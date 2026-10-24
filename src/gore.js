import { G, groups } from './constants.js';

const SPLAT_PPM = 16;        // resolution of the persistent splatter layer
const MAX_PARTICLES = 2200;
const MAX_GIBS = 90;
const GRAVITY = -16;         // droplets fall a touch faster than bodies; reads better

// Droplets and gibs are not rigid bodies — there are far too many of them.
// They are integrated by hand and raycast against the terrain so they land
// where they would actually land.
export class Gore {
  constructor(world, RAPIER, bounds, audio = null) {
    this.world = world;
    this.RAPIER = RAPIER;
    this.bounds = bounds;
    this.audio = audio;
    this.particles = [];
    this.gibs = [];
    this.bleeders = [];
    this.screenDrops = [];

    const w = Math.ceil((bounds.maxX - bounds.minX) * SPLAT_PPM);
    const h = Math.ceil((bounds.maxY - bounds.minY) * SPLAT_PPM);
    this.splat = document.createElement('canvas');
    this.splat.width = Math.min(w, 8000);
    this.splat.height = Math.min(h, 3200);
    this.sctx = this.splat.getContext('2d');
    this.rayFilter = groups(G.DEBRIS, G.GROUND);
  }

  worldToSplat(x, y) {
    return [
      (x - this.bounds.minX) * SPLAT_PPM,
      this.splat.height - (y - this.bounds.minY) * SPLAT_PPM,
    ];
  }

