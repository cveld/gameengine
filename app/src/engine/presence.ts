import { gameHistory } from "./history";
import { UserType } from "./messages";
import { newId, Value } from "./observable";
import { signalr } from "./signalr";

export interface PresenceEntry {
  clientId: string;
  name: string;
  joinedAt: number;
}

export interface PresenceResult {
  clientId: string;
  name: string;
  completedAt: number;
}

/**
 * Who is playing a game right now, plus a shared results feed.
 * Messages are `<game>.presence.join|leave|query|result` and `<game>.result`.
 * Presence is live only; results are also kept in the local game history.
 */
export class PresenceRoom<R extends PresenceResult> {
  readonly clientId = newId();
  readonly presence = new Value<Map<string, PresenceEntry>>(new Map());
  readonly results: Value<R[]>;
  name?: string;
  private joined = false;
  private joinedAt?: number;

  constructor(private game: string, private summarize: (result: R) => string) {
    this.results = new Value<R[]>(
      gameHistory.get<R>(game).map(e => e.data).sort((a, b) => b.completedAt - a.completedAt).slice(0, 50)
    );
    const client = signalr();
    client.on<PresenceEntry>(`${game}.presence.join`, m => this.onEntry(m.payload));
    client.on<PresenceEntry>(`${game}.presence.result`, m => this.onEntry(m.payload));
    client.on<{ clientId: string }>(`${game}.presence.leave`, m => this.onLeave(m.payload?.clientId));
    client.on(`${game}.presence.query`, () => this.answerQuery());
    client.on<R>(`${game}.result`, m => this.onResult(m.payload));
    window.addEventListener("pagehide", () => this.leave());
  }

  join(name: string): void {
    this.name = name;
    this.joinedAt = Date.now();
    this.joined = true;
    this.send(`${this.game}.presence.join`, { clientId: this.clientId, name, joinedAt: this.joinedAt });
    // Ask everyone already present to (re-)announce themselves.
    this.send(`${this.game}.presence.query`, undefined);
  }

  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.send(`${this.game}.presence.leave`, { clientId: this.clientId });
  }

  report(result: Omit<R, "clientId" | "completedAt">): void {
    this.send(`${this.game}.result`, { ...result, clientId: this.clientId, completedAt: Date.now() });
  }

  private answerQuery() {
    if (!this.joined || !this.name || !this.joinedAt) return;
    this.send(`${this.game}.presence.result`, { clientId: this.clientId, name: this.name, joinedAt: this.joinedAt });
  }

  private onEntry(entry?: PresenceEntry) {
    if (!entry) return;
    const map = new Map(this.presence.value);
    map.set(entry.clientId, entry);
    this.presence.set(map);
  }

  private onLeave(clientId?: string) {
    if (!clientId) return;
    const map = new Map(this.presence.value);
    map.delete(clientId);
    this.presence.set(map);
  }

  private onResult(result?: R) {
    if (!result) return;
    this.results.set([result, ...this.results.value].slice(0, 50));
    gameHistory.add<R>({ game: this.game, name: result.name, summary: this.summarize(result), data: result, completedAt: result.completedAt });
  }

  private send<T>(type: string, payload: T) {
    signalr().send({ type, usertype: UserType.undefined, connectionid: this.clientId, payload }).catch(() => {});
  }
}
