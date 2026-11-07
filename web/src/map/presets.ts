// 編集項目ごとの候補の中身。候補の並びと名前は protocol/mapwand.json と一致させる。
import {
  schemeBlues,
  schemeGreens,
  schemeGreys,
  schemeOranges,
  schemeOrRd,
  schemePuBu,
  schemeRdPu,
  schemeYlGn,
  schemeYlOrRd,
} from 'd3-scale-chromatic';
import { ITEMS } from '../protocol/generated';

export type FontKind = 'sans' | 'serif';

export const FONT_FAMILY: Record<FontKind, string> = {
  sans: '"BIZ UDPGothic", sans-serif',
  serif: '"Zen Old Mincho", serif',
};

export interface StylePreset {
  bg: string;
  text: string;
  subText: string;
  border: string; // 都道府県界の色
  coast: string; // 外周線の色
  graticule: string | null;
  panel: string; // 凡例・挿入図の背景
  panelStroke: string;
  halo: string; // 地名の縁取り
  font: FontKind;
  titleWeight: 400 | 700;
  rule: boolean; // タイトル下の罫線
  ramp: 'normal' | 'reverse'; // reverse: 暗い背景で値が大きいほど明るくする
  // STYLE 採用時にまとめて適用する値（候補の index）
  defaults: { color: number; line: number; label: number; base: number };
}

export const STYLES: StylePreset[] = [
  {
    // 白地
    bg: '#ffffff', text: '#1f1f1f', subText: '#5c5c5c', border: '#ffffff', coast: '#8a8a8a',
    graticule: null, panel: '#ffffff', panelStroke: '#d0d0d0', halo: '#ffffff',
    font: 'sans', titleWeight: 700, rule: false, ramp: 'normal',
    defaults: { color: 0, line: 2, label: 1, base: 0 },
  },
  {
    // 和紙
    bg: '#f2ead8', text: '#3a2d1f', subText: '#6e5b45', border: '#5b4630', coast: '#5b4630',
    graticule: '#ddd0b4', panel: '#f7f1e3', panelStroke: '#b9a684', halo: '#f2ead8',
    font: 'serif', titleWeight: 700, rule: true, ramp: 'normal',
    defaults: { color: 1, line: 1, label: 2, base: 0 },
  },
  {
    // 夜
    bg: '#0e1828', text: '#eef2fb', subText: '#a5b2c9', border: '#0e1828', coast: '#3c5274',
    graticule: '#1d2b44', panel: '#132037', panelStroke: '#2e4262', halo: '#0e1828',
    font: 'sans', titleWeight: 700, rule: false, ramp: 'reverse',
    defaults: { color: 2, line: 2, label: 1, base: 0 },
  },
  {
    // 雪
    bg: '#edf2f6', text: '#1c3244', subText: '#53697c', border: '#ffffff', coast: '#9fb2c2',
    graticule: '#dde6ee', panel: '#f7fafc', panelStroke: '#c3d0db', halo: '#edf2f6',
    font: 'sans', titleWeight: 400, rule: false, ramp: 'normal',
    defaults: { color: 4, line: 3, label: 0, base: 4 },
  },
  {
    // 新聞
    bg: '#fbfaf6', text: '#111111', subText: '#444444', border: '#111111', coast: '#111111',
    graticule: null, panel: '#fbfaf6', panelStroke: '#111111', halo: '#fbfaf6',
    font: 'serif', titleWeight: 700, rule: true, ramp: 'normal',
    defaults: { color: 5, line: 0, label: 2, base: 0 },
  },
  {
    // 若草
    bg: '#f4f8ee', text: '#22361c', subText: '#5a6e50', border: '#f4f8ee', coast: '#9cb38c',
    graticule: null, panel: '#fbfdf8', panelStroke: '#c4d4b5', halo: '#f4f8ee',
    font: 'sans', titleWeight: 700, rule: false, ramp: 'normal',
    defaults: { color: 3, line: 3, label: 1, base: 1 },
  },
];

