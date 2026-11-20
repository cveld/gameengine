import { readJson, writeJson } from "./storage";

const STORAGE_KEY = "gameHistory";
const MAX_ENTRIES_PER_GAME = 50;

export interface GameHistoryEntry<T = unknown> {
  game: string;
  name: string;
  summary: string;
  data: T;
  completedAt: number;
}

// Local, per-browser history so a player's results survive a page reload.
export const gameHistory = {
  add<T>(entry: GameHistoryEntry<T>): void {
    const all = readAll();
    const forGame = [entry, ...all.filter(e => e.game === entry.game)].slice(0, MAX_ENTRIES_PER_GAME);
    writeJson(STORAGE_KEY, [...forGame, ...all.filter(e => e.game !== entry.game)]);
  },
  get<T>(game: string): GameHistoryEntry<T>[] {
    return readAll().filter(e => e.game === game) as GameHistoryEntry<T>[];
  },
  clear(game?: string): void {
    writeJson(STORAGE_KEY, game ? readAll().filter(e => e.game !== game) : []);
  }
};

function readAll(): GameHistoryEntry[] {
  const value = readJson<unknown>(STORAGE_KEY, []);
  return Array.isArray(value) ? (value as GameHistoryEntry[]) : [];
}
