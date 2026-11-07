# MapWand 開発者向け資料

## 役割分担

| | M5StickC Plus（ファームウェア） | ブラウザ（Web アプリ） |
| - | - | - |
| BLE | Peripheral / GATT サーバー | Central / GATT クライアント（Web Bluetooth） |
| 担当 | 回転・押し込み・BtnA/BtnB の検出、端末画面、LED | 編集状態の正本、地図の描画・分類・凡例、PNG/JSON 書き出し、タイマー |
| 表示 | 項目名・候補名・候補番号・採用状態・接続状態・タイマー | 地図と操作画面 |

デバイスは「何が押されたか」だけを送り、Web が状態を決めて送り返す。キーボード・画面ボタン・BLE 入力はすべて `web/src/state/editor.ts` の同じ `EditorAction` に変換される。

## 共通定義

`protocol/mapwand.json` が唯一の定義。項目の順序、候補名（日本語と端末表示用の ASCII）、LED 色、UUID、パケットサイズ、長押し時間を持つ。

```bash
npm run protocol:gen
```

で次の 2 ファイルを生成する（手で編集しない）。

- `web/src/protocol/generated.ts`
- `firmware/src/protocol_gen.h`

候補を増減したら、`web/src/map/presets.ts` の候補の中身も合わせる（起動時に件数を照合し、ずれていれば例外を出す）。端末の画面は ASCII フォントだけを使うので、候補名の `short` は ASCII 10 文字以内。

## GATT

| 名前 | UUID | 属性 |
| - | - | - |
| Service | `84cff35f-c3ea-4542-bc50-29b53501e42a` | Primary |
| Input | `dde87509-d227-40ae-944c-06743fffba6b` | Read, Notify |
| State | `073f0c86-ae4e-4130-bd76-9f56941e8e8e` | Write（with response） |

広告名は `MapWand`。広告パケットに Flags（3B）＋128bit Service UUID（18B）＋名前（9B）の 30 バイトを入れる。ブラウザは Service UUID または名前で絞り込む。接続は 1 台まで。切断されると再び広告する。

ATT MTU は既定の 23（ペイロード 20 バイト）を前提にし、どのパケットも 20 バイト以内。

## パケット（すべてリトルエンディアン）

### Input（12 バイト, デバイス → Web）

| オフセット | 型 | 内容 |
| - | - | - |
| 0 | u8 | プロトコルバージョン（現在 2。項目を 11 にした版） |
| 1 | u8 | 種別 1=ROTARY 2=BUTTON 3=SNAPSHOT |
| 2 | u16 | seq。Notify ごとに +1、65535 の次は 0 |
| 4 | i32 | 累積回転カウンター（起動からの合計。2 の補数、int32 で折り返す） |
| 8 | u8 | ボタン 0=なし 1=A 2=B 3=ダイヤル |
| 9 | u8 | 動作 0=なし 1=短押し 2=長押し |
| 10 | u8 | デバイスフラグ bit0=エンコーダ検出中 |
| 11 | u8 | 予約（0） |

- すべてのパケットに最新の累積カウンターが入る。Web は前回値との差分（int32 の折り返しを考慮した `(now - prev) | 0`）を回転量にする。通知の欠落があっても回転量はずれない。
- seq の前進量 `(now - prev) & 0xFFFF` が 0 なら重複として捨て、0x8000 以上なら古いパケットとして捨てる。2 以上なら欠落数を数える（画面の『ダイヤル設定』に表示）。
- Read で読める値は常に最新カウンターと最後に送った seq を持つ SNAPSHOT。Web は接続のたびにこれを読み、バージョン照合と回転の基準値の取り直しをしてから Notify を購読する。基準値を取る前に届いた通知は捨てる（切断中の回転や古い入力を再生しない）。
- 回転の通知は最短 40ms 間隔にまとめる。間隔待ちの間の変化も、次の周期で必ず最後の累積値を送る。
- 回転量（カウント）から候補の移動数への換算は Web 側で行う（既定 2 カウント = 1 候補、端数は持ち越し）。1 クリックのカウント数と方向は実機で確かめ、『ダイヤル設定』で合わせる。

### State（16 バイト, Web → デバイス）

