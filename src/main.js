import RAPIER from '@dimforge/rapier2d-compat';
import { DT, MAX_SUBSTEPS, IMPACT_THRESHOLD, DAMAGE_PER_ACCEL } from './constants.js';
import { createInput } from './input.js';
import { createCamera } from './camera.js';
import { Gore } from './gore.js';
import { Audio } from './audio.js';
import { Ragdoll } from './ragdoll.js';
import { Bike, BIKE } from './bike.js';
import { buildLevel, updateLevel, destroyLevel } from './level.js';
import { LEVELS } from './levels.js';
import * as R from './render.js';
import { drawHud } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput();
const cam = createCamera();
const audio = new Audio();
audio.attachUnlock();

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function fit() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
}
addEventListener('resize', fit);
fit();

const game = {
  levelIndex: 0,
  state: 'playing',
  timer: 0,
  slow: false,
  deathSlow: 0,
  grace: 0,
  elapsed: 0,
};

let sim, level, bike, dad, kid, headImage;
let debugForces = null;
let rigMass = 130;
// Deceleration (m/s^2) of the whole rig that shakes the riders off the bike.
const BIKE_JOLT_EJECT = 1100;
const activeHazards = new Map();
const activeBoosts = new Map();

function explode(mine) {
  if (mine.spent) return;
  mine.spent = true;
  const t = mine.body.translation();
  sim.world.removeCollider(mine.col, true);
  sim.registry.delete(mine.col.handle);
  cam.kick(1.1);

  const radius = 3.6 * mine.power;
  const push = (body, mass) => {
    const b = body.translation();
    const dx = b.x - t.x, dy = b.y - t.y;
    const d = Math.hypot(dx, dy);
    if (d > radius || d < 1e-5) return 0;
    const f = (1 - d / radius);
    const j = f * 13 * mine.power * mass;
    body.applyImpulse({ x: (dx / d) * j, y: (dy / d) * j + j * 0.35 }, true);
    return f;
  };

  for (const doll of [dad, kid]) {
    if (!doll) continue;
    for (const part of doll.parts.values()) {
      const f = push(part.body, part.body.mass());
      if (f > 0) {
        const p = part.body.translation();
        // Damage is kept well below the impulse: being launched across the
        // level is the joke, being deleted by a mine you could not see is not.
        doll.hurt(part, f * 30 * mine.power, p.x, p.y);
      }
    }
  }
  if (bike) {
    push(bike.frame, bike.frame.mass());
    for (const w of bike.wheels) push(w.body, w.body.mass());
  }
  sim.gore.spray(t.x, t.y, 0, 1, 120, 14, Math.PI);
  sim.gore.throwGibs(t.x, t.y, 8, 10);
  sim.gore.screenHit(0.9);
  audio.boom();
}

// Grips and the saddle only hold a rider who is still on an intact bike. Once
// the bike itself hits something nasty, everyone aboard is luggage.
function throwRiders() {
  for (const doll of [dad, kid]) {
    if (!doll) continue;
    doll.release('hands');
    doll.release('feet');
    doll.release('seat');
  }
}

function pairEvent(src, other, srcH, otherH, started) {
  if (!src) return;

  if (src.kind === 'hazard' && other?.kind === 'flesh') {
    const key = `${srcH}:${otherH}`;
    if (started) {
      if (game.grace <= 0) {
        const p = other.part.body.translation();
        other.ragdoll.hurt(other.part, src.damage, p.x, p.y);
        cam.kick(0.35);
        audio.metal();
      }
      if (src.dps) activeHazards.set(key, { src, other });
    } else {
      activeHazards.delete(key);
    }
  }

  if (src.kind === 'hazard' && other?.kind === 'bike' && started && game.grace <= 0) {
    // A glancing blow off a half-buried blade is survivable; spikes wreck the
    // bike outright and everyone aboard becomes luggage.
    bike.integrity -= src.bikeDamage ?? 110;
    cam.kick(0.4);
    audio.metal();
    if (bike.integrity <= 0) throwRiders();
  }

  if (src.kind === 'mine' && started && other && other.kind !== 'mine') {
    explode(src.mine);
    throwRiders();
  }

  if (src.kind === 'boost') {
    // Key by BODY, not collider: the frame is ten separate tubes, and boosting
    // each of them in turn launched the bike into orbit.
    const body = sim.world.colliders.get(otherH)?.parent();
    if (!body) return;
    const key = `${srcH}:${body.handle}`;
    const entry = activeBoosts.get(key);
    if (started) {
      if (entry) entry.n++;
      else {
        activeBoosts.set(key, { boost: src.boost, body, n: 1 });
        audio.whoosh();
      }
    } else if (entry && --entry.n <= 0) {
      activeBoosts.delete(key);
    }
  }

  if (src.kind === 'finish' && started && other?.kind === 'flesh' && other.ragdoll === dad) {
    if (game.state === 'playing' && !dad.dead) {
      game.state = 'won';
      audio.win();
    }
  }
}

