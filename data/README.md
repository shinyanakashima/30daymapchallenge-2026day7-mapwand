# data

統計表と境界データの取得・加工。元データ（`raw/`）は Git に入れず、加工済みの `processed/` と `manifest.json` を管理する。

## 再生成

```bash
npm ci                                  # リポジトリ直下（mapshaper 0.7.101）
pip install -r data/requirements.txt    # openpyxl 3.1.5
npm run data:fetch                      # raw/ へダウンロード（約 350MB）
npm run data:build                      # 抽出 → 境界の統合・簡略化 → 47 件の結合確認と manifest
```

## 元データ

| ファイル | 取得元 | SHA-256 |
| - | - | - |
| `raw/t1-1.xlsx` | e-Stat 令和2年国勢調査 人口等基本集計 第1-1表 `https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032142402&fileKind=0` | `91ba30c83013cf2f6efb9fcec8c3496be99b77ab0b800f97441648e9108215ab` |
| `raw/N03-20200101_GML.zip` | 国土数値情報 行政区域データ N03 2020 年 `https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2020/N03-20200101_GML.zip` | `f6c5c689e774003a16e6d132d80c5989d2afe1f2311e8bd90895d77339b4a22a` |

取得日：2026-11-04。

## 統計の扱い

- 第1-1表の「地域識別コード = a」かつ 2020 年地域コードが `XX000` の行（全国と 47 都道府県）を使う。
- 列は「人口 総数」「面積（参考）km2」「人口密度 1km2当たり」。人口密度は表の値をそのまま採用する。境界ポリゴンの面積からは計算しない。
- 表の注記：面積は国土地理院「令和2年全国都道府県市区町村別面積調（10月1日時点）」、人口密度は国勢調査施行規則第1条により調査対象外とした地域の面積を除いて算出。
- 47 都道府県の人口の合計が全国値（126,146,099 人）と一致することを確認している。
- 欠損値はない。欠損があった場合は処理を止める（0 として塗らない）。

## 境界の加工（表示用）

1. 市区町村ポリゴンを行政区域コード `N03_007` の上 2 桁で dissolve。所属未定地（`N03_007` が空）は `N03_001` の都道府県名から割り当てる。
2. 東京都の北緯 31 度以南（小笠原諸島・沖ノ鳥島・南鳥島）を除外。
3. 面積 1km² 未満の島を除外。
4. mapshaper の Visvalingam（weighted）で頂点の 1% を保持し、TopoJSON（量子化 50000）で出力。

境界は 2020 年 1 月 1 日時点、統計は 10 月 1 日時点。この間に都道府県の境界の変更はない。

## 出力

| ファイル | 内容 |
| - | - |
| `processed/density_2020.json` / `.csv` | 47 都道府県のコード・名称・人口・面積・人口密度 |
| `processed/prefectures.topo.json` | 47 都道府県の境界（id = 都道府県コード 2 桁, 経緯度 JGD2011） |
| `processed/boundaries_params.json` | 境界加工のパラメータ |
| `manifest.json` | 統計年・単位・地域コード・出典・利用条件・加工方法・結合結果 |
