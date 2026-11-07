// 画面と地図の表示言語。地図の中の文字（タイトル・凡例・地名・出典）も同じ言語にそろえる。
export type Lang = 'ja' | 'en';

const KEY = 'mw.lang';

/** URL の ?lang= → 前回選んだ言語 → ブラウザの言語（日本語以外は英語）の順で決める */
export function detectLang(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'ja' || q === 'en') return q;
  } catch {
    /* URL が読めなくても続ける */
  }
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ja' || v === 'en') return v;
  } catch {
    /* 保存できない環境でも続ける */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function rememberLang(lang: Lang) {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* 保存できなくても動作は続ける */
  }
  try {
    const url = new URL(location.href);
    url.searchParams.set('lang', lang);
    history.replaceState(null, '', url);
  } catch {
    /* 共有用 URL に残せなくても続ける */
  }
  document.documentElement.lang = lang;
}

/** 項目・候補の表示名（protocol/mapwand.json の label / en） */
export const nameOf = (x: { label: string; en: string }, lang: Lang) => (lang === 'ja' ? x.label : x.en);

const ja = {
  start: '制作開始',
  reset: 'リセット',
  remaining: '残り',
  over10: '10分を超過',
  doneIn: '完成 {t}',
  'status.unsupported': '画面操作モード',
  'status.idle': '未接続',
  'status.bt-off': 'Bluetooth 無効',
  'status.requesting': '機器選択中',
  'status.connecting': '接続中',
  'status.connected': '接続中のMapWand',
  'status.reconnecting': '再接続中',
  'status.disconnected': '切断',
  'status.error': 'エラー',
  dialMissing: 'ダイヤル未検出',
  preview: '未採用',
  adopted: '採用中',
  adopt: '採用',
  decide: '決定',
  prevCand: '前の候補',
  nextCand: '次の候補',
  prevItem: '前の項目',
  revert: '戻す',
  nextItem: '次の項目',
  'help.turn': '回す',
  'help.turnDo': '候補を試す',
  'help.press': '押す',
  'help.pressDo': '採用して次へ',
  'help.hold': '長押し',
  'help.holdDo': '戻す',
  'help.ab': '次・前の項目',
  'help.keys': 'キーボード：← → 候補　Enter 採用　Backspace 戻す　↑ ↓ 項目',
  unsupported: 'このブラウザは Web Bluetooth 非対応です。画面とキーボードで操作できます（Windows 版 Chrome / Edge で接続可）。',
  disconnect: '切断',
  connect: 'MapWandに接続',
  reconnect: '再接続',
  dialSettings: 'ダイヤル設定',
  countsPerStep: '1候補あたりのカウント',
  invert: '回転方向を反転',
  lost: '欠落した通知: {n}',
  toFinish: '仕上げへ',
  saveSettings: '設定を保存',
  openSettings: '設定を開く',
  tilesFailed: 'ベースマップのタイル {n} 枚を読み込めず、画像から除いて保存しました',
  saveFailed: '保存に失敗しました: {m}',
  loaded: '設定を読み込みました',
  loadFailed: '読み込めませんでした: {m}',
  exporting: '画像を書き出しています…',
  saveReady: '保存準備完了',
  elapsed: '制作時間 {t}',
  overtime: '（10分超過）',
  timerNotStarted: 'タイマー未開始',
  autoNote: '自動で保存されない場合は下のボタンを押してください。',
  savePng: 'PNG を保存',
  settingsJson: '設定 JSON',
  close: '閉じる',
  savedAlt: '保存した地図',
  saveDialog: '保存',
  switchLang: 'English',
  'link.unsupported': 'このブラウザは Web Bluetooth に対応していません',
  'link.btOff': 'PC の Bluetooth が無効か、アダプターが見つかりません',
  'link.choose': '機器選択で MapWand を選んでください',
  'link.cancelled': '機器選択がキャンセルされました',
  'link.notFound': 'MapWand が見つかりません（電源と距離を確認）',
  'link.denied': 'Bluetooth の利用が許可されていません（ブラウザの権限を確認）',
  'link.chooseFailed': '機器選択に失敗しました: {m}',
  'link.connecting': '{name} に接続しています',
  'link.mismatch': 'プロトコルが一致しません（機器 v{d} / 画面 v{w}）。ファームウェアを書き直してください',
  'link.connected': '接続しました',
  'link.connectFailed': '接続できませんでした: {m}',
  'link.disconnected': '切断しました',
  'link.dropped': '切断されました。自動で再接続を試みます（編集内容は保持）',
  'file.notMapwand': 'MapWand の設定ファイルではありません',
  'file.newer': '新しい形式の設定ファイルです。アプリを更新してください',
  'file.invalid': '設定値が不正です: {k}',
  'file.dataVersion': 'データ版が異なります（ファイル {f} / 現在 {c}）',
} as const;

