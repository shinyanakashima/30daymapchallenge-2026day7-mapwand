// MapWand firmware
// M5StickC Plus + Hat Mini EncoderC (I2C: SDA=GPIO0, SCL=GPIO26, addr 0x42)
// BLE Peripheral / GATT server. 入力を Notify で送り、Web から表示状態を受け取る。
// 地図の描画はしない。画面は項目名・現在値・接続状態だけを表示する。

#include <M5Unified.h>
#include <Wire.h>
#include <NimBLEDevice.h>
#include <M5HatMiniEncoderC.h>

#include "protocol_gen.h"

using namespace mapwand;

// ---------------- 設定 ----------------
static const uint8_t ENC_SDA = 0;
static const uint8_t ENC_SCL = 26;
static const uint32_t ENC_I2C_HZ = 100000;
static const uint32_t POLL_MS = 8;            // エンコーダ読み取り周期
static const uint32_t DEBOUNCE_MS = 25;       // ダイヤル押し込みのチャタリング除去
static const uint32_t ROTARY_NOTIFY_MS = 40;  // 回転通知の最短間隔（まとめ送り）
static const uint32_t ENC_RETRY_MS = 1000;    // I2C 再試行間隔
static const uint8_t ENC_FAIL_LIMIT = 3;      // 連続失敗で未検出扱い
static const uint32_t DRAW_MIN_MS = 50;       // 画面更新の最短間隔
static const float LED_SCALE = 0.35f;         // LED の明るさ

// ---------------- エンコーダ ----------------
M5HatMiniEncoderC encoder;
static bool encOk = false;
static uint8_t encFails = 0;
static uint32_t encRetryAt = 0;
static uint32_t lastPoll = 0;
static int32_t hatLast = 0;       // Hat が返す生の値
static int32_t counterOut = 0;    // 送信する累積カウンター（Hat の再初期化をまたいで連続）

// I2C の失敗を検出できるよう、レジスタ読み取りは自前で行う
static bool readReg(uint8_t reg, uint8_t* buf, uint8_t len) {
  Wire.beginTransmission(MiniEncoderC_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)MiniEncoderC_ADDR, len) != len) return false;
  for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
  return true;
}

static bool readEncoder(int32_t& value, bool& pressed) {
  uint8_t v[4];
  uint8_t b;
  if (!readReg(ENCODER_REG, v, 4)) return false;
  if (!readReg(BUTTON_REG, &b, 1)) return false;
  value = (int32_t)((uint32_t)v[0] | ((uint32_t)v[1] << 8) | ((uint32_t)v[2] << 16) | ((uint32_t)v[3] << 24));
  pressed = (b == 0);  // 押すと 0
  return true;
}

static uint32_t ledNow = 0xFFFFFFFF;
static void setLed(uint32_t rgb) {
  if (!encOk || rgb == ledNow) return;
  encoder.setLEDColor(rgb);
  ledNow = rgb;
}

static void tryInitEncoder(uint32_t now) {
  if (now < encRetryAt) return;
  encRetryAt = now + ENC_RETRY_MS;
  Wire.end();
  bool ok = encoder.begin(&Wire, MiniEncoderC_ADDR, ENC_SDA, ENC_SCL, ENC_I2C_HZ);
  // ライブラリ 0.0.1 は速度を uint8_t に保持して begin へ渡すため、ここで正しい値に設定し直す
  Wire.setClock(ENC_I2C_HZ);
  Wire.setTimeOut(20);
  int32_t v;
  bool p;
  if (ok && readEncoder(v, p)) {
    hatLast = v;  // 再初期化時は基準を取り直す（カウンターを飛ばさない）
    encOk = true;
    encFails = 0;
    ledNow = 0xFFFFFFFF;
    Serial.printf("[enc] found, fw=%u value=%ld\n", encoder.getFirmwareVersion(), (long)v);
  } else {
    encOk = false;
    Serial.println("[enc] not found, retry");
  }
}

// ---------------- BLE ----------------
static NimBLEServer* server = nullptr;
static NimBLECharacteristic* inputChr = nullptr;
static volatile bool bleConnected = false;
static uint16_t seq = 0;

struct WebState {
  bool valid = false;
  uint16_t stateSeq = 0;
  uint8_t item = 0, cand = 0, count = 0, adopted = 0, flags = 0;
  uint8_t r = 0, g = 0, b = 0;
  int16_t timer = 600;
};
static portMUX_TYPE stateMux = portMUX_INITIALIZER_UNLOCKED;
static WebState webShared;          // BLE タスクが書く
static volatile bool webDirty = false;
static volatile bool connDirty = true;

