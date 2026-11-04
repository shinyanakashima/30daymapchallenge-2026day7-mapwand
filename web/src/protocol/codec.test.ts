import { describe, expect, it } from 'vitest';
import { RotaryTracker, counterDelta, decodeInput, encodeInput, encodeState, seqAdvance } from './codec';
import { InputType, PROTOCOL_VERSION, STATE_SIZE } from './generated';

describe('codec', () => {
  it('round-trips input packets (little endian, signed counter)', () => {
    const p = { version: PROTOCOL_VERSION, type: InputType.ROTARY, seq: 65535, counter: -123456, button: 0, action: 0, deviceFlags: 1 };
    const v = encodeInput(p);
    expect(new Uint8Array(v.buffer).slice(0, 4)).toEqual(new Uint8Array([PROTOCOL_VERSION, 1, 0xff, 0xff]));
    expect(decodeInput(v)).toEqual(p);
  });

  it('encodes state packets within 20 bytes', () => {
    const b = encodeState({
      stateSeq: 0x1234, item: 2, candidate: 3, count: 5, adopted: 2, flags: 1, rgb: [1, 2, 3], timerSeconds: -61,
    });
    expect(b.length).toBe(STATE_SIZE);
    expect(STATE_SIZE).toBeLessThanOrEqual(20);
    expect([...b.slice(0, 12)]).toEqual([PROTOCOL_VERSION, 1, 0x34, 0x12, 2, 3, 5, 2, 1, 1, 2, 3]);
    expect(new DataView(b.buffer).getInt16(12, true)).toBe(-61);
  });

  it('handles counter and seq wrap-around', () => {
    expect(counterDelta(-2147483648, 2147483647)).toBe(1);
    expect(counterDelta(2147483647, -2147483648)).toBe(-1);
    expect(seqAdvance(0, 65535)).toBe(1);
    expect(seqAdvance(5, 5)).toBe(0);
  });

  it('tracks rotation with remainder and ignores duplicates', () => {
    const t = new RotaryTracker(2);
    t.reset(100, 10);
    expect(t.acceptSeq(10)).toBe(false);
    expect(t.acceptSeq(11)).toBe(true);
    expect(t.update(101)).toBe(0);
    expect(t.update(103)).toBe(1);
    expect(t.update(104)).toBe(1);
    expect(t.acceptSeq(14)).toBe(true);
    expect(t.lost).toBe(2);
    expect(t.update(96)).toBe(-4);
    t.invert = true;
    expect(t.update(98)).toBe(-1);
  });
});
