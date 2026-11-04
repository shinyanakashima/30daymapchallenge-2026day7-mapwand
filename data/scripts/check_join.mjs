// 統計表と境界の 47 都道府県が 1 対 1 で結合できるか確認し、manifest を書き出す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p = (f) => path.join(root, f);
const density = JSON.parse(fs.readFileSync(p('data/processed/density_2020.json'), 'utf8'));
const topo = JSON.parse(fs.readFileSync(p('data/processed/prefectures.topo.json'), 'utf8'));
const params = JSON.parse(fs.readFileSync(p('data/processed/boundaries_params.json'), 'utf8'));

const statCodes = new Set(density.prefectures.map((d) => d.code));
const geoCodes = new Set(topo.objects.prefectures.geometries.map((g) => g.id));
const missingGeo = [...statCodes].filter((c) => !geoCodes.has(c));
const missingStat = [...geoCodes].filter((c) => !statCodes.has(c));
const bad = density.prefectures.filter((d) => !(Number.isFinite(d.density) && d.density > 0));
if (statCodes.size !== 47 || geoCodes.size !== 47 || missingGeo.length || missingStat.length || bad.length) {
  console.error({ stat: statCodes.size, geo: geoCodes.size, missingGeo, missingStat, bad });
  process.exit(1);
}

const manifest = {
  dataVersion: 'pd2020-n03-2020-v1',
  theme: '都道府県別人口密度',
  statistic: {
    name: '人口密度',
    unit: '人/km²',
    reference_date: density.reference_date,
    survey: '令和2年国勢調査（2020年）人口等基本集計',
    table: '第1-1表 男女別人口，世帯の種類別世帯数及び世帯人員並びに…面積（参考）及び人口密度－全国，都道府県，市区町村',
    statInfId: density.statInfId,
    url: density.url,
    definition:
      '人口総数÷面積（1km²当たり）。面積は国土地理院「令和2年全国都道府県市区町村別面積調（10月1日時点）」。国勢調査施行規則第1条により調査対象外とした地域の面積を除いて統計局が算出した値を表から転記。',
    source_sha256: density.source_sha256,
    license: '政府統計の総合窓口(e-Stat)利用規約（政府標準利用規約 第2.0版準拠、CC BY 4.0 互換）。出典記載と加工の旨の記載が必要',
    retrieved: '2026-11-04',
    region_code: 'JIS X 0401 都道府県コード（2桁）',
  },
  boundaries: {
    name: '国土数値情報 行政区域データ（N03）2020年（令和2年1月1日時点）',
    url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2020.html',
    file: 'N03-20200101_GML.zip / N03-20_200101.shp',
    license: '国土数値情報ダウンロードサイトコンテンツ利用規約（政府標準利用規約準拠版、CC BY 4.0 互換）。出典と加工の旨の記載が必要',
    retrieved: '2026-11-04',
    credit: '「国土数値情報（行政区域データ）」（国土交通省）（https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2020.html）を加工して作成',
    processing: [
      '市区町村ポリゴンを行政区域コード(N03_007)の上2桁で dissolve（所属未定地は N03_001 の都道府県名から割当）',
      `東京都の北緯${params.removeTokyoSouthOfLat}度以南（小笠原諸島・沖ノ鳥島・南鳥島）を表示から除外`,
      `${params.minIslandKm2}km² 未満の島を表示から除外`,
      `mapshaper Visvalingam weighted で頂点 ${params.simplifyPercent} を保持、TopoJSON 量子化 ${params.quantization}`,
      '簡略化ポリゴンの面積は人口密度の計算に使用しない',
    ],
  },
  display: {
    projection: '正積円錐図法（Albers, 標準緯線 北緯33度・43度, 中央経線 東経136度）',
    insets: '沖縄県を左上の枠内へ移動して表示（縮尺は本図と異なる）',
  },
  join: { key: 'code', matched: 47, missing_in_boundaries: [], missing_in_statistics: [] },
  generated_by: ['data/scripts/build_density.py', 'data/scripts/build_boundaries.mjs', 'data/scripts/check_join.mjs'],
};
fs.writeFileSync(p('data/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const vals = density.prefectures.map((d) => d.density).sort((a, b) => a - b);
console.log(`ok: 47/47 joined. density min ${vals[0]} max ${vals[46]}`);
