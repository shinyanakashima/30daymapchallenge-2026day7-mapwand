// 同じ地図を再現するための設定 JSON
import { ITEMS } from '../protocol/generated';
import { DATA_VERSION, MANIFEST } from '../data/dataset';
import type { MapSettings } from '../map/scene';

export const SETTINGS_FORMAT = 1;
const KEYS: (keyof MapSettings)[] = ['style', 'color', 'classes', 'line', 'label', 'frame', 'title'];

export interface SettingsFile {
  app: 'MapWand';
  format: number;
  dataVersion: string;
  data: { statistic: string; unit: string; reference_date: string; source: string };
  settings: Record<keyof MapSettings, { index: number; label: string }>;
  savedAt: string;
  elapsedMs: number | null;
}

export function toSettingsFile(s: MapSettings, elapsedMs: number | null): SettingsFile {
  const settings = {} as SettingsFile['settings'];
  for (const k of KEYS) {
    const item = ITEMS.find((i) => i.key === k)!;
    settings[k] = { index: s[k], label: item.candidates[s[k]].label };
  }
  return {
    app: 'MapWand',
    format: SETTINGS_FORMAT,
    dataVersion: DATA_VERSION,
    data: {
      statistic: MANIFEST.statistic.name,
      unit: MANIFEST.statistic.unit,
      reference_date: MANIFEST.statistic.reference_date,
      source: MANIFEST.statistic.survey,
    },
    settings,
    savedAt: new Date().toISOString(),
    elapsedMs,
  };
}

export function parseSettingsFile(text: string): { settings: MapSettings; warning?: string } {
  const j = JSON.parse(text) as Partial<SettingsFile>;
  if (j.app !== 'MapWand' || typeof j.format !== 'number') throw new Error('MapWand の設定ファイルではありません');
  if (j.format > SETTINGS_FORMAT) throw new Error('新しい形式の設定ファイルです。アプリを更新してください');
  const out = {} as MapSettings;
  for (const k of KEYS) {
    const v = j.settings?.[k]?.index;
    const n = ITEMS.find((i) => i.key === k)!.candidates.length;
    if (!Number.isInteger(v) || v! < 0 || v! >= n) throw new Error(`設定値が不正です: ${k}`);
    out[k] = v!;
  }
  const warning =
    j.dataVersion !== DATA_VERSION ? `データ版が異なります（ファイル ${j.dataVersion} / 現在 ${DATA_VERSION}）` : undefined;
  return { settings: out, warning };
}
