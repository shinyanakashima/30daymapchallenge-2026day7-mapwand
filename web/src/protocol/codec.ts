// MapWand GATT パケットの符号化・復号。バイト配置は docs/PROTOCOL.md を参照。
// すべてリトルエンディアン。
import { INPUT_SIZE, PROTOCOL_VERSION, STATE_SIZE, StateType } from './generated';

export interface InputPacket {
  version: number;
  type: number;
  seq: number; // u16
  counter: number; // i32 累積回転カウント
  button: number;
  action: number;
  deviceFlags: number;
}

export function decodeInput(view: DataView): InputPacket {
  if (view.byteLength < INPUT_SIZE) throw new Error(`input packet too short: ${view.byteLength}`);
  return {
    version: view.getUint8(0),
    type: view.getUint8(1),
    seq: view.getUint16(2, true),
    counter: view.getInt32(4, true),
    button: view.getUint8(8),
    action: view.getUint8(9),
    deviceFlags: view.getUint8(10),
  };
}

export function encodeInput(p: InputPacket): DataView {
  const v = new DataView(new ArrayBuffer(INPUT_SIZE));
  v.setUint8(0, p.version);
  v.setUint8(1, p.type);
  v.setUint16(2, p.seq & 0xffff, true);
  v.setInt32(4, p.counter | 0, true);
  v.setUint8(8, p.button);
  v.setUint8(9, p.action);
  v.setUint8(10, p.deviceFlags);
  return v;
}

export interface StatePacket {
  stateSeq: number; // u16
  item: number;
  candidate: number;
  count: number;
  adopted: number;
  flags: number;
  rgb: [number, number, number];
  timerSeconds: number; // i16 残り秒（負 = 超過）
}

export function encodeState(s: StatePacket): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(STATE_SIZE);
  const v = new DataView(buf);
  v.setUint8(0, PROTOCOL_VERSION);
  v.setUint8(1, StateType.STATE);
  v.setUint16(2, s.stateSeq & 0xffff, true);
  v.setUint8(4, s.item);
  v.setUint8(5, s.candidate);
  v.setUint8(6, s.count);
  v.setUint8(7, s.adopted);
  v.setUint8(8, s.flags);
  v.setUint8(9, s.rgb[0]);
  v.setUint8(10, s.rgb[1]);
  v.setUint8(11, s.rgb[2]);
  v.setInt16(12, Math.max(-32768, Math.min(32767, Math.round(s.timerSeconds))), true);
  return new Uint8Array(buf);
}

/** int32 の折り返しを考慮した差分 */
export const counterDelta = (now: number, prev: number) => (now - prev) | 0;

/** u16 seq の前進量（0 = 重複、0x8000 以上 = 古いパケット） */
export const seqAdvance = (now: number, prev: number) => (now - prev) & 0xffff;

/**
 * 回転カウンターを候補の移動量へ変換する。端数は持ち越す。
 * 接続のたびに reset() で基準値を取り直し、古い入力を再生しない。
 */
export class RotaryTracker {
  private base: number | null = null;
  private lastSeq: number | null = null;
  private acc = 0;
  lost = 0;
  duplicates = 0;

  constructor(
    public countsPerStep = 2,
    public invert = false,
  ) {}

  reset(counter: number | null = null, seq: number | null = null) {
    this.base = counter;
    this.lastSeq = seq;
    this.acc = 0;
  }

  get ready() {
    return this.base !== null;
  }

  /** パケットを受け取り、処理すべきなら true。重複・古いものは false */
  acceptSeq(seq: number): boolean {
    if (this.lastSeq !== null) {
      const adv = seqAdvance(seq, this.lastSeq);
      if (adv === 0) {
        this.duplicates++;
        return false;
      }
      if (adv >= 0x8000) return false;
      if (adv > 1) this.lost += adv - 1;
    }
    this.lastSeq = seq;
    return true;
  }

  /** 累積カウンターから移動ステップ数を返す */
  update(counter: number): number {
    if (this.base === null) {
      this.base = counter;
      return 0;
    }
    const d = counterDelta(counter, this.base);
    this.base = counter;
    this.acc += this.invert ? -d : d;
    const steps = Math.trunc(this.acc / this.countsPerStep);
    this.acc -= steps * this.countsPerStep;
    return steps;
  }
}
