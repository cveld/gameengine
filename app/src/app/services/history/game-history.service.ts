import { Injectable } from '@angular/core';
import { IGameHistoryEntry } from './game-history.models';

const STORAGE_KEY = 'gameHistory';
const MAX_ENTRIES_PER_GAME = 50;

// Local, per-browser history so a player's results survive a page reload.
// This is separate from any live SignalR presence/results feed, which stays
// in-memory-only by design (see MemoryService).
@Injectable({
  providedIn: 'root'
})
export class GameHistoryService {

  add<T>(entry: IGameHistoryEntry<T>): void {
    const all = this.readAll();
    const forGame = [entry, ...all.filter(e => e.game === entry.game)].slice(0, MAX_ENTRIES_PER_GAME);
    const others = all.filter(e => e.game !== entry.game);
    this.writeAll([...forGame, ...others]);
  }

  get<T>(game: string): IGameHistoryEntry<T>[] {
    return this.readAll().filter(e => e.game === game) as IGameHistoryEntry<T>[];
  }

  clear(game?: string): void {
    if (!game) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    this.writeAll(this.readAll().filter(e => e.game !== game));
  }

  private readAll(): IGameHistoryEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private writeAll(entries: IGameHistoryEntry[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
}
