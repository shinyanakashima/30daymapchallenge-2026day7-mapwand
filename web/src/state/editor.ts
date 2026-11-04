// 編集状態。Web アプリがこの状態の正本で、デバイス・キーボード・画面の操作は
// すべて同じ EditorAction として reducer に渡す。
import { ITEMS } from '../protocol/generated';
import { STYLES } from '../map/presets';
import type { MapSettings } from '../map/scene';

export type SettingKey = keyof MapSettings;
export const ITEM_KEYS = ITEMS.map((i) => i.key);
export const FINISH_INDEX = ITEM_KEYS.indexOf('finish');
export const FINISH_SAVE = 0;
export const FINISH_BACK = 1;

export const DEFAULT_SETTINGS: MapSettings = {
  data: 0,
  style: 0,
  ...STYLES[0].defaults,
  classes: 2,
  layer: 0,
  frame: 0,
  title: 0,
};

export interface EditorState {
  itemIndex: number;
  committed: MapSettings;
  /** 未採用のプレビュー候補（null = 採用値を表示中） */
  preview: number | null;
  /** 仕上げ項目で選んでいる候補 */
  finishChoice: number;
  /** 項目ごとの採用履歴（採用前の値）。長押しで戻す */
  history: Partial<Record<SettingKey, Partial<MapSettings>[]>>;
  /** 最後の操作（画面の小さな反応用） */
  pulse: { kind: 'preview' | 'adopt' | 'revert' | 'move' | 'save'; n: number };
  /** 保存要求の回数（増えたら保存処理を走らせる） */
  saveRequest: number;
}

export type EditorAction =
  | { type: 'rotate'; steps: number }
  | { type: 'adopt' }
  | { type: 'revert' }
  | { type: 'nextItem' }
  | { type: 'prevItem' }
  | { type: 'gotoItem'; index: number }
  | { type: 'pick'; candidate: number }
  | { type: 'load'; settings: MapSettings };

export function initialEditor(settings: MapSettings = DEFAULT_SETTINGS): EditorState {
  return {
    itemIndex: 0,
    committed: settings,
    preview: null,
    finishChoice: FINISH_SAVE,
    history: {},
    pulse: { kind: 'move', n: 0 },
    saveRequest: 0,
  };
}

export const itemCount = (index: number) => ITEMS[index].candidates.length;
const keyOf = (index: number) => ITEM_KEYS[index] as SettingKey | 'finish';
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 現在項目で表示中の候補 */
export function currentCandidate(s: EditorState): number {
  const key = keyOf(s.itemIndex);
  if (key === 'finish') return s.finishChoice;
  return s.preview ?? s.committed[key];
}

/** 採用済みの候補 */
export function adoptedCandidate(s: EditorState): number {
  const key = keyOf(s.itemIndex);
  if (key === 'finish') return s.finishChoice;
  return s.committed[key];
}

export function isPreviewing(s: EditorState): boolean {
  const key = keyOf(s.itemIndex);
  return key !== 'finish' && s.preview !== null && s.preview !== s.committed[key];
}

/** ある項目へ候補を適用した設定。STYLE は配色・線・地名もまとめて切り替える */
function applyCandidate(base: MapSettings, key: SettingKey, value: number): MapSettings {
  if (key === 'style') return { ...base, style: value, ...STYLES[value].defaults };
  return { ...base, [key]: value };
}

/** 地図に描く設定（プレビューを含む） */
export function effectiveSettings(s: EditorState): MapSettings {
  const key = keyOf(s.itemIndex);
  if (key === 'finish' || s.preview === null) return s.committed;
  return applyCandidate(s.committed, key, s.preview);
}

const bump = (s: EditorState, kind: EditorState['pulse']['kind']) => ({ kind, n: s.pulse.n + 1 });

function moveTo(s: EditorState, index: number): EditorState {
  const itemIndex = mod(index, ITEMS.length);
  // 項目を移ると未採用のプレビューは取り消す
  return { ...s, itemIndex, preview: null, finishChoice: FINISH_SAVE, pulse: bump(s, 'move') };
}

function setCandidate(s: EditorState, candidate: number): EditorState {
  const key = keyOf(s.itemIndex);
  const c = mod(candidate, itemCount(s.itemIndex));
  if (key === 'finish') return { ...s, finishChoice: c, pulse: bump(s, 'preview') };
  return { ...s, preview: c === s.committed[key] ? null : c, pulse: bump(s, 'preview') };
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'rotate':
      if (a.steps === 0) return s;
      return setCandidate(s, currentCandidate(s) + a.steps);
    case 'pick':
      return setCandidate(s, a.candidate);
    case 'nextItem':
      return moveTo(s, s.itemIndex + 1);
    case 'prevItem':
      return moveTo(s, s.itemIndex - 1);
    case 'gotoItem':
      return moveTo(s, a.index);
    case 'adopt': {
      const key = keyOf(s.itemIndex);
      if (key === 'finish') {
        if (s.finishChoice === FINISH_SAVE) return { ...s, saveRequest: s.saveRequest + 1, pulse: bump(s, 'save') };
        return { ...moveTo(s, 0), pulse: bump(s, 'adopt') };
      }
      const value = s.preview ?? s.committed[key];
      const next = applyCandidate(s.committed, key, value);
      let history = s.history;
      if (value !== s.committed[key]) {
        const changed: Partial<MapSettings> = {};
        for (const k of Object.keys(next) as SettingKey[]) if (next[k] !== s.committed[k]) changed[k] = s.committed[k];
        history = { ...s.history, [key]: [...(s.history[key] ?? []), changed] };
      }
      const moved = moveTo({ ...s, committed: next, history }, s.itemIndex + 1);
      return { ...moved, pulse: bump(s, 'adopt') };
    }
    case 'revert': {
      const key = keyOf(s.itemIndex);
      if (key === 'finish') return { ...s, finishChoice: FINISH_SAVE, pulse: bump(s, 'revert') };
      // 未採用のプレビュー中なら採用値へ戻す。プレビューがなければ直前の採用を取り消す
      if (s.preview !== null) return { ...s, preview: null, pulse: bump(s, 'revert') };
      const stack = s.history[key];
      if (!stack || stack.length === 0) return { ...s, pulse: bump(s, 'revert') };
      const prev = stack[stack.length - 1];
      return {
        ...s,
        committed: { ...s.committed, ...prev },
        history: { ...s.history, [key]: stack.slice(0, -1) },
        pulse: bump(s, 'revert'),
      };
    }
    case 'load':
      return { ...initialEditor(a.settings), pulse: bump(s, 'adopt') };
  }
}
