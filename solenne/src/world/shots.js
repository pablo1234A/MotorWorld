/**
 * Camera library. Villa-local metres; sea toward -z, entrance from +z.
 *   SHOTS  — fixed compositions used for the rendered stills (gallery, catalogue)
 *   TOUR   — keyframes of the scroll-driven walkthrough on the home page
 */

export const SHOTS = {
  hero:     { pos: [64, 8.5, -32],  look: [-4, 3.2, -9],    fov: 38 },
  heroW:    { pos: [-66, 7.5, -30],  look: [4, 3.4, -10],    fov: 38 },
  heroLow:  { pos: [46, 2.6, -36],   look: [-4, 3.6, -9],    fov: 44 },
  heroHigh: { pos: [34, 26, -52],    look: [-2, 1.5, -10],   fov: 40 },
  heroPool: { pos: [-30, 3.2, -46],  look: [4, 3.2, -12],    fov: 40 },
  aerial:   { pos: [44, 15, -58],   look: [-1, 2.5, -8],    fov: 38 },
  front:    { pos: [-3, 2.3, 36],   look: [-7, 2.5, 4],     fov: 40 },
  entry:    { pos: [-13.5, 1.65, 4.8], look: [-9, 1.5, -1.5], fov: 62 },
  living:   { pos: [-9.4, 1.55, 3.7], look: [0.8, 1.2, -4.6], fov: 64 },
  kitchen:  { pos: [2.5, 1.65, -4.6], look: [9.6, 1.1, 2.6],  fov: 60 },
  suite:    { pos: [9.4, 6.0, -1.6], look: [3.0, 5.0, 5.1],   fov: 68 },
  bath:     { pos: [-3.9, 5.95, -0.2], look: [-8.4, 5.0, -6.8], fov: 64 },
  terrace:  { pos: [-9.0, 1.5, -8.0], look: [3.5, 1.1, -12.5], fov: 62 },
  balcony:  { pos: [9.5, 6.05, -9.6], look: [1.5, 4.4, -24],   fov: 60 },
  pool:     { pos: [-16.5, 2.3, -11.5], look: [4, 0.0, -24.5],  fov: 56 },
  poolwide: { pos: [-20, 4.5, -3],   look: [4, 0.5, -24],      fov: 52 },
};

/** Walkthrough keyframes. `hold` (0–1) makes the camera settle at the key; `tod` drives the light. */
export const TOUR = [
  { id: 'exterior', pos: [64, 8.5, -32],    look: [-4, 3.2, -9],     fov: 38, hold: 1.0, tod: 1.0 },
  { id: 'flank',    pos: [54, 8, -4],       look: [0, 3.0, -2],      fov: 38, hold: 0.0, tod: 1.0 },
  { id: 'approach', pos: [20, 5.5, 40],     look: [-10, 2.8, 6],     fov: 38, hold: 0.55, tod: 1.0 },
  { id: 'door',     pos: [-10.5, 1.9, 19],  look: [-13.4, 1.9, 5],   fov: 46, hold: 0.7, tod: 0.9 },
  { id: 'entrance', pos: [-13.5, 1.7, 4.4], look: [-8.6, 1.5, -1.2], fov: 60, hold: 1.0, tod: 0.6 },
  { id: 'threshold', pos: [-9.9, 1.65, 1.0], look: [-1, 1.5, -2.5],  fov: 62, hold: 0.0, tod: 0.5 },
  { id: 'living',   pos: [-8.6, 1.58, 3.4], look: [0.8, 1.2, -4.6],  fov: 64, hold: 1.0, tod: 0.5 },
  { id: 'kitchen',  pos: [2.4, 1.65, -4.3], look: [9.8, 1.1, 2.6],   fov: 60, hold: 1.0, tod: 0.5 },
  { id: 'stairFoot', pos: [13.6, 1.65, 0.2], look: [11.6, 2.5, 5.9], fov: 62, hold: 0.0, tod: 0.5 },
  { id: 'stairMid', pos: [12.9, 3.85, 4.1], look: [9.0, 5.1, 5.8],   fov: 62, hold: 0.0, tod: 0.5 },
  { id: 'suite',    pos: [9.4, 6.0, -1.6],  look: [3.0, 5.0, 5.1],   fov: 68, hold: 1.0, tod: 0.6 },
  { id: 'suiteDoor', pos: [0.4, 5.95, -2.6], look: [-6, 5.0, -3.5],  fov: 62, hold: 0.0, tod: 0.65 },
  { id: 'bath',     pos: [-3.9, 5.95, -0.3], look: [-8.4, 5.0, -6.8], fov: 64, hold: 1.0, tod: 0.7 },
  { id: 'balcony',  pos: [9.5, 6.05, -9.9], look: [1.5, 4.4, -24],   fov: 60, hold: 1.0, tod: 0.85 },
  { id: 'overPool', pos: [6.5, 6.0, -16.5], look: [0, 1.5, -27],     fov: 58, hold: 0.0, tod: 1.0 },
  { id: 'pool',     pos: [-14.5, 1.35, -14.5], look: [3.5, 0.3, -25], fov: 56, hold: 1.0, tod: 1.1 },
  { id: 'finale',   pos: [-48, 17, -54],    look: [2, 3.2, -6],      fov: 34, hold: 1.0, tod: 2.0 },
];

/** Narrative stages mapped onto TOUR indices (what the visitor reads while scrolling). */
export const STAGES = [
  { at: 0,  label: 'Exterior' },
  { at: 2,  label: 'Approach' },
  { at: 4,  label: 'Entrance' },
  { at: 6,  label: 'Salon' },
  { at: 7,  label: 'Kitchen' },
  { at: 10, label: 'Principal suite' },
  { at: 12, label: 'Bathroom' },
  { at: 13, label: 'Terrace' },
  { at: 15, label: 'Pool' },
  { at: 16, label: 'The estate' },
];
