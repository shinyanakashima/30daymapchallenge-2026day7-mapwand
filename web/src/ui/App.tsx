import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Action, Button, ITEMS, StateFlag } from '../protocol/generated';
import { MapWandLink, bluetoothSupported, type LinkInfo, type LinkInput } from '../ble/link';
import { buildScene } from '../map/scene';
import { SceneSvg } from '../map/SceneSvg';
import { sceneToPng } from '../map/exportPng';
import {
  FINISH_INDEX,
  adoptedCandidate,
  currentCandidate,
  editorReducer,
  effectiveSettings,
  initialEditor,
  isPreviewing,
  type EditorAction,
} from '../state/editor';
import { parseSettingsFile, toSettingsFile } from '../state/settingsFile';
import { Logo } from './Logo';
import { formatClock, useTimer } from './timer';

const LIMIT_MS = 10 * 60 * 1000;

interface SaveResult {
  pngUrl: string;
  jsonUrl: string;
  base: string;
  elapsedMs: number | null;
  at: Date;
}

const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function download(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function stamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 保存できなくても動作は続ける */
  }
}

export function App() {
  const [editor, dispatch] = useReducer(editorReducer, undefined, () => initialEditor());
  const timer = useTimer(LIMIT_MS);
  const [save, setSave] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [link, setLink] = useState<LinkInfo>({
    status: bluetoothSupported() ? 'idle' : 'unsupported',
    message: '',
    lost: 0,
  });
  const [countsPerStep, setCountsPerStep] = useState<number>(() => loadPref('mw.countsPerStep', 2));
  const [invert, setInvert] = useState<boolean>(() => loadPref('mw.invert', false));
  const fileRef = useRef<HTMLInputElement>(null);

  const settings = effectiveSettings(editor);
  const scene = useMemo(() => buildScene(settings), [settings]);
  const item = ITEMS[editor.itemIndex];
  const cand = currentCandidate(editor);
  const previewing = isPreviewing(editor);

  // ---- デバイス入力 → 共通の操作 ----
  const onLinkInput = useCallback((e: LinkInput) => {
    if (e.kind === 'rotate') return dispatch({ type: 'rotate', steps: e.steps });
    if (e.action === Action.SHORT) {
      if (e.button === Button.A) dispatch({ type: 'nextItem' });
      else if (e.button === Button.B) dispatch({ type: 'prevItem' });
      else if (e.button === Button.DIAL) dispatch({ type: 'adopt' });
    } else if (e.action === Action.LONG && e.button === Button.DIAL) {
      dispatch({ type: 'revert' });
    }
  }, []);
  const linkRef = useRef<MapWandLink | null>(null);
  if (!linkRef.current) linkRef.current = new MapWandLink(onLinkInput, setLink);
  const ble = linkRef.current;
  useEffect(() => {
    ble.tracker.countsPerStep = countsPerStep;
    ble.tracker.invert = invert;
    savePref('mw.countsPerStep', countsPerStep);
    savePref('mw.invert', invert);
  }, [ble, countsPerStep, invert]);

  // ---- 状態をデバイスへ同期 ----
  const remainingSec = timer.startedAt === null ? 600 : Math.ceil((LIMIT_MS - timer.elapsed) / 1000);
  useEffect(() => {
    let flags = 0;
    if (previewing) flags |= StateFlag.PREVIEW;
    if (timer.startedAt !== null && timer.stoppedAt === null) flags |= StateFlag.TIMER_RUNNING;
    if (timer.elapsed > LIMIT_MS) flags |= StateFlag.OVERTIME;
    if (save) flags |= StateFlag.SAVED;
    ble.sendState({
      item: editor.itemIndex,
      candidate: cand,
      count: item.candidates.length,
      adopted: adoptedCandidate(editor),
      flags,
      rgb: hexToRgb(item.led),
      timerSeconds: remainingSec,
    });
  }, [ble, editor, cand, item, previewing, remainingSec, timer.startedAt, timer.stoppedAt, timer.elapsed, save, link.status]);

  // ---- 保存 ----
  const doSave = useCallback(async () => {
    setSaving(true);
    try {
      const elapsedMs = timer.startedAt === null ? null : timer.stop();
      const at = new Date();
      const committedScene = buildScene(editor.committed);
      const png = await sceneToPng(committedScene);
      const json = new Blob([JSON.stringify(toSettingsFile(editor.committed, elapsedMs), null, 2)], {
        type: 'application/json',
      });
      setSave((old) => {
        if (old) {
          URL.revokeObjectURL(old.pngUrl);
          URL.revokeObjectURL(old.jsonUrl);
        }
        return { pngUrl: URL.createObjectURL(png), jsonUrl: URL.createObjectURL(json), base: `mapwand-${stamp(at)}`, elapsedMs, at };
      });
    } catch (e) {
      setNotice(`保存に失敗しました: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [editor.committed, timer]);

  const lastSaveReq = useRef(0);
  useEffect(() => {
    if (editor.saveRequest !== lastSaveReq.current) {
      lastSaveReq.current = editor.saveRequest;
      void doSave();
    }
  }, [editor.saveRequest, doSave]);

  // 保存準備ができたら PNG のダウンロードを試みる（ブラウザに阻まれたら画面のボタンで完了）
  const autoDownloaded = useRef<string | null>(null);
  useEffect(() => {
    if (save && autoDownloaded.current !== save.pngUrl) {
      autoDownloaded.current = save.pngUrl;
      download(save.pngUrl, `${save.base}.png`);
    }
  }, [save]);

  // ---- キーボード ----
  const act = useCallback((a: EditorAction) => dispatch(a), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, select, textarea')) return;
      const map: Record<string, EditorAction> = {
        ArrowRight: { type: 'rotate', steps: 1 },
        ArrowLeft: { type: 'rotate', steps: -1 },
        ArrowDown: { type: 'nextItem' },
        ArrowUp: { type: 'prevItem' },
        Enter: { type: 'adopt' },
        ' ': { type: 'adopt' },
        Backspace: { type: 'revert' },
        Escape: { type: 'revert' },
      };
      const a = map[e.key];
      if (!a) return;
      e.preventDefault();
      if (t.closest('button') && (e.key === 'Enter' || e.key === ' ')) (t as HTMLButtonElement).blur();
      act(a);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act]);

  const onLoadFile = async (f: File) => {
    try {
      const { settings: s, warning } = parseSettingsFile(await f.text());
      dispatch({ type: 'load', settings: s });
      setNotice(warning ?? '設定を読み込みました');
    } catch (e) {
      setNotice(`読み込めませんでした: ${(e as Error).message}`);
    }
  };

  const saveJsonNow = () => {
    const blob = new Blob([JSON.stringify(toSettingsFile(editor.committed, timer.startedAt ? timer.elapsed : null), null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    download(url, `mapwand-settings-${stamp(new Date())}.json`);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const over = timer.elapsed > LIMIT_MS;
  const linkLabel: Record<LinkInfo['status'], string> = {
    unsupported: '画面操作モード',
    idle: '未接続',
    'bt-off': 'Bluetooth 無効',
    requesting: '機器選択中',
    connecting: '接続中',
    connected: '接続中のMapWand',
    reconnecting: '再接続中',
    disconnected: '切断',
    error: 'エラー',
  };

  return (
    <div className="app">
      <header className="bar">
        <Logo />
        <div className={`timer ${over ? 'over' : ''} ${timer.startedAt === null ? 'idle' : ''}`}>
          {timer.startedAt === null ? (
            <>
              <span className="clock">10:00</span>
              <button className="primary" onClick={timer.start}>
                制作開始
              </button>
            </>
          ) : (
            <>
              <span className="clock" aria-live="off">
                {over ? `+${formatClock(timer.elapsed - LIMIT_MS)}` : formatClock(LIMIT_MS - timer.elapsed)}
              </span>
              <span className="timer-note">
                {timer.stoppedAt !== null
                  ? `完成 ${formatClock(timer.elapsed)}`
                  : over
                    ? '10分を超過'
                    : '残り'}
              </span>
              <button className="ghost" onClick={timer.reset}>
                リセット
              </button>
            </>
          )}
        </div>
        <div className={`link link-${link.status}`}>
          <span className="dot" />
          <span>{linkLabel[link.status]}</span>
          {link.status === 'connected' && link.encoderOk === false && <span className="warn">ダイヤル未検出</span>}
        </div>
      </header>

      <main className="stage">
        <div className="map-frame">
          <SceneSvg scene={scene} />
          {(editor.pulse.kind === 'adopt' || editor.pulse.kind === 'save') && <span key={editor.pulse.n} className="glint" />}
        </div>
      </main>

      <aside className="side">
        <section className="now" style={{ ['--item' as string]: item.led }}>
          <div className="now-item">
            <span className="chip" />
            {item.label}
            <span className="now-key">{item.short}</span>
          </div>
          <div className="now-value" key={editor.pulse.n}>
            {item.candidates[cand].label}
          </div>
          <div className="now-meta">
            {cand + 1} / {item.candidates.length}
            {editor.itemIndex !== FINISH_INDEX && (
              <span className={previewing ? 'badge preview' : 'badge'}>{previewing ? '未採用' : '採用中'}</span>
            )}
          </div>
          <div className="wand">
            <button onClick={() => act({ type: 'rotate', steps: -1 })} aria-label="前の候補">
              ◀
            </button>
            <button className="adopt" onClick={() => act({ type: 'adopt' })}>
              {editor.itemIndex === FINISH_INDEX ? '決定' : '採用'}
            </button>
            <button onClick={() => act({ type: 'rotate', steps: 1 })} aria-label="次の候補">
              ▶
            </button>
          </div>
          <div className="wand sub">
            <button onClick={() => act({ type: 'prevItem' })}>前の項目</button>
            <button onClick={() => act({ type: 'revert' })}>戻す</button>
            <button onClick={() => act({ type: 'nextItem' })}>次の項目</button>
          </div>
        </section>

        <ol className="items">
          {ITEMS.map((it, i) => {
            const k = it.key as keyof typeof editor.committed | 'finish';
            const v = k === 'finish' ? '' : it.candidates[editor.committed[k]].label;
            return (
              <li key={it.key} className={i === editor.itemIndex ? 'on' : ''} style={{ ['--item' as string]: it.led }}>
                <button onClick={() => act({ type: 'gotoItem', index: i })}>
                  <span className="chip" />
                  <span className="name">{it.label}</span>
                  <span className="val">{v}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <section className="help">
          <p>
            <b>回す</b> 候補を試す　<b>押す</b> 採用して次へ　<b>長押し</b> 戻す
          </p>
          <p>
            <b>A / B</b> 次・前の項目
          </p>
          <p className="keys">キーボード：← → 候補　Enter 採用　Backspace 戻す　↑ ↓ 項目</p>
        </section>

        <section className="conn">
          {link.status === 'unsupported' ? (
            <p className="muted">このブラウザは Web Bluetooth 非対応です。画面とキーボードで操作できます（Windows 版 Chrome / Edge で接続可）。</p>
          ) : (
            <>
              <div className="row">
                {link.status === 'connected' ? (
                  <button onClick={() => ble.disconnect()}>切断</button>
                ) : (
                  <button className="primary" onClick={() => void ble.request()} disabled={link.status === 'requesting' || link.status === 'connecting'}>
                    MapWandに接続
                  </button>
                )}
                {(link.status === 'disconnected' || link.status === 'error' || link.status === 'reconnecting') && (
                  <button onClick={() => void ble.reconnect()}>再接続</button>
                )}
              </div>
              {link.message && <p className="muted">{link.message}</p>}
              <details>
                <summary>ダイヤル設定</summary>
                <label>
                  1候補あたりのカウント
                  <select value={countsPerStep} onChange={(e) => setCountsPerStep(Number(e.target.value))}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
                  回転方向を反転
                </label>
                {link.lost > 0 && <p className="muted">欠落した通知: {link.lost}</p>}
              </details>
            </>
          )}
        </section>

        <section className="files">
          <div className="row">
            <button onClick={() => act({ type: 'gotoItem', index: FINISH_INDEX })}>仕上げへ</button>
            <button onClick={saveJsonNow}>設定を保存</button>
            <button onClick={() => fileRef.current?.click()}>設定を開く</button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onLoadFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {notice && <p className="muted">{notice}</p>}
        </section>
      </aside>

      {(save || saving) && (
        <div className="save-panel" role="dialog" aria-label="保存">
          {saving || !save ? (
            <p>画像を書き出しています…</p>
          ) : (
            <>
              <img src={save.pngUrl} alt="保存した地図" />
              <div>
                <p className="save-title">保存準備完了</p>
                <p className="muted">
                  {save.elapsedMs !== null
                    ? `制作時間 ${formatClock(save.elapsedMs)}${save.elapsedMs > LIMIT_MS ? '（10分超過）' : ''}`
                    : 'タイマー未開始'}
                  ・{save.at.toLocaleTimeString('ja-JP')}
                </p>
                <p className="muted">自動で保存されない場合は下のボタンを押してください。</p>
                <div className="row">
                  <button className="primary" onClick={() => download(save.pngUrl, `${save.base}.png`)}>
                    PNG を保存
                  </button>
                  <button onClick={() => download(save.jsonUrl, `${save.base}.json`)}>設定 JSON</button>
                  <button className="ghost" onClick={() => setSave(null)}>
                    閉じる
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
