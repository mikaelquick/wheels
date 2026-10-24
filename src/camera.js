const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createCamera() {
  return {
    baseZoom: 82,
    x: 0,
    y: 0,
    zoom: 82, // CSS pixels per metre
    targetZoom: 82,
    leadX: 0,
    leadY: 0,
    shake: 0,

    // Leads the rider in the direction of travel and eases back a little at
    // speed, so there is always road visible ahead of the front wheel.
    follow(p, dt, vel = { x: 0, y: 0 }) {
      const speed = Math.hypot(vel.x, vel.y);
      const wantLeadX = clamp(vel.x * 0.30, -3.2, 3.2);
      const wantLeadY = clamp(vel.y * 0.14, -2.0, 2.0);
      const lk = 1 - Math.exp(-3 * dt);
      this.leadX += (wantLeadX - this.leadX) * lk;
      this.leadY += (wantLeadY - this.leadY) * lk;

      const k = 1 - Math.exp(-7 * dt);
      this.x += (p.x + this.leadX - this.x) * k;
      this.y += (p.y + 0.5 + this.leadY - this.y) * k;

      const want = this.baseZoom * (1 - clamp(speed / 26, 0, 0.26));
      this.targetZoom = want;
      this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-2.5 * dt));
      this.shake = Math.max(0, this.shake - dt * 2.2);
    },

    kick(amount) {
      this.shake = Math.min(1.2, this.shake + amount);
    },

    // Maps metres (y-up) onto the canvas (y-down) and leaves the context ready
    // for drawing in world units.
    apply(ctx, w, h, dpr = 1) {
      const z = this.zoom * dpr;
      const s = this.shake * this.shake;
      const ox = (Math.random() - 0.5) * s * 26 * dpr;
      const oy = (Math.random() - 0.5) * s * 26 * dpr;
      ctx.setTransform(
        z, 0, 0, -z,
        w / 2 - this.x * z + ox,
        h / 2 + this.y * z + oy,
      );
    },
  };
}
