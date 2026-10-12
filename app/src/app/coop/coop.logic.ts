import { COOP_H, COOP_W, ICoopState } from './coop.models';

export const SHIP_R = 16;
export const SHIP_SPEED = 260;
const MARGIN = 24;
const TOP = 50;

export function newState(names: { h: string; v: string }, phase: ICoopState['phase']): ICoopState {
  return {
    phase,
    countdown: 3,
    shipX: COOP_W / 2,
    shipY: COOP_H - 120,
    dirH: 0,
    dirV: 0,
    items: [],
    score: 0,
    lives: 3,
    hitFlash: 0,
    names,
  };
}

// Movement only: used by the host and (as extrapolation between network
// updates) by the guest.
export function moveAll(s: ICoopState, dt: number) {
  s.shipX = clamp(s.shipX + s.dirH * SHIP_SPEED * dt, MARGIN, COOP_W - MARGIN);
  s.shipY = clamp(s.shipY + s.dirV * SHIP_SPEED * dt, TOP, COOP_H - MARGIN);
  for (const item of s.items) item.y += item.vy * dt;
  s.items = s.items.filter(i => i.y < COOP_H + 40);
  s.hitFlash = Math.max(0, s.hitFlash - dt);
}

let nextId = 1;
let spawnTimer = 0;

// Full authoritative step, host only.
export function stepHost(s: ICoopState, dt: number) {
  if (s.phase === 'countdown') {
    s.countdown -= dt;
    if (s.countdown <= 0) {
      s.phase = 'playing';
      spawnTimer = 0.5;
    }
    return;
  }
  if (s.phase !== 'playing') return;

  moveAll(s, dt);

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const difficulty = Math.min(s.score, 40);
    spawnTimer = Math.max(0.35, 0.9 - difficulty * 0.012);
    const isStar = Math.random() < 0.4;
    const r = isStar ? 12 : 14 + Math.random() * 10;
    s.items.push({
      id: nextId++,
      kind: isStar ? 'star' : 'rock',
      x: MARGIN + Math.random() * (COOP_W - 2 * MARGIN),
      y: -30,
      vy: (isStar ? 110 : 130) + difficulty * 3 + Math.random() * 40,
      r,
    });
  }

  for (const item of [...s.items]) {
    const dx = item.x - s.shipX;
    const dy = item.y - s.shipY;
    if (dx * dx + dy * dy > (item.r + SHIP_R) ** 2) continue;
    s.items = s.items.filter(i => i !== item);
    if (item.kind === 'star') {
      s.score++;
    } else {
      s.lives--;
      s.hitFlash = 0.4;
      if (s.lives <= 0) s.phase = 'over';
    }
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
