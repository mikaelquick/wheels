import { G, groups, MASK_FLESH, PART_SEVER_AT, DEATH_TOTAL_DAMAGE, SKIN } from './constants.js';

const HOODIE = '#30343c';
const HOODIE_DARK = '#23262c';
const JEANS = '#3b4f6b';
const JEANS_DARK = '#2c3c53';
const SHOE = '#1b1d21';

// The pose is authored as a stick figure in metres, pelvis at the origin,
// facing +x, already seated. Building the ragdoll directly in its final pose
// avoids the joints having to yank it into place on the first frame.
//
//   a/b  endpoints of the bone
//   r    capsule radius
//   pivot  the joint position shared with the parent (pose space)
//   lim  joint limits as an offset from the resting angle
export const POSE = {
  pelvis:    { a: [-0.06, 0.00], b: [0.08, 0.02], r: 0.115, parent: null, z: 0, color: JEANS, tough: 1.5 },
  torso:     { a: [0.02, 0.05], b: [0.11, 0.42], r: 0.135, parent: 'pelvis', pivot: [0.02, 0.05], lim: [-0.5, 0.5], k: 6000, tough: 1.5, z: 1, color: HOODIE },
  // The head is a heavy ball on a floppy neck and whips into the ground in
  // any tumble, so it is both the stiffest joint and by far the toughest part.
  // Decapitation should be a rare spectacle, not the default way to die.
  head:      { ball: [0.17, 0.60], r: 0.16, parent: 'torso', pivot: [0.12, 0.45], lim: [-0.8, 0.8], k: 3000, tough: 2.6, z: 4, color: SKIN },

  upperArmB: { a: [0.09, 0.37], b: [0.37, 0.25], r: 0.052, parent: 'torso', pivot: [0.09, 0.37], lim: [-1.9, 1.3], k: 1200, z: -2, color: HOODIE_DARK },
  lowerArmB: { a: [0.37, 0.25], b: [0.66, 0.10], r: 0.046, parent: 'upperArmB', pivot: [0.37, 0.25], lim: [-0.1, 2.3], k: 800, z: -1, color: HOODIE_DARK, hand: true },
  upperArmF: { a: [0.10, 0.38], b: [0.38, 0.26], r: 0.055, parent: 'torso', pivot: [0.10, 0.38], lim: [-1.9, 1.3], k: 1200, z: 3, color: HOODIE },
  lowerArmF: { a: [0.38, 0.26], b: [0.66, 0.10], r: 0.048, parent: 'upperArmF', pivot: [0.38, 0.26], lim: [-0.1, 2.3], k: 800, z: 3, color: HOODIE, hand: true },

  upperLegB: { a: [0.00, -0.02], b: [0.29, -0.11], r: 0.072, parent: 'pelvis', pivot: [0.00, -0.02], lim: [-1.3, 1.5], k: 2500, z: -3, color: JEANS_DARK },
  lowerLegB: { a: [0.29, -0.11], b: [0.22, -0.42], r: 0.058, parent: 'upperLegB', pivot: [0.29, -0.11], lim: [-2.3, 0.1], k: 1600, z: -2, color: JEANS_DARK, foot: true },
  upperLegF: { a: [0.01, -0.01], b: [0.30, -0.10], r: 0.075, parent: 'pelvis', pivot: [0.01, -0.01], lim: [-1.3, 1.5], k: 2500, z: 2, color: JEANS },
  lowerLegF: { a: [0.30, -0.10], b: [0.23, -0.41], r: 0.060, parent: 'upperLegF', pivot: [0.30, -0.10], lim: [-2.3, 0.1], k: 1600, z: 2, color: JEANS, foot: true },
};

// Where the pose expects to be bolted to a vehicle, in pose space.
export const ANCHORS = {
  hand: [0.66, 0.10],
  foot: [0.22, -0.42],
};

