// 地図の構成要素（シーン）を組み立てる。画面表示(SVG)と PNG 書き出し(Canvas)は
// 同じシーンから描くので、見た目が一致する。
import { geoGraticule, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import {
  CAPITALS,
  CITIES,
  CITY_MIN_POPULATION,
  COAST_MAIN,
  COAST_OKINAWA,
  DID,
  INDICATORS,
  INNER_BORDERS,
  NATIONAL,
  PREFECTURES,
  RAIL,
  SHINKANSEN,
  type Indicator,
  type Prefecture,
} from '../data/dataset';
import { quantileClassify, type Classification } from './classify';
import type { Lang } from '../i18n';
import { ITEMS } from '../protocol/generated';
import {
  BASEMAPS,
  CLASS_COUNTS,
  FONT_FAMILY,
  FRAMES,
  LABEL_MODES,
  LAYER_SETS,
  LINE_WIDTHS,
  MAJOR_PREFS,
  STYLES,
  TITLES,
  divergingColors,
  paletteColors,
  type Basemap,
  type FrameKind,
  type LayerSet,
  type StylePreset,
} from './presets';

export const SCENE_W = 1600;
export const SCENE_H = 1200;

export interface MapSettings {
  data: number;
  style: number;
  base: number;
  color: number;
  classes: number;
  line: number;
  label: number;
  layer: number;
  frame: number;
  title: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Prim =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; fo?: number; stroke?: string; sw?: number }
  | {
      t: 'path';
      d: string;
      fill?: string;
      fo?: number;
      stroke?: string;
      sw?: number;
      so?: number;
      join?: 'round' | 'miter';
      id?: string;
    }
  | { t: 'circle'; cx: number; cy: number; r: number; fill?: string; fo?: number; stroke?: string; sw?: number }
  | { t: 'image'; href: string; x: number; y: number; w: number; h: number; opacity?: number; blend?: 'multiply' }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      weight: number;
      family: string;
      fill: string;
      anchor: 'start' | 'middle' | 'end';
      halo?: string;
      haloW?: number;
    }
  | { t: 'group'; clip?: Box; children: Prim[] };

export interface Scene {
  w: number;
  h: number;
  bg: string;
  prims: Prim[];
  classification: Classification;
  colors: string[];
  indicator: Indicator;
}

// ---------------- 構図 ----------------

interface FrameLayout {
  /** 本図を収める範囲 */
  main: Box;
  /** 寄り: 本図の拡大率と、指定の経緯度を置く画面上の位置 */
  zoom?: { k: number; center: [number, number]; at: [number, number] };
  inset: Box;
  /** 凡例の左端と下端 */
  legend: { x: number; bottom: number };
  title: { x: number; y: number; size: number };
}

const CREDIT_TOP = SCENE_H - 104;

const LAYOUTS: Record<FrameKind, FrameLayout> = {
  full: {
    main: { x: 250, y: 70, w: 1320, h: 1010 },
    inset: { x: 60, y: 300, w: 380, h: 230 },
    legend: { x: 1210, bottom: CREDIT_TOP - 16 },
    title: { x: 60, y: 110, size: 56 },
  },
  wide: {
    main: { x: 470, y: 230, w: 900, h: 760 },
    inset: { x: 140, y: 400, w: 320, h: 195 },
    legend: { x: 1210, bottom: CREDIT_TOP - 40 },
    title: { x: 140, y: 170, size: 52 },
  },
  close: {
    main: { x: 250, y: 70, w: 1320, h: 1010 },
    zoom: { k: 1.35, center: [137.4, 36.3], at: [860, 600] },
    inset: { x: 50, y: 250, w: 340, h: 205 },
    legend: { x: 1220, bottom: CREDIT_TOP - 12 },
    title: { x: 50, y: 100, size: 54 },
  },
};

const MAIN_FC: FeatureCollection<Polygon | MultiPolygon> = {
  type: 'FeatureCollection',
  features: PREFECTURES.filter((p) => p.code !== '47').map((p) => p.feature),
};
const OKINAWA = PREFECTURES.find((p) => p.code === '47')!;

