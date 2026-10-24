// Physics runs in metres, y-up. Rendering uses the same coordinate system via a
// flipped canvas transform, so no unit conversion lives outside of camera.js.

export const DT = 1 / 60;
export const MAX_SUBSTEPS = 5;

// Collision groups: Rapier packs membership into the high 16 bits and the
// filter mask into the low 16.
export const G = {
  GROUND: 1 << 0,
  BIKE: 1 << 1,
  DAD: 1 << 2,
  KID: 1 << 3,
  HAZARD: 1 << 4,
  DEBRIS: 1 << 5,
};

export function groups(membership, mask) {
  return ((membership & 0xffff) << 16) | (mask & 0xffff);
}

// Riders pass through the bike they sit on, and through each other — joints
// hold them in place, so contact would only add jitter.
export const MASK_FLESH = G.GROUND | G.HAZARD | G.DEBRIS;
export const MASK_BIKE = G.GROUND | G.HAZARD | G.DEBRIS;
export const MASK_GROUND = 0xffff;

// Damage tuning. Contact force events report newtons, which on its own says
// nothing about injury — 5 kN is a scratch on a torso and a decapitation on a
// child's head. Dividing by the part's mass gives deceleration, which is what
// actually hurts, so the threshold is in m/s^2 (1100 ~= 110 g).
export const IMPACT_THRESHOLD = 1100;
export const DAMAGE_PER_ACCEL = 0.021;
export const PART_SEVER_AT = 100;
export const DEATH_TOTAL_DAMAGE = 330;

export const SKIN = '#e8b89b';
export const SKIN_DARK = '#c2957a';