| オフセット | 型 | 内容 |
| - | - | - |
| 0 | u8 | プロトコルバージョン（2） |
| 1 | u8 | 種別 1=STATE |
| 2 | u16 | 状態番号。接続セッション内で書き込みごとに +1 |
| 4 | u8 | 項目 ID（`protocol/mapwand.json` の items の順, 0〜10） |
| 5 | u8 | 表示中の候補 ID |
| 6 | u8 | 候補数 |
| 7 | u8 | 採用済みの候補 ID |
| 8 | u8 | フラグ bit0=未採用のプレビュー中 bit1=タイマー作動中 bit2=10分超過 bit3=保存済み |
| 9–11 | u8×3 | LED の RGB（項目の色） |
| 12 | i16 | タイマー残り秒（負の値は超過秒） |
| 14 | u16 | 予約（0） |

- Web は状態が変わるたびに送る。書き込みは直列化し、前の書き込みの完了待ちの間に溜まった状態は最新の 1 件にまとめる。
- デバイスはバージョンと種別が一致しないパケット、項目 ID が範囲外のパケットを無視する。

### 接続手順（Web）

1. `navigator.bluetooth.getAvailability()` で Bluetooth の有無を確認。
2. `requestDevice({ filters: [{ services: [SERVICE] }, { name: 'MapWand' }] })`（ユーザー操作から呼ぶ）。
3. `gatt.connect()` → Service → Input / State Characteristic を取得（再接続のたびに取り直す）。
4. Input を Read してバージョン照合と基準値の取得。
5. `startNotifications()`。
6. 現在の全状態を State へ書く。

切断（`gattserverdisconnected`）時は編集状態を保持し、3 秒後から自動で再接続を試みる。『再接続』ボタンでも同じ処理を行う。エラーは「Bluetooth 無効」「機器選択キャンセル」「機器未検出」「権限なし」「プロトコル不一致」「接続失敗」を分けて表示する。

## ファームウェア

| 項目 | 値 |
| - | - |
| ボード | M5StickC Plus（ESP32-PICO-D4）。PlatformIO の `m5stick-c` 定義を使う。Plus2 ではない |
| プラットフォーム | `espressif32@6.13.0`（Arduino-ESP32 2.0.17） |
| ライブラリ | M5Unified 0.2.25、M5GFX 0.2.32、NimBLE-Arduino 2.5.1、M5Hat-Mini-EncoderC（commit `38b0dd9`） |
| パーティション | `huge_app.csv`（アプリ 3MB, OTA なし） |
| Hat の I²C | Wire, SDA=GPIO0, SCL=GPIO26, 100kHz, アドレス 0x42（公式の StickC Plus 接続例と同じ） |

- 公式ライブラリ 0.0.1 は I²C の失敗を返さないため、エンコーダ値（レジスタ 0x00, 4 バイト）とボタン（0x20, 押下で 0）の読み取りは `Wire` で直接行い、失敗を検出する。3 回続けて失敗したら未検出として画面に `NO DIAL` を出し、1 秒ごとに再初期化する。無限待ちはしない。
- ライブラリの `begin()` は速度を `uint8_t` に保持して渡すので、直後に `Wire.setClock(100000)` で設定し直している。
- Hat を再初期化したときは Hat の値を基準に取り直し、送信用の累積カウンターは連続させる。
- ダイヤルの押し込みは 8ms 周期で読み、25ms 安定したら確定。短押しは離したとき、長押しは押してから 800ms で 1 回だけ送る。長押しのあとに離しても短押しは送らない。
- BtnA（正面）＝次の項目、BtnB（側面）＝前の項目。電源ボタンは使わない。
- 描画・BLE・入力は `delay` で止めない（ループ末尾の `delay(1)` のみ）。画面はスプライトに描いてから転送し、最短 50ms 間隔。
- LED は Hat の RGB LED。接続中は Web から届いた項目色（明るさ 35%）、項目移動・採用・保存のときに 120ms 白く光る。未接続時は青の点滅。

### ビルドと書き込み

```bash
cd firmware
pio run                     # ビルド
pio run -t upload           # USB で書き込み
pio device monitor          # ログ（115200bps）
./scripts/merge_bin.sh      # 0x0 から書く 1 ファイルの bin を prebuilt/ に作る
```

ビルド済みの結合 bin は `firmware/prebuilt/` にある。esptool で直接書く場合：

```bash
python -m esptool --chip esp32 --baud 921600 write_flash 0x0 firmware/prebuilt/mapwand-m5stickc-plus-merged.bin
```

## Web アプリ