interface Projected {
  proj: GeoProjection;
  path: ReturnType<typeof geoPath>;
}

interface FrameGeometry {
  layout: FrameLayout;
  main: Projected;
  inset: Projected;
  fills: Map<string, string>;
  inner: string;
  coastMain: string;
  coastOkinawa: string;
  graticule: string;
  labelPos: Map<string, [number, number]>;
  labelPosEn: Map<string, [number, number]>;
  rail: { main: string; inset: string };
  shinkansen: string;
  did: { main: string; inset: string };
}

// 地名の位置を手で調整する県（経緯度）。重心が海や隣県に寄るもの、混み合う地域。
const LABEL_LONLAT: Record<string, [number, number]> = {
  '01': [142.9, 43.4],
  '04': [140.85, 38.45],
  '11': [139.25, 36.04],
  '12': [140.25, 35.5],
  '13': [139.32, 35.72],
  '14': [139.3, 35.42],
  '16': [137.25, 36.65],
  '17': [136.62, 36.42],
  '19': [138.62, 35.6],
  '22': [138.2, 35.05],
  '23': [137.2, 35.1],
  '24': [136.4, 34.45],
  '25': [136.15, 35.22],
  '26': [135.4, 35.42],
  '27': [135.45, 34.68],
  '28': [134.75, 35.0],
  '29': [135.9, 34.3],
  '30': [135.5, 33.95],
  '33': [133.8, 34.95],
  '34': [132.75, 34.6],
  '37': [133.95, 34.25],
  '36': [134.25, 33.9],
  '41': [130.1, 33.3],
  '42': [129.75, 32.9],
  '40': [130.7, 33.55],
  '46': [130.55, 31.65],
  '47': [127.9, 26.45],
};

// 英語名は長いので、混み合う地域を中心に位置を調整する（経緯度）
const LABEL_LONLAT_EN: Record<string, [number, number]> = {
  '04': [141.05, 38.5],
  '06': [139.95, 38.5],
  '08': [140.3, 36.3],
  '09': [139.8, 36.72],
  '10': [138.95, 36.52],
  '11': [139.35, 36.06],
  '12': [140.25, 35.5],
  '13': [139.35, 35.72],
  '14': [139.35, 35.4],
  '17': [136.62, 36.4],
  '16': [137.3, 36.68],
  '18': [136.2, 35.92],
  '19': [138.5, 35.6],
  '20': [138.05, 36.1],
  '21': [136.95, 35.78],
  '22': [138.25, 35.05],
  '23': [137.2, 35.05],
  '24': [136.45, 34.5],
  '25': [136.1, 35.25],
  '26': [135.45, 35.45],
  '27': [135.45, 34.62],
  '28': [134.8, 35.12],
  '29': [135.85, 34.25],
  '30': [135.45, 33.95],
  '31': [133.85, 35.42],
  '32': [132.5, 35.05],
  '33': [133.75, 34.95],
  '34': [132.75, 34.6],
  '35': [131.5, 34.2],
  '36': [134.3, 33.85],
  '37': [133.95, 34.25],
  '38': [132.85, 33.7],
  '39': [133.5, 33.5],
  '40': [130.7, 33.55],
  '41': [130.12, 33.3],
  '42': [129.85, 32.85],
  '43': [130.8, 32.6],
  '44': [131.42, 33.2],
  '45': [131.3, 32.2],
  '46': [130.55, 31.6],
};

const geomCache = new Map<FrameKind, FrameGeometry>();

function largestPolygon(f: Feature<Polygon | MultiPolygon>, path: ReturnType<typeof geoPath>): Feature<Polygon> {
  if (f.geometry.type === 'Polygon') return f as Feature<Polygon>;
  let best: Feature<Polygon> | null = null;
  let bestArea = -1;
  for (const coords of f.geometry.coordinates) {
    const g: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } };
    const a = path.area(g);
    if (a > bestArea) {
      bestArea = a;
      best = g;
    }
  }
  return best!;
}

