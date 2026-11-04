// Web Bluetooth を模擬した MapWand でブラウザ側の接続処理を通しで確認する。
//   cd web && npx vite --port 5173 &  node e2e/mock-ble.mjs
// 実機の動作確認の代わりにはならない（GATT 処理とプロトコル実装の確認用）。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// playwright はプロジェクト依存に入れず、環境にあるものを使う（NODE_PATH 経由も可）
const { chromium } = await import('playwright').catch(() => createRequire(import.meta.url)('playwright'));

const URL = process.env.MAPWAND_URL ?? 'http://localhost:5173/';
const OUT = process.env.MAPWAND_OUT ?? path.resolve('e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const mock = () => {
  const UUIDS = window.__MW_UUIDS;
  const listeners = new Set();
  const state = { counter: 1000, seq: 50, writes: [], connected: false, connects: 0 };
  const pkt = (type, button = 0, action = 0) => {
    const v = new DataView(new ArrayBuffer(12));
    v.setUint8(0, 1);
    v.setUint8(1, type);
    v.setUint16(2, state.seq & 0xffff, true);
    v.setInt32(4, state.counter, true);
    v.setUint8(8, button);
    v.setUint8(9, action);
    v.setUint8(10, 1);
    return v;
  };
  const input = {
    value: null,
    addEventListener: (t, f) => listeners.add(f),
    removeEventListener: (t, f) => listeners.delete(f),
    readValue: async () => pkt(3),
    startNotifications: async () => input,
  };
  const stateChr = {
    writeValueWithResponse: async (b) => {
      await new Promise((r) => setTimeout(r, 15));
      state.writes.push(Array.from(new Uint8Array(b.buffer ?? b)));
    },
  };
  const devListeners = new Set();
  const device = {
    name: 'MapWand',
    addEventListener: (t, f) => devListeners.add(f),
    gatt: {
      connect: async () => {
        state.connected = true;
        state.connects++;
        return device.gatt;
      },
      disconnect: () => {
        state.connected = false;
        devListeners.forEach((f) => f(new Event('gattserverdisconnected')));
      },
      getPrimaryService: async () => ({
        getCharacteristic: async (u) => (u === UUIDS.input ? input : stateChr),
      }),
    },
  };
  window.__mw = {
    state,
    notify(type, button = 0, action = 0) {
      state.seq++;
      input.value = pkt(type, button, action);
      listeners.forEach((f) => f({ target: input }));
    },
    rotate(counts) {
      state.counter += counts;
      this.notify(1);
    },
    press(button, action) {
      this.notify(2, button, action);
    },
    replayOld() {
      // 古い seq のパケット（再生されてはいけない）
      const saved = state.seq;
      state.seq -= 5;
      input.value = pkt(2, 3, 1);
      listeners.forEach((f) => f({ target: input }));
      state.seq = saved;
    },
    drop() {
      device.gatt.disconnect();
    },
  };
  Object.defineProperty(navigator, 'bluetooth', {
    value: { getAvailability: async () => true, requestDevice: async () => device },
  });
};

const proto = JSON.parse(fs.readFileSync(path.resolve('../protocol/mapwand.json'), 'utf8'));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.addInitScript((u) => (window.__MW_UUIDS = u), proto.uuids);
await p.addInitScript(mock);
await p.goto(URL);
await p.waitForTimeout(800);

const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) process.exitCode = 1;
};
const nowValue = () => p.textContent('.now-value');
const nowItem = () => p.textContent('.now-item');

await p.click('text=MapWandに接続');
await p.waitForTimeout(200);
check((await p.textContent('.link')).includes('接続中のMapWand'), 'connect');
let w = await p.evaluate(() => window.__mw.state.writes.length);
check(w >= 1, `initial state synced (${w} writes)`);

