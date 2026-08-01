import { Injectable, OnDestroy } from '@angular/core';
import { Guid } from 'guid-typescript';
import { BehaviorSubject } from 'rxjs';
import { SignalrService } from '../services/signalr/SignalrService';
import { GameHistoryService } from '../services/history/game-history.service';
import { UserTypeEnum } from '../shared/signalrmodels';
import { MemoryOps } from './memory-ops';
import { IMemoryResult, IPresenceEntry } from './memory.models';

const HISTORY_GAME_KEY = 'memory';

// Presence stays live-only (see below), but results are additionally kept in
// localStorage via GameHistoryService so a player's own history survives a
// page reload, instead of only existing as long as clients stay connected.
@Injectable({
  providedIn: 'root'
})
export class MemoryService implements OnDestroy {

  readonly clientId = Guid.create().toString();

  presence$ = new BehaviorSubject<Map<string, IPresenceEntry>>(new Map());
  results$: BehaviorSubject<IMemoryResult[]>;

  name?: string;
  private joined = false;
  private joinedAt?: number;

  constructor(private signalr: SignalrService, private history: GameHistoryService) {
    this.results$ = new BehaviorSubject<IMemoryResult[]>(this.loadStoredResults());

    this.signalr.addHandler<IPresenceEntry>(MemoryOps.presenceJoin, msg => this.onPresenceEntry(msg.payload));
    this.signalr.addHandler<IPresenceEntry>(MemoryOps.presenceResult, msg => this.onPresenceEntry(msg.payload));
    this.signalr.addHandler<{ clientId: string }>(MemoryOps.presenceLeave, msg => this.onPresenceLeave(msg.payload?.clientId));
    this.signalr.addHandler<undefined>(MemoryOps.presenceQuery, () => this.respondToPresenceQuery());
    this.signalr.addHandler<IMemoryResult>(MemoryOps.result, msg => this.onResult(msg.payload));

    window.addEventListener('beforeunload', this.leaveOnUnload);
  }

  private leaveOnUnload = () => this.leave();

  ngOnDestroy(): void {
    this.leave();
    window.removeEventListener('beforeunload', this.leaveOnUnload);
  }

  join(name: string) {
    this.name = name;
    this.joinedAt = Date.now();
    this.joined = true;
    this.send(MemoryOps.presenceJoin, { clientId: this.clientId, name, joinedAt: this.joinedAt });
    // ask everyone already present to (re-)announce themselves to us
    this.send(MemoryOps.presenceQuery, undefined);
  }

  leave() {
    if (!this.joined) return;
    this.joined = false;
    this.send(MemoryOps.presenceLeave, { clientId: this.clientId });
  }

  reportResult(moves: number, durationMs: number) {
    const result: IMemoryResult = {
      clientId: this.clientId,
      name: this.name ?? 'Onbekend',
      moves,
      durationMs,
      completedAt: Date.now(),
    };
    this.send(MemoryOps.result, result);
  }

  private respondToPresenceQuery() {
    if (!this.joined || !this.name || !this.joinedAt) return;
    this.send(MemoryOps.presenceResult, { clientId: this.clientId, name: this.name, joinedAt: this.joinedAt });
  }

  private onPresenceEntry(entry?: IPresenceEntry) {
    if (!entry) return;
    const map = new Map(this.presence$.value);
    map.set(entry.clientId, entry);
    this.presence$.next(map);
  }

  private onPresenceLeave(clientId?: string) {
    if (!clientId) return;
    const map = new Map(this.presence$.value);
    map.delete(clientId);
    this.presence$.next(map);
  }

  private onResult(result?: IMemoryResult) {
    if (!result) return;
    this.results$.next([result, ...this.results$.value].slice(0, 50));
    this.history.add<IMemoryResult>({
      game: HISTORY_GAME_KEY,
      name: result.name,
      summary: `${result.moves} zetten in ${(result.durationMs / 1000).toFixed(1)}s`,
      data: result,
      completedAt: result.completedAt,
    });
  }

  private loadStoredResults(): IMemoryResult[] {
    return this.history.get<IMemoryResult>(HISTORY_GAME_KEY)
      .map(entry => entry.data)
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, 50);
  }

  private send<T>(type: string, payload: T) {
    this.signalr.sendSignalrMessage<T>({
      type,
      usertype: UserTypeEnum.undefined,
      connectionid: this.clientId,
      payload,
    }).subscribe();
  }
}
