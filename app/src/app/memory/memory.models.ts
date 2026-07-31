export interface IMemoryCard {
  index: number;
  symbol: string;
  flipped: boolean;
  matched: boolean;
}

export interface IPresenceEntry {
  clientId: string;
  name: string;
  joinedAt: number;
}

export interface IMemoryResult {
  clientId: string;
  name: string;
  moves: number;
  durationMs: number;
  completedAt: number;
}
