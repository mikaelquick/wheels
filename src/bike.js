import { G, groups, MASK_BIKE } from './constants.js';

const GROUND_PROBE = groups(G.BIKE, G.GROUND);

// Bike-local geometry, origin on the ground line midway between the axles.
export const BIKE = {
  rearAxle: [-0.62, 0.00],
  frontAxle: [0.52, 0.00],
  wheelR: 0.32,
  seat: [-0.26, 0.55],
  handlebar: [0.40, 0.65],
  pedal: [-0.04, 0.13],
  rack: [-0.90, 0.46],
  grabBar: [-0.491, 0.522],
};

export const TUBES = [
  [[-0.62, 0.02], [-0.04, 0.13]],   // chain stay
  [[-0.62, 0.02], [-0.26, 0.55]],   // seat stay
  [[-0.26, 0.55], [-0.04, 0.13]],   // seat tube
  [[-0.04, 0.13], [0.46, 0.62]],    // down tube
  [[-0.26, 0.55], [0.44, 0.64]],    // top tube
  [[0.46, 0.62], [0.52, 0.00]],     // fork
  [[0.30, 0.66], [0.52, 0.64]],     // handlebar
  [[-1.06, 0.46], [-0.74, 0.46]],   // rear rack
  [[-1.06, 0.46], [-0.62, 0.02]],   // rack strut
  [[-0.58, 0.52], [-0.41, 0.52]],   // kid grab bar
];

const PEDAL_TORQUE = 250;
const BRAKE_TORQUE = 260;
const LEAN_TORQUE = 300;
const MAX_SPEED = 11.5;     // m/s, about 41 km/h
const SPIN_LIMIT = 55;      // rad/s, stops a free wheel revving to infinity
const COYOTE = 0.17;        // s of air that still counts as ground
const ANTI_LOOP = 70;       // N*m per rad/s of nose-lift while pedalling

export class Bike {
  constructor(sim, x, y) {
    this.sim = sim;
    this.origin = { x, y };
    const { world, RAPIER, registry } = sim;
    const cg = groups(G.BIKE, MASK_BIKE);

    this.frame = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        .setLinearDamping(0.02)
        .setAngularDamping(0.4)
        // Thin tubes weigh nothing, so the frame's mass is declared outright.
        // It is deliberately heavy and low: the riders are ~110 kg of
        // articulated weight sitting high up, and a light frame just gets
        // thrown around by them. A planted vehicle is what makes the thing
        // feel like a game rather than a wobble simulator.
        .setAdditionalMassProperties(45, { x: 0.0, y: 0.15 }, 7),
    );

