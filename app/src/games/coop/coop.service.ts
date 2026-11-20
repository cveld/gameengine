import { UserType } from "@/engine/messages";
import { Emitter, newId, Value } from "@/engine/observable";
import { signalr } from "@/engine/signalr";
import type { CoopPeer, CoopState } from "./coop.models";

// Namespaced SignalR message types for Tandem Ruimteschip. Every message
// carries the room code in `gameid`; handlers ignore other rooms.
export const CoopOps = {
  announce: "coop.announce", // a player announces themselves (join, or reply to a query)
  query: "coop.query", // a new player asks "who's in this room?"
  leave: "coop.leave", // a player left
  input: "coop.input", // a player's steering direction changed
  state: "coop.state", // the host's authoritative game state
  restart: "coop.restart" // a player asks for a new game
} as const;

// The partner pings every few seconds; silence for this long means their tab
// was closed or backgrounded (a "leave" can't be sent in that case).
const PEER_TIMEOUT_MS = 15000;

// Two-player room on top of the shared SignalR client. Both clients broadcast to
// everyone, so every message carries the room code (gameid) and handlers filter
// on it. The peer with the earliest joinedAt is the host: it runs the simulation
// and broadcasts the state; the other one only sends its input.
export class CoopService {
  readonly clientId = newId();
  room?: string;
  name = "";
  private joinedAt = 0;

  readonly peer = new Value<CoopPeer | undefined>(undefined);
  readonly roomFull = new Value(false);
  readonly guestInput = new Emitter<number>();
  readonly remoteState = new Emitter<CoopState>();
  readonly restartRequested = new Emitter<void>();

  private others = new Map<string, CoopPeer>();
  private helloTimer?: number;
  private helloTicks = 0;
  private peerLastSeen = 0;
  private client = signalr();

  constructor() {
    const c = this.client;
    c.on<CoopPeer>(CoopOps.announce, m => this.onAnnounce(m.gameid, m.payload));
    c.on(CoopOps.query, m => {
      if (this.inRoom(m.gameid) && m.connectionid !== this.clientId) this.announce();
    });
    c.on<{ clientId: string }>(CoopOps.leave, m => this.onLeave(m.gameid, m.payload?.clientId));
    c.on<{ clientId: string; dir: number }>(CoopOps.input, m => {
      if (this.inRoom(m.gameid) && m.payload && m.payload.clientId === this.peer.value?.clientId) {
        this.peerLastSeen = Date.now();
        this.guestInput.emit(m.payload.dir);
      }
    });
    c.on<CoopState>(CoopOps.state, m => {
      if (this.inRoom(m.gameid) && m.payload && m.connectionid === this.peer.value?.clientId && !this.isHost) {
        this.peerLastSeen = Date.now();
        this.remoteState.emit(m.payload);
      }
    });
    c.on(CoopOps.restart, m => {
      if (this.inRoom(m.gameid) && m.connectionid !== this.clientId) this.restartRequested.emit();
    });

    // Messages reach whoever is connected at that moment, so a "who's here?"
    // sent before our own connection is up is never answered. Say hello whenever
    // we (re)connect, and keep asking until we have found our partner.
    c.state.subscribe(() => {
      if (c.connected && this.room) this.hello();
    });
    // Back from another app/tab: our partner may have dropped us meanwhile.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.room) this.hello();
    });
    window.addEventListener("pagehide", () => this.leave());
  }

  get isHost(): boolean {
    const peer = this.peer.value;
    if (!peer) return true;
    return this.joinedAt < peer.joinedAt || (this.joinedAt === peer.joinedAt && this.clientId < peer.clientId);
  }

  join(room: string, name: string): void {
    this.leave();
    this.room = room;
    this.name = name;
    this.joinedAt = Date.now();
    this.others.clear();
    this.peer.set(undefined);
    this.roomFull.set(false);
    this.hello();
    window.clearInterval(this.helloTimer);
    this.helloTicks = 0;
    this.helloTimer = window.setInterval(() => this.tick(), 2000);
  }

  // Every 2s: look for a partner if we have none; otherwise ping them every
  // other tick and drop them when we haven't heard anything for a while.
  private tick() {
    if (!this.room) return;
    const peer = this.peer.value;
    if (!peer) {
      this.hello();
      return;
    }
    if (Date.now() - this.peerLastSeen > PEER_TIMEOUT_MS) {
      this.others.delete(peer.clientId);
      this.peer.set(undefined);
      this.hello();
      return;
    }
    if (++this.helloTicks % 2 === 0 && this.client.connected) this.announce();
  }

  private hello() {
    if (!this.client.connected) return;
    this.announce();
    this.send(CoopOps.query, undefined);
  }

  leave(): void {
    window.clearInterval(this.helloTimer);
    if (!this.room) return;
    this.send(CoopOps.leave, { clientId: this.clientId });
    this.room = undefined;
    this.others.clear();
    this.peer.set(undefined);
  }

  sendInput(dir: number): void {
    this.send(CoopOps.input, { clientId: this.clientId, dir });
  }

  sendState(state: CoopState): void {
    this.send(CoopOps.state, state);
  }

  sendRestart(): void {
    this.send(CoopOps.restart, undefined);
  }

  private inRoom(room?: string) {
    return !!this.room && room === this.room;
  }

  private announce() {
    this.send<CoopPeer>(CoopOps.announce, { clientId: this.clientId, name: this.name, joinedAt: this.joinedAt });
  }

  private onAnnounce(room?: string, entry?: CoopPeer) {
    if (!entry || !this.inRoom(room) || entry.clientId === this.clientId) return;
    if (entry.clientId === this.peer.value?.clientId) this.peerLastSeen = Date.now();
    this.others.set(entry.clientId, entry);
    if (!this.peer.value) {
      this.peerLastSeen = Date.now();
      this.peer.set(entry);
      this.announce(); // make sure the newcomer learns about us
    }
    // A third player has joined after both existing players: turn them away.
    const entries = [...this.others.values()];
    if (entries.length >= 2 && entries.every(e => e.joinedAt < this.joinedAt)) this.roomFull.set(true);
  }

  private onLeave(room?: string, clientId?: string) {
    if (!this.inRoom(room) || !clientId) return;
    this.others.delete(clientId);
    if (this.peer.value?.clientId === clientId) this.peer.set(undefined);
  }

  private send<T>(type: string, payload: T) {
    this.client.send({ type, usertype: UserType.undefined, connectionid: this.clientId, gameid: this.room, payload }).catch(() => {});
  }
}
