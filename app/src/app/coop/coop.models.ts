export const COOP_W = 480;
export const COOP_H = 640;

export type CoopPhase = 'waiting' | 'countdown' | 'playing' | 'over';

export interface ICoopItem {
  id: number;
  kind: 'star' | 'rock';
  x: number;
  y: number;
  vy: number;
  r: number;
}

export interface ICoopState {
  phase: CoopPhase;
  countdown: number;   // seconds left while phase === 'countdown'
  shipX: number;
  shipY: number;
  dirH: number;        // -1 | 0 | 1, controlled by the horizontal player
  dirV: number;        // -1 | 0 | 1, controlled by the vertical player
  items: ICoopItem[];
  score: number;
  lives: number;
  hitFlash: number;    // seconds of "ouch" left
  names: { h: string; v: string };
}

export interface ICoopPeer {
  clientId: string;
  name: string;
  joinedAt: number;
}

export interface ICoopResult {
  names: string[];
  score: number;
  completedAt: number;
}