function frameGeometry(kind: FrameKind): FrameGeometry {
  const cached = geomCache.get(kind);
  if (cached) return cached;
  const layout = LAYOUTS[kind];
  const m = layout.main;
  const proj = geoMercator().fitExtent(
    [
      [m.x, m.y],
      [m.x + m.w, m.y + m.h],
    ],
    MAIN_FC,
  );
  if (layout.zoom) {
    proj.scale(proj.scale() * layout.zoom.k);
    const p = proj(layout.zoom.center)!;
    const [tx, ty] = proj.translate();
    proj.translate([tx + layout.zoom.at[0] - p[0], ty + layout.zoom.at[1] - p[1]]);
  }
  const ib = layout.inset;
  const pad = 18;
  const insetProj = geoMercator().fitExtent(
    [
      [ib.x + pad, ib.y + pad + 14],
      [ib.x + ib.w - pad, ib.y + ib.h - pad],
    ],
    OKINAWA.feature,
  );
  const path = geoPath(proj).digits(1);
  const insetPath = geoPath(insetProj).digits(1);

  const fills = new Map<string, string>();
  const labelPos = new Map<string, [number, number]>();
  const labelPosEn = new Map<string, [number, number]>();
  for (const p of PREFECTURES) {
    const isOk = p.code === '47';
    const pth = isOk ? insetPath : path;
    const pr = isOk ? insetProj : proj;
    fills.set(p.code, pth(p.feature) ?? '');
    const fixed = LABEL_LONLAT[p.code];
    const pos = fixed ? (pr(fixed) as [number, number]) : pth.centroid(largestPolygon(p.feature, pth));
    labelPos.set(p.code, pos);
    const fixedEn = LABEL_LONLAT_EN[p.code];
    labelPosEn.set(p.code, fixedEn ? (pr(fixedEn) as [number, number]) : pos);
  }
  const g: FrameGeometry = {
    layout,
    main: { proj, path },
    inset: { proj: insetProj, path: insetPath },
    fills,
    inner: path(INNER_BORDERS) ?? '',
    coastMain: path(COAST_MAIN) ?? '',
    coastOkinawa: insetPath(COAST_OKINAWA) ?? '',
    graticule: path(geoGraticule().step([5, 5]).extent([[115, 15], [160, 55]])()) ?? '',
    labelPos,
    labelPosEn,
    rail: { main: path(RAIL) ?? '', inset: insetPath(RAIL) ?? '' },
    shinkansen: path(SHINKANSEN) ?? '',
    did: { main: path(DID) ?? '', inset: insetPath(DID) ?? '' },
  };
  geomCache.set(kind, g);
  return g;
}

// ---------------- 地理院タイル ----------------

/** Web メルカトルの投影に合わせて、範囲 clip を覆うタイル画像を並べる */
export function tilePrims(proj: GeoProjection, clip: Box, base: Basemap): Prim[] {
  if (!base.url) return [];
  const s = proj.scale();
  const [tx, ty] = proj.translate();
  const world = 2 * Math.PI * s; // ズーム 0 の世界全体の画面上の幅
  const z = Math.min(base.zoom[1], Math.max(base.zoom[0], Math.ceil(Math.log2(world / 256))));
  const n = 2 ** z;
  const T = world / n;
  const ox = tx - Math.PI * s;
  const oy = ty - Math.PI * s;
  const x0 = Math.max(0, Math.floor((clip.x - ox) / T));
  const x1 = Math.min(n - 1, Math.floor((clip.x + clip.w - ox) / T));
  const y0 = Math.max(0, Math.floor((clip.y - oy) / T));
  const y1 = Math.min(n - 1, Math.floor((clip.y + clip.h - oy) / T));
  const out: Prim[] = [];
  const multiply = base.mode === 'multiply';
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      out.push({
        t: 'image',
        href: base.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)),
        // 継ぎ目に細い線が出ないよう 0.5px 重ねる
        x: ox + x * T,
        y: oy + y * T,
        w: T + 0.5,
        h: T + 0.5,
        opacity: base.opacity,
        blend: multiply ? 'multiply' : undefined,
      });
    }
  }
  return out;
}

