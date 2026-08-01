import { Injectable, OnDestroy } from '@angular/core';
import { Guid } from 'guid-typescript';
import { BehaviorSubject } from 'rxjs';
import { SignalrService } from '../services/signalr/SignalrService';
import { GameHistoryService } from '../services/history/game-history.service';
import { UserTypeEnum } from '../shared/signalrmodels';
import { SimonOps } from './simon-ops';
import { IPresenceEntry, ISimonResult } from './simon.models';

const HISTORY_GAME_KEY = 'simon';

// Same pattern as MemoryService: presence and results are broadcast to every
// connected client via SignalR, and results are also kept in localStorage so
// a player's own history survives a page reload even without a live broadcast.
@Injectable({
  providedIn: 'root'
})
export class SimonService implements OnDestroy {

  readonly clientId = Guid.create().toString();

  presence$ = new BehaviorSubject<Map<string, IPresenceEntry>>(new Map());
  results$: BehaviorSubject<ISimonResult[]>;

  name?: string;
  private joined = false;
  private joinedAt?: number;

  constructor(private signalr: SignalrService, private history: GameHistoryService) {
    this.results$ = new BehaviorSubject<ISimonResult[]>(this.loadStoredResults());

    this.signalr.addHandler<IPresenceEntry>(SimonOps.presenceJoin, msg => this.onPresenceEntry(msg.payload));
    this.signalr.addHandler<IPresenceEntry>(SimonOps.presenceResult, msg => this.onPresenceEntry(msg.payload));
    this.signalr.addHandler<{ clientId: string }>(SimonOps.presenceLeave, msg => this.onPresenceLeave(msg.payload?.clientId));
    this.signalr.addHandler<undefined>(SimonOps.presenceQuery, () => this.respondToPresenceQuery());
    this.signalr.addHandler<ISimonResult>(SimonOps.result, msg => this.onResult(msg.payload));

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
    this.send(SimonOps.presenceJoin, { clientId: this.clientId, name, joinedAt: this.joinedAt });
    // ask everyone already present to (re-)announce themselves to us
    this.send(SimonOps.presenceQuery, undefined);
  }

  leave() {
    if (!this.joined) return;
    this.joined = false;
    this.send(SimonOps.presenceLeave, { clientId: this.clientId });
  }

  reportResult(name: string, score: number) {
    const result: ISimonResult = {
      clientId: this.clientId,
      name,
      score,
      completedAt: Date.now(),
    };
    this.send(SimonOps.result, result);
  }

  private respondToPresenceQuery() {
    if (!this.joined || !this.name || !this.joinedAt) return;
    this.send(SimonOps.presenceResult, { clientId: this.clientId, name: this.name, joinedAt: this.joinedAt });
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

  private onResult(result?: ISimonResult) {
    if (!result) return;
    this.results$.next([result, ...this.results$.value].slice(0, 50));
    this.history.add<ISimonResult>({
      game: HISTORY_GAME_KEY,
      name: result.name,
      summary: `Score ${result.score}`,
      data: result,
      completedAt: result.completedAt,
    });
  }

  private loadStoredResults(): ISimonResult[] {
    return this.history.get<ISimonResult>(HISTORY_GAME_KEY)
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
