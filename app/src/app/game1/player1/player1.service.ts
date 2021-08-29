import { Injectable, OnDestroy } from '@angular/core';
import { Store } from '@ngxs/store';
import { Guid } from 'guid-typescript';
import { BehaviorSubject, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { IStateguidConsumer } from 'src/app/shared/IStateguidConsumer';
import { ISignalrMessage, UserTypeEnum } from 'src/app/shared/signalrmodels';
import { UpdateUserStateAction } from 'src/app/store/userstate/userstate.actions';
import { UserStateState } from 'src/app/store/userstate/userstate.state';
import { SignalrService } from '../../services/signalr/SignalrService';
import { Game1Service } from '../game1/game1.service';
import { Game1Ops } from '../shared/ops';
import { IPlayer1State } from '../shared/player1.models';

@Injectable()
export class Player1Service implements IStateguidConsumer, OnDestroy {

  constructor(private signalr: SignalrService, private store: Store) {
    this.randomvalue = Math.random();
    this.signalr.addHandler(Game1Ops.querygamesresult, (value: any) => this.querygamesresult(value));
    this.signalr.addHandler(Game1Ops.updateplayer, (value: any) => this.updateplayer(value))
    // const observablestate$ = this.store.select(UserStateState.userstate).pipe(map(filterFn => filterFn(this.guid)));
    // this.subscriptions.push(observablestate$.subscribe(this.state$));
  }
  updateplayer(value: ISignalrMessage<IPlayer1State>): void {
    if (value.connectionid !== this.guid?.toString()) {
      return
    }
    const currentState = this.state$.value;
    const nextState: IPlayer1State = {
      ...currentState,
      ...value.payload,
      gameid: Guid.parse(value.gameid!),
      joinedplayers: (value.payload?.joinedplayers as any)?.map((v: any) => Guid.parse(v.value))
    }
    this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
  }

  subscriptions = new Array<Subscription>();

  ngOnDestroy(): void {
    console.log(`Player1Service[${this.guid}].ngOnDestroy`);
    this.subscriptions.forEach(value => value.unsubscribe());
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
  //_state$ = this.store.select(UserStateState.userstate).pipe(map(filterFn => filterFn(this.guid)));
  state$ = new BehaviorSubject<IPlayer1State>({});

  setStateguid = (stateguid: Guid) => {
    this.guid = stateguid;
    const _state$ = this.store.select(UserStateState.userstate(stateguid));
    this.subscriptions.push(_state$.subscribe(this.state$));
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
      usertype: UserTypeEnum.player,
      connectionid: this.guid?.toString(),
      gameid: guid.toString()
    }).subscribe();
  }

  drawCard() {
    const currentState = this.state$?.value;
    this.signalr.sendSignalrMessage({
      type: Game1Ops.drawcard,
      usertype: UserTypeEnum.player,
      connectionid: this.guid?.toString(),
      gameid: currentState.gameid?.toString()
    }).subscribe();
  }
  playCard(index: number) {
    const currentState = this.state$?.value;
    this.signalr.sendSignalrMessage({
      type: Game1Ops.playcard,
      usertype: UserTypeEnum.player,
      connectionid: this.guid?.toString(),
      gameid: currentState.gameid?.toString(),
      payload: index
    }).subscribe();
  }
}