await p.click('text=制作開始');
// 回転 2 カウント = 1 候補
await p.evaluate(() => window.__mw.rotate(2));
await p.waitForTimeout(100);
check((await nowValue()) === '和紙', 'rotate +1 → 和紙 preview');
check((await p.textContent('.badge')) === '未採用', 'preview badge');
// 1 カウントでは動かない（端数持ち越し）、もう 1 で動く
await p.evaluate(() => window.__mw.rotate(1));
await p.waitForTimeout(50);
check((await nowValue()) === '和紙', 'half step does not move');
await p.evaluate(() => window.__mw.rotate(1));
await p.waitForTimeout(50);
check((await nowValue()) === '夜', 'remainder carried over');
// 重複パケット（同 seq）は無視
await p.evaluate(() => {
  window.__mw.state.counter += 2;
  window.__mw.state.seq--; // 同じ seq を再送
  window.__mw.notify(1);
});
await p.waitForTimeout(50);
check((await nowValue()) === '夜', 'duplicate seq ignored');
await p.evaluate(() => window.__mw.rotate(-2));
await p.waitForTimeout(50);
check((await nowValue()) === '夜' || (await nowValue()) === '和紙', 'rotate back');
// 短押しで採用 → 次の項目
await p.evaluate(() => window.__mw.press(3, 1));
await p.waitForTimeout(100);
check((await nowItem()).includes('配色'), 'dial short press adopts and moves to COLOR');
const writes = await p.evaluate(() => window.__mw.state.writes);
const last = writes[writes.length - 1];
check(last[0] === 1 && last[1] === 1 && last[4] === 1, `state packet item=1 (${last.slice(0, 9)})`);
// BtnA / BtnB
await p.evaluate(() => window.__mw.press(1, 1));
await p.waitForTimeout(50);
check((await nowItem()).includes('階級'), 'BtnA next item');
await p.evaluate(() => window.__mw.press(2, 1));
await p.waitForTimeout(50);
check((await nowItem()).includes('配色'), 'BtnB prev item');
// 長押しで戻す（プレビュー取り消し）
await p.evaluate(() => window.__mw.rotate(4));
await p.waitForTimeout(50);
const pv = await nowValue();
await p.evaluate(() => window.__mw.press(3, 2));
await p.waitForTimeout(50);
check((await nowValue()) !== pv && (await p.textContent('.badge')) === '採用中', 'long press cancels preview');

// 切断 → 状態維持 → 自動再接続 → 古い入力は再生しない
await p.evaluate(() => window.__mw.drop());
await p.waitForTimeout(100);
check((await p.textContent('.link')).includes('切断') || (await p.textContent('.link')).includes('再接続'), 'disconnect detected');
check((await nowItem()).includes('配色'), 'editing state kept after disconnect');
await p.waitForTimeout(3500);
check((await p.textContent('.link')).includes('接続中のMapWand'), 'auto reconnect');
await p.evaluate(() => {
  window.__mw.state.counter += 40; // 切断中に回した分は基準値の取り直しで捨てる
});
await p.click('text=切断').catch(() => {});
await p.waitForTimeout(100);
await p.click('text=再接続').catch(() => p.click('text=MapWandに接続'));
await p.waitForTimeout(300);
const before = await nowValue();
await p.evaluate(() => window.__mw.replayOld());
await p.waitForTimeout(50);
check((await nowItem()).includes('配色') && (await nowValue()) === before, 'old packets not replayed after reconnect');
await p.screenshot({ path: `${OUT}/connected.png` });

// 仕上げ → 保存（PNG 自動ダウンロード + 保存準備完了パネル）
await p.click('text=仕上げへ');
const dl = p.waitForEvent('download', { timeout: 10000 });
await p.evaluate(() => window.__mw.press(3, 1));
const d = await dl;
const pngPath = `${OUT}/${d.suggestedFilename()}`;
await d.saveAs(pngPath);
check(/mapwand-.*\.png$/.test(pngPath), `PNG downloaded ${path.basename(pngPath)}`);
const buf = fs.readFileSync(pngPath);
check(buf.readUInt32BE(16) === 1600 && buf.readUInt32BE(20) === 1200, `PNG size ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
await p.waitForSelector('text=保存準備完了');
check(true, 'save-ready panel shown');
const dl2 = p.waitForEvent('download');
await p.click('text=設定 JSON');
const j = await dl2;
const jsonPath = `${OUT}/${j.suggestedFilename()}`;
await j.saveAs(jsonPath);
const settings = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
check(settings.app === 'MapWand' && settings.settings.style.index >= 0 && settings.elapsedMs > 0, 'settings JSON');
const lastW = (await p.evaluate(() => window.__mw.state.writes)).at(-1);
check((lastW[8] & 8) === 8, 'SAVED flag sent to device');
await p.screenshot({ path: `${OUT}/saved.png` });

// 設定 JSON から復元
await p.click('text=閉じる');
for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight');
await p.setInputFiles('input[type=file]', jsonPath);
await p.waitForTimeout(200);
check((await p.textContent('.files')).includes('設定を読み込みました'), 'settings restored');

check(errors.length === 0, `no page errors ${errors.join(' / ')}`);
await b.close();
