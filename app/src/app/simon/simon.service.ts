import { Injectable } from '@angular/core';
import { Guid } from 'guid-typescript';
import { BehaviorSubject } from 'rxjs';
import { SignalrService } from '../services/signalr/SignalrService';
import { GameHistoryService } from '../services/history/game-history.service';
import { UserTypeEnum } from '../shared/signalrmodels';
import { SimonOps } from './simon-ops';
import { ISimonResult } from './simon.models';

const HISTORY_GAME_KEY = 'simon';

// Same pattern as MemoryService: results are broadcast to every connected
// client via SignalR, and also kept in localStorage so a player's own
// history survives a page reload even without a live broadcast.
@Injectable({
  providedIn: 'root'
})
export class SimonService {

  readonly clientId = Guid.create().toString();

  results$: BehaviorSubject<ISimonResult[]>;

  constructor(private signalr: SignalrService, private history: GameHistoryService) {
    this.results$ = new BehaviorSubject<ISimonResult[]>(this.loadStoredResults());
    this.signalr.addHandler<ISimonResult>(SimonOps.result, msg => this.onResult(msg.payload));
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
