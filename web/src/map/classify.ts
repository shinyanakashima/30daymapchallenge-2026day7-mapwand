// 分位分類（順位による等数分割）。
// 同じ値は必ず同じ階級へ入れ、空になった階級は詰めて実際の階級数を返す。
export interface ClassBin {
  min: number;
  max: number;
  count: number;
}

export interface Classification {
  requested: number;
  /** 実際の階級数（重複値や空階級を整理した後） */
  k: number;
  bins: ClassBin[];
  /** key → 階級 index（0 = 最小） */
  classOf: Map<string, number>;
}

export function quantileClassify(rows: { key: string; value: number }[], requested: number): Classification {
  const valid = rows.filter((r) => Number.isFinite(r.value));
  const sorted = valid.slice().sort((a, b) => a.value - b.value);
  const n = sorted.length;
  const raw: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = Math.min(requested - 1, Math.floor((i * requested) / n));
    // 同値は先に現れた値と同じ階級にする
    if (i > 0 && sorted[i].value === sorted[i - 1].value) raw[i] = raw[i - 1];
  }
  // 空階級を詰める
  const remap = new Map<number, number>();
  for (const c of raw) if (!remap.has(c)) remap.set(c, remap.size);
  const k = remap.size;
  const bins: ClassBin[] = Array.from({ length: k }, () => ({ min: Infinity, max: -Infinity, count: 0 }));
  const classOf = new Map<string, number>();
  sorted.forEach((r, i) => {
    const c = remap.get(raw[i])!;
    classOf.set(r.key, c);
    const b = bins[c];
    b.min = Math.min(b.min, r.value);
    b.max = Math.max(b.max, r.value);
    b.count++;
  });
  return { requested, k, bins, classOf };
}
