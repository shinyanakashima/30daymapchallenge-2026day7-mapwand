// MapWand との BLE 接続（Web Bluetooth, ブラウザ = Central / GATT クライアント）。
import { DEVICE_NAME, InputType, PROTOCOL_VERSION, UUIDS } from '../protocol/generated';
import { RotaryTracker, decodeInput, encodeState, type InputPacket, type StatePacket } from '../protocol/codec';

export type LinkStatus =
  | 'unsupported' // navigator.bluetooth なし
  | 'idle' // 未接続
  | 'bt-off' // PC の Bluetooth が無効
  | 'requesting' // 機器選択中
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type LinkInput =
  | { kind: 'rotate'; steps: number }
  | { kind: 'button'; button: number; action: number };

export interface LinkInfo {
  status: LinkStatus;
  message: string;
  deviceName?: string;
  encoderOk?: boolean;
  lost: number;
}

type Listener = (info: LinkInfo) => void;

export const bluetoothSupported = () => typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export class MapWandLink {
  private device: BluetoothDevice | null = null;
  private input: BluetoothRemoteGATTCharacteristic | null = null;
  private state: BluetoothRemoteGATTCharacteristic | null = null;
  private writing = false;
  private pending: StatePacket | null = null;
  private lastState: StatePacket | null = null;
  private stateSeq = 0;
  private manualDisconnect = false;
  private reconnectTimer: number | null = null;
  readonly tracker = new RotaryTracker();
  info: LinkInfo = { status: bluetoothSupported() ? 'idle' : 'unsupported', message: '', lost: 0 };

  constructor(
    private onInput: (e: LinkInput) => void,
    private onInfo: Listener,
  ) {}

  private set(status: LinkStatus, message = '', extra: Partial<LinkInfo> = {}) {
    this.info = { ...this.info, status, message, lost: this.tracker.lost, ...extra };
    this.onInfo(this.info);
  }

  /** 『MapWandに接続』ボタンから呼ぶ（ユーザー操作が必要） */
  async request() {
    if (!bluetoothSupported()) return this.set('unsupported', 'このブラウザは Web Bluetooth に対応していません');
    try {
      if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability())) {
        return this.set('bt-off', 'PC の Bluetooth が無効か、アダプターが見つかりません');
      }
    } catch {
      /* getAvailability 非対応はそのまま続ける */
    }
    this.set('requesting', '機器選択で MapWand を選んでください');
    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [UUIDS.service] }, { name: DEVICE_NAME }],
        optionalServices: [UUIDS.service],
      });
    } catch (e) {
      const err = e as DOMException;
      if (err.name === 'NotFoundError') {
        const cancelled = /cancel/i.test(err.message);
        return this.set(
          this.device ? 'disconnected' : 'idle',
          cancelled ? '機器選択がキャンセルされました' : 'MapWand が見つかりません（電源と距離を確認）',
        );
      }
      if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
        return this.set('error', 'Bluetooth の利用が許可されていません（ブラウザの権限を確認）');
      }
      return this.set('error', `機器選択に失敗しました: ${err.message}`);
    }
    if (this.device && this.device !== device) this.disconnect();
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.handleDisconnected);
    await this.connect();
  }

  /** 選択済みの機器へ再接続（機器選択なし） */
  async reconnect() {
    if (!this.device) return this.request();
    await this.connect(true);
  }

  disconnect() {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.device?.gatt?.disconnect();
    this.input = null;
    this.state = null;
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async connect(isRetry = false) {
    const device = this.device!;
    this.manualDisconnect = false;
    this.set(isRetry ? 'reconnecting' : 'connecting', `${device.name ?? DEVICE_NAME} に接続しています`, {
      deviceName: device.name ?? DEVICE_NAME,
    });
    try {
      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(UUIDS.service);
      // 再接続のたびに Characteristic を取り直す
      this.input = await service.getCharacteristic(UUIDS.input);
      this.state = await service.getCharacteristic(UUIDS.state);
      // 現在値を読み、プロトコルバージョン照合と回転基準値の取り直し
      const snap = decodeInput(await this.input.readValue());
      if (snap.version !== PROTOCOL_VERSION) {
        this.set('error', `プロトコルが一致しません（機器 v${snap.version} / 画面 v${PROTOCOL_VERSION}）。ファームウェアを書き直してください`);
        device.gatt!.disconnect();
        return;
      }
      this.tracker.reset(snap.counter, snap.seq);
      this.input.addEventListener('characteristicvaluechanged', this.handleNotify);
      await this.input.startNotifications();
      this.set('connected', '接続しました', { encoderOk: (snap.deviceFlags & 1) === 1 });
      // 購読開始後に全状態を同期
      this.writing = false;
      if (this.lastState) this.sendState(this.lastState);
    } catch (e) {
      const err = e as Error;
      this.input = null;
      this.state = null;
      if (this.manualDisconnect) return;
      this.set('disconnected', `接続できませんでした: ${err.message}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    this.clearReconnectTimer();
    if (this.manualDisconnect || !this.device) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.info.status !== 'connected') void this.connect(true);
    }, 3000);
  }

  private handleDisconnected = () => {
    this.input?.removeEventListener('characteristicvaluechanged', this.handleNotify);
    this.input = null;
    this.state = null;
    this.tracker.reset();
    if (this.manualDisconnect) {
      this.set('disconnected', '切断しました');
      return;
    }
    this.set('disconnected', '切断されました。自動で再接続を試みます（編集内容は保持）');
    this.scheduleReconnect();
  };

  private handleNotify = (ev: Event) => {
    const ch = ev.target as BluetoothRemoteGATTCharacteristic;
    if (!ch.value) return;
    let p: InputPacket;
    try {
      p = decodeInput(ch.value);
    } catch {
      return;
    }
    if (p.version !== PROTOCOL_VERSION) return;
    if (!this.tracker.ready) return; // 基準値を取るまでは古い入力として捨てる
    if (!this.tracker.acceptSeq(p.seq)) return;
    // すべてのパケットに累積カウンターが入るので、どの種類でも回転差分を拾う
    const steps = this.tracker.update(p.counter);
    if (steps !== 0) this.onInput({ kind: 'rotate', steps });
    if (p.type === InputType.BUTTON) this.onInput({ kind: 'button', button: p.button, action: p.action });
    const encoderOk = (p.deviceFlags & 1) === 1;
    if (encoderOk !== this.info.encoderOk || this.tracker.lost !== this.info.lost) {
      this.set(this.info.status, this.info.message, { encoderOk });
    }
  };

  /** 状態をデバイスへ送る。書き込みは直列化し、待ちの間の古い状態は最新にまとめる */
  sendState(s: Omit<StatePacket, 'stateSeq'> | StatePacket) {
    this.lastState = { ...s, stateSeq: 0 };
    if (!this.state || this.info.status !== 'connected') return;
    this.pending = this.lastState;
    if (!this.writing) void this.flush();
  }

  private async flush() {
    this.writing = true;
    try {
      while (this.pending && this.state) {
        const p = { ...this.pending, stateSeq: (this.stateSeq = (this.stateSeq + 1) & 0xffff) };
        this.pending = null;
        await this.state.writeValueWithResponse(encodeState(p));
      }
    } catch (e) {
      console.warn('[MapWand] state write failed', e);
    } finally {
      this.writing = false;
    }
  }
}
