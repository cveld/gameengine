import { Injectable, OnDestroy } from '@angular/core';
import { Store } from '@ngxs/store';
import { TabsState } from 'src/app/store/tabs/tabs.state';
import { UpdateUserStateAction } from 'src/app/store/userstate/userstate.actions';
import { SignalrService } from '../../services/signalr/SignalrService';
import { Guid } from "guid-typescript";
import { IStateguidConsumer } from '../../shared/IStateguidConsumer';
import { UserStateState } from 'src/app/store/userstate/userstate.state';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { IUserState } from 'src/app/shared/IUserState';
import { ISignalrMessage, UserTypeEnum } from 'src/app/shared/signalrmodels';
import { Game1Ops } from '../shared/ops';

interface IGame1State {
  started: boolean;
  joinedplayers: Array<Guid>;
  players: Array<Array<ICard>>;
  turn?: number; // which player has the turn
  roundstarted?: boolean;
}

interface IPlayer1State {
  stacksize: number;
  playedcards: Array<ICard>;
  myturn: boolean;
  myindex: number;
  players: Array<Array<ICard>>;
  allowedops: Array<string>;
  roundstarted: boolean;
  lastroundresult: string; // which player has won
}

enum ColorEnum {
  undefined = 'undefined',
  spades = 'spades',
  hearts = 'hearts',
  clubs = 'clubs',
  diamonds = 'diamonds',
}

enum SpecialEnum {
  undefined = 'undefined',
  joker = 'joker',
  covered = 'covered'
}

const cardNumbers = "A 2 3 4 5 6 7 8 9 10J Q K ";

enum CardTypeEnum {
  undefined = 'undefined',
  regular = 'regular',
  special = 'special'
}

interface ICard {
  color?: ColorEnum,
  number?: number,
  type: CardTypeEnum,
  special?: SpecialEnum
}

@Injectable()
export class Game1Service implements IStateguidConsumer, OnDestroy {
  startGame() {
    //const index = this.tabsState.statetotabindexmap.get(this)!;

    this.store.dispatch(new UpdateUserStateAction(this.guid!, { started: true }));
  }

  guid?: Guid;
  _state$ = this.store.select(UserStateState.userstate).pipe(map(filterFn => filterFn(this.guid)));
  state$ = new BehaviorSubject<IGame1State>({
    started: false,
    players: [],
    joinedplayers: []
  });

  constructor(
    private signalr: SignalrService,
    private tabsState: TabsState,
    private userState: UserStateState,
    private store: Store) {
    this.randomvalue = Math.random();
    this.signalr.addHandler(Game1Ops.join, value => this.joinGame(value));
    this.signalr.addHandler(Game1Ops.querygames, value => this.querygames(value));
    this.subscriptions.push(this._state$.subscribe(this.state$));
  }
  querygames(value: ISignalrMessage<unknown>): void {
    this.signalr.sendSignalrMessage({
      type: Game1Ops.querygamesresult,
      usertype: UserTypeEnum.game,
      gameid: this.guid?.toString()
    }).subscribe();
  }

  subscriptions = new Array<Subscription>();

  ngOnDestroy(): void {
    this.subscriptions.forEach(value => value.unsubscribe());
  }

  setStateguid = (stateguid: Guid) => {
    this.guid = stateguid;
  }

  messages: string[] = [];
  value?: string;
  randomvalue: Number;
  setValue(value: string) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  joinGame(value: ISignalrMessage<unknown>) {
    console.log('join game', value);
    this.messages.push('join game');
  }

}
