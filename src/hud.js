const PANEL = 'rgba(12,14,18,0.72)';

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function limbsLeft(doll) {
  let n = 0;
  for (const p of doll.parts.values()) if (!p.severed && p.name !== 'head' && p.name !== 'torso' && p.name !== 'pelvis') n++;
  return n;
}

function healthColor(frac) {
  if (frac > 0.6) return '#5bbd5b';
  if (frac > 0.3) return '#d6b23c';
  return '#cc3b30';
}

export function drawHud(ctx, w, h, game) {
  const { dad, kid, headImage, level, state, timer, slow, muted } = game;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textBaseline = 'top';

  // --- status panel -------------------------------------------------------
  ctx.fillStyle = PANEL;
  ctx.fillRect(14, 14, 268, 104);

  const drawRow = (doll, label, y, size) => {
    if (!doll) return;
    const frac = 1 - Math.min(1, doll.totalDamage / 330);
    ctx.save();
    ctx.beginPath();
    ctx.arc(14 + 10 + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const ar = headImage.naturalHeight / headImage.naturalWidth;
    ctx.drawImage(headImage, 14 + 10, y - size * 0.06, size, size * ar);
    ctx.restore();
    ctx.strokeStyle = doll.dead ? '#cc3b30' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(14 + 10 + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.stroke();

    const tx = 14 + 10 + size + 10;
    ctx.fillStyle = '#fff';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(doll.dead ? `${label} — DÖD` : label, tx, y + 1);
    bar(ctx, tx, y + 18, 160, 9, frac, doll.dead ? '#6b2220' : healthColor(frac));
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText(`lemmar ${limbsLeft(doll)}/8`, tx, y + 31);
  };

  drawRow(dad, 'NICLAS', 24, 44);
  drawRow(kid, 'LILLE NICLAS', 76, 32);

  // --- level / speed ------------------------------------------------------
  ctx.fillStyle = PANEL;
  ctx.fillRect(w - 196, 14, 182, 66);
  ctx.fillStyle = '#fff';
  ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(level.name, w - 182, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(`${(game.bike.speed() * 3.6).toFixed(0)} km/h`, w - 182, 43);
  ctx.fillText(`${timer.toFixed(1)} s`, w - 182, 59);
  if (slow) {
    ctx.fillStyle = '#f2b705';
    ctx.fillText('SLOW', w - 70, 43);
  }
  if (muted) {
    ctx.fillStyle = '#9aa3b2';
    ctx.fillText('LJUD AV', w - 70, 59);
  }

  // --- centre overlays ----------------------------------------------------
  if (state !== 'playing') {
    const msg = state === 'won' ? 'FRAMME VID SKOLAN' : 'PAPPA ÄR DÖD';
    const sub = state === 'won'
      ? `${timer.toFixed(1)} s  ·  skada ${Math.round(dad.totalDamage)}  ·  R = igen, N = nästa bana`
      : 'R = försök igen   ·   N = nästa bana';
    ctx.textAlign = 'center';
    ctx.fillStyle = state === 'won' ? '#e8e2c8' : '#e0453a';
    ctx.font = '700 54px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(msg, w / 2, h / 2 - 54);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '15px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(sub, w / 2, h / 2 + 12);
    ctx.textAlign = 'left';
  }

  // --- controls -----------------------------------------------------------
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(
    '↑ trampa   ↓ broms/back   ← → luta   CTRL släpp händer   SKIFT släpp fötter   MELLANSLAG hoppa av   Z slowmo   M ljud   R om   N nästa',
    16, h - 24,
  );
}
