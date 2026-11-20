import type { Card, Suit } from "./cards";

export enum Direction {
  clockwise = "clockwise",
  counterclockwise = "counterclockwise"
}

export enum RoundStatus {
  notstarted = "notstarted",
  started = "started",
  finished = "finished"
}

export const Game1Ops = {
  querygames: "game1.querygames", // the player sends to all games
  join: "game1.join", // the player sends this to the game
  querygamesresult: "game1.querygamesresult", // the game broadcasts this to all players
  playcard: "game1.playcard", // the player sends this to the game
  drawcard: "game1.drawcard", // the player sends this to the game
  updateplayer: "game1.updateplayer" // the game sends every player a personalized payload
} as const;

export interface PlayCard {
  index: number;
  sayLastCard: boolean;
  selectSuit: Suit;
}

export interface DrawCard {
  selectSuit: Suit;
}

/** The game's authoritative state (kept by the game tab only). */
export interface Game1State {
  started: boolean;
  joinedplayers: string[];
  players: Card[][];
  turn?: number; // which player has the turn
  direction?: Direction;
  roundstatus?: RoundStatus;
  stack?: Card[];
  playedcards?: Card[];
  lastroundresult?: number;
  cardsToTake?: number; // adding jokers and 2's
  selectedSuit?: Suit;
}

/** What one player sees (sent by the game). */
export interface Player1State {
  gameid?: string;
  cardsToTake?: number;
  stacksize?: number;
  playedcards?: Card[];
  myturn?: boolean;
  myindex?: number;
  direction?: Direction;
  joinedplayers?: string[];
  selectedSuit?: Suit;
  mycards?: Card[];
  players?: number[];
  allowedops?: string[];
  roundstatus?: RoundStatus;
  lastroundresult?: number; // which player has won
}

/** Player ids were Guid objects ({ value }) in the Angular version; accept both forms. */
export function idOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { value?: unknown }).value === "string") return (value as { value: string }).value;
  return String(value);
}