// ---------------- 書式 ----------------

export function formatValue(v: number, ind: Indicator, lang: Lang = 'ja'): string {
  const s = Math.abs(v).toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    minimumFractionDigits: ind.digits,
    maximumFractionDigits: ind.digits,
  });
  if (ind.diverging !== null) return (v > 0 ? '+' : v < 0 ? '−' : '±') + s;
  return v < 0 ? '−' + s : s;
}

/** 欧文を単語の切れ目で折り返す（半角 1 字 = 0.55 で数える） */
function wrapWords(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length * 0.55 > max && cur) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 全角を 1、半角を 0.55 として幅を数え、max 文字幅で折り返す */
function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = '';
  let w = 0;
  for (const ch of text) {
    const cw = ch.charCodeAt(0) < 0x2000 ? 0.55 : 1;
    if (w + cw > max && cur) {
      lines.push(cur);
      cur = '';
      w = 0;
    }
    cur += ch;
    w += cw;
  }
  if (cur) lines.push(cur);
  return lines;
}

function creditLinesEn(ind: Indicator, base: Basemap, layers: LayerSet, serif: boolean): string[] {
  // 国土数値情報には公式の英語名がないので、データの記号を添えて元をたどれるようにする
  const ksj = ['Administrative Areas N03'];
  if (layers.railways) ksj.push('Railways N02');
  if (layers.did) ksj.push('Densely Inhabited Districts A16');
  const src = [
    `Sources: Statistics Bureau of Japan, 2020 Population Census, Basic Complete Tabulation on Population and Households, ${ind.en.table} (e-Stat)`,
    `National Land Numerical Information (${ksj.join(', ')}), MLIT`,
  ];
  if (layers.capitals || layers.cities) src.push('Wikidata (city locations)');
  if (base.url) src.push(base.creditEn);
  const notes = [
    `${ind.en.label}: ${ind.en.note}. `,
    'Web Mercator projection (areas further north look larger). Okinawa is shown in the inset at a different scale. Some remote islands, including the Ogasawara Islands, are omitted.',
  ];
  const width = serif ? 112 : 122; // 明朝体は字幅が広い
  return [...wrapWords(src.join('; ') + '. Processed by the author.', width), ...wrapWords(notes.join(''), width)];
}

export interface CreditLine {
  text: string;
  /** 地理院タイルの追加の出典表記（小さめの字） */
  small: boolean;
}

export function creditLines(ind: Indicator, base: Basemap, layers: LayerSet, serif = false, lang: Lang = 'ja'): CreditLine[] {
  const main = lang === 'en' ? creditLinesEn(ind, base, layers, serif) : creditLinesJa(ind, base, layers, serif);
  // LP DAAC の引用形式の (Year) は、画像を取得した年に置き換える
  const extraText = base.extraCredit?.replace('(Year)', `(${new Date().getFullYear()})`);
  const extra = extraText ? wrapWords(extraText, 108) : [];
  return [...main.map((text) => ({ text, small: false })), ...extra.map((text) => ({ text, small: true }))];
}

function creditLinesJa(ind: Indicator, base: Basemap, layers: LayerSet, serif: boolean): string[] {
  const boundary = ['行政区域データ'];
  if (layers.railways) boundary.push('鉄道データ');
  if (layers.did) boundary.push('人口集中地区データ');
  const src = [
    `出典：総務省統計局「令和2年国勢調査 人口等基本集計」${ind.table}（e-Stat）`,
    `「国土数値情報（${boundary.join('・')}）」（国土交通省）`,
  ];
  if (layers.capitals || layers.cities) src.push('Wikidata（都市の位置）');
  if (base.url) src.push(base.credit);
  const notes = [
    `${ind.label}：${ind.note}。`,
    'Webメルカトル図法（北ほど面積が大きく表示される）。沖縄県は枠内に移動（縮尺は本図と異なる）。小笠原諸島など一部の島は省略。',
  ];
  const width = serif ? 100 : 108; // 明朝体は字幅が広い
  return [...wrap(src.join('、') + 'を加工して作成', width), ...wrap(notes.join(''), width)];
}

