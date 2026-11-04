// 地図の構成要素（シーン）を組み立てる。画面表示(SVG)と PNG 書き出し(Canvas)は
// 同じシーンから描くので、見た目が一致する。
import { geoConicEqualArea, geoGraticule, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import {
  COAST_MAIN,
  COAST_OKINAWA,
  INNER_BORDERS,
  NATIONAL_DENSITY,
  PREFECTURES,
  type Prefecture,
} from '../data/dataset';
import { quantileClassify, type Classification } from './classify';
import {
  CLASS_COUNTS,
  FONT_FAMILY,
  FRAMES,
  LABEL_MODES,
  LINE_WIDTHS,
  MAJOR_PREFS,
  STYLES,
  TITLES,
  paletteColors,
  type FrameKind,
} from './presets';

export const SCENE_W = 1600;
export const SCENE_H = 1200;

export interface MapSettings {
  style: number;
  color: number;
  classes: number;
  line: number;
  label: number;
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
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number }
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number; join?: 'round' | 'miter'; id?: string }
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
}

// ---------------- 構図 ----------------

interface FrameLayout {
  /** 本図を収める範囲 */
  main: Box;
  /** 寄り: 本図の拡大率と中心にする経緯度 */
  zoom?: { k: number; center: [number, number]; at: [number, number] };
  inset: Box;
  legend: { x: number; y: number };
  title: { x: number; y: number; size: number };
}

const LAYOUTS: Record<FrameKind, FrameLayout> = {
  full: {
    main: { x: 200, y: 105, w: 1360, h: 1000 },
    inset: { x: 70, y: 290, w: 400, h: 215 },
    legend: { x: 1200, y: 690 },
    title: { x: 80, y: 120, size: 56 },
  },
  wide: {
    main: { x: 420, y: 250, w: 1000, h: 760 },
    inset: { x: 150, y: 380, w: 330, h: 180 },
    legend: { x: 1200, y: 760 },
    title: { x: 150, y: 170, size: 52 },
  },
  close: {
    main: { x: 260, y: 150, w: 1270, h: 930 },
    zoom: { k: 1.32, center: [137.6, 36.4], at: [880, 640] },
    inset: { x: 60, y: 250, w: 360, h: 195 },
    legend: { x: 1210, y: 740 },
    title: { x: 60, y: 110, size: 54 },
  },
};

const baseProjection = () => geoConicEqualArea().parallels([33, 43]).rotate([-136, 0]).center([0, 37]);

const MAIN_FC: FeatureCollection<Polygon | MultiPolygon> = {
  type: 'FeatureCollection',
  features: PREFECTURES.filter((p) => p.code !== '47').map((p) => p.feature),
};
const OKINAWA = PREFECTURES.find((p) => p.code === '47')!;

