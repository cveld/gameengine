export type SimonColor = 'green' | 'red' | 'yellow' | 'blue';

export interface ISimonResult {
  clientId: string;
  name: string;
  score: number;
  completedAt: number;
}

export interface IPresenceEntry {
  clientId: string;
  name: string;
  joinedAt: number;
}