// ---------------- シーン ----------------

const CITY_R_MAX = 34; // 東京 23 区の円の半径（px）
const cityRadius = (pop: number) => CITY_R_MAX * Math.sqrt(pop / CITIES[0].population!);

function layerColors(style: StylePreset) {
  return {
    rail: style.text,
    did: style.text,
    city: style.bg,
  };
}

// 地図の中の文字（言語別）
const TEXT = {
  ja: {
    okinawa: '沖縄県',
    subtitle: (l: string) => `令和2年（2020年）国勢調査　都道府県別の${l}`,
    classes: (u: string, k: number) => `${u}　分位分類 ${k}階級`,
    national: (v: string) => `全国 ${v}　右の数は都道府県数`,
    diverging: (p: number) => `${p} を境に色の系統を分けています`,
    reclass: (merged: boolean, p: number | null, r: number, k: number) =>
      `${merged ? '同じ値の整理' : `${p} での分割`}により ${r}→${k}階級`,
    did: '人口集中地区（2020年）',
    rail: '鉄道',
    shinkansen: '新幹線',
    capital: '県庁所在都市',
    cities: (min: number) => `人口（${(min / 10000).toFixed(0)}万以上の市・東京23区）`,
    pop: (v: number) => `${v / 10000}万`,
  },
  en: {
    okinawa: 'Okinawa',
    subtitle: (l: string) => `2020 Population Census of Japan — ${l.toLowerCase()} by prefecture`,
    classes: (u: string, k: number) => `${u} · quantiles, ${k} classes`,
    national: (v: string) => `Japan ${v} · count = prefectures`,
    diverging: (p: number) => `Color scheme splits at ${p}`,
    reclass: (merged: boolean, p: number | null, r: number, k: number) =>
      `${r}→${k} classes (${merged ? 'tied values merged' : `split at ${p}`})`,
    did: 'Densely inhabited districts (2020)',
    rail: 'Railways',
    shinkansen: 'Shinkansen',
    capital: 'Prefectural capitals',
    cities: (min: number) => `Population (cities ${min / 1000}k+, Tokyo 23 wards)`,
    pop: (v: number) => (v >= 1_000_000 ? `${v / 1_000_000}M` : `${v / 1000}k`),
  },
};

const TITLES_EN = ITEMS.find((i) => i.key === 'title')!.candidates.map((c) => c.en);

/** タイトル。{指標} / {indicator}（小文字）/ {Indicator}（先頭大文字）を置き換える */
export function titleText(index: number, ind: Indicator, lang: Lang): string {
  if (lang === 'ja') return TITLES[index].replace('{指標}', ind.label);
  const l = ind.en.label;
  return TITLES_EN[index]
    .replace('{Indicator}', l.charAt(0).toUpperCase() + l.slice(1))
    .replace('{indicator}', l.toLowerCase());
}

