// 国土数値情報 行政区域データ(N03, 2020年1月1日時点)の市区町村ポリゴンを
// 都道府県コード2桁で dissolve し、表示用に簡略化した TopoJSON を書き出す。
//
// 入力 : data/raw/n03/N03-20_200101.shp
// 出力 : data/processed/prefectures.topo.json
//
// 表示用の加工（manifest と README に記録）:
//  - 所属未定地(N03_007 が空)は N03_001 の都道府県名からコードを割り当てる
//  - 東京都のうち北緯31度より南の島（小笠原諸島・沖ノ鳥島・南鳥島）は表示しない
//  - 面積 1km2 未満の島は表示しない
//  - Visvalingam(weighted) で頂点の 1% を保持
// 簡略化ポリゴンの面積は人口密度の計算に使わない。
import mapshaper from 'mapshaper';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'data/raw/n03/N03-20_200101.shp');
const out = path.join(root, 'data/processed/prefectures.topo.json');
const density = JSON.parse(fs.readFileSync(path.join(root, 'data/processed/density_2020.json'), 'utf8'));

const nameToCode = Object.fromEntries(density.prefectures.map((p) => [p.name, p.code]));
if (!fs.existsSync(src)) {
  console.error('missing', src, '→ npm run data:fetch');
  process.exit(1);
}

export const PARAMS = {
  removeTokyoSouthOfLat: 31,
  minIslandKm2: 1,
  simplifyPercent: '1%',
  quantization: 50000,
};

const cmd = [
  `-i ${JSON.stringify(src)} encoding=sjis`,
  `-each 'pref = N03_007 ? N03_007.slice(0, 2) : (${JSON.stringify(nameToCode)})[N03_001]'`,
  `-filter-fields pref`,
  `-dissolve pref`,
  `-explode`,
  `-filter '!(pref === "13" && this.centroidY < ${PARAMS.removeTokyoSouthOfLat})'`,
  `-filter 'this.area >= ${PARAMS.minIslandKm2 * 1e6}'`,
  `-dissolve pref`,
  `-simplify weighted ${PARAMS.simplifyPercent} keep-shapes`,
  `-clean`,
  `-rename-layers prefectures`,
  `-o format=topojson quantization=${PARAMS.quantization} id-field=pref out.json`,
].join(' ');

const result = await mapshaper.applyCommands(cmd);
const topo = JSON.parse(result['out.json']);
const geoms = topo.objects.prefectures.geometries;
for (const g of geoms) {
  g.id = String(g.id ?? g.properties.pref);
  g.properties = { code: g.id };
}
geoms.sort((a, b) => a.id.localeCompare(b.id));
const ids = geoms.map((g) => g.id);
if (ids.length !== 47 || ids.some((id, i) => id !== String(i + 1).padStart(2, '0'))) {
  console.error('都道府県の境界が47件になりません', ids);
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(topo));
fs.writeFileSync(
  path.join(root, 'data/processed/boundaries_params.json'),
  JSON.stringify(PARAMS, null, 1) + '\n',
);
console.log('ok:', out, (fs.statSync(out).size / 1024).toFixed(0), 'KB');