function loadLevel(index) {
  game.levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;

  if (sim) {
    dad?.destroy();
    kid?.destroy();
    bike?.destroy();
    destroyLevel(sim, level);
  } else {
    sim = {
      RAPIER,
      world: new RAPIER.World({ x: 0, y: -9.81 }),
      eventQueue: new RAPIER.EventQueue(true),
      registry: new Map(),
      gore: null,
      audio,
    };
    sim.world.timestep = DT;
    sim.world.numSolverIterations = 8;
  }

  activeHazards.clear();
  activeBoosts.clear();

  const spec = LEVELS[game.levelIndex];
  level = buildLevel(sim, spec);
  if (sim.gore) sim.gore.reset();
  sim.gore = new Gore(sim.world, RAPIER, level.bounds, audio);

  bike = new Bike(sim, spec.start.x, spec.start.y);

  const seat = bike.point('seat');
  dad = new Ragdoll(sim, { x: seat.x, y: seat.y, scale: 1, group: 4 /* G.DAD */, headImage });
  // Without a seat joint the rider's whole weight hangs off the grips and he
  // simply slumps through the frame onto the road.
  dad.attach('pelvis', bike.frame, seat, 'seat', { limits: [-0.55, 0.55], muscle: 9000 });
  dad.attach('lowerArmF', bike.frame, bike.point('handlebar'), 'hands', { muscle: 700 });
  dad.attach('lowerArmB', bike.frame, bike.point('handlebar'), 'hands', { muscle: 700 });
  dad.attach('lowerLegF', bike.frame, bike.point('pedal'), 'feet', { muscle: 700 });
  dad.attach('lowerLegB', bike.frame, bike.point('pedal'), 'feet', { muscle: 700 });

  const rack = bike.point('rack');
  kid = new Ragdoll(sim, { x: rack.x, y: rack.y, scale: 0.62, group: 8 /* G.KID */, headImage, bleedScale: 0.8, muscleScale: 0.9, densityScale: 0.8 });
  kid.attach('pelvis', bike.frame, rack, 'seat', { limits: [-0.9, 0.9], muscle: 5000 });
  kid.attach('lowerArmF', bike.frame, bike.point('grabBar'), 'hands', { muscle: 500 });
  kid.attach('lowerArmB', bike.frame, bike.point('grabBar'), 'hands', { muscle: 500 });

  sim.onDeath = (doll) => {
    // Dying after the finish line does not un-win the level.
    if (doll === dad && game.state === 'playing') {
      game.state = 'dead';
      game.deathSlow = 2.4;
      cam.kick(0.8);
      audio.death();
    }
  };
  sim.onGore = () => cam.kick(0.5);

  game.state = 'playing';
  game.timer = 0;
  game.grace = 0.7;
  game.elapsed = 0;

  rigMass = bike.frame.mass() + bike.wheels.reduce((m, w) => m + w.body.mass(), 0);
  for (const doll of [dad, kid]) for (const p of doll.parts.values()) rigMass += p.body.mass();

  const c = dad.centroid();
  cam.x = c.x; cam.y = c.y;
}

function handleEdgeInput() {
  if (input.hit('mute')) audio.toggleMute();
  if (input.hit('restart')) loadLevel(game.levelIndex);
  if (input.hit('next')) loadLevel(game.levelIndex + 1);

  if (game.state !== 'playing' || dad.dead) return;

  if (input.hit('eject')) {
    dad.release();
    const torso = dad.parts.get('torso');
    if (torso && !torso.severed) {
      torso.body.applyImpulse({ x: 0, y: 9 * torso.body.mass() }, true);
    }
  }
  for (const tag of ['hands', 'feet']) {
    const key = tag === 'hands' ? 'hands' : 'feet';
    if (!input.hit(key)) continue;
    if (dad.hasGrip(tag)) {
      dad.release(tag);
    } else {
      // Re-grab, but only if the limb is still attached and actually close by.
      const target = tag === 'hands' ? bike.point('handlebar') : bike.point('pedal');
      for (const name of tag === 'hands' ? ['lowerArmF', 'lowerArmB'] : ['lowerLegF', 'lowerLegB']) {
        const part = dad.parts.get(name);
        if (!part || part.severed) continue;
        const a = part.body.rotation();
        const t = part.body.translation();
        const hx = t.x - Math.sin(a) * part.halfLen;
        const hy = t.y + Math.cos(a) * part.halfLen;
        if (Math.hypot(hx - target.x, hy - target.y) < 0.45) dad.attach(name, bike.frame, target, tag);
      }
    }
  }
}

function nearestSawDistance() {
  if (!level.saws.length) return null;
  const c = dad.centroid();
  let best = Infinity;
  for (const s of level.saws) {
    const t = s.body.translation();
    const d = Math.hypot(t.x - c.x, t.y - c.y);
    if (d < best) best = d;
  }
  return best;
}