static void buildInput(uint8_t* buf, uint8_t type, uint16_t s, uint8_t button, uint8_t action) {
  memset(buf, 0, INPUT_SIZE);
  buf[0] = PROTOCOL_VERSION;
  buf[1] = type;
  buf[2] = s & 0xFF;
  buf[3] = s >> 8;
  uint32_t c = (uint32_t)counterOut;
  buf[4] = c & 0xFF;
  buf[5] = (c >> 8) & 0xFF;
  buf[6] = (c >> 16) & 0xFF;
  buf[7] = (c >> 24) & 0xFF;
  buf[8] = button;
  buf[9] = action;
  buf[10] = encOk ? DEVICEFLAG_ENCODER_OK : 0;
}

// Read 用の値（接続時の基準値）を最新の累積カウンターに保つ
static void updateSnapshot() {
  uint8_t buf[INPUT_SIZE];
  buildInput(buf, INPUTTYPE_SNAPSHOT, seq, BUTTON_NONE, ACTION_NONE);
  inputChr->setValue(buf, INPUT_SIZE);
}

static int32_t lastSentCounter = 0;
static uint32_t lastNotifyAt = 0;

static void sendInput(uint8_t type, uint8_t button, uint8_t action) {
  uint8_t buf[INPUT_SIZE];
  seq++;
  buildInput(buf, type, seq, button, action);
  inputChr->setValue(buf, INPUT_SIZE);
  if (bleConnected) inputChr->notify();
  lastSentCounter = counterOut;
  lastNotifyAt = millis();
  Serial.printf("[in] type=%u seq=%u counter=%ld btn=%u act=%u\n", type, seq, (long)counterOut, button, action);
}

class ServerCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& info) override {
    bleConnected = true;
    connDirty = true;
    Serial.printf("[ble] connected %s\n", info.getAddress().toString().c_str());
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& info, int reason) override {
    bleConnected = false;
    portENTER_CRITICAL(&stateMux);
    webShared.valid = false;
    portEXIT_CRITICAL(&stateMux);
    connDirty = true;
    Serial.printf("[ble] disconnected reason=%d, advertising\n", reason);
    NimBLEDevice::startAdvertising();
  }
};

class StateCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& info) override {
    NimBLEAttValue v = c->getValue();
    if (v.size() < STATE_SIZE) return;
    const uint8_t* d = v.data();
    if (d[0] != PROTOCOL_VERSION || d[1] != STATETYPE_STATE) return;
    WebState w;
    w.valid = true;
    w.stateSeq = d[2] | (d[3] << 8);
    w.item = d[4];
    w.cand = d[5];
    w.count = d[6];
    w.adopted = d[7];
    w.flags = d[8];
    w.r = d[9];
    w.g = d[10];
    w.b = d[11];
    w.timer = (int16_t)(d[12] | (d[13] << 8));
    if (w.item >= ITEM_COUNT) return;
    portENTER_CRITICAL(&stateMux);
    webShared = w;
    portEXIT_CRITICAL(&stateMux);
    webDirty = true;
  }
};

