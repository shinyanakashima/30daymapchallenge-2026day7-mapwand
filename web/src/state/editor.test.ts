import { describe, expect, it } from 'vitest';
import { STYLES } from '../map/presets';
import {
  DEFAULT_SETTINGS,
  FINISH_INDEX,
  ITEM_KEYS,
  currentCandidate,
  editorReducer as r,
  effectiveSettings,
  initialEditor,
  isPreviewing,
} from './editor';

const at = (key: string) => ITEM_KEYS.indexOf(key as (typeof ITEM_KEYS)[number]);
const STYLE = at('style');

describe('editor', () => {
  it('previews on rotate, wraps around, and adopts on short press', () => {
    let s = r(initialEditor(), { type: 'gotoItem', index: STYLE });
    s = r(s, { type: 'rotate', steps: 1 });
    expect(isPreviewing(s)).toBe(true);
    expect(effectiveSettings(s).style).toBe(1);
    expect(s.committed.style).toBe(0);
    s = r(s, { type: 'rotate', steps: -2 });
    expect(currentCandidate(s)).toBe(STYLES.length - 1);
    s = r(s, { type: 'adopt' });
    expect(s.committed.style).toBe(STYLES.length - 1);
    expect(s.committed.color).toBe(STYLES[STYLES.length - 1].defaults.color);
    expect(s.committed.base).toBe(STYLES[STYLES.length - 1].defaults.base);
    expect(s.itemIndex).toBe(STYLE + 1);
  });

  it('moving item with buttons discards an unadopted preview', () => {
    let s = initialEditor();
    s = r(s, { type: 'rotate', steps: 2 });
    s = r(s, { type: 'nextItem' });
    expect(s.committed).toEqual(DEFAULT_SETTINGS);
    expect(s.preview).toBeNull();
    s = r(s, { type: 'prevItem' });
    expect(s.itemIndex).toBe(0);
    s = r(s, { type: 'prevItem' });
    expect(s.itemIndex).toBe(ITEM_KEYS.length - 1);
  });

  it('long press cancels preview, then undoes the previous adoption', () => {
    let s = initialEditor();
    s = r(s, { type: 'gotoItem', index: at('classes') });
    s = r(s, { type: 'rotate', steps: 1 });
    s = r(s, { type: 'adopt' });
    expect(s.committed.classes).toBe(3);
    s = r(s, { type: 'prevItem' });
    s = r(s, { type: 'rotate', steps: 1 });
    s = r(s, { type: 'revert' });
    expect(s.preview).toBeNull();
    expect(s.committed.classes).toBe(3);
    s = r(s, { type: 'revert' });
    expect(s.committed.classes).toBe(2);
  });

  it('undoing a style restores the bundled values', () => {
    let s = r(initialEditor(), { type: 'gotoItem', index: STYLE });
    s = r(s, { type: 'rotate', steps: 2 });
    s = r(s, { type: 'adopt' });
    s = r(s, { type: 'prevItem' });
    s = r(s, { type: 'revert' });
    expect(s.committed).toEqual(DEFAULT_SETTINGS);
  });

  it('finish: save increments the request, back returns to STYLE', () => {
    let s = r(initialEditor(), { type: 'gotoItem', index: FINISH_INDEX });
    s = r(s, { type: 'adopt' });
    expect(s.saveRequest).toBe(1);
    s = r(s, { type: 'rotate', steps: 1 });
    s = r(s, { type: 'adopt' });
    expect(s.itemIndex).toBe(0);
    expect(ITEM_KEYS[s.itemIndex]).toBe('data');
    expect(s.saveRequest).toBe(1);
  });
});