interface FrameGeometry {
  layout: FrameLayout;
  fills: Map<string, string>;
  inner: string;
  coastMain: string;
  coastOkinawa: string;
  graticule: string;
  labelPos: Map<string, [number, number]>;
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
  const proj: GeoProjection = baseProjection().fitExtent(
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
  const insetProj = baseProjection()
    .rotate([-127.5, 0])
    .center([0, 26])
    .fitExtent(
      [
        [ib.x + pad, ib.y + pad],
        [ib.x + ib.w - pad, ib.y + ib.h - pad],
      ],
      OKINAWA.feature,
    );
  const path = geoPath(proj).digits(1);
  const insetPath = geoPath(insetProj).digits(1);

  const fills = new Map<string, string>();
  const labelPos = new Map<string, [number, number]>();
  for (const p of PREFECTURES) {
    const isOk = p.code === '47';
    const pth = isOk ? insetPath : path;
    const pr = isOk ? insetProj : proj;
    fills.set(p.code, pth(p.feature) ?? '');
    const fixed = LABEL_LONLAT[p.code];
    const pos = fixed ? (pr(fixed) as [number, number]) : pth.centroid(largestPolygon(p.feature, pth));
    labelPos.set(p.code, pos);
  }
  const g: FrameGeometry = {
    layout,
    fills,
    inner: path(INNER_BORDERS) ?? '',
    coastMain: path(COAST_MAIN) ?? '',
    coastOkinawa: insetPath(COAST_OKINAWA) ?? '',
    graticule: path(geoGraticule().step([5, 5]).extent([[115, 15], [160, 55]])()) ?? '',
    labelPos,
  };
  geomCache.set(kind, g);
  return g;
}

// ---------------- 書式 ----------------

export const fmt1 = (v: number) =>
  v.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const CREDIT_LINES = [
  '出典：総務省統計局「令和2年国勢調査 人口等基本集計」第1-1表（e-Stat）、「国土数値情報（行政区域データ）」（国土交通省）を加工して作成',
  '人口密度は統計表の値（調査対象外地域の面積を除く）。正積円錐図法。沖縄県は枠内に移動（縮尺は本図と異なる）。小笠原諸島など一部の島は省略。',
];

// ---------------- シーン ----------------

export function buildScene(s: MapSettings): Scene {
  const style = STYLES[s.style];
  const frame = FRAMES[s.frame];
  const g = frameGeometry(frame);
  const L = g.layout;
  const family = FONT_FAMILY[style.font];
  const lw = LINE_WIDTHS[s.line];
  const rows = PREFECTURES.map((p) => ({ key: p.code, value: p.density }));
  const cls = quantileClassify(rows, CLASS_COUNTS[s.classes]);
  const colors = paletteColors(s.color, cls.k, style.ramp, style.bg);
  const prims: Prim[] = [];
  const text = (
    x: number,
    y: number,
    t: string,
    size: number,
    opt: Partial<Extract<Prim, { t: 'text' }>> = {},
  ): Prim => ({ t: 'text', x, y, text: t, size, weight: 400, family, fill: style.text, anchor: 'start', ...opt });

  prims.push({ t: 'rect', x: 0, y: 0, w: SCENE_W, h: SCENE_H, fill: style.bg });
  if (style.graticule) prims.push({ t: 'path', d: g.graticule, stroke: style.graticule, sw: 1 });

  // 本図
  const main: Prim[] = [];
  for (const p of PREFECTURES) {
    if (p.code === '47') continue;
    main.push({ t: 'path', d: g.fills.get(p.code)!, fill: colors[cls.classOf.get(p.code)!], id: p.code });
  }
  main.push({ t: 'path', d: g.inner, stroke: style.border, sw: lw, join: 'round' });
  main.push({ t: 'path', d: g.coastMain, stroke: style.coast, sw: Math.max(0.6, Math.min(lw, 1.2)), join: 'round' });
  prims.push(...main);

  // 沖縄県の挿入図
  const ib = L.inset;
  prims.push({ t: 'rect', ...ib, fill: style.panel, stroke: style.panelStroke, sw: 1.2 });
  prims.push({
    t: 'group',
    clip: ib,
    children: [
      { t: 'path', d: g.fills.get('47')!, fill: colors[cls.classOf.get('47')!], id: '47' },
      { t: 'path', d: g.coastOkinawa, stroke: style.coast, sw: Math.max(0.6, Math.min(lw, 1.2)), join: 'round' },
    ],
  });

  // 地名
  const mode = LABEL_MODES[s.label];
  if (mode !== 'none') {
    const targets: Prefecture[] = mode === 'all' ? PREFECTURES : PREFECTURES.filter((p) => MAJOR_PREFS.includes(p.code));
    for (const p of targets) {
      const [x, y] = g.labelPos.get(p.code)!;
      if (mode === 'all') {
        if (p.code === '47') continue; // 挿入図の見出しで示す
        prims.push(text(x, y + 5, p.shortName, 15, { anchor: 'middle', weight: 700, halo: style.halo, haloW: 3.5 }));
      } else {
        prims.push(text(x, y - 2, p.shortName, 19, { anchor: 'middle', weight: 700, halo: style.halo, haloW: 4 }));
        prims.push(text(x, y + 18, fmt1(p.density), 15, { anchor: 'middle', halo: style.halo, haloW: 3.5 }));
      }
    }
  }

  // タイトル
  const T = L.title;
  prims.push(text(T.x, T.y, TITLES[s.title], T.size, { weight: style.titleWeight }));
  if (style.rule) prims.push({ t: 'rect', x: T.x, y: T.y + 22, w: 560, h: 2, fill: style.text });
  prims.push(text(T.x, T.y + 60, '令和2年（2020年）国勢調査　都道府県別の人口密度', 22, { fill: style.subText }));

  // 凡例
  const lg = L.legend;
  const rowH = 34;
  const lgW = 330;
  const lgH = 96 + cls.k * rowH + 52;
  prims.push({ t: 'rect', x: lg.x, y: lg.y, w: lgW, h: lgH, fill: style.panel, stroke: style.panelStroke, sw: 1.2 });
  prims.push(text(lg.x + 22, lg.y + 40, '人口密度', 21, { weight: 700 }));
  prims.push(text(lg.x + 112, lg.y + 40, '人/km²', 16, { fill: style.subText }));
  prims.push(text(lg.x + 22, lg.y + 68, `分位分類 ${cls.k}階級`, 15, { fill: style.subText }));
  for (let i = 0; i < cls.k; i++) {
    const ci = cls.k - 1 - i; // 上から大きい階級
    const b = cls.bins[ci];
    const y = lg.y + 90 + i * rowH;
    prims.push({ t: 'rect', x: lg.x + 22, y, w: 40, h: 24, fill: colors[ci], stroke: style.panelStroke, sw: 0.8 });
    const label = b.min === b.max ? fmt1(b.min) : `${fmt1(b.min)} – ${fmt1(b.max)}`;
    prims.push(text(lg.x + 76, y + 18, label, 16));
    prims.push(text(lg.x + lgW - 22, y + 18, `${b.count}`, 14, { anchor: 'end', fill: style.subText }));
  }
  const fy = lg.y + 90 + cls.k * rowH + 26;
  prims.push(text(lg.x + 22, fy, `全国 ${fmt1(NATIONAL_DENSITY)}　右の数は都道府県数`, 14, { fill: style.subText }));
  if (cls.k < cls.requested) {
    prims.push(text(lg.x + 22, fy + 20, `同じ値の整理により${cls.requested}→${cls.k}階級`, 13, { fill: style.subText }));
  }

  // 挿入図の注記
  prims.push(text(ib.x + 12, ib.y + 26, '沖縄県', 15, { weight: 700, fill: style.subText }));

  // 出典（寄りの構図で地図と重ならないよう帯を敷く）
  prims.push({ t: 'rect', x: 0, y: SCENE_H - 88, w: SCENE_W, h: 88, fill: style.bg });
  CREDIT_LINES.forEach((line, i) => {
    prims.push(text(60, SCENE_H - 58 + i * 22, line, 14, { fill: style.subText }));
  });
  prims.push(text(SCENE_W - 60, SCENE_H - 36, 'MapWand', 14, { anchor: 'end', weight: 700, fill: style.subText }));

  return { w: SCENE_W, h: SCENE_H, bg: style.bg, prims, classification: cls, colors };
}