// ColorBrewer の順序尺度（値が大きいほど濃い）
type Scheme = readonly (readonly string[])[];
export const PALETTES: Scheme[] = [
  schemeOrRd, // 柿
  schemePuBu, // 藍
  schemeYlOrRd, // 夕焼
  schemeYlGn, // 若葉
  schemeRdPu, // 紫
  schemeGreys, // 墨
];

/** 0 などを境にした発散配色で、境より小さい側に使う配色（PALETTES と同じ並び） */
export const NEGATIVE_PALETTES: Scheme[] = [
  schemePuBu, // 柿 ↔ 藍
  schemeOranges, // 藍 ↔ 橙
  schemeBlues, // 夕焼 ↔ 青
  schemeRdPu, // 若葉 ↔ 紫
  schemeGreens, // 紫 ↔ 緑
  schemeOranges, // 墨 ↔ 橙
];

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

/**
 * k 色の配色。返り値は小さい階級→大きい階級の順。
 * reverse は暗い背景用: 明るさの並びを反転し、小さい階級ほど背景色へ寄せて沈める
 * （値が大きいほど明るく目立つ。大小の意味は逆転しない）。
 */
export function paletteColors(paletteIndex: number, k: number, ramp: 'normal' | 'reverse', bg = '#000000'): string[] {
  const scheme = PALETTES[paletteIndex];
  if (k === 1) return [scheme[3][1]];
  // 白に近い最小色を避けるため k+1 色から先頭を落とす（2〜7 階級なら最大 8 色）
  const colors = scheme[Math.max(3, k + 1)].slice(-k);
  if (ramp === 'normal') return colors.slice();
  const rev = colors.slice().reverse();
  return rev.map((c, i) => mix(c, bg, 0.5 * (1 - i / (k - 1))));
}

/**
 * 発散配色。境より小さい階級 nNeg 個、大きい階級 nPos 個の色を、小さい階級→大きい階級の順で返す。
 * 境から離れるほど濃く（reverse のときは明るく）する。
 */
export function divergingColors(
  paletteIndex: number,
  nNeg: number,
  nPos: number,
  ramp: 'normal' | 'reverse',
  bg = '#000000',
): string[] {
  const side = (scheme: Scheme, n: number) => {
    if (n === 0) return [];
    // 境に近い側を薄くするため、n+1 色の先頭（最も薄い色）を落とす
    const c = scheme[Math.max(3, n + 1)].slice(-n);
    if (ramp === 'normal') return c;
    return c.map((x, i) => mix(x, bg, 0.5 * (1 - (n === 1 ? 1 : i / (n - 1)))));
  };
  const neg = side(NEGATIVE_PALETTES[paletteIndex], nNeg).reverse(); // 最も小さい階級が最も濃い
  const pos = side(PALETTES[paletteIndex], nPos);
  return [...neg, ...pos];
}

export const CLASS_COUNTS = [3, 4, 5, 6, 7];
export const LINE_WIDTHS = [0.4, 0.9, 1.5, 2.3, 3.4];

export type LabelMode = 'none' | 'major' | 'all';
export const LABEL_MODES: LabelMode[] = ['none', 'major', 'all'];
export const MAJOR_PREFS = ['01', '04', '13', '23', '27', '34', '40', '47'];

export type FrameKind = 'full' | 'wide' | 'close';
export const FRAMES: FrameKind[] = ['full', 'wide', 'close'];

const itemOf = (key: string) => ITEMS.find((i) => i.key === key)!;

/** タイトル。{指標} をデータ名に置き換えて使う */
export const TITLES: string[] = itemOf('title').candidates.map((c) => c.label);

// ---------------- ベースマップ（地理院タイル） ----------------

export interface Basemap {
  id: string;
  url: string | null; // {z}/{x}/{y}
  zoom: [number, number]; // 提供ズーム範囲
  /** 'under': 地図の下に敷き、塗りを半透明にする / 'multiply': 塗りの上に乗算で重ねる */
  mode: 'under' | 'multiply';
  fillOpacity: number;
  opacity: number;
  credit: string;
  creditEn: string;
  /** 小縮尺で必要な追加の出典表記 */
  extraCredit?: string;
}

