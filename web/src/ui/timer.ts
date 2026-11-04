import { useCallback, useEffect, useRef, useState } from 'react';

export const formatClock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** 『制作開始』から計る 10 分タイマー。超過後も止まらず、保存で完成時刻を固定する */
export function useTimer(_limitMs: number) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef({ startedAt, stoppedAt });
  ref.current = { startedAt, stoppedAt };

  useEffect(() => {
    if (startedAt === null || stoppedAt !== null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startedAt, stoppedAt]);

  const start = useCallback(() => {
    const t = Date.now();
    setStartedAt(t);
    setStoppedAt(null);
    setNow(t);
  }, []);
  /** 完成時刻を記録して経過ミリ秒を返す（すでに止まっていればその値） */
  const stop = useCallback((): number | null => {
    const { startedAt: s, stoppedAt: e } = ref.current;
    if (s === null) return null;
    if (e !== null) return e - s;
    const t = Date.now();
    setStoppedAt(t);
    setNow(t);
    return t - s;
  }, []);
  const reset = useCallback(() => {
    setStartedAt(null);
    setStoppedAt(null);
  }, []);

  const elapsed = startedAt === null ? 0 : (stoppedAt ?? now) - startedAt;
  return { startedAt, stoppedAt, elapsed, start, stop, reset };
}
