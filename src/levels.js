// Terrain is a single continuous polyline per level; everything else is
// scattered on top of it.
//
// Two rules keep a level finishable, and breaking either one makes it
// impossible rather than merely hard:
//   * every pit is either jumpable (a ramp in front of it, gap under ~7 m) or
//     has a rideable way out (climbs no steeper than about 35 degrees);
//   * land on a downslope, never on the flat — a flat landing at speed is what
//     turns a good jump into a decapitation.

function strip(x0, x1, step, fn) {
  const pts = [];
  for (let x = x0; x <= x1 + 1e-9; x += step) pts.push([+x.toFixed(3), +fn(x).toFixed(3)]);
  return pts;
}

const L1_TERRAIN = [
  [-40, 0], [14, 0],
  ...strip(14, 24, 1, (x) => 0.8 * Math.sin(((x - 14) / 10) * Math.PI)),
  [26, 0], [31, 0],
  // Eased kicker. A single straight ramp is a kink, and hitting a kink at
  // 40 km/h throws the rider over the bars. The lip is kept low because every
  // metre climbed is speed you no longer have for the gap.
  [33, 0.25], [35, 0.75], [37, 1.3], [38.5, 1.6],
  [38.8, -4], [42.1, -4],    // spike pit: 3.3 m, no way out, jump it
  [42.3, 1.2],               // landing lip, below the launch lip
  [45, 0.6], [49, 0.35], [55, 0.3], [62, 0.3],   // keep falling where you land
  [64, 0.8], [67, 1.7], [69.5, 2.45], [71.5, 2.75], [73, 2.8], [76, 2.8],
  [79, 1.8], [82, 0.6], [86, 0.1], [90, 0.1],     // dip with a blade in it
  [94, 0.6], [98, 1.0], [101, 1.0],
  ...strip(101, 111, 1.2, (x) => 1.0 + 0.45 * Math.sin((x - 101) * 0.85)),
  [115, 0], [131, 0], [131.3, 3.5], [149, 3.5],
];

const L2_TERRAIN = [
  [-40, 0], [8, 0],
  [10, 0.7],                 // kicker
  [10.2, -3.5], [15, -3.5],  // spike pit: 4.8 m
  [15.2, 0.4], [24, 0.4],
  ...strip(24, 38, 1, (x) => 0.4 + 1.3 * Math.sin(((x - 24) / 7) * Math.PI)),
  [40, 0.4], [50, 0.4],
  [58, 2.4], [66, 2.4],      // 14-degree climb onto the gantry
  // S-curve down, not a cliff edge: a convex lip launches the bike and it
  // arrives nose-first at the bottom instead of rolling down.
  [68, 2.2], [70, 1.6], [72, 0.8], [74, 0.0], [76, -0.5], [84, -0.5],
  [90, 0.6],                 // 10-degree ramp out
  [107, 0.6], [107.3, 4.0], [126, 4.0],
];

// Smoothstep rather than a power curve: it leaves the top and meets the
// bottom horizontally, so there is no compression at either end. A curve that
// is steepest where it joins the flat is a crash, not a hill.
const L3_GROUND = (x) => {
  const t = Math.max(0, Math.min(1, (x - 6) / 50));
  return 10 * (1 - t * t * (3 - 2 * t));
};

const L3_TERRAIN = [
  [-40, 10], [7.5, 9.99],
  // Fine steps: at 50 km/h a coarse polyline is a washboard, and the rider
  // arrives at the jump already half dead from the facets.
  ...strip(8.5, 56, 0.8, L3_GROUND),
  [58, 0], [70, 0],
  [71.5, 0.4], [73, 1.2], [74.2, 1.9],   // eased ramp, taken with whatever the hill gave you
  [74.4, -5], [78.6, -5],    // spike pit: 4.2 m, the big one
  [78.8, 0.8], [88, 0.4],    // land on the way down, well below the launch lip
  [111, 0.4], [111.3, 3.8], [130, 3.8],
];

export const LEVELS = [
  {
    name: 'Skolskjutsen',
    start: { x: -8, y: 0.34 },
    objects: [
      { t: 'terrain', points: L1_TERRAIN },
      // Tall on purpose: the hills before it leave the bike slightly airborne,
      // and a thin pad gets missed completely.
      { t: 'boost', x: 29, y: 0.8, w: 4, h: 1.8, fx: 18 },
      { t: 'spikes', x: 39.1, y: -4, count: 13, width: 0.22, height: 0.38, damage: 64 },
      { t: 'crate', x: 56, y: 0.8, w: 0.7, h: 0.7 },
      { t: 'crate', x: 56.3, y: 1.7, w: 0.7, h: 0.7 },
      // One half-buried blade: ride over it with speed, get chewed if you
      // stall. This is the opening level, so it is a warning, not a grinder.
      { t: 'saw', x: 88, y: -0.2, r: 0.62, speed: 12 },
      { t: 'finish', x: 125, y: 1.6 },
    ],
  },
  {
    name: 'Lekplatsen',
    start: { x: -9, y: 0.34 },
    objects: [
      { t: 'terrain', points: L2_TERRAIN },
      { t: 'spikes', x: 10.4, y: -3.5, count: 20, width: 0.22, height: 0.36, damage: 60 },
      // Nothing in the bottom of the dip: you arrive there with no speed, and
      // anything that stops you is a trap rather than an obstacle.
      { t: 'box', x: 30, y: 4.9, w: 5, h: 0.3, color: '#6b5436' },
      { t: 'saw', x: 30, y: 4.0, r: 0.55, speed: -15 },
      { t: 'boost', x: 46, y: 1.2, w: 3.4, h: 1.8, fx: 26 },
      { t: 'mine', x: 63, y: 2.6, power: 0.7 },
      // Set back from the bottom of the descent — you arrive there far too fast
      // to react to anything in the first couple of metres.
      { t: 'saw', x: 79, y: -0.85, r: 0.6, speed: 13 },
      { t: 'saw', x: 82, y: -0.85, r: 0.6, speed: -13 },
      { t: 'crate', x: 97, y: 1.1, w: 0.8, h: 0.8 },
      { t: 'finish', x: 103, y: 1.7 },
    ],
  },
  {
    name: 'Avfarten',
    start: { x: -10, y: 10.34 },
    objects: [
      { t: 'terrain', points: L3_TERRAIN },
      // Nothing on the descent itself, and nothing on the flat either: with no
      // sideways steering, a mine on the racing line is not an obstacle, it is
      // a coin flip. This one sits in the pit, for anyone who comes up short.
      { t: 'mine', x: 76.5, y: -4.7, power: 0.9 },
      { t: 'boost', x: 66, y: 0.9, w: 3.4, h: 1.8, fx: 28 },
      { t: 'spikes', x: 74.7, y: -5, count: 17, width: 0.22, height: 0.4, damage: 66 },
      { t: 'crate', x: 94, y: 0.85, w: 0.8, h: 0.8 },
      { t: 'crate', x: 94.2, y: 1.7, w: 0.8, h: 0.8 },
      { t: 'saw', x: 100, y: 0.05, r: 0.6, speed: -14, path: { x: 100, y: 0.05, dx: 3.2, speed: 1.2 } },
      { t: 'finish', x: 108, y: 2.0 },
    ],
  },
];