    for (const [a, b] of TUBES) {
      const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) - Math.PI / 2;
      const d = RAPIER.ColliderDesc.capsule(len / 2, 0.035)
        .setTranslation(cx, cy)
        .setRotation(ang)
        .setDensity(0)
        .setFriction(0.4)
        .setRestitution(0.2)
        .setCollisionGroups(cg)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(6000);
      const c = world.createCollider(d, this.frame);
      registry.set(c.handle, { kind: 'bike', bike: this });
    }

    this.wheels = [];
    for (const [name, axle] of [['rear', BIKE.rearAxle], ['front', BIKE.frontAxle]]) {
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x + axle[0], y + axle[1])
          .setAngularDamping(0.05)
          .setCcdEnabled(true),
      );
      const d = RAPIER.ColliderDesc.ball(BIKE.wheelR)
        .setDensity(10)
        .setFriction(2.2)
        .setRestitution(0.12)
        .setCollisionGroups(cg)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(6000);
      const c = world.createCollider(d, body);
      registry.set(c.handle, { kind: 'bike', bike: this });

      const jd = RAPIER.JointData.revolute({ x: axle[0], y: axle[1] }, { x: 0, y: 0 });
      world.createImpulseJoint(jd, this.frame, body, true);
      this.wheels.push({ name, body });
    }
    this.rear = this.wheels[0].body;
    this.front = this.wheels[1].body;
    // Hazards chew the bike itself; at zero the riders are no longer attached.
    this.integrity = 100;
    this.airTime = 0;
  }

  point(key) {
    const t = this.frame.translation();
    const a = this.frame.rotation();
    const [lx, ly] = BIKE[key];
    const c = Math.cos(a), s = Math.sin(a);
    return { x: t.x + lx * c - ly * s, y: t.y + lx * s + ly * c };
  }

  // Per-wheel ground contact. Two short rays beat tracking contact pairs, and
  // telling the wheels apart is what makes a wheelie distinguishable from the
  // bike simply following a ramp.
  groundContacts() {
    const { world, RAPIER } = this.sim;
    const out = { rear: false, front: false };
    for (const w of this.wheels) {
      const t = w.body.translation();
      const ray = new RAPIER.Ray({ x: t.x, y: t.y }, { x: 0, y: -1 });
      if (world.castRay(ray, BIKE.wheelR + 0.1, true, undefined, GROUND_PROBE)) out[w.name] = true;
    }
    return out;
  }

  control(input, dt, contacts = { rear: true, front: true }) {
    const touching = contacts.rear || contacts.front;
    this.airTime = touching ? 0 : this.airTime + dt;
    // Brief hops still count as grounded. Without this the throttle cuts out
    // on every bump, because the drive keys change meaning the instant a wheel
    // leaves the ground. A real jump lasts far longer than this window.
    const grounded = this.airTime < COYOTE;

    const up = input.down('up') ? 1 : 0;
    const down = input.down('down') ? 1 : 0;

    // Two keys do both jobs. On the ground they drive; off it they rotate.
    // You never need to pedal mid-flight, so nothing is lost by overloading
    // them, and the whole game becomes playable with up and down alone.
    const pedal = grounded ? up : 0;
    const brake = grounded ? down : 0;
    const airLean = grounded ? 0 : up - down;

    const manualLean = (input.down('left') ? 1 : 0) - (input.down('right') ? 1 : 0);
    const lean = Math.max(-1, Math.min(1, airLean + manualLean));

    if (pedal && this.speed() < MAX_SPEED) {
      // Top speed is capped on how fast the BIKE is going, not on how fast the
      // wheel is turning. Capping wheel spin looks equivalent but silently cuts
      // all drive the moment a wheel slips, which strands you on every climb.
      for (const w of [this.rear, this.front]) {
        if (Math.abs(w.angvel()) >= SPIN_LIMIT) continue;
        // The front gets a token share so the bike still crawls when the rear
        // is off the ground.
        w.applyTorqueImpulse(-PEDAL_TORQUE * dt * (w === this.rear ? 1 : 0.25), true);
      }
    }
    // The kid on the rack drags the centre of mass behind the rear axle, so
    // pedalling loops the bike off its own power. A real rider leans over the
    // bars to stop that. A constant nose-down bias would stand in for it, but
    // it fights every climb and pitches you over the bars on the flat — so
    // this damps the lifting rotation only. It does nothing once the bike is
    // settled, and you can still wheelie by holding left.
    // Only while one end is actually in the air. Reacting to raw rotation
    // instead also fought the ramp transitions and threw the bike over its own
    // bars at speed.
    const spin = this.frame.angvel();
    if (pedal && contacts.rear && !contacts.front && spin > 0) {
      this.frame.applyTorqueImpulse(-Math.min(spin, 3.2) * ANTI_LOOP * dt, true);
    }
    // The mirror image: riding up and over the front wheel. The rider would
    // throw their weight back here, and without it the bike somersaults off
    // any bump taken at speed.
    if (contacts.front && !contacts.rear && spin < 0) {
      this.frame.applyTorqueImpulse(-Math.max(spin, -3.2) * ANTI_LOOP * dt, true);
    }

    if (brake) {
      for (const w of [this.rear, this.front]) {
        const v = w.angvel();
        w.applyTorqueImpulse(-Math.sign(v) * Math.min(Math.abs(v) * 2.2, 1) * BRAKE_TORQUE * dt, true);
      }
      // Pressing down also backs the bike up once it has stopped.
      if (Math.abs(this.rear.angvel()) < 1.5) this.rear.applyTorqueImpulse(PEDAL_TORQUE * 0.45 * dt, true);
    }
    // Happy Wheels lives on air control, so leaning bites harder off the ground.
    if (lean) this.frame.applyTorqueImpulse(LEAN_TORQUE * (grounded ? 1 : 1.7) * lean * dt, true);
  }

  speed() {
    const v = this.frame.linvel();
    return Math.hypot(v.x, v.y);
  }

  destroy() {
    const { world, registry } = this.sim;
    for (const w of this.wheels) {
      world.removeRigidBody(w.body);
    }
    world.removeRigidBody(this.frame);
    this.wheels.length = 0;
  }
}