export type MsgKey = keyof typeof ja;

const en: Record<MsgKey, string> = {
  start: 'Start',
  reset: 'Reset',
  remaining: 'left',
  over10: 'Over 10 min',
  doneIn: 'Done in {t}',
  'status.unsupported': 'On-screen mode',
  'status.idle': 'Not connected',
  'status.bt-off': 'Bluetooth off',
  'status.requesting': 'Choosing device',
  'status.connecting': 'Connecting',
  'status.connected': 'MapWand connected',
  'status.reconnecting': 'Reconnecting',
  'status.disconnected': 'Disconnected',
  'status.error': 'Error',
  dialMissing: 'Dial not found',
  preview: 'Preview',
  adopted: 'Adopted',
  adopt: 'Adopt',
  decide: 'OK',
  prevCand: 'Previous option',
  nextCand: 'Next option',
  prevItem: 'Prev item',
  revert: 'Undo',
  nextItem: 'Next item',
  'help.turn': 'Turn',
  'help.turnDo': 'try options',
  'help.press': 'Press',
  'help.pressDo': 'adopt and go on',
  'help.hold': 'Hold',
  'help.holdDo': 'undo',
  'help.ab': 'next / previous item',
  'help.keys': 'Keyboard: ← → options · Enter adopt · Backspace undo · ↑ ↓ items',
  unsupported:
    'This browser does not support Web Bluetooth. You can still edit with the on-screen buttons and keyboard (connect with Chrome or Edge on Windows).',
  disconnect: 'Disconnect',
  connect: 'Connect to MapWand',
  reconnect: 'Reconnect',
  dialSettings: 'Dial settings',
  countsPerStep: 'Counts per option',
  invert: 'Reverse direction',
  lost: 'Lost notifications: {n}',
  toFinish: 'Finish',
  saveSettings: 'Save settings',
  openSettings: 'Open settings',
  tilesFailed: '{n} basemap tiles could not be loaded and were left out of the image',
  saveFailed: 'Could not save: {m}',
  loaded: 'Settings loaded',
  loadFailed: 'Could not load: {m}',
  exporting: 'Exporting the image…',
  saveReady: 'Ready to save',
  elapsed: 'Made in {t}',
  overtime: ' (over 10 min)',
  timerNotStarted: 'Timer not started',
  autoNote: 'If the download did not start, use the buttons below.',
  savePng: 'Save PNG',
  settingsJson: 'Settings JSON',
  close: 'Close',
  savedAlt: 'Saved map',
  saveDialog: 'Save',
  switchLang: '日本語',
  'link.unsupported': 'This browser does not support Web Bluetooth',
  'link.btOff': 'Bluetooth is off on this PC, or no adapter was found',
  'link.choose': 'Choose MapWand in the device chooser',
  'link.cancelled': 'Device selection was cancelled',
  'link.notFound': 'MapWand not found (check power and distance)',
  'link.denied': 'Bluetooth is not allowed (check browser permissions)',
  'link.chooseFailed': 'Device selection failed: {m}',
  'link.connecting': 'Connecting to {name}',
  'link.mismatch': 'Protocol mismatch (device v{d} / app v{w}). Please flash the firmware again',
  'link.connected': 'Connected',
  'link.connectFailed': 'Could not connect: {m}',
  'link.disconnected': 'Disconnected',
  'link.dropped': 'Connection lost. Reconnecting automatically (your edits are kept)',
  'file.notMapwand': 'Not a MapWand settings file',
  'file.newer': 'This settings file is from a newer version. Please update the app',
  'file.invalid': 'Invalid setting: {k}',
  'file.dataVersion': 'Different data version (file {f} / current {c})',
};

export interface Msg {
  key: MsgKey;
  args?: Record<string, string | number>;
}

export function t(lang: Lang, key: MsgKey, args: Record<string, string | number> = {}): string {
  const s: string = (lang === 'ja' ? ja : en)[key];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(args[k] ?? `{${k}}`));
}

/** 例外にキーを持たせ、表示時に翻訳する */
export class MsgError extends Error {
  constructor(public msg: Msg) {
    super(msg.key);
  }
}

export const errorText = (lang: Lang, e: unknown) =>
  e instanceof MsgError ? t(lang, e.msg.key, e.msg.args) : (e as Error).message;
