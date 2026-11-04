// 重ねるレイヤー（鉄道・人口集中地区）を表示用に簡略化した TopoJSON にする。
//
// 入力 : data/raw/n02/N02-20_GML/N02-20_RailroadSection.shp（国土数値情報 鉄道 2020年）
//        data/raw/a16/A16-20_00_DID.shp（国土数値情報 人口集中地区 2020年）
// 出力 : data/processed/railways.topo.json, data/processed/did.topo.json
//
// 鉄道: 鋼索鉄道（ケーブルカー, N02_001=13）を除き、新幹線（N02_002=1）とそれ以外の 2 区分に統合
// DID : 1,463 地区をまとめて 1 つの面にし、全国図で見える程度に簡略化
import mapshaper from 'mapshaper';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p = (f) => path.join(root, f);

export const LAYER_PARAMS = {
  railways: { exclude: 'N02_001 === "13"', simplify: '1.5%' },
  did: { simplify: '2.5%', minPartKm2: 0.5 },
};

async function run(cmd, outName) {
  const out = await mapshaper.applyCommands(cmd);
  const txt = out[outName];
  fs.writeFileSync(p(`data/processed/${outName}`), txt);
  console.log('ok:', outName, (txt.length / 1024).toFixed(0), 'KB');
  return JSON.parse(txt);
}

const rail = await run(
  [
    `-i ${JSON.stringify(p('data/raw/n02/N02-20_GML/N02-20_RailroadSection.shp'))} encoding=sjis`,
    `-filter '!(${LAYER_PARAMS.railways.exclude})'`,
    `-each 'kind = N02_002 === "1" ? "shinkansen" : "rail"'`,
    `-filter-fields kind`,
    `-dissolve kind`,
    `-simplify ${LAYER_PARAMS.railways.simplify} keep-shapes`,
    `-rename-layers railways`,
    `-o format=topojson quantization=50000 railways.topo.json`,
  ].join(' '),
  'railways.topo.json',
);

const did = await run(
  [
    `-i ${JSON.stringify(p('data/raw/a16/A16-20_00_DID.shp'))}`,
    `-each 'one = 1'`,
    `-filter-fields one`,
    `-dissolve one`,
    `-explode`,
    `-filter 'this.area >= ${LAYER_PARAMS.did.minPartKm2 * 1e6}'`,
    `-dissolve one`,
    `-simplify ${LAYER_PARAMS.did.simplify} keep-shapes`,
    `-clean`,
    `-rename-layers did`,
    `-o format=topojson quantization=50000 did.topo.json`,
  ].join(' '),
  'did.topo.json',
);

const kinds = rail.objects.railways.geometries.map((g) => g.properties.kind).sort();
if (kinds.join() !== 'rail,shinkansen' || did.objects.did.geometries.length !== 1) {
  console.error('unexpected layer output', kinds, did.objects.did.geometries.length);
  process.exit(1);
}
fs.writeFileSync(p('data/processed/layers_params.json'), JSON.stringify(LAYER_PARAMS, null, 1) + '\n');