const GSI = 'https://cyberjapandata.gsi.go.jp/xyz';
export const BASEMAPS: Basemap[] = [
  { id: 'none', url: null, zoom: [0, 0], mode: 'under', fillOpacity: 1, opacity: 1, credit: '', creditEn: '' },
  {
    id: 'pale', url: `${GSI}/pale/{z}/{x}/{y}.png`, zoom: [2, 18], mode: 'under', fillOpacity: 0.78, opacity: 1,
    credit: '地理院タイル（淡色地図）',
    creditEn: 'GSI Tiles (Pale Map)',
    extraCredit: 'Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)."',
  },
  {
    id: 'std', url: `${GSI}/std/{z}/{x}/{y}.png`, zoom: [2, 18], mode: 'under', fillOpacity: 0.72, opacity: 1,
    credit: '地理院タイル（標準地図）',
    creditEn: 'GSI Tiles (Standard Map)',
    extraCredit: 'The bathymetric contours are derived from those contained within the GEBCO Digital Atlas.',
  },
  {
    id: 'blank', url: `${GSI}/blank/{z}/{x}/{y}.png`, zoom: [5, 14], mode: 'under', fillOpacity: 0.85, opacity: 1,
    credit: '地理院タイル（白地図）',
    creditEn: 'GSI Tiles (Blank Map)',
  },
  {
    id: 'hillshade', url: `${GSI}/hillshademap/{z}/{x}/{y}.png`, zoom: [2, 16], mode: 'multiply', fillOpacity: 1, opacity: 0.6,
    credit: '地理院タイル（陰影起伏図）',
    creditEn: 'GSI Tiles (Hillshade)',
  },
  {
    id: 'photo', url: `${GSI}/seamlessphoto/{z}/{x}/{y}.jpg`, zoom: [2, 18], mode: 'under', fillOpacity: 0.68, opacity: 1,
    credit: '地理院タイル（全国最新写真（シームレス））',
    creditEn: 'GSI Tiles (Seamless Photo)',
    extraCredit:
      'Images on 世界衛星モザイク画像 obtained from site https://lpdaac.usgs.gov/data_access maintained by the NASA Land Processes Distributed Active Archive Center (LP DAAC), USGS/Earth Resources Observation and Science (EROS) Center, Sioux Falls, South Dakota, (Year). Source of image data product.',
  },
];

// ---------------- 重ねるレイヤー ----------------

export interface LayerSet {
  capitals: boolean;
  cities: boolean;
  railways: boolean;
  did: boolean;
}
const L = (capitals: boolean, cities: boolean, railways: boolean, did: boolean): LayerSet => ({ capitals, cities, railways, did });
export const LAYER_SETS: LayerSet[] = [
  L(false, false, false, false), // なし
  L(true, false, false, false), // 県庁所在地
  L(false, true, false, false), // 主要都市の人口
  L(false, false, true, false), // 鉄道
  L(false, false, false, true), // 人口集中地区
  L(true, false, true, false), // 鉄道＋県庁所在地
  L(false, false, true, true), // 人口集中地区＋鉄道
  L(true, true, true, true), // すべて
];

// 候補数が共通定義と一致することを起動時に確認する
const counts: Record<string, number> = {
  base: BASEMAPS.length,
  layer: LAYER_SETS.length,
  style: STYLES.length,
  color: PALETTES.length,
  classes: CLASS_COUNTS.length,
  line: LINE_WIDTHS.length,
  label: LABEL_MODES.length,
  frame: FRAMES.length,
  title: TITLES.length,
};
for (const it of ITEMS) {
  if (it.key in counts && counts[it.key] !== it.candidates.length) {
    throw new Error(`candidate count mismatch: ${it.key}`);
  }
}