static void setupBle() {
  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(9);  // dBm
  server = NimBLEDevice::createServer();
  server->setCallbacks(new ServerCB());
  NimBLEService* svc = server->createService(SERVICE_UUID);
  inputChr = svc->createCharacteristic(INPUT_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic* stateChr = svc->createCharacteristic(STATE_UUID, NIMBLE_PROPERTY::WRITE);
  stateChr->setCallbacks(new StateCB());
  server->start();  // NimBLE 2.x ではサービスはサーバー開始時に有効になる
  updateSnapshot();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setName(DEVICE_NAME);
  adv->enableScanResponse(false);
  adv->start();
  Serial.println("[ble] advertising as MapWand");
}

// ---------------- 入力 ----------------
static bool dialRaw = false, dialStable = false, longFired = false;
static uint32_t dialRawAt = 0, dialDownAt = 0;

static void pollEncoder(uint32_t now) {
  if (!encOk) {
    tryInitEncoder(now);
    if (!encOk) return;
  }
  if (now - lastPoll < POLL_MS) return;
  lastPoll = now;

  int32_t v;
  bool pressed;
  if (!readEncoder(v, pressed)) {
    if (++encFails >= ENC_FAIL_LIMIT) {
      encOk = false;
      encRetryAt = now + ENC_RETRY_MS;
      connDirty = true;
      Serial.println("[enc] lost");
      if (bleConnected) sendInput(INPUTTYPE_SNAPSHOT, BUTTON_NONE, ACTION_NONE);
    }
    return;
  }
  if (encFails >= ENC_FAIL_LIMIT) connDirty = true;
  encFails = 0;

  // 回転: Hat の値の差分を累積（int32 の折り返しは差分で吸収）
  int32_t d = (int32_t)((uint32_t)v - (uint32_t)hatLast);
  hatLast = v;
  if (d != 0) {
    counterOut = (int32_t)((uint32_t)counterOut + (uint32_t)d);
    updateSnapshot();
  }
  if (counterOut != lastSentCounter && now - lastNotifyAt >= ROTARY_NOTIFY_MS) {
    sendInput(INPUTTYPE_ROTARY, BUTTON_NONE, ACTION_NONE);  // 最後の累積値も必ずここで送られる
  }

  // 押し込み: チャタリング除去 → 短押しは離したとき、長押しは 800ms で 1 回だけ
  if (pressed != dialRaw) {
    dialRaw = pressed;
    dialRawAt = now;
  }
  if (dialRaw != dialStable && now - dialRawAt >= DEBOUNCE_MS) {
    dialStable = dialRaw;
    if (dialStable) {
      dialDownAt = now;
      longFired = false;
    } else if (!longFired) {
      sendInput(INPUTTYPE_BUTTON, BUTTON_DIAL, ACTION_SHORT);
    }
  }
  if (dialStable && !longFired && now - dialDownAt >= LONG_PRESS_MS) {
    longFired = true;
    sendInput(INPUTTYPE_BUTTON, BUTTON_DIAL, ACTION_LONG);
  }
}

static void pollButtons() {
  // BtnA = 正面, BtnB = 側面。電源ボタンは使わない
  if (M5.BtnA.wasPressed()) sendInput(INPUTTYPE_BUTTON, BUTTON_A, ACTION_SHORT);
  if (M5.BtnB.wasPressed()) sendInput(INPUTTYPE_BUTTON, BUTTON_B, ACTION_SHORT);
}

// ---------------- 表示 ----------------
M5Canvas canvas(&M5.Display);
static WebState web;
static bool drawDirty = true;
static uint32_t lastDraw = 0;
static uint32_t flashUntil = 0;
static int batteryLevel = -1;
static uint32_t batteryAt = 0;

static uint16_t rgb565(uint32_t rgb) {
  return M5.Display.color565((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
}

static void drawHeader(bool blinkOn) {
  canvas.setFont(&fonts::Font2);
  canvas.setTextColor(TFT_LIGHTGREY);
  canvas.setTextDatum(top_left);
  canvas.drawString("MapWand", 6, 3);
  const char* st;
  uint16_t col;
  if (bleConnected) {
    st = "BLE OK";
    col = TFT_GREEN;
  } else {
    st = "NO PC";
    col = blinkOn ? TFT_YELLOW : TFT_DARKGREY;
  }
  canvas.setTextDatum(top_right);
  canvas.setTextColor(col);
  canvas.drawString(st, 234, 3);
  if (batteryLevel >= 0) {
    canvas.setTextColor(TFT_DARKGREY);
    canvas.drawString(String(batteryLevel) + "%", 170, 3);
  }
  canvas.drawFastHLine(0, 21, 240, 0x3186);
}

static void draw(uint32_t now) {
  bool blinkOn = (now / 500) % 2 == 0;
  canvas.fillScreen(TFT_BLACK);
  drawHeader(blinkOn);

  if (!encOk) {
    canvas.setTextDatum(middle_center);
    canvas.setFont(&fonts::FreeSansBold12pt7b);
    canvas.setTextColor(TFT_RED);
    canvas.drawString("NO DIAL", 120, 60);
    canvas.setFont(&fonts::Font2);
    canvas.setTextColor(TFT_LIGHTGREY);
    canvas.drawString("Check Mini EncoderC Hat", 120, 92);
    canvas.drawString("retrying...", 120, 112);
  } else if (!bleConnected) {
    canvas.setTextDatum(middle_center);
    canvas.setFont(&fonts::FreeSansBold12pt7b);
    canvas.setTextColor(TFT_YELLOW);
    canvas.drawString("WAITING PC", 120, 58);
    canvas.setFont(&fonts::Font2);
    canvas.setTextColor(TFT_LIGHTGREY);
    canvas.drawString("Open web app and press", 120, 90);
    canvas.drawString("[Connect to MapWand]", 120, 110);
  } else if (!web.valid) {
    canvas.setTextDatum(middle_center);
    canvas.setFont(&fonts::FreeSansBold12pt7b);
    canvas.setTextColor(TFT_GREEN);
    canvas.drawString("SYNCING", 120, 72);
  } else {
    const ItemDef& it = ITEMS[web.item];
    uint16_t ic = rgb565(it.led);
    canvas.fillRect(0, 22, 6, 113, ic);
    canvas.setTextDatum(top_left);
    canvas.setFont(&fonts::FreeSansBold12pt7b);
    canvas.setTextColor(ic);
    canvas.drawString(it.name, 14, 28);
    canvas.setFont(&fonts::Font2);
    canvas.setTextColor(TFT_LIGHTGREY);
    canvas.setTextDatum(top_right);
    canvas.drawString(String(web.cand + 1) + "/" + String(web.count), 234, 32);

    const char* val = web.cand < it.count ? it.candidates[web.cand] : "?";
    canvas.setTextDatum(top_left);
    canvas.setFont(&fonts::FreeSansBold18pt7b);
    canvas.setTextColor(TFT_WHITE);
    canvas.drawString(val, 14, 58);

    canvas.setFont(&fonts::Font2);
    canvas.setTextDatum(bottom_left);
    bool preview = web.flags & STATEFLAG_PREVIEW;
    if (web.item == ITEM_COUNT - 1) {
      canvas.setTextColor(TFT_LIGHTGREY);
      canvas.drawString((web.flags & STATEFLAG_SAVED) ? "SAVED" : "PUSH TO DECIDE", 14, 130);
    } else {
      canvas.setTextColor(preview ? TFT_ORANGE : TFT_GREEN);
      canvas.drawString(preview ? "PREVIEW  push=OK" : "ADOPTED", 14, 130);
    }

    // タイマー
    canvas.setTextDatum(bottom_right);
    bool over = web.flags & STATEFLAG_OVERTIME;
    int t = web.timer < 0 ? -web.timer : web.timer;
    char buf[12];
    snprintf(buf, sizeof(buf), "%s%02d:%02d", over ? "+" : "", t / 60, t % 60);
    canvas.setFont(&fonts::Font4);
    canvas.setTextColor((web.flags & STATEFLAG_TIMER_RUNNING) ? (over ? TFT_RED : TFT_WHITE) : TFT_DARKGREY);
    canvas.drawString(buf, 234, 133);
  }
  canvas.pushSprite(0, 0);
}

static void updateLed(uint32_t now) {
  if (!encOk) return;
  uint32_t c;
  if (now < flashUntil) {
    c = 0x606060;
  } else if (!bleConnected || !web.valid) {
    // 未接続: 青をゆっくり点滅
    c = ((now / 1000) % 2 == 0) ? 0x000018 : 0x000000;
  } else {
    c = ((uint32_t)(web.r * LED_SCALE) << 16) | ((uint32_t)(web.g * LED_SCALE) << 8) | (uint32_t)(web.b * LED_SCALE);
  }
  setLed(c);
}

// ---------------- main ----------------
void setup() {
  auto cfg = M5.config();
  cfg.serial_baudrate = 115200;
  M5.begin(cfg);
  M5.Display.setRotation(1);
  M5.Display.setBrightness(140);
  canvas.setColorDepth(16);
  canvas.createSprite(240, 135);

  canvas.fillScreen(TFT_BLACK);
  canvas.setTextDatum(middle_center);
  canvas.setFont(&fonts::FreeSansBold12pt7b);
  canvas.setTextColor(TFT_WHITE);
  canvas.drawString("MapWand", 120, 58);
  canvas.setFont(&fonts::Font2);
  canvas.setTextColor(TFT_LIGHTGREY);
  canvas.drawString("starting...", 120, 92);
  canvas.pushSprite(0, 0);
  Serial.println("[boot] MapWand");

  tryInitEncoder(millis());
  setLed(0x202020);
  setupBle();
}

void loop() {
  uint32_t now = millis();
  M5.update();
  pollEncoder(now);
  pollButtons();

  if (webDirty) {
    webDirty = false;
    WebState w;
    portENTER_CRITICAL(&stateMux);
    w = webShared;
    portEXIT_CRITICAL(&stateMux);
    // 項目移動・採用・保存で LED を短く光らせる
    if (web.valid && w.valid &&
        (w.item != web.item || w.adopted != web.adopted || ((w.flags ^ web.flags) & STATEFLAG_SAVED))) {
      flashUntil = now + 120;
    }
    web = w;
    drawDirty = true;
  }
  if (connDirty) {
    connDirty = false;
    portENTER_CRITICAL(&stateMux);
    if (!webShared.valid) web.valid = false;
    portEXIT_CRITICAL(&stateMux);
    drawDirty = true;
  }
  if (now - batteryAt > 5000) {
    batteryAt = now;
    batteryLevel = M5.Power.getBatteryLevel();
    drawDirty = true;
  }
  // 未接続時は点滅表示のため定期的に描き直す
  if (!bleConnected && now - lastDraw > 500) drawDirty = true;
  if (drawDirty && now - lastDraw >= DRAW_MIN_MS) {
    drawDirty = false;
    lastDraw = now;
    draw(now);
  }
  updateLed(now);
  delay(1);
}
