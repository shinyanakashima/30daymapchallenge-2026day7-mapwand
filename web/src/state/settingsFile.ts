// 同じ地図を再現するための設定 JSON
import { ITEMS } from '../protocol/generated';
import { DATA_VERSION, INDICATORS } from '../data/dataset';
import type { MapSettings } from '../map/scene';
import { MsgError, type Lang, type Msg } from '../i18n';

export const SETTINGS_FORMAT = 2;
const KEYS: (keyof MapSettings)[] = ['data', 'style', 'base', 'color', 'classes', 'line', 'label', 'layer', 'frame', 'title'];
/** 形式 1（データ・ベースマップ・レイヤーの項目がない版）で省略された値 */
const ADDED_IN_2: Partial<MapSettings> = { data: 0, base: 0, layer: 0 };

export interface SettingsFile {
  app: 'MapWand';
  format: number;
  dataVersion: string;
  data: { statistic: string; unit: string; reference_date: string; source: string; table: string };
  settings: Record<keyof MapSettings, { index: number; label: string; en?: string }>;
  /** 地図の文字の言語（形式 2 で追加。省略時は日本語） */
  lang?: Lang;
  savedAt: string;
  elapsedMs: number | null;
}

export function toSettingsFile(s: MapSettings, elapsedMs: number | null, lang: Lang = 'ja'): SettingsFile {
  const settings = {} as SettingsFile['settings'];
  for (const k of KEYS) {
    const item = ITEMS.find((i) => i.key === k)!;
    settings[k] = { index: s[k], label: item.candidates[s[k]].label, en: item.candidates[s[k]].en };
  }
  return {
    app: 'MapWand',
    format: SETTINGS_FORMAT,
    dataVersion: DATA_VERSION,
    data: {
      statistic: INDICATORS[s.data].label,
      unit: INDICATORS[s.data].unit,
      reference_date: '2020-10-01',
      source: '令和2年国勢調査 人口等基本集計（総務省統計局）',
      table: INDICATORS[s.data].table,
    },
    settings,
    lang,
    savedAt: new Date().toISOString(),
    elapsedMs,
  };
}

export function parseSettingsFile(text: string): { settings: MapSettings; lang?: Lang; warning?: Msg } {
  const j = JSON.parse(text) as Partial<SettingsFile>;
  if (j.app !== 'MapWand' || typeof j.format !== 'number') throw new MsgError({ key: 'file.notMapwand' });
  if (j.format > SETTINGS_FORMAT) throw new MsgError({ key: 'file.newer' });
  const out = {} as MapSettings;
  for (const k of KEYS) {
    let v = j.settings?.[k]?.index;
    if (v === undefined && j.format === 1 && k in ADDED_IN_2) v = ADDED_IN_2[k];
    const n = ITEMS.find((i) => i.key === k)!.candidates.length;
    if (!Number.isInteger(v) || v! < 0 || v! >= n) throw new MsgError({ key: 'file.invalid', args: { k } });
    out[k] = v!;
  }
  const warning: Msg | undefined =
    j.dataVersion !== DATA_VERSION
      ? { key: 'file.dataVersion', args: { f: String(j.dataVersion), c: DATA_VERSION } }
      : undefined;
  const lang = j.lang === 'en' || j.lang === 'ja' ? j.lang : undefined;
  return { settings: out, lang, warning };
}