  spray(x, y, dx, dy, count, speed = 7, spread = 0.9) {
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      const a = base + (Math.random() - 0.5) * spread * 2;
      const v = speed * (0.3 + Math.random() * 1.1);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: 0.03 + Math.random() * 0.075,
        life: 1.8 + Math.random() * 3,
      });
    }
  }

  // Chunks of meat. They bounce once or twice before they stay put.
  throwGibs(x, y, count, speed = 7) {
    for (let i = 0; i < count; i++) {
      if (this.gibs.length >= MAX_GIBS) break;
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random());
      const n = 5 + ((Math.random() * 3) | 0);
      const size = 0.045 + Math.random() * 0.07;
      const pts = [];
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2;
        const r = size * (0.6 + Math.random() * 0.7);
        pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
      }
      this.gibs.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.abs(Math.sin(a)) * v * 0.9 + 2,
        rot: Math.random() * 6.28,
        vrot: (Math.random() - 0.5) * 14,
        size, pts,
        bounces: 1 + ((Math.random() * 2) | 0),
        life: 9,
      });
    }
  }

  // A stump that keeps pumping. getPose returns the position and the direction
  // the wound faces, so arteries spray along the limb instead of straight down.
  addBleeder(getPose, duration = 7, rate = 34) {
    this.bleeders.push({ getPose, t: duration, max: duration, rate, acc: 0, phase: Math.random() * 6.28 });
  }

  clearBleeders() {
    this.bleeders.length = 0;
  }

  // Blood thrown at the camera lens on a really bad hit.
  screenHit(intensity) {
    const n = Math.min(16, 2 + Math.floor(intensity * 12));
    for (let i = 0; i < n; i++) {
      this.screenDrops.push({
        x: Math.random(),
        y: Math.random(),
        r: 4 + Math.random() * 26 * intensity,
        life: 2.5 + Math.random() * 3.5,
        max: 6,
      });
    }
  }

  castDown(x, y, dist) {
    const ray = new this.RAPIER.Ray({ x, y }, { x: 0, y: -1 });
    const hit = this.world.castRay(ray, dist, true, undefined, this.rayFilter);
    if (!hit) return null;
    return y - (hit.timeOfImpact ?? hit.toi ?? 0);
  }

  update(dt) {
    this.updateBleeders(dt);
    this.updateParticles(dt);
    this.updateGibs(dt);

    for (let i = this.screenDrops.length - 1; i >= 0; i--) {
      const d = this.screenDrops[i];
      d.life -= dt;
      if (d.life <= 0) this.screenDrops.splice(i, 1);
    }
  }

  updateBleeders(dt) {
    let pumping = false;
    for (let i = this.bleeders.length - 1; i >= 0; i--) {
      const b = this.bleeders[i];
      b.t -= dt;
      if (b.t <= 0) { this.bleeders.splice(i, 1); continue; }
      const pose = b.getPose();
      if (!pose) continue;
      pumping = true;

      // Heartbeat: the jet surges rather than running at a constant rate.
      const pulse = 0.45 + 0.55 * Math.max(0, Math.sin(b.phase + performance.now() * 0.009));
      const fade = Math.max(0.12, b.t / b.max);
      b.acc += dt * b.rate * pulse * fade;
      while (b.acc >= 1) {
        b.acc -= 1;
        this.spray(pose.x, pose.y, pose.dx ?? 0, pose.dy ?? -0.4, 1, 3.2 + pulse * 4.5, 0.75);
      }

      // A bleeding body dragged along the ground leaves a smear.
      const gy = this.castDown(pose.x, pose.y, 0.45);
      if (gy !== null) this.paint(pose.x, gy + 0.02, 0.07 + Math.random() * 0.09, 0.55);
    }
    if (pumping) this.audio?.spray();
  }

  updateParticles(dt) {
    const { RAPIER } = this;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += GRAVITY * dt;
      const dx = p.vx * dt, dy = p.vy * dt;
      const len = Math.hypot(dx, dy);
      let landed = null;
      if (len > 1e-4) {
        const ray = new RAPIER.Ray({ x: p.x, y: p.y }, { x: dx / len, y: dy / len });
        const hit = this.world.castRay(ray, len, true, undefined, this.rayFilter);
        if (hit) {
          const t = hit.timeOfImpact ?? hit.toi ?? 0;
          landed = { x: p.x + (dx / len) * t, y: p.y + (dy / len) * t };
        }
      }
      p.x += dx; p.y += dy;
      p.life -= dt;

      if (landed) {
        this.paint(landed.x, landed.y, p.r * (1.8 + Math.random() * 1.4));
        this.particles.splice(i, 1);
      } else if (p.life <= 0 || p.y < this.bounds.minY) {
        this.paint(p.x, p.y, p.r * 1.4);
        this.particles.splice(i, 1);
      }
    }
  }

  updateGibs(dt) {
    const { RAPIER } = this;
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.vy += GRAVITY * 0.7 * dt;
      g.rot += g.vrot * dt;
      g.life -= dt;

      const dx = g.vx * dt, dy = g.vy * dt;
      const len = Math.hypot(dx, dy);
      let hit = null;
      if (len > 1e-4) {
        const ray = new RAPIER.Ray({ x: g.x, y: g.y }, { x: dx / len, y: dy / len });
        hit = this.world.castRayAndGetNormal(ray, len, true, undefined, this.rayFilter);
      }

      if (hit) {
        const t = hit.timeOfImpact ?? hit.toi ?? 0;
        const hx = g.x + (dx / len) * t;
        const hy = g.y + (dy / len) * t;
        this.paint(hx, hy, g.size * 2.4, 0.95);
        this.spray(hx, hy, 0, 1, 5, 3, 1.6);

        if (g.bounces-- <= 0) {
          this.paintChunk(hx, hy, g);
          this.gibs.splice(i, 1);
          continue;
        }
        const n = hit.normal ?? { x: 0, y: 1 };
        const dot = g.vx * n.x + g.vy * n.y;
        g.vx = (g.vx - 2 * dot * n.x) * 0.38;
        g.vy = (g.vy - 2 * dot * n.y) * 0.38;
        g.vrot *= 0.5;
        g.x = hx + n.x * 0.03;
        g.y = hy + n.y * 0.03;
        continue;
      }

      g.x += dx; g.y += dy;
      if (g.life <= 0 || g.y < this.bounds.minY) {
        this.paintChunk(g.x, g.y, g);
        this.gibs.splice(i, 1);
      }
    }
  }

  paint(x, y, r, alpha = 0.9) {
    const [sx, sy] = this.worldToSplat(x, y);
    if (sx < -60 || sy < -60 || sx > this.splat.width + 60 || sy > this.splat.height + 60) return;
    const c = this.sctx;
    const pr = Math.max(1, r * SPLAT_PPM);
    c.fillStyle = `rgba(${118 + ((Math.random() * 40) | 0)},${4 + ((Math.random() * 14) | 0)},${8 + ((Math.random() * 12) | 0)},${alpha})`;
    c.beginPath();
    c.arc(sx, sy, pr, 0, Math.PI * 2);
    c.fill();
    // Satellite specks, so splats never read as clean circles.
    const specks = 3 + ((Math.random() * 4) | 0);
    for (let i = 0; i < specks; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = pr * (0.8 + Math.random() * 2.8);
      c.beginPath();
      c.arc(sx + Math.cos(a) * d, sy + Math.sin(a) * d, pr * (0.12 + Math.random() * 0.45), 0, Math.PI * 2);
      c.fill();
    }
  }

  // Where a gib comes to rest it leaves a darker lump, not just a stain.
  paintChunk(x, y, g) {
    const [sx, sy] = this.worldToSplat(x, y);
    const c = this.sctx;
    c.save();
    c.translate(sx, sy);
    c.rotate(g.rot);
    c.fillStyle = `rgba(${74 + ((Math.random() * 28) | 0)},10,14,0.95)`;
    c.beginPath();
    g.pts.forEach(([px, py], i) => {
      const X = px * SPLAT_PPM, Y = -py * SPLAT_PPM;
      i ? c.lineTo(X, Y) : c.moveTo(X, Y);
    });
    c.closePath();
    c.fill();
    c.restore();
  }

  drawSplatter(ctx) {
    const b = this.bounds;
    ctx.save();
    ctx.translate(b.minX, b.maxY);
    ctx.scale(1 / SPLAT_PPM, -1 / SPLAT_PPM);
    ctx.globalAlpha = 0.94;
    ctx.drawImage(this.splat, 0, -this.splat.height, this.splat.width, this.splat.height);
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.fillStyle = '#9d0c12';
    for (const p of this.particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const g of this.gibs) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rot);
      ctx.fillStyle = '#7d1118';
      ctx.beginPath();
      g.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#4a070b';
      ctx.lineWidth = 0.012;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Screen space, drawn after the HUD transform is reset to CSS pixels.
  drawScreen(ctx, w, h) {
    for (const d of this.screenDrops) {
      ctx.globalAlpha = Math.min(0.88, (d.life / d.max) * 0.95);
      ctx.fillStyle = '#5c060b';
      ctx.beginPath();
      ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(d.x * w, d.y * h + d.r * 0.9, d.r * 0.32, d.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  reset() {
    this.particles.length = 0;
    this.gibs.length = 0;
    this.bleeders.length = 0;
    this.screenDrops.length = 0;
    this.sctx.clearRect(0, 0, this.splat.width, this.splat.height);
  }
}
