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

/** Phone held at screen angle `a` (0 portrait, 90/270 landscape), tipped back by `pitch`, turned like a wheel by `wheel` (clockwise +). */
function held(a: number, wheel: number, pitch: number): [number, number] {
  const w = wheel * d, p = pitch * d, r = a * d;
  const sx = -Math.sin(w) * Math.cos(p), sy = Math.cos(w) * Math.cos(p);
  const ux = sx * Math.cos(r) + sy * Math.sin(r), uy = -sx * Math.sin(r) + sy * Math.cos(r);
  return euler(ux, uy, Math.sin(p));
}

describe('tilt steering (landscape, like a steering wheel)', () => {
  it('both landscape orientations: right turns right, left turns left, centred when straight', () => {
    for (const a of [90, 270])
      for (const pitch of [10, 35, 60]) {
        expect(Math.abs(tiltSteer(...held(a, 0, pitch), a))).toBeLessThan(0.01);
        expect(tiltSteer(...held(a, 20, pitch), a)).toBeGreaterThan(0.3);
        expect(tiltSteer(...held(a, -20, pitch), a)).toBeLessThan(-0.3);
      }
  });
  it('is proportional: a little turn steers a little, a big turn steers a lot', () => {
    const v = [5, 10, 20, 30].map((w) => tiltSteer(...held(90, w, 30), 90, 0.55));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    expect(v[0]).toBeGreaterThan(0.05);
    expect(v[0]).toBeLessThan(0.2);
    expect(v[2]).toBeGreaterThan(0.35);
    expect(v[2]).toBeLessThan(0.65);
    // roughly linear: double the angle, about double the steering
    expect(v[2] / v[1]).toBeGreaterThan(1.7);
    expect(tiltSteer(...held(90, 70, 30), 90, 0.55)).toBe(1);
  });
});

describe('tilt steering (portrait, like a steering wheel)', () => {
  it('is centred when the phone is held straight', () => {
    for (const pitch of [0, 20, 45, 70]) expect(Math.abs(tiltSteer(...portrait(0, pitch), 0))).toBeLessThan(0.01);
  });
  it('turning the phone to the right steers right, to the left steers left', () => {
    for (const pitch of [0, 25, 50, 65]) {
      expect(tiltSteer(...portrait(15, pitch), 0)).toBeGreaterThan(0.3);
      expect(tiltSteer(...portrait(-15, pitch), 0)).toBeLessThan(-0.3);
      if (pitch <= 50) {
        expect(tiltSteer(...portrait(60, pitch), 0)).toBe(1);
        expect(tiltSteer(...portrait(-60, pitch), 0)).toBe(-1);
      }
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
