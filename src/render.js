import { POSE } from './ragdoll.js';
import { TUBES, BIKE } from './bike.js';

const HEAD_SPRITE_SCALE = 1.78; // visual head is deliberately bigger than its collider

export function drawSky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2a3f5f');
  g.addColorStop(0.55, '#6f8bb0');
  g.addColorStop(1, '#c7b79a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export function drawParallax(ctx, cam, w, h, dpr = 1) {
  const layers = [
    { k: 0.12, y: 0.62, amp: 46, color: '#3c4f68' },
    { k: 0.26, y: 0.72, amp: 34, color: '#465a52' },
    { k: 0.45, y: 0.82, amp: 24, color: '#3f4f38' },
  ];
  for (const L of layers) {
    ctx.fillStyle = L.color;
    ctx.beginPath();
    // Distant hills drift with the camera, but only a little, and never far
    // enough to swallow the sky when the camera drops into a pit.
    const drift = Math.max(-0.3, Math.min(0.3, cam.y * L.k * 0.02));
    const base = h * (L.y + drift);
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 12) {
      const wx = (x + cam.x * cam.zoom * dpr * L.k) * 0.01;
      const y = base - (Math.sin(wx) * 0.6 + Math.sin(wx * 2.3 + 1.7) * 0.4) * L.amp * dpr;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawLevel(ctx, level) {
  for (const d of level.draw) {
    switch (d.type) {
      case 'terrain': {
        ctx.beginPath();
        ctx.moveTo(d.points[0][0], d.points[0][1]);
        for (const p of d.points) ctx.lineTo(p[0], p[1]);
        const last = d.points[d.points.length - 1];
        ctx.lineTo(last[0], level.bounds.minY);
        ctx.lineTo(d.points[0][0], level.bounds.minY);
        ctx.closePath();
        ctx.fillStyle = d.fill;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(d.points[0][0], d.points[0][1]);
        for (const p of d.points) ctx.lineTo(p[0], p[1]);
        ctx.strokeStyle = d.top;
        ctx.lineWidth = 0.16;
        ctx.lineJoin = 'round';
        ctx.stroke();
        break;
      }

      case 'box': {
        const t = d.body.translation();
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(d.body.rotation());
        ctx.fillStyle = d.color;
        ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.04;
        ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
        ctx.restore();
        break;
      }

      case 'spikes': {
        const t = d.body.translation();
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(d.body.rotation());
        ctx.fillStyle = '#b9bec6';
        ctx.strokeStyle = '#6d727a';
        ctx.lineWidth = 0.02;
        for (const [a, b, c] of d.tris) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
        break;
      }

      case 'saw': {
        const t = d.body.translation();
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(d.body.rotation());
        ctx.fillStyle = '#cfd4da';
        ctx.beginPath();
        const teeth = 14;
        for (let i = 0; i < teeth; i++) {
          const a0 = (i / teeth) * Math.PI * 2;
          const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
          ctx.lineTo(Math.cos(a0) * d.r, Math.sin(a0) * d.r);
          ctx.lineTo(Math.cos(a1) * d.r * 0.78, Math.sin(a1) * d.r * 0.78);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8b9198';
        ctx.beginPath();
        ctx.arc(0, 0, d.r * 0.26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'mine': {
        if (d.mine.spent) break;
        const t = d.mine.body.translation();
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.fillStyle = '#2d3136';
        ctx.beginPath();
        ctx.arc(0, 0, d.mine.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2d3136';
        ctx.lineWidth = 0.045;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * d.mine.r, Math.sin(a) * d.mine.r);
          ctx.lineTo(Math.cos(a) * d.mine.r * 1.45, Math.sin(a) * d.mine.r * 1.45);
          ctx.stroke();
        }
        ctx.fillStyle = (performance.now() % 700 < 350) ? '#ff3b30' : '#5a1512';
        ctx.beginPath();
        ctx.arc(0, 0, d.mine.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }

      case 'boost': {
        const t = d.body.translation();
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(d.body.rotation());
        ctx.fillStyle = '#f2b705';
        ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
        ctx.fillStyle = '#1d1d1d';
        for (let i = 0; i < 3; i++) {
          const x = -d.w / 2 + 0.35 + i * (d.w - 0.7) / 3;
          ctx.beginPath();
          ctx.moveTo(x, -d.h * 0.3);
          ctx.lineTo(x + 0.3, 0);
          ctx.lineTo(x, d.h * 0.3);
          ctx.lineTo(x + 0.12, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        break;
      }

      case 'finish': {
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.fillStyle = '#d8d8d8';
        ctx.fillRect(-0.05, -1.6, 0.1, 3.4);
        const cs = 0.22;
        for (let r = 0; r < 4; r++) {
          for (let c = 0; c < 5; c++) {
            ctx.fillStyle = (r + c) % 2 ? '#111' : '#fff';
            ctx.fillRect(0.05 + c * cs, 1.8 - (r + 1) * cs, cs, cs);
          }
        }
        ctx.restore();
        break;
      }
    }
  }
}

export function drawBike(ctx, bike) {
  const t = bike.frame.translation();
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(bike.frame.rotation());
  ctx.strokeStyle = '#d23b2e';
  ctx.lineWidth = 0.07;
  ctx.lineCap = 'round';
  for (const [a, b] of TUBES) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  // Saddle and rear rack pad.
  ctx.fillStyle = '#1b1d21';
  ctx.beginPath();
  ctx.ellipse(BIKE.seat[0], BIKE.seat[1] + 0.05, 0.17, 0.055, 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(BIKE.rack[0] - 0.15, BIKE.rack[1], 0.32, 0.05);
  ctx.restore();

  for (const w of bike.wheels) {
    const wt = w.body.translation();
    ctx.save();
    ctx.translate(wt.x, wt.y);
    ctx.rotate(w.body.rotation());
    ctx.strokeStyle = '#17181b';
    ctx.lineWidth = 0.075;
    ctx.beginPath();
    ctx.arc(0, 0, BIKE.wheelR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,220,220,0.75)';
    ctx.lineWidth = 0.018;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * BIKE.wheelR, Math.sin(a) * BIKE.wheelR);
      ctx.lineTo(-Math.cos(a) * BIKE.wheelR, -Math.sin(a) * BIKE.wheelR);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCapsule(ctx, part, color) {
  const t = part.body.translation();
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(part.body.rotation());
  ctx.strokeStyle = color;
  ctx.lineWidth = part.radius * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -part.halfLen);
  ctx.lineTo(0, part.halfLen);
  ctx.stroke();
  ctx.restore();
}

function drawStump(ctx, part) {
  const t = part.body.translation();
  const a = part.body.rotation();
  // The stump sits at the end of the capsule that used to face the parent.
  const sx = t.x + Math.sin(a) * part.halfLen;
  const sy = t.y - Math.cos(a) * part.halfLen;
  ctx.fillStyle = '#6d0c11';
  ctx.beginPath();
  ctx.arc(sx, sy, part.radius * 1.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a81720';
  ctx.beginPath();
  ctx.arc(sx, sy, part.radius * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e07a76';
  ctx.beginPath();
  ctx.arc(sx, sy, part.radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

export function drawRagdoll(ctx, doll, headImage) {
  const order = [...doll.parts.values()].sort((a, b) => (a.def.z ?? 0) - (b.def.z ?? 0));
  for (const part of order) {
    if (part.name === 'head') {
      const t = part.body.translation();
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(part.body.rotation());
      ctx.scale(1, -1); // undo the world's y-up flip so the image is upright
      const s = part.radius * 2 * HEAD_SPRITE_SCALE;
      const ar = headImage.naturalHeight / headImage.naturalWidth;
      ctx.drawImage(headImage, -s / 2, -s * ar / 2 - s * 0.06, s, s * ar);
      ctx.restore();
      if (part.severed) drawStump(ctx, part);
      continue;
    }

    drawCapsule(ctx, part, part.def.color);

    // Hands and feet get a dab of skin / shoe so limbs read as limbs.
    if (part.def.hand || part.def.foot) {
      const t = part.body.translation();
      const a = part.body.rotation();
      const ex = t.x - Math.sin(a) * part.halfLen;
      const ey = t.y + Math.cos(a) * part.halfLen;
      ctx.fillStyle = part.def.hand ? '#e0ae92' : '#15171a';
      ctx.beginPath();
      ctx.arc(ex, ey, part.radius * (part.def.hand ? 1.15 : 1.35), 0, Math.PI * 2);
      ctx.fill();
    }

    if (part.severed) drawStump(ctx, part);
    else if (part.damage > 12) {
      // Blood soaks through the clothes long before anything comes off.
      const t = part.body.translation();
      ctx.save();
      ctx.globalAlpha = Math.min(0.92, (part.damage - 12) / 55);
      ctx.translate(t.x, t.y);
      ctx.rotate(part.body.rotation());
      ctx.strokeStyle = '#7d1118';
      ctx.lineWidth = part.radius * 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, -part.halfLen * 0.85);
      ctx.lineTo(0, part.halfLen * 0.85);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export { POSE };
