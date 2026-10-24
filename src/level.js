import { G, groups, MASK_GROUND } from './constants.js';

const GROUND_CG = groups(G.GROUND, MASK_GROUND);
const HAZARD_CG = groups(G.HAZARD, 0xffff);

// Builds a level from a declarative spec. Everything a level can contain is
// one case in this switch; levels themselves stay data.
export function buildLevel(sim, spec) {
  const { world, RAPIER, registry } = sim;
  const level = {
    spec,
    name: spec.name,
    start: spec.start,
    bodies: [],
    draw: [],
    saws: [],
    mines: [],
    boosts: [],
    finish: null,
    bounds: { minX: 1e9, minY: 1e9, maxX: -1e9, maxY: -1e9 },
  };

  const grow = (x, y) => {
    const b = level.bounds;
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y;
    if (y > b.maxY) b.maxY = y;
  };

  const staticBody = (x, y, rotation = 0) =>
    world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(rotation));

  for (const o of spec.objects) {
    switch (o.t) {
      case 'terrain': {
        const body = staticBody(0, 0);
        const flat = new Float32Array(o.points.length * 2);
        o.points.forEach((p, i) => {
          flat[i * 2] = p[0];
          flat[i * 2 + 1] = p[1];
          grow(p[0], p[1]);
          grow(p[0], p[1] - 6);
        });
        const c = world.createCollider(
          RAPIER.ColliderDesc.polyline(flat)
            .setFriction(o.friction ?? 0.85)
            .setRestitution(0.05)
            .setCollisionGroups(GROUND_CG),
          body,
        );
        registry.set(c.handle, { kind: 'ground' });
        level.bodies.push(body);
        level.draw.push({ type: 'terrain', points: o.points, fill: o.fill ?? '#4a5a3a', top: o.top ?? '#6b8a46' });
        break;
      }

      case 'box': {
        const body = staticBody(o.x, o.y, o.angle ?? 0);
        const c = world.createCollider(
          RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2)
            .setFriction(o.friction ?? 0.8)
            .setRestitution(0.05)
            .setCollisionGroups(GROUND_CG),
          body,
        );
        registry.set(c.handle, { kind: 'ground' });
        level.bodies.push(body);
        level.draw.push({ type: 'box', body, w: o.w, h: o.h, color: o.color ?? '#5b5f66' });
        grow(o.x - o.w, o.y - o.h);
        grow(o.x + o.w, o.y + o.h);
        break;
      }

      case 'crate': {
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic().setTranslation(o.x, o.y).setCcdEnabled(true),
        );
        const c = world.createCollider(
          RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2)
            .setDensity(o.density ?? 26)   // light enough to scatter, not a roadblock
            .setFriction(0.7)
            .setCollisionGroups(groups(G.GROUND, MASK_GROUND)),
          body,
        );
        registry.set(c.handle, { kind: 'ground' });
        level.bodies.push(body);
        level.draw.push({ type: 'box', body, w: o.w, h: o.h, color: o.color ?? '#8a6a3f' });
        grow(o.x, o.y);
        break;
      }

      case 'spikes': {
        const n = o.count ?? 6;
        const sw = o.width ?? 0.22;
        const sh = o.height ?? 0.34;
        const up = o.down ? -1 : 1;
        const body = staticBody(o.x, o.y, o.angle ?? 0);
        const tris = [];
        for (let i = 0; i < n; i++) {
          const bx = i * sw;
          const a = { x: bx, y: 0 };
          const b = { x: bx + sw, y: 0 };
          const c = { x: bx + sw / 2, y: sh * up };
          const col = world.createCollider(
            RAPIER.ColliderDesc.triangle(a, b, c)
              .setFriction(0.9)
              .setCollisionGroups(HAZARD_CG)
              .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            body,
          );
          // Spikes keep grinding for as long as you are lying on them.
          registry.set(col.handle, { kind: 'hazard', damage: o.damage ?? 62, dps: o.dps ?? 45, bikeDamage: o.bikeDamage ?? 110 });
          tris.push([a, b, c]);
        }
        level.bodies.push(body);
        level.draw.push({ type: 'spikes', body, tris });
        grow(o.x, o.y);
        grow(o.x + n * sw, o.y + sh);
        break;
      }

      case 'saw': {
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(o.x, o.y),
        );
        body.setAngvel(o.speed ?? 9, true);
        const col = world.createCollider(
          RAPIER.ColliderDesc.ball(o.r ?? 0.55)
            .setFriction(0.1)
            .setCollisionGroups(HAZARD_CG)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          body,
        );
        registry.set(col.handle, { kind: 'hazard', damage: 30, dps: 110, bikeDamage: 22 });
        level.bodies.push(body);
        level.saws.push({ body, r: o.r ?? 0.55, path: o.path, t: Math.random() * 10 });
        level.draw.push({ type: 'saw', body, r: o.r ?? 0.55 });
        grow(o.x - 2, o.y - 2);
        grow(o.x + 2, o.y + 2);
        break;
      }

      case 'mine': {
        const body = staticBody(o.x, o.y);
        const col = world.createCollider(
          RAPIER.ColliderDesc.ball(o.r ?? 0.17)
            .setCollisionGroups(HAZARD_CG)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          body,
        );
        const mine = { body, col, r: o.r ?? 0.17, power: o.power ?? 1, spent: false };
        registry.set(col.handle, { kind: 'mine', mine });
        level.bodies.push(body);
        level.mines.push(mine);
        level.draw.push({ type: 'mine', mine });
        grow(o.x, o.y);
        break;
      }

      case 'boost': {
        const body = staticBody(o.x, o.y, o.angle ?? 0);
        const col = world.createCollider(
          RAPIER.ColliderDesc.cuboid(o.w / 2, o.h / 2)
            .setSensor(true)
            .setCollisionGroups(groups(G.GROUND, 0xffff))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          body,
        );
        const boost = { col, fx: o.fx ?? 26, fy: o.fy ?? 0, active: new Set() };
        registry.set(col.handle, { kind: 'boost', boost });
        level.bodies.push(body);
        level.boosts.push(boost);
        level.draw.push({ type: 'boost', body, w: o.w, h: o.h });
        grow(o.x, o.y);
        break;
      }

      case 'finish': {
        const body = staticBody(o.x, o.y);
        const col = world.createCollider(
          RAPIER.ColliderDesc.cuboid(0.4, 1.6)
            .setSensor(true)
            .setCollisionGroups(groups(G.GROUND, 0xffff))
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
          body,
        );
        registry.set(col.handle, { kind: 'finish' });
        level.bodies.push(body);
        level.finish = { x: o.x, y: o.y };
        level.draw.push({ type: 'finish', x: o.x, y: o.y });
        grow(o.x + 3, o.y + 4);
        break;
      }

      default:
        throw new Error(`unknown level object: ${o.t}`);
    }
  }

  const b = level.bounds;
  b.minX -= 6; b.maxX += 6; b.minY -= 10; b.maxY += 12;
  return level;
}

export function updateLevel(level, elapsed) {
  for (const s of level.saws) {
    if (!s.path) continue;
    // Patrolling blades ride a sine along their axis.
    const p = s.path;
    const k = Math.sin((elapsed + s.t) * (p.speed ?? 1));
    s.body.setNextKinematicTranslation({
      x: p.x + (p.dx ?? 0) * k,
      y: p.y + (p.dy ?? 0) * k,
    });
  }
}

export function destroyLevel(sim, level) {
  for (const body of level.bodies) {
    for (let i = 0; i < body.numColliders(); i++) sim.registry.delete(body.collider(i).handle);
    sim.world.removeRigidBody(body);
  }
  level.bodies.length = 0;
}
