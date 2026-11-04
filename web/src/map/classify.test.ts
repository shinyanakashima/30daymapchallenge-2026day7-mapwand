import { describe, expect, it } from 'vitest';
import { quantileClassify } from './classify';
import density from '@data/processed/density_2020.json';

const rows = density.prefectures.map((p) => ({ key: p.code, value: p.density }));

describe('quantileClassify', () => {
  it('assigns all 47 prefectures and keeps bins ordered and non-overlapping', () => {
    for (const k of [3, 4, 5, 6, 7]) {
      const c = quantileClassify(rows, k);
      expect(c.classOf.size).toBe(47);
      expect(c.bins.reduce((s, b) => s + b.count, 0)).toBe(47);
      for (let i = 1; i < c.bins.length; i++) expect(c.bins[i].min).toBeGreaterThan(c.bins[i - 1].max);
      // 各県の値が所属階級の範囲内
      for (const r of rows) {
        const b = c.bins[c.classOf.get(r.key)!];
        expect(r.value).toBeGreaterThanOrEqual(b.min);
        expect(r.value).toBeLessThanOrEqual(b.max);
      }
      // 密度の大小と階級の大小が逆転しない
      const sorted = rows.slice().sort((a, b) => a.value - b.value);
      for (let i = 1; i < sorted.length; i++) {
        expect(c.classOf.get(sorted[i].key)!).toBeGreaterThanOrEqual(c.classOf.get(sorted[i - 1].key)!);
      }
    }
  });

  it('merges ties and removes empty classes', () => {
    const c = quantileClassify(
      [1, 1, 1, 1, 1, 2].map((v, i) => ({ key: String(i), value: v })),
      5,
    );
    expect(c.k).toBe(2);
    expect(c.bins.map((b) => b.count)).toEqual([5, 1]);
  });

  it('ignores missing values instead of treating them as 0', () => {
    const c = quantileClassify(
      [{ key: 'a', value: NaN }, { key: 'b', value: 3 }, { key: 'c', value: 5 }],
      2,
    );
    expect(c.classOf.has('a')).toBe(false);
    expect(c.bins[0].min).toBe(3);
  });
});
