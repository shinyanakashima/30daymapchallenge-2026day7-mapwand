import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import topoJson from '@data/processed/prefectures.topo.json';
import densityJson from '@data/processed/density_2020.json';
import manifestJson from '@data/manifest.json';

export interface Prefecture {
  code: string;
  name: string;
  shortName: string;
  density: number;
  population: number;
  areaKm2: number;
  feature: Feature<Polygon | MultiPolygon>;
}

const topo = topoJson as unknown as Topology<{ prefectures: GeometryCollection }>;
const obj = topo.objects.prefectures;

const geoms = new Map(
  (feature(topo, obj) as unknown as { features: Feature<Polygon | MultiPolygon>[] }).features.map((f) => [
    String(f.id),
    f,
  ]),
);

export const PREFECTURES: Prefecture[] = densityJson.prefectures.map((p) => {
  const f = geoms.get(p.code);
  if (!f) throw new Error(`boundary missing for ${p.code}`);
  return {
    code: p.code,
    name: p.name,
    shortName: p.name === '北海道' ? p.name : p.name.replace(/[都府県]$/, ''),
    density: p.density,
    population: p.population,
    areaKm2: p.area_km2,
    feature: f,
  };
});

if (PREFECTURES.length !== 47) throw new Error('expected 47 prefectures');

export const NATIONAL_DENSITY = densityJson.national.density;
export const MANIFEST = manifestJson;
export const DATA_VERSION = manifestJson.dataVersion;

const isOkinawa = (g: { id?: string | number }) => String(g.id) === '47';

/** 都道府県界（沖縄県を除く。沖縄県は他県と接しない） */
export const INNER_BORDERS: MultiLineString = mesh(topo, obj, (a, b) => a !== b);
/** 海岸線（沖縄県以外） */
export const COAST_MAIN: MultiLineString = mesh(topo, obj, (a, b) => a === b && !isOkinawa(a));
/** 海岸線（沖縄県） */
export const COAST_OKINAWA: MultiLineString = mesh(topo, obj, (a, b) => a === b && isOkinawa(a));
