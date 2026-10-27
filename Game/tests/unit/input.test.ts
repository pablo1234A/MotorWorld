import { describe, expect, it } from 'vitest';
import { tiltSteer } from '../../src/core/Input';

const d = Math.PI / 180;
/** (beta, gamma) a browser would report for a given world-up vector in device coordinates. */
function euler(ux: number, uy: number, uz: number): [number, number] {
  const beta = Math.asin(uy) / d;
  const gamma = Math.atan2(-ux, uz) / d;
  return [beta, gamma];
}
/** Phone held in portrait, tipped back by `pitch` degrees, turned like a steering wheel by `wheel` degrees (clockwise +). */
function portrait(wheel: number, pitch: number): [number, number] {
  const w = wheel * d, p = pitch * d;
  // up in screen plane rotated by the wheel angle, then the screen tipped back
  const ux = -Math.sin(w) * Math.cos(p), uy = Math.cos(w) * Math.cos(p), uz = Math.sin(p);
  return euler(ux, uy, uz);
}

describe('tilt steering (portrait, like a steering wheel)', () => {
  it('is centred when the phone is held straight', () => {
    for (const pitch of [0, 20, 45, 70]) expect(Math.abs(tiltSteer(...portrait(0, pitch), 0))).toBeLessThan(0.01);
  });
  it('turning the phone to the right steers right, to the left steers left', () => {
    for (const pitch of [0, 25, 50, 65]) {
      expect(tiltSteer(...portrait(15, pitch), 0)).toBeGreaterThan(0.3);
      expect(tiltSteer(...portrait(-15, pitch), 0)).toBeLessThan(-0.3);
      expect(tiltSteer(...portrait(45, pitch), 0)).toBe(1);
      expect(tiltSteer(...portrait(-45, pitch), 0)).toBe(-1);
    }
  });
  it('works near the gimbal lock (phone upright)', () => {
    // browsers report e.g. beta 60, gamma 90 for an upright phone turned 30 degrees clockwise
    expect(tiltSteer(60, 90, 0)).toBeGreaterThan(0.5);
    expect(tiltSteer(60, -90, 0)).toBeLessThan(-0.5);
  });
  it('lying flat: lowering the right edge steers right', () => {
    expect(tiltSteer(0, 20, 0)).toBeGreaterThan(0.3);
    expect(tiltSteer(0, -20, 0)).toBeLessThan(-0.3);
  });
  it('respects the screen orientation (landscape)', () => {
    // landscape-primary (angle 90): turning clockwise puts world-up on the device's +y side
    const t = 20 * d;
    const [b, g] = euler(Math.cos(t), Math.sin(t), 0.001);
    expect(tiltSteer(b, g, 90)).toBeGreaterThan(0.3);
  });
  it('has a small dead zone', () => {
    expect(tiltSteer(...portrait(1.5, 30), 0)).toBe(0);
  });
});
