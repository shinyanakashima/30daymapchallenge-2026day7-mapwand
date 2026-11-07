import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, FeatureCollection, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import topoJson from '@data/processed/prefectures.topo.json';
import railJson from '@data/processed/railways.topo.json';
import didJson from '@data/processed/did.topo.json';
import statsJson from '@data/processed/stats_2020.json';
import placesJson from '@data/processed/places_wikidata.json';
import manifestJson from '@data/manifest.json';

export type IndicatorKey = 'density' | 'growth' | 'household' | 'sexratio' | 'aging';

export interface Indicator {
  key: IndicatorKey;
  label: string;
  unit: string;
  digits: number;
  /** 発散配色の境（なければ null） */
  diverging: number | null;
  table: string;
  note: string;
  en: { label: string; unit: string; table: string; note: string };
}

export interface Prefecture {
  code: string;
  name: string;
  shortName: string;
  nameEn: string;
  values: Record<IndicatorKey, number>;
  population: number;
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

/** データ項目の並びは protocol/mapwand.json の data 候補と同じ */
export const INDICATORS: Indicator[] = statsJson.indicators.map((i) => ({
  key: i.key as IndicatorKey,
  label: i.label,
  unit: i.unit,
  digits: i.digits,
  diverging: i.diverging,
  table: i.table,
  note: i.note,
  en: i.en,
}));

export const PREFECTURES: Prefecture[] = statsJson.prefectures.map((p) => {
  const f = geoms.get(p.code);
  if (!f) throw new Error(`boundary missing for ${p.code}`);
  return {
    code: p.code,
    name: p.name,
    shortName: p.name === '北海道' ? p.name : p.name.replace(/[都府県]$/, ''),
    nameEn: p.name_en,
    values: { density: p.density, growth: p.growth, household: p.household, sexratio: p.sexratio, aging: p.aging },
    population: p.population,
    feature: f,
  };
});

if (PREFECTURES.length !== 47) throw new Error('expected 47 prefectures');

const n = statsJson.national;
export const NATIONAL: Record<IndicatorKey, number> = {
  density: n.density,
  growth: n.growth,
  household: n.household,
  sexratio: n.sexratio,
  aging: n.aging,
};
export const MANIFEST = manifestJson;
export const DATA_VERSION = manifestJson.dataVersion;

const isOkinawa = (g: { id?: string | number }) => String(g.id) === '47';

/** 都道府県界（沖縄県は他県と接しない） */
export const INNER_BORDERS: MultiLineString = mesh(topo, obj, (a, b) => a !== b);
/** 海岸線（沖縄県以外） */
export const COAST_MAIN: MultiLineString = mesh(topo, obj, (a, b) => a === b && !isOkinawa(a));
/** 海岸線（沖縄県） */
export const COAST_OKINAWA: MultiLineString = mesh(topo, obj, (a, b) => a === b && isOkinawa(a));

// ---------------- レイヤー ----------------

const railTopo = railJson as unknown as Topology<{ railways: GeometryCollection<{ kind: string }> }>;
const railFc = feature(railTopo, railTopo.objects.railways) as unknown as FeatureCollection<
  MultiLineString,
  { kind: string }
>;
export const RAIL = railFc.features.find((f) => f.properties.kind === 'rail')!;
export const SHINKANSEN = railFc.features.find((f) => f.properties.kind === 'shinkansen')!;

const didTopo = didJson as unknown as Topology<{ did: GeometryCollection }>;
export const DID = (feature(didTopo, didTopo.objects.did) as unknown as FeatureCollection<MultiPolygon>).features[0];

export interface Place {
  name: string;
  nameEn: string;
  lonlat: [number, number];
  pref: string;
  population?: number;
}

/** 県庁所在都市（東京都は新宿区） */
export const CAPITALS: Place[] = placesJson.capitals.map((c) => ({
  name: c.pref === '13' ? '東京' : c.name.replace(/市$/, ''),
  nameEn: c.pref === '13' ? 'Tokyo' : c.name_en,
  lonlat: c.lonlat as [number, number],
  pref: c.pref,
}));

const coordOf = new Map(placesJson.cities.map((c) => [c.code, c.lonlat as [number, number]]));
const enOf = new Map(placesJson.cities.map((c) => [c.code, c.name_en]));
const tokyo = placesJson.capitals.find((c) => c.pref === '13')!.lonlat as [number, number];

/** 人口 50 万以上の市と東京 23 区。東京 23 区の位置は都庁（新宿区）の代表点 */
export const CITIES: Place[] = statsJson.cities.items
  .map((c) => ({
    name: c.name,
    nameEn: c.code === '13100' ? 'Tokyo 23 wards' : enOf.get(c.code)!,
    lonlat: c.code === '13100' ? tokyo : coordOf.get(c.code)!,
    pref: c.code.slice(0, 2),
    population: c.population,
  }))
  .sort((a, b) => b.population - a.population);
if (CITIES.some((c) => !c.lonlat)) throw new Error('city coordinate missing');
export const CITY_MIN_POPULATION = statsJson.cities.min_population;
