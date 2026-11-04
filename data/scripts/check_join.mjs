// 統計表・境界・レイヤー・地点の整合を確認し、manifest を書き出す。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p = (f) => path.join(root, f);
const read = (f) => JSON.parse(fs.readFileSync(p(f), 'utf8'));
const stats = read('data/processed/stats_2020.json');
const topo = read('data/processed/prefectures.topo.json');
const params = read('data/processed/boundaries_params.json');
const lparams = read('data/processed/layers_params.json');
const places = read('data/processed/places_wikidata.json');

const statCodes = new Set(stats.prefectures.map((d) => d.code));
const geoCodes = new Set(topo.objects.prefectures.geometries.map((g) => g.id));
const missingGeo = [...statCodes].filter((c) => !geoCodes.has(c));
const missingStat = [...geoCodes].filter((c) => !statCodes.has(c));
const bad = [];
for (const d of stats.prefectures) for (const i of stats.indicators) if (!Number.isFinite(d[i.key])) bad.push(`${d.code}:${i.key}`);
const capCodes = new Set(places.capitals.map((c) => c.pref));
const cityCodes = new Set(places.cities.map((c) => c.code));
const missingCities = stats.cities.items.filter((c) => c.code !== '13100' && !cityCodes.has(c.code)).map((c) => c.code);
if (statCodes.size !== 47 || geoCodes.size !== 47 || missingGeo.length || missingStat.length || bad.length || capCodes.size !== 47 || missingCities.length) {
  console.error({ stat: statCodes.size, geo: geoCodes.size, missingGeo, missingStat, bad, capitals: capCodes.size, missingCities });
  process.exit(1);
}

const LICENSE_ESTAT = '政府統計の総合窓口(e-Stat)利用規約（政府標準利用規約 第2.0版準拠、CC BY 4.0 互換）。出典記載と加工の旨の記載が必要';
const LICENSE_KSJ_OPEN = '国土数値情報ダウンロードサイトコンテンツ利用規約（政府標準利用規約準拠版、CC BY 4.0 互換）。出典と加工の旨の記載が必要';
const manifest = {
  dataVersion: 'census2020-v2',
  statistics: {
    survey: stats.survey,
    reference_date: stats.reference_date,
    region_code: 'JIS X 0401 都道府県コード（2桁）',
    license: LICENSE_ESTAT,
    retrieved: '2026-11-04',
    sources: stats.sources,
    indicators: stats.indicators,
    cities: { rule: `人口${stats.cities.min_population.toLocaleString('ja-JP')}以上の市（第1-1表の市の行）と東京都特別区部`, count: stats.cities.items.length },
  },
  boundaries: {
    name: '国土数値情報 行政区域データ（N03）2020年（令和2年1月1日時点）',
    url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2020.html',
    license: LICENSE_KSJ_OPEN,
    retrieved: '2026-11-04',
    processing: [
      '市区町村ポリゴンを行政区域コード(N03_007)の上2桁で dissolve（所属未定地は N03_001 の都道府県名から割当）',
      `東京都の北緯${params.removeTokyoSouthOfLat}度以南（小笠原諸島・沖ノ鳥島・南鳥島）を表示から除外`,
      `${params.minIslandKm2}km² 未満の島を表示から除外`,
      `mapshaper Visvalingam weighted で頂点 ${params.simplifyPercent} を保持、TopoJSON 量子化 ${params.quantization}`,
      '簡略化ポリゴンの面積は統計値の計算に使用しない',
    ],
  },
  layers: {
    railways: {
      name: '国土数値情報 鉄道データ（N02）2020年度',
      url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2020.html',
      license: LICENSE_KSJ_OPEN,
      processing: [`鋼索鉄道を除外（${lparams.railways.exclude}）`, '新幹線とそれ以外の2区分に統合', `頂点 ${lparams.railways.simplify} を保持`],
    },
    did: {
      name: '国土数値情報 人口集中地区データ（A16）2020年',
      url: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-A16-2020.html',
      license: '国土数値情報 利用規約（1995年以降は商用可）。出典記載が必要',
      processing: ['全地区を1つの面に統合', `${lparams.did.minPartKm2}km² 未満の部分を除外`, `頂点 ${lparams.did.simplify} を保持`],
    },
    places: {
      name: 'Wikidata（県庁所在都市 P36 の座標 P625、全国地方公共団体コード P429 で照合した市の座標）',
      url: places.endpoint,
      license: 'CC0',
      note: '各市の代表点（多くは市役所付近）で、庁舎の位置そのものではない。東京23区は都庁所在の新宿区の座標',
      capitals: places.capitals.length,
      cities: places.cities.length,
    },
  },
  basemaps: {
    name: '地理院タイル（淡色地図・標準地図・白地図・陰影起伏図・全国最新写真（シームレス））',
    url: 'https://maps.gsi.go.jp/development/ichiran.html',
    note: '実行時にブラウザが読み込む（リポジトリには含めない）。小縮尺で必要な追加の出典表記は地図に自動で入れる',
  },
  display: {
    projection: 'Webメルカトル図法（d3-geo geoMercator。地理院タイルと同じ投影。北ほど面積が大きく表示される）',
    insets: '沖縄県を左上の枠内へ移動して表示（縮尺は本図と異なる）',
  },
  join: { key: 'code', matched: 47, missing_in_boundaries: [], missing_in_statistics: [] },
  generated_by: [
    'data/scripts/build_stats.py',
    'data/scripts/fetch_places.py',
    'data/scripts/build_boundaries.mjs',
    'data/scripts/build_layers.mjs',
    'data/scripts/check_join.mjs',
  ],
};
fs.writeFileSync(p('data/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`ok: 47/47 joined, ${stats.indicators.length} indicators, ${places.capitals.length} capitals, ${places.cities.length + 1} cities`);
