const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'eject',
  ControlLeft: 'hands', ControlRight: 'hands',
  ShiftLeft: 'feet', ShiftRight: 'feet',
  KeyR: 'restart',
  KeyZ: 'slowmo',
  KeyN: 'next',
  KeyM: 'mute',
};

export function createInput() {
  const held = new Set();
  const pressed = new Set();

  addEventListener('keydown', (e) => {
    const a = KEYS[e.code];
    if (!a) return;
    e.preventDefault();
    if (!held.has(a)) pressed.add(a);
    held.add(a);
  });
  addEventListener('keyup', (e) => {
    const a = KEYS[e.code];
    if (!a) return;
    e.preventDefault();
    held.delete(a);
  });
  addEventListener('blur', () => held.clear());

  return {
    down: (a) => held.has(a),
    // Edge-triggered; consumed once per frame by endFrame().
    hit: (a) => pressed.has(a),
    endFrame: () => pressed.clear(),
  };
}