export function buildScene(s: MapSettings, lang: Lang = 'ja'): Scene {
  const tx = TEXT[lang];
  const en = lang === 'en';
  const style = STYLES[s.style];
  const ind = INDICATORS[s.data];
  const base = BASEMAPS[s.base];
  const layers = LAYER_SETS[s.layer];
  const frame = FRAMES[s.frame];
  const g = frameGeometry(frame);
  const L = g.layout;
  const family = FONT_FAMILY[style.font];
  const lw = LINE_WIDTHS[s.line];
  const lc = layerColors(style);
  const rows = PREFECTURES.map((p) => ({ key: p.code, value: p.values[ind.key] }));
  const cls = quantileClassify(rows, CLASS_COUNTS[s.classes], ind.diverging);
  const colors =
    ind.diverging === null
      ? paletteColors(s.color, cls.k, style.ramp, style.bg)
      : divergingColors(s.color, cls.below, cls.k - cls.below, style.ramp, style.bg);
  const fillOf = (code: string) => colors[cls.classOf.get(code)!];
  const fo = base.mode === 'under' ? base.fillOpacity : 1;
  const coastW = Math.max(0.6, Math.min(lw, 1.2));
  const prims: Prim[] = [];
  const text = (
    x: number,
    y: number,
    t: string,
    size: number,
    opt: Partial<Extract<Prim, { t: 'text' }>> = {},
  ): Prim => ({ t: 'text', x, y, text: t, size, weight: 400, family, fill: style.text, anchor: 'start', ...opt });

  const full: Box = { x: 0, y: 0, w: SCENE_W, h: SCENE_H };
  prims.push({ t: 'rect', ...full, fill: style.bg });
  if (!base.url && style.graticule) prims.push({ t: 'path', d: g.graticule, stroke: style.graticule, sw: 1 });

  // 1 つの投影について、ベースマップ・塗り・レイヤーを重ねる
  const drawMap = (pj: Projected, clip: Box, codes: Prefecture[], coast: string, inner: string | null, isInset: boolean) => {
    const out: Prim[] = [];
    if (base.mode === 'under') out.push(...tilePrims(pj.proj, clip, base));
    for (const p of codes) out.push({ t: 'path', d: g.fills.get(p.code)!, fill: fillOf(p.code), fo, id: p.code });
    if (base.mode === 'multiply') out.push(...tilePrims(pj.proj, clip, base));
    if (layers.did) out.push({ t: 'path', d: isInset ? g.did.inset : g.did.main, fill: lc.did, fo: 0.3 });
    if (inner) out.push({ t: 'path', d: inner, stroke: style.border, sw: lw, join: 'round' });
    out.push({ t: 'path', d: coast, stroke: style.coast, sw: coastW, join: 'round' });
    if (layers.railways) {
      out.push({ t: 'path', d: isInset ? g.rail.inset : g.rail.main, stroke: lc.rail, sw: 1, so: 0.75, join: 'round' });
      if (!isInset) {
        out.push({ t: 'path', d: g.shinkansen, stroke: style.bg, sw: 4.2, join: 'round' });
        out.push({ t: 'path', d: g.shinkansen, stroke: lc.rail, sw: 2.2, join: 'round' });
      }
    }
    if (layers.cities) {
      for (const c of CITIES) {
        if ((c.pref === '47') !== isInset) continue;
        const [x, y] = pj.proj(c.lonlat)!;
        out.push({ t: 'circle', cx: x, cy: y, r: cityRadius(c.population!), fill: lc.city, fo: 0.45, stroke: style.text, sw: 1.4 });
      }
    }
    if (layers.capitals) {
      for (const c of CAPITALS) {
        if ((c.pref === '47') !== isInset) continue;
        const [x, y] = pj.proj(c.lonlat)!;
        out.push({ t: 'circle', cx: x, cy: y, r: 4, fill: style.bg, stroke: style.text, sw: 1.8 });
        // 県名の地名を出さないときだけ都市名を添える
        if (LABEL_MODES[s.label] === 'none') {
          out.push(text(x + 7, y + 5, en ? c.nameEn : c.name, 13, { weight: 700, halo: style.halo, haloW: 3 }));
        }
      }
    }
    return out;
  };

  // 本図
  prims.push({
    t: 'group',
    clip: full,
    children: drawMap(g.main, full, PREFECTURES.filter((p) => p.code !== '47'), g.coastMain, g.inner, false),
  });

  // 沖縄県の挿入図
  const ib = L.inset;
  prims.push({ t: 'rect', ...ib, fill: style.panel, stroke: style.panelStroke, sw: 1.2 });
  prims.push({ t: 'group', clip: ib, children: drawMap(g.inset, ib, [OKINAWA], g.coastOkinawa, null, true) });
  prims.push({ t: 'rect', ...ib, stroke: style.panelStroke, sw: 1.2 });
  prims.push(text(ib.x + 12, ib.y + 24, tx.okinawa, 15, { weight: 700, fill: style.subText, halo: style.panel, haloW: 3 }));

  // 地名
  const mode = LABEL_MODES[s.label];
  if (mode !== 'none') {
    const targets = mode === 'all' ? PREFECTURES : PREFECTURES.filter((p) => MAJOR_PREFS.includes(p.code));
    for (const p of targets) {
      const [x, y] = (en && mode === 'all' ? g.labelPosEn : g.labelPos).get(p.code)!;
      if (mode === 'all') {
        if (p.code === '47') continue; // 挿入図の見出しで示す
        // 英語名は長いので字を小さくする
        prims.push(text(x, y + 5, en ? p.nameEn : p.shortName, en ? 12 : 15, { anchor: 'middle', weight: 700, halo: style.halo, haloW: 3.5 }));
      } else {
        prims.push(text(x, y - 2, en ? p.nameEn : p.shortName, en ? 17 : 19, { anchor: 'middle', weight: 700, halo: style.halo, haloW: 4 }));
        prims.push(text(x, y + 18, formatValue(p.values[ind.key], ind, lang), 15, { anchor: 'middle', halo: style.halo, haloW: 3.5 }));
      }
    }
  }

  // タイトル（ベースマップの上でも読めるよう縁取りする）
  const T = L.title;
  const titleHalo = base.url ? { halo: style.halo, haloW: 6 } : {};
  prims.push(text(T.x, T.y, titleText(s.title, ind, lang), en ? T.size - 6 : T.size, { weight: style.titleWeight, ...titleHalo }));
  if (style.rule) prims.push({ t: 'rect', x: T.x, y: T.y + 22, w: 600, h: 2, fill: style.text });
  prims.push(
    text(T.x, T.y + 60, tx.subtitle(en ? ind.en.label : ind.label), 22, {
      fill: style.subText,
      ...(base.url ? { halo: style.halo, haloW: 5 } : {}),
    }),
  );

  // 出典の帯の位置（凡例はこの上に収める）
  const credits = creditLines(ind, base, layers, style.font === 'serif', lang);
  const creditTop = SCENE_H - 24 - credits.length * 19;

  // 凡例
  const lg = { x: L.legend.x, bottom: Math.min(L.legend.bottom, creditTop - 36) };
  const rowH = 34;
  const lgW = 340;
  const layerRows: { kind: 'did' | 'rail' | 'shinkansen' | 'capital' | 'cities'; label: string }[] = [];
  if (layers.did) layerRows.push({ kind: 'did', label: tx.did });
  if (layers.railways) {
    layerRows.push({ kind: 'rail', label: tx.rail });
    layerRows.push({ kind: 'shinkansen', label: tx.shinkansen });
  }
  if (layers.capitals) layerRows.push({ kind: 'capital', label: tx.capital });
  const citiesH = layers.cities ? 122 : 0;
  const notesH = 26 + (cls.k < cls.requested || cls.k > cls.requested ? 20 : 0) + (ind.diverging !== null ? 20 : 0);
  const lgH = 96 + cls.k * rowH + notesH + (layerRows.length ? 16 + layerRows.length * 28 : 0) + citiesH + 14;
  const ly = lg.bottom - lgH;
  prims.push({ t: 'rect', x: lg.x, y: ly, w: lgW, h: lgH, fill: style.panel, stroke: style.panelStroke, sw: 1.2 });
  prims.push(text(lg.x + 22, ly + 40, en ? ind.en.label : ind.label, 21, { weight: 700 }));
  prims.push(text(lg.x + 22, ly + 68, tx.classes(en ? ind.en.unit : ind.unit, cls.k), 15, { fill: style.subText }));
  for (let i = 0; i < cls.k; i++) {
    const ci = cls.k - 1 - i; // 上から大きい階級
    const b = cls.bins[ci];
    const y = ly + 90 + i * rowH;
    prims.push({ t: 'rect', x: lg.x + 22, y, w: 40, h: 24, fill: colors[ci], fo, stroke: style.panelStroke, sw: 0.8 });
    const label =
      b.min === b.max
        ? formatValue(b.min, ind, lang)
        : `${formatValue(b.min, ind, lang)} ${en ? 'to' : '〜'} ${formatValue(b.max, ind, lang)}`;
    prims.push(text(lg.x + 76, y + 18, label, 16));
    prims.push(text(lg.x + lgW - 22, y + 18, `${b.count}`, 14, { anchor: 'end', fill: style.subText }));
  }
  let fy = ly + 90 + cls.k * rowH + 22;
  prims.push(text(lg.x + 22, fy, tx.national(formatValue(NATIONAL[ind.key], ind, lang)), 14, { fill: style.subText }));
  if (ind.diverging !== null) {
    fy += 20;
    prims.push(text(lg.x + 22, fy, tx.diverging(ind.diverging), 13, { fill: style.subText }));
  }
  if (cls.k !== cls.requested) {
    fy += 20;
    prims.push(text(lg.x + 22, fy, tx.reclass(cls.k < cls.requested, ind.diverging, cls.requested, cls.k), 13, { fill: style.subText }));
  }
  if (layerRows.length) {
    fy += 12;
    prims.push({ t: 'rect', x: lg.x + 22, y: fy, w: lgW - 44, h: 1, fill: style.panelStroke });
    for (const r of layerRows) {
      fy += 28;
      const cx = lg.x + 42;
      const cy = fy - 6;
      if (r.kind === 'did') prims.push({ t: 'rect', x: lg.x + 22, y: cy - 9, w: 40, h: 18, fill: lc.did, fo: 0.3 });
      if (r.kind === 'rail') prims.push({ t: 'path', d: `M${lg.x + 22},${cy}h40`, stroke: lc.rail, sw: 1, so: 0.75 });
      if (r.kind === 'shinkansen') prims.push({ t: 'path', d: `M${lg.x + 22},${cy}h40`, stroke: lc.rail, sw: 2.2 });
      if (r.kind === 'capital') prims.push({ t: 'circle', cx, cy, r: 4, fill: style.bg, stroke: style.text, sw: 1.8 });
      prims.push(text(lg.x + 76, fy, r.label, 15));
    }
  }
  if (layers.cities) {
    fy += 32;
    prims.push(text(lg.x + 22, fy, tx.cities(CITY_MIN_POPULATION), en ? 14 : 15));
    const baseY = fy + 76;
    let cx = lg.x + 50;
    for (const v of [500_000, 2_000_000, 5_000_000]) {
      const r = cityRadius(v);
      prims.push({ t: 'circle', cx, cy: baseY - r, r, fill: lc.city, fo: 0.45, stroke: style.text, sw: 1.4 });
      prims.push(text(cx, baseY + 18, tx.pop(v), 13, { anchor: 'middle', fill: style.subText }));
      cx += r + 64;
    }
  }

  // 出典（寄りの構図で地図と重ならないよう帯を敷く）
  const top = creditTop;
  prims.push({ t: 'rect', x: 0, y: top - 22, w: SCENE_W, h: SCENE_H - top + 22, fill: style.bg });
  credits.forEach((line, i) => {
    prims.push(text(60, top + i * 19, line.text, line.small ? 11.5 : 13.5, { fill: style.subText }));
  });
  prims.push(text(SCENE_W - 60, SCENE_H - 24, 'MapWand', 14, { anchor: 'end', weight: 700, fill: style.subText }));

  return { w: SCENE_W, h: SCENE_H, bg: style.bg, prims, classification: cls, colors, indicator: ind };
}