function rot(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

export class Ragdoll {
  constructor(sim, { x, y, scale = 1, group, headImage, bleedScale = 1, muscleScale = 1, densityScale = 1 }) {
    this.sim = sim;
    this.scale = scale;
    this.group = group;
    this.headImage = headImage;
    this.bleedScale = bleedScale;
    this.muscleScale = muscleScale;
    this.origin = { x, y };
    this.parts = new Map();
    this.joints = new Map();
    this.attachments = [];
    this.dead = false;
    this.totalDamage = 0;

    const { world, RAPIER, registry } = sim;
    const cg = groups(group, MASK_FLESH);

    for (const [name, def] of Object.entries(POSE)) {
      let cx, cy, angle, halfLen, radius;
      if (def.ball) {
        cx = def.ball[0] * scale; cy = def.ball[1] * scale;
        angle = 0; halfLen = 0; radius = def.r * scale;
      } else {
        const ax = def.a[0] * scale, ay = def.a[1] * scale;
        const bx = def.b[0] * scale, by = def.b[1] * scale;
        cx = (ax + bx) / 2; cy = (ay + by) / 2;
        // Capsules are aligned to the body's local Y, so rotate the bone onto it.
        angle = Math.atan2(by - ay, bx - ax) - Math.PI / 2;
        halfLen = Math.hypot(bx - ax, by - ay) / 2;
        radius = def.r * scale;
      }

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x + cx, y + cy)
          .setRotation(angle)
          .setLinearDamping(0.05)
          .setAngularDamping(0.25)
          .setCcdEnabled(name === 'head'),
      );

      const desc = def.ball
        ? RAPIER.ColliderDesc.ball(radius)
        : RAPIER.ColliderDesc.capsule(halfLen, radius);
      // Rapier2D mass = density * AREA, so these are kg/m^2, not kg/m^3.
      // Together they come to roughly an 85 kg adult.
      desc.setDensity((name === 'head' ? 60 : 130) * densityScale)
        .setFriction(0.6)
        .setRestitution(0.03)
        .setCollisionGroups(cg)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(800);
      const collider = world.createCollider(desc, body);

      const part = {
        name, def, body, collider, halfLen, radius, angle,
        damage: 0, severed: false,
        poseCenter: [cx, cy],
      };
      this.parts.set(name, part);
      registry.set(collider.handle, { kind: 'flesh', ragdoll: this, part });
    }

    // Joints, built after every body exists so parents are always available.
    for (const [name, def] of Object.entries(POSE)) {
      if (!def.parent) continue;
      const child = this.parts.get(name);
      const parent = this.parts.get(def.parent);
      const pw = [def.pivot[0] * scale, def.pivot[1] * scale];

      const a1 = rot(pw[0] - parent.poseCenter[0], pw[1] - parent.poseCenter[1], -parent.angle);
      const a2 = rot(pw[0] - child.poseCenter[0], pw[1] - child.poseCenter[1], -child.angle);

      const jd = RAPIER.JointData.revolute({ x: a1[0], y: a1[1] }, { x: a2[0], y: a2[1] });
      const joint = world.createImpulseJoint(jd, parent.body, child.body, true);
      // Rapier's 2D build drops JointData.limits for revolute joints, so the
      // range has to be applied to the joint itself. Limits are relative to the
      // resting pose, which keeps the spawn pose legal by construction.
      const rest = child.angle - parent.angle;
      joint.setLimits(rest + def.lim[0], rest + def.lim[1]);
      this.joints.set(name, { joint, parent, child, stumpLocal: a2, parentStumpLocal: a1, rest, k: def.k ?? 240 });
    }
  }

  // Bolt a body part to a vehicle. Returns a handle so the grip can be let go.
  // `limits` (relative to the pose at attach time) keeps a seated rider seated;
  // grips are left free so hands and feet pivot naturally.
  attach(name, otherBody, worldPoint, tag, { limits = null, muscle = 0 } = {}) {
    const { world, RAPIER } = this.sim;
    const part = this.parts.get(name);
    if (!part || part.severed) return null;

    const pt = part.body.translation();
    const ot = otherBody.translation();
    const a1 = rot(worldPoint.x - ot.x, worldPoint.y - ot.y, -otherBody.rotation());
    const a2 = rot(worldPoint.x - pt.x, worldPoint.y - pt.y, -part.body.rotation());
    const jd = RAPIER.JointData.revolute({ x: a1[0], y: a1[1] }, { x: a2[0], y: a2[1] });
    const joint = world.createImpulseJoint(jd, otherBody, part.body, true);
    const rest = part.body.rotation() - otherBody.rotation();
    if (limits) joint.setLimits(rest + limits[0], rest + limits[1]);
    const att = { joint, tag, part, rest, k: muscle };
    this.attachments.push(att);
    return att;
  }

  release(tag) {
    let released = false;
    for (let i = this.attachments.length - 1; i >= 0; i--) {
      const a = this.attachments[i];
      if (tag && a.tag !== tag) continue;
      this.sim.world.removeImpulseJoint(a.joint, true);
      this.attachments.splice(i, 1);
      released = true;
    }
    return released;
  }

  hasGrip(tag) {
    return this.attachments.some((a) => a.tag === tag);
  }

  // Position motors hold the riding pose while he is alive and conscious; the
  // weaker a limb gets the less it resists, and death switches everything off.
  // That is the whole difference between "sitting on a bike" and "ragdoll".
  updateMuscles() {
    const alive = this.dead ? 0 : 1;
    for (const link of this.joints.values()) {
      const s = alive * Math.max(0, 1 - link.child.damage / (100 * (link.child.def.tough ?? 1)));
      const k = link.k * s * this.muscleScale;
      link.joint.configureMotorPosition(link.rest, k, k * 0.12);
    }
    for (const a of this.attachments) {
      if (!a.k) continue;
      const s = alive * Math.max(0, 1 - a.part.damage / 100);
      const k = a.k * s * this.muscleScale;
      a.joint.configureMotorPosition(a.rest, k, k * 0.12);
    }
  }

  hurt(part, amount, atX, atY) {
    if (part.severed || amount <= 0) return;
    part.damage += amount;
    this.totalDamage += amount;

    if (amount > 2) {
      const n = Math.min(70, 4 + Math.floor(amount * 2.2));
      this.sim.gore.spray(atX, atY, (Math.random() - 0.5), 0.5, n, 5 + amount * 0.14, 1.5);
      if (amount > 18) {
        this.sim.gore.throwGibs(atX, atY, 1 + Math.floor(amount / 25), 5);
        this.sim.gore.screenHit(Math.min(0.5, amount / 90));
      }
      this.sim.audio?.squelch(Math.min(1.5, amount / 35));
    }
    if (amount > 8) this.sim.audio?.thud(Math.min(1, amount / 45));

    // A solid hit rips whatever that limb was holding onto.
    if (part.damage > 50 * (part.def.tough ?? 1)) {
      for (const a of [...this.attachments]) {
        if (a.part !== part) continue;
        this.sim.world.removeImpulseJoint(a.joint, true);
        this.attachments.splice(this.attachments.indexOf(a), 1);
      }
    }

    if (part.damage >= PART_SEVER_AT * (part.def.tough ?? 1)) this.sever(part);
    if (this.totalDamage >= DEATH_TOTAL_DAMAGE) this.die();
  }

  sever(part) {
    if (part.severed) return;
    part.severed = true;

    const link = this.joints.get(part.name);
    if (link) {
      this.sim.world.removeImpulseJoint(link.joint, true);
      this.joints.delete(part.name);
    }
    // A severed limb stops being part of the body and starts being scenery.
    part.collider.setCollisionGroups(groups(G.DEBRIS, G.GROUND | G.HAZARD | G.DEBRIS));
    for (const a of [...this.attachments]) {
      if (a.part === part) {
        this.sim.world.removeImpulseJoint(a.joint, true);
        this.attachments.splice(this.attachments.indexOf(a), 1);
      }
    }

    const t = part.body.translation();
    this.sim.gore.spray(t.x, t.y, 0, 1, 170, 12, Math.PI);
    this.sim.gore.throwGibs(t.x, t.y, 5 + ((Math.random() * 4) | 0), 7.5);
    this.sim.gore.screenHit(0.75);
    this.sim.audio?.crunch();
    this.sim.audio?.squelch(1.5);

    // The severed end of the limb, pointing away from where the parent was.
    this.sim.gore.addBleeder(() => {
      const p = part.body.translation();
      const a = part.body.rotation();
      const ux = Math.sin(a), uy = -Math.cos(a);
      return { x: p.x + ux * part.halfLen, y: p.y + uy * part.halfLen, dx: ux, dy: uy };
    }, 9 * this.bleedScale, 42);

    // ...and the matching stump left behind on the parent.
    if (link) {
      const pb = link.parent.body;
      const [lx, ly] = link.parentStumpLocal;
      const d = Math.hypot(lx, ly) || 1;
      this.sim.gore.addBleeder(() => {
        const pt = pb.translation();
        const r = pb.rotation();
        const c = Math.cos(r), sn = Math.sin(r);
        return {
          x: pt.x + lx * c - ly * sn,
          y: pt.y + lx * sn + ly * c,
          dx: (lx / d) * c - (ly / d) * sn,
          dy: (lx / d) * sn + (ly / d) * c,
        };
      }, 9 * this.bleedScale, 36);
    }

    this.sim.onGore?.(part, this);
    if (part.name === 'head' || part.name === 'torso' || part.name === 'pelvis') this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.release();
    this.sim.onDeath?.(this);
  }

  pos(name = 'torso') {
    const p = this.parts.get(name);
    if (!p) return { x: 0, y: 0 };
    const t = p.body.translation();
    return { x: t.x, y: t.y };
  }

  // Centre of mass of whatever is still attached — the camera follows this so
  // it does not chase a severed arm off a cliff.
  centroid() {
    let x = 0, y = 0, n = 0;
    for (const p of this.parts.values()) {
      if (p.severed) continue;
      const t = p.body.translation();
      x += t.x; y += t.y; n++;
    }
    return n ? { x: x / n, y: y / n } : this.pos('torso');
  }

  destroy() {
    const { world, registry } = this.sim;
    this.release();
    for (const p of this.parts.values()) {
      registry.delete(p.collider.handle);
      world.removeRigidBody(p.body);
    }
    this.parts.clear();
    this.joints.clear();
  }
}
