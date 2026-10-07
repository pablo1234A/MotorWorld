/**
 * Photographic walkthrough of Villa Aurelia.
 *
 * Each shot is a camera move over one photograph: `from` → `to`, where
 *   s = scale, o = [x, y] focal point (0–1) the lens moves toward, r = roll in degrees.
 * Consecutive shots on the same photo continue seamlessly. A change of photo is a camera
 * transition (`enter`): an iris opening through a doorway, a lateral wipe, or a reveal from
 * above, while the outgoing frame keeps travelling forward, so the cut reads as walking through.
 * `w` is the scroll length of the shot (same total as the previous 3D tour).
 */
export const PHOTOS = {
  exterior: { src: 'assets/tour/exterior', alt: 'Villa Aurelia from the palm garden: terracotta roofs, white walls and an arched loggia' },
  salon: { enter: 'iris', src: 'assets/tour/salon', alt: 'Salon with black and white marble floor, a green sectional sofa and a coved ceiling' },
  kitchen: { enter: 'right', src: 'assets/tour/kitchen', alt: 'Kitchen with a white marble island, velvet bar stools and encaustic tiles' },
  island: { enter: 'iris', src: 'assets/tour/island', alt: 'The marble island seen along its length toward the chandelier' },
  aerial: { enter: 'down', src: 'assets/tour/aerial', alt: 'The pool and terracotta terraces seen from above' },
};

export const SHOTS = [
  { photo: 'exterior', label: 'Exterior', w: 1.0, hold: 1, from: { s: 1.03, o: [0.3, 0.52] }, to: { s: 1.1, o: [0.3, 0.5] } },
  { photo: 'exterior', label: 'Approach', w: 1.3, hold: 0.5, from: { s: 1.1, o: [0.3, 0.5] }, to: { s: 1.46, o: [0.41, 0.47] },
    t: 'The approach', b: 'Terracotta roofs, a loggia of five arches, and a fountain stair that carries water down to the lawn beneath the palms.' },
  { photo: 'salon', label: 'Salon', w: 1.3, hold: 0.8, from: { s: 1.22, o: [0.42, 0.62] }, to: { s: 1.05, o: [0.6, 0.58] },
    t: 'The salon', b: 'Black and white marble laid on the diagonal, a coved ceiling washed in warm light, and room for twenty around one table.' },
  { photo: 'kitchen', label: 'Kitchen', w: 1.2, hold: 0.8, from: { s: 1.2, o: [0.5, 0.62] }, to: { s: 1.04, o: [0.56, 0.56] },
    t: 'The kitchen', b: 'Veined porcelain, hand-made encaustic tiles and timber shutters that open onto the loggia.' },
  { photo: 'island', label: 'Island', w: 1.2, hold: 0.6, from: { s: 1.02, o: [0.5, 0.56] }, to: { s: 1.28, o: [0.5, 0.5] },
    t: 'The heart of the house', b: 'A four-metre island built for long breakfasts, with the terrace on one side and the salon on the other.' },
  { photo: 'aerial', label: 'Pool', w: 1.2, hold: 0.8, from: { s: 1.32, o: [0.47, 0.6], r: -5 }, to: { s: 1.12, o: [0.5, 0.56], r: 0 },
    t: 'The pool', b: 'Green glass mosaic set in terracotta, a shallow step for long afternoons, and jets that murmur until evening.' },
  { photo: 'aerial', label: 'The estate', w: 1.0, hold: 1, from: { s: 1.12, o: [0.5, 0.56], r: 0 }, to: { s: 1.0, o: [0.5, 0.5], r: 2.5 },
    t: 'Villa Aurelia', b: 'Seven hundred and eighty square metres, five suites and a walled garden of palms. Marbella, Costa del Sol.', final: true },
];
