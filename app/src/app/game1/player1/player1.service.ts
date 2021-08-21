import { Injectable, OnDestroy } from '@angular/core';
import { Store } from '@ngxs/store';
import { Guid } from 'guid-typescript';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { IStateguidConsumer } from 'src/app/shared/IStateguidConsumer';
import { ISignalrMessage, UserTypeEnum } from 'src/app/shared/signalrmodels';
import { UserStateState } from 'src/app/store/userstate/userstate.state';
import { SignalrService } from '../../services/signalr/SignalrService';
import { Game1Service } from '../game1/game1.service';
import { Game1Ops } from '../shared/ops';

@Injectable()
export class Player1Service implements IStateguidConsumer, OnDestroy {

  constructor(private signalr: SignalrService, private store: Store) {
    this.randomvalue = Math.random();
    this.signalr.addHandler(Game1Ops.querygamesresult, (value: any) => this.querygamesresult(value));
  }
  ngOnDestroy(): void {
    console.log(`Player1Service[${this.guid}].ngOnDestroy`);
  }
  querygamesresult(value: ISignalrMessage<unknown>): void {
    this.games.set(value.gameid!, value.gameid!);
  }

  queryGames() {
    this.signalr.sendSignalrMessage({
      usertype: UserTypeEnum.player,
      connectionid: this.guid?.toString(),
      type: Game1Ops.querygames
    }).subscribe();
  }

  games: Map<string, string> = new Map<string, string>();
  guid?: Guid;
  _state$ = this.store.select(UserStateState.userstate).pipe(map(filterFn => filterFn(this.guid)));
  state$ = new BehaviorSubject<any>({});

  setStateguid = (stateguid: Guid) => {
    this.guid = stateguid;
  }

  value?: string;
  randomvalue: Number;
  setValue(value: string) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  joinGame(guid: Guid) {
    this.signalr.sendSignalrMessage({
      type: Game1Ops.join,
      usertype: UserTypeEnum.player
    }).subscribe();
  }
}
