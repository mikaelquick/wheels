// Dev-only autopilot. It exists to answer one question: can this level
// actually be finished? It plays through the same key handlers a human uses,
// so if the bot can get round, a player can.

const CODES = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

export function createBot(g) {
  const held = {};
  const press = (name, on) => {
    if (held[name] === on) return;
    held[name] = on;
    dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: CODES[name], bubbles: true }));
  };
  const releaseAll = () => Object.keys(CODES).forEach((k) => press(k, false));

  let raf = 0;
  let airTime = 0;

  function controller() {
    const f = g.bike.frame;
    const rot = f.rotation();
    const spin = f.angvel();
    const grounded = g.grounded();

    // Mirrors the bike's own coyote window: short hops still count as ground,
    // so the throttle is not dropped on every bump.
    airTime = grounded ? 0 : airTime + 1 / 60;
    const driving = airTime < 0.17;

    const v = f.linvel();
    const speed = Math.hypot(v.x, v.y);

    if (driving) {
      // A human brakes on a long descent instead of pedalling into the bottom
      // of it at 70 km/h; the bot has to do the same to be a fair test.
      press('up', speed < 13.5);
      press('down', speed > 15.5);
      // On the ground the bike should follow the slope, so leaning is only for
      // recovering from a flip. Steering towards level here fights every climb.
      press('left', rot < -1.0);
      press('right', rot > 1.0);
      return;
    }

    // Airborne: up and down now rotate. Aim slightly nose-up so it lands on
    // the rear wheel first.
    const err = (rot - 0.05) + spin * 0.25;
    press('up', err < -0.06);
    press('down', err > 0.06);
    press('left', false);
    press('right', false);
  }

  return {
    result: null,
    stop() {
      cancelAnimationFrame(raf);
      releaseAll();
    },
    run(levelIndex, maxSeconds = 60) {
      this.result = null;
      g.loadLevel(levelIndex);
      const t0 = performance.now();
      let maxX = -1e9;
      let stuckSince = t0;
      let lastX = -1e9;

      return new Promise((resolve) => {
        const tick = () => {
          const elapsed = (performance.now() - t0) / 1000;
          const x = g.bike.frame.translation().x;
          if (x > maxX + 0.5) { maxX = x; stuckSince = performance.now(); }
          const stuck = (performance.now() - stuckSince) / 1000;

          const over = g.game.state !== 'playing' || elapsed > maxSeconds || stuck > 6;
          if (over) {
            releaseAll();
            const c = g.dad.centroid();
            this.result = {
              level: g.level.name,
              outcome: g.game.state === 'won' ? 'WON' : g.game.state === 'dead' ? 'DIED' : 'STUCK',
              maxX: +maxX.toFixed(1),
              diedAt: [+c.x.toFixed(1), +c.y.toFixed(1)],
              finishX: g.level.finish?.x ?? null,
              seconds: +elapsed.toFixed(1),
              damage: Math.round(g.dad.totalDamage),
              severed: [...g.dad.parts.values()].filter((p) => p.severed).map((p) => p.name),
            };
            return resolve(this.result);
          }
          controller();
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
    },
  };
}
