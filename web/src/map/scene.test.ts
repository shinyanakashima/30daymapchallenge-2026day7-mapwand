import { describe, expect, it } from 'vitest';
import { buildScene, titleText, type Prim } from './scene';
import { INDICATORS } from '../data/dataset';
import { DEFAULT_SETTINGS } from '../state/editor';
import { ITEMS } from '../protocol/generated';
import { BASEMAPS } from './presets';
import { parseSettingsFile, toSettingsFile } from '../state/settingsFile';

const texts = (prims: Prim[]): string[] =>
  prims.flatMap((p) => (p.t === 'text' ? [p.text] : p.t === 'group' ? texts(p.children) : []));
const CJK = /[぀-ヿ㐀-鿿＀-￯]/;
const count = (key: string) => ITEMS.find((i) => i.key === key)!.candidates.length;

describe('English map', () => {
  it('has no Japanese text in any data / layer / basemap / label combination', () => {
    for (let data = 0; data < count('data'); data++) {
      for (const layer of [0, count('layer') - 1]) {
        for (let label = 0; label < count('label'); label++) {
          for (const base of [0, 1, 5]) {
            const s = { ...DEFAULT_SETTINGS, data, layer, label, base };
            // 地理院タイルの指定どおりの出典表記（「世界衛星モザイク画像」を含む）は原文のまま
            const required = BASEMAPS[base].extraCredit ?? '';
            const bad = texts(buildScene(s, 'en').prims).filter((t) => CJK.test(t) && !required.includes(t));
            expect(bad, JSON.stringify(s)).toEqual([]);
          }
        }
      }
    }
  });

  it('fills the indicator into title templates', () => {
    const density = INDICATORS[0];
    expect(titleText(0, density, 'en')).toBe('Population density by prefecture');
    expect(titleText(1, density, 'en')).toBe('Japan, mapped by population density');
    expect(titleText(0, density, 'ja')).toBe('都道府県別 人口密度');
    for (let i = 0; i < count('title'); i++) expect(titleText(i, density, 'en')).not.toMatch(/[{}]/);
  });

  it('keeps the map language in the settings file', () => {
    const f = toSettingsFile(DEFAULT_SETTINGS, 1000, 'en');
    expect(parseSettingsFile(JSON.stringify(f)).lang).toBe('en');
    const old = { ...f, lang: undefined };
    expect(parseSettingsFile(JSON.stringify(old)).lang).toBeUndefined();
  });
});
