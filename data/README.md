# data

統計表・境界・レイヤーの取得と加工。元データ（`raw/`）は Git に入れず、加工済みの `processed/` と `manifest.json` を管理する。ベースマップ（地理院タイル）は実行時にブラウザが読み込むので、ここには含まない。

## 再生成

```bash
npm ci                                  # リポジトリ直下（mapshaper 0.7.101）
pip install -r data/requirements.txt    # openpyxl 3.1.5
npm run data:fetch                      # raw/ へダウンロード（約 410MB）
npm run data:build                      # 統計の抽出 → 境界 → レイヤー → 結合確認と manifest
npm run data:places                     # Wikidata の座標を取り直すとき（結果は processed/ に保存済み）
```

## 元データ

| ファイル | 取得元 | SHA-256 |
| - | - | - |
| `raw/t1-1.xlsx` | e-Stat 令和2年国勢調査 人口等基本集計 第1-1表 `https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142402&fileKind=0` | `91ba30c83013cf2f6efb9fcec8c3496be99b77ab0b800f97441648e9108215ab` |
| `raw/t2-3.xlsx` | 同 第2-3表 `https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142406&fileKind=0` | `d148f2c3c26985fffecd44110e5792295c4e02514e49f1b2eb4764345e9f355a` |
| `raw/N03-20200101_GML.zip` | 国土数値情報 行政区域データ N03 2020 年 `https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2020/N03-20200101_GML.zip` | `f6c5c689e774003a16e6d132d80c5989d2afe1f2311e8bd90895d77339b4a22a` |
| `raw/N02-20_GML.zip` | 国土数値情報 鉄道データ N02 2020 年度 `https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-20/N02-20_GML.zip` | `12fadde339dfbe3088e99dbd53da19447cd7c4bb8ba4af540e2a73c86a0458c7` |
| `raw/A16-20_GML.zip` | 国土数値情報 人口集中地区データ A16 2020 年 `https://nlftp.mlit.go.jp/ksj/gml/data/A16/A16-20/A16-20_GML.zip` | `ebcb2b73ea298a44f8868b6eea6403e8b2f21e0bd454971da67616b1f5eb1e7e` |
| `processed/places_wikidata.json` | Wikidata Query Service `https://query.wikidata.org/sparql`（取得結果をそのまま保存） | — |

取得日：2026-11-04。

## 統計の扱い（`build_stats.py`）

- 第1-1表・第2-3表とも、「地域識別コード = a」の全国・47 都道府県の行を使う。
- 指標は表の値をそのまま使う。境界ポリゴンの面積などからは計算しない。

| 指標 | 列 | 備考 |
| - | - | - |
| 人口密度（人/km²） | 第1-1表「人口密度 1km2当たり」 | 面積は国土地理院「令和2年全国都道府県市区町村別面積調（10月1日時点）」。国勢調査施行規則第1条により調査対象外とした地域の面積を除いて算出 |
| 人口増減率（%） | 第1-1表「5年間の人口増減率」 | 2015 年の人口は 2020 年の境域に組み替えた値 |
| 平均世帯人員（人/世帯） | 第1-1表「世帯人員 一般世帯」÷「世帯数 一般世帯」 | 施設等の世帯を除く。唯一計算で求める指標 |
| 人口性比 | 第1-1表「人口性比」 | 女性 100 人に対する男性の数 |
| 高齢化率（%） | 第2-3表「人口構成比［年齢別］ 3_65歳以上」（国籍総数・男女総数） | 年齢「不詳」を除いて算出（表の注記） |

- 47 都道府県の人口の合計が全国値（126,146,099 人）と一致することを確認している。
- 欠損値はない。欠損があった場合は処理を止める（0 として塗らない）。
- 主要都市の人口：第1-1表の市の行（地域識別コード 1・2）のうち人口 50 万以上の 27 市と、東京都特別区部（コード 13100）。

## 都市の位置（`fetch_places.py`）

- 県庁所在都市：都道府県（P31=Q50337）の P36 の都市の座標 P625。東京都は新宿区。
- 主要都市：全国地方公共団体コード（P429）の上 5 桁が第1-1表のコードと一致する市の P625。東京 23 区は新宿区の座標を使う。
- どちらも各市の代表点（多くは市役所付近）で、庁舎の位置そのものではない。Wikidata は CC0。

## 境界の加工（表示用, `build_boundaries.mjs`）

1. 市区町村ポリゴンを行政区域コード `N03_007` の上 2 桁で dissolve。所属未定地（`N03_007` が空）は `N03_001` の都道府県名から割り当てる。
2. 東京都の北緯 31 度以南（小笠原諸島・沖ノ鳥島・南鳥島）を除外。
3. 面積 1km² 未満の島を除外。
4. mapshaper の Visvalingam（weighted）で頂点の 1% を保持し、TopoJSON（量子化 50000）で出力。

境界は 2020 年 1 月 1 日時点、統計は 10 月 1 日時点。この間に都道府県の境界の変更はない。

## レイヤーの加工（`build_layers.mjs`）

- 鉄道：鋼索鉄道（ケーブルカー, `N02_001 = 13`）を除き、事業者種別 `N02_002 = 1`（新幹線）とそれ以外の 2 区分に統合。頂点の 1.5% を保持。
- 人口集中地区：1,463 地区を 1 つの面に統合し、0.5km² 未満の部分を除外。頂点の 2.5% を保持。

## 出力

| ファイル | 内容 |
| - | - |
| `processed/stats_2020.json` / `.csv` | 47 都道府県の 5 指標・人口・面積、全国値、主要都市の人口、指標の定義 |
| `processed/prefectures.topo.json` | 47 都道府県の境界（id = 都道府県コード 2 桁, 経緯度 JGD2011） |
| `processed/railways.topo.json` | 鉄道（rail / shinkansen） |
| `processed/did.topo.json` | 人口集中地区（2020 年） |
| `processed/places_wikidata.json` | 県庁所在都市と主要都市の座標 |
| `processed/boundaries_params.json` / `layers_params.json` | 加工のパラメータ |
| `manifest.json` | 統計年・単位・地域コード・出典・利用条件・加工方法・結合結果 |