function step(dt) {
  game.elapsed += dt;
  if (game.grace > 0) game.grace -= dt;
  if (game.state === 'playing') game.timer += dt;

  updateLevel(level, game.elapsed);

  const contacts = bike.groundContacts();
  if (game.state === 'playing' && !dad.dead) bike.control(input, dt, contacts);
  audio.setSaw(nearestSawDistance());

  for (const { boost, body } of activeBoosts.values()) {
    const m = body.mass();
    body.applyImpulse({ x: boost.fx * dt * m, y: boost.fy * dt * m }, true);
  }

  for (const { src, other } of activeHazards.values()) {
    if (other.part.severed && other.part.damage > 400) continue;
    const p = other.part.body.translation();
    other.ragdoll.hurt(other.part, src.dps * dt, p.x, p.y);
  }

  dad.updateMuscles();
  kid.updateMuscles();

  sim.world.step(sim.eventQueue);

  sim.eventQueue.drainCollisionEvents((h1, h2, started) => {
    const a = sim.registry.get(h1);
    const b = sim.registry.get(h2);
    pairEvent(a, b, h1, h2, started);
    pairEvent(b, a, h2, h1, started);
  });

  sim.eventQueue.drainContactForceEvents((e) => {
    if (game.grace > 0) return;
    const mag = e.totalForceMagnitude();
    for (const h of [e.collider1(), e.collider2()]) {
      const info = sim.registry.get(h);
      if (info?.kind === 'bike') {
        const jolt = mag / rigMass;
        if (debugForces) debugForces.push(['bike', +mag.toFixed(0), +jolt.toFixed(0)]);
        audio.thud(Math.min(1, jolt / 900));
        if (jolt > BIKE_JOLT_EJECT) {
          throwRiders();
          cam.kick(0.5);
        }
        continue;
      }
      if (info?.kind !== 'flesh') continue;
      const accel = mag / info.part.body.mass();
      if (debugForces) debugForces.push([+mag.toFixed(0), info.part.name, +accel.toFixed(0)]);
      if (accel < IMPACT_THRESHOLD) continue;
      const dmg = (accel - IMPACT_THRESHOLD) * DAMAGE_PER_ACCEL;
      if (dmg < 0.5) continue;
      const t = info.part.body.translation();
      info.ragdoll.hurt(info.part, dmg, t.x, t.y);
      cam.kick(Math.min(0.45, dmg * 0.012));
    }
  });

  sim.gore.update(dt);

  // Anything that leaves the level floor is gone for good.
  if (game.state === 'playing' && !dad.dead && dad.centroid().y < level.bounds.minY + 2.5) dad.die();
}

function render() {
  const w = canvas.width, h = canvas.height;
  const dpr = canvas.width / innerWidth;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  R.drawSky(ctx, w, h);
  R.drawParallax(ctx, cam, w, h, dpr);

  cam.apply(ctx, w, h, dpr);
  sim.gore.drawSplatter(ctx);
  R.drawLevel(ctx, level);
  R.drawBike(ctx, bike);
  R.drawRagdoll(ctx, kid, headImage);
  R.drawRagdoll(ctx, dad, headImage);
  sim.gore.drawParticles(ctx);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sim.gore.drawScreen(ctx, innerWidth, innerHeight);
  drawHud(ctx, innerWidth, innerHeight, { ...game, dad, kid, bike, level, headImage, muted: audio.muted });
}

let last = performance.now();
let acc = 0;

function frame(now) {
  const real = Math.min(0.08, (now - last) / 1000);
  last = now;

  handleEdgeInput();
  input.endFrame();

  game.slow = input.down('slowmo') || game.deathSlow > 0;
  if (game.deathSlow > 0) game.deathSlow -= real;
  const scale = game.slow ? 0.28 : 1;

  acc += real * scale;
  let steps = 0;
  while (acc >= DT && steps < MAX_SUBSTEPS) {
    step(DT);
    acc -= DT;
    steps++;
  }
  if (steps === MAX_SUBSTEPS) acc = 0;

  cam.follow(dad.centroid(), real, bike.frame.linvel());
  render();
  requestAnimationFrame(frame);
}

// Handy for poking at the simulation from the devtools console.
if (import.meta.env?.DEV) {
  window.__g = {
    get dad() { return dad; },
    get kid() { return kid; },
    get bike() { return bike; },
    get sim() { return sim; },
    get level() { return level; },
    cam,
    audio,
    forceLog(on) { debugForces = on ? [] : null; return debugForces; },
    get forces() { return debugForces; },
    game,
    loadLevel,
    grounded: () => { const c = bike.groundContacts(); return c.rear || c.front; },
    async bot() {
      const { createBot } = await import('./bot.js');
      window.__bot = createBot(window.__g);
      return window.__bot;
    },
    mass(doll) {
      let m = 0;
      for (const p of doll.parts.values()) m += p.body.mass();
      return m;
    },
  };
}

(async function boot() {
  // Relative to the deployed base, not the server root: on GitHub Pages the
  // game lives under /<repo>/, where an absolute path would 404.
  headImage = await loadImage(`${import.meta.env.BASE_URL}niclas.png`);
  await RAPIER.init();
  loadLevel(0);
  document.getElementById('loading')?.remove();
  requestAnimationFrame(frame);
})();