| 項目 | 値 |
| - | - |
| ビルド | Vite 7.3.7、React 19.3.1、TypeScript 5.9.3 |
| 地図 | d3-geo 3.1.2（Webメルカトル図法）、topojson-client 3.1.0、ColorBrewer（d3-scale-chromatic 3.1.1） |
| ベースマップ | 地理院タイル（淡色・標準・白地図・陰影起伏図・写真）。CORS で読み込み、PNG にも入る |
| フォント | BIZ UDPGothic、Zen Old Mincho（@fontsource で同梱。外部の Web フォント配信を使わない） |

- 地図は 1600×1200 の「シーン」（四角・パス・文字のリスト）として `web/src/map/scene.ts` で組み立て、画面は SVG、PNG は Canvas で同じシーンから描く。PNG 書き出し前に使う文字のフォントを `document.fonts.load` で読み込む。
- 分類（`web/src/map/classify.ts`）は順位による分位分類。同じ値は同じ階級に入れ、空の階級は詰めて実際の階級数を凡例に出す。色・凡例・塗りは同じ分類結果から作る。
- 構図ごとの投影とパスはキャッシュし、候補の切り替えでは色と文字だけを作り直す。
- ベースマップは MapLibre を使わず、d3-geo の `geoMercator` の縮尺・平行移動からタイル番号と画面上の位置を求めて `<image>` で並べる（`tilePrims`）。構図が 3 つに固定でパン・ズームがないため、SVG と PNG を同じシーンから描く仕組みをそのまま使える。ズームは画面上のタイルが 256px 以下になる最小の整数ズーム（全景でおよそ 7）。陰影起伏図は塗りの上に乗算で重ね、それ以外は塗りを半透明にして下に敷く。
- 地理院タイルは `Access-Control-Allow-Origin: *` を返すので、Canvas に描いても PNG を書き出せる。読み込めなかったタイルは画面と同じく描かず、保存時に枚数を知らせる。
- 小縮尺の地理院タイルで必要な追加の出典表記（VMAP0、GEBCO、世界衛星モザイク画像）は、選んだベースマップに応じて出典欄へ自動で入る。
- 人口増減率は 0 を境にした発散配色。分位分類の階級が 0 をまたぐ場合は 0 で 2 つに分けるので、階級数が指定より 1 つ増えることがある（凡例に表示）。

### 表示言語（日本語・英語）

- 画面の文言は `web/src/i18n.ts` にまとめている。日本語の辞書のキーが型になり、英語の辞書に抜けがあると型チェックで止まる。
- 項目と候補の英語名は `protocol/mapwand.json` の `en`。生成スクリプトは `en` がないと止まる。端末はこれまでどおり `short`（ASCII）を表示する。
- 地図の中の文字は `buildScene(settings, lang)` で切り替える。都道府県の英語名は `build_stats.py` の `PREF_EN`（ヘボン式、長音記号なし）、都市の英語名は Wikidata の英語ラベル（県名付き・「-shi」・長音記号を外す）。英語の地名は長いので、全都道府県名のときは字を小さくし、`LABEL_LONLAT_EN` で位置を調整している。
- 地理院タイルの指定どおりの出典表記（英文。「世界衛星モザイク画像」を含む）は、英語表示でも原文のまま入れる。
- BLE 接続や設定ファイルのメッセージはキー（`Msg`）で受け渡し、表示時に翻訳する。

### テスト

```bash
cd web
npm test                    # 分類・編集状態・パケットの単体テスト（vitest）
npx vite --port 5173 &
node e2e/mock-ble.mjs       # Web Bluetooth を模擬した通しの確認（Playwright が必要）
```

`e2e/mock-ble.mjs` は接続、回転（端数の持ち越し・重複 seq の破棄）、短押し・長押し・BtnA/B、切断時の状態保持、自動再接続、再接続後に古い入力を再生しないこと、ベースマップとレイヤーを採用した状態での PNG（1600×1200, タイル込み）と設定 JSON（形式 2）の保存、SAVED フラグの送信、設定の復元、英語への切り替え（画面・地図・URL・設定 JSON・再読み込み後の保持）を確かめる。`src/map/scene.test.ts` は、英語表示ですべてのデータ・レイヤー・地名の組み合わせに日本語の文字が残らないことを確かめる。模擬なので、実機での確認の代わりにはならない。

## データ

[data/README.md](../data/README.md) を参照。
