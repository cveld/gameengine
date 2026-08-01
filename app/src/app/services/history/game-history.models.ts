export interface IGameHistoryEntry<T = unknown> {
  game: string;
  name: string;
  summary: string;
  data: T;
  completedAt: number;
}
