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
import { cpuUsage } from 'process';

export interface IGame1State {
  started: boolean;
  joinedplayers: Array<Guid>;
  players: Array<Array<ICard>>;
  turn?: number; // which player has the turn
  roundstarted?: boolean;
  stack?: Array<ICard>;
  playedcards?: Array<ICard>;
  lastroundresult?: number;
}

interface IPlayer1State {
  stacksize: number;
  playedcards: Array<ICard>;
  myturn: boolean;
  myindex: number;
  players: Array<Array<ICard>>;
  allowedops: Array<string>;
  roundstarted: boolean;
  lastroundresult?: number; // which player has won
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

export enum MessageTypeEnum {
  undefined = 'undefined',
  message = 'message',
  error = 'error'
}

interface IMessage {
  type: MessageTypeEnum,
  message: string
}

@Injectable()
export class Game1Service implements IStateguidConsumer, OnDestroy {
  generateDeck() {
    const colors = [ColorEnum.clubs, ColorEnum.diamonds, ColorEnum.hearts, ColorEnum.spades];
    const cards = new Array<ICard>();
    colors.forEach(color => {
      for (let number = 0; number < 13; number++) {
        const card : ICard = {
          type: CardTypeEnum.regular,
          color: color,
          number: number
        }
        cards.push(card);
      }
    });
    return cards;
  }
  shuffle<T>(array: Array<T>) {
    var m = array.length, t, i;

    // While there remain elements to shuffle…
    while (m) {

      // Pick a remaining element…
      i = Math.floor(Math.random() * m--);

      // And swap it with the current element.
      t = array[m];
      array[m] = array[i];
      array[i] = t;
    }

    return array;
  }
  generateRandomCards() {
    const joker : ICard = {
      type: CardTypeEnum.special,
      special: SpecialEnum.joker
    };
    const cards = [...this.generateDeck(), ...this.generateDeck(), joker, joker, joker, joker];

    return this.shuffle(cards);
  }
  stopGame() {
    const currentState = this.state$.value;
    const nextState = { ...currentState, started: false };
    this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
  }
  startGame() {
    const currentState = this.state$.value;
    if (!currentState.joinedplayers || currentState.joinedplayers.length < 2) {
      this.messages.push({
        type: MessageTypeEnum.error,
        message: `at least two players required`
      });
      return;
    }
    const stack = this.generateRandomCards();
    const players = [];
    for (let i = 0; i < currentState.joinedplayers.length; i++) {
      players.push(stack.splice(-7, 7));
    }

    const playedcards: ICard[] = [];
    do {
      const card = stack.pop();
      playedcards.push(card!);
      if (!this.IsPestCard(card!)) {
        break;
      }
    } while (true)

    const nextState: IGame1State = {
      ...currentState,
      started: true,
      playedcards: playedcards,
      players: players,
      turn: 0,
      roundstarted: true,
      stack: stack
    };
    this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
    this.sendPlayerStates(nextState);
  }
  sendPlayerStates(nextState: IGame1State) {
    nextState.joinedplayers.forEach((playerid, index) => {
      this.signalr.sendSignalrMessage({
        type: Game1Ops.updateplayer,
        usertype: UserTypeEnum.game,
        gameid: this.guid?.toString(),
        connectionid: playerid.toString(),
        payload: {
          allowedops: [],
          myindex: index,
          stacksize: nextState.stack?.length,
          myturn: nextState.turn === index,
          playedcards: nextState.playedcards,
          players: [],
          roundstarted: nextState.roundstarted
        } as IPlayer1State
      }).subscribe();
    });
  }

  guid?: Guid;
  state$ = new BehaviorSubject<IGame1State>({
    started: false,
    players: [],
    joinedplayers: []
  });

  constructor(
    private signalr: SignalrService,
    private tabsState: TabsState,
    public userState: UserStateState,
    private store: Store) {
    this.randomvalue = Math.random();
    this.signalr.addHandler(Game1Ops.join, value => this.joinGame(value));
    this.signalr.addHandler(Game1Ops.querygames, value => this.querygames(value));
    // const observablestate$ = this.store.select(UserStateState.userstate).pipe(map(filterFn => filterFn(this.guid)));
    // this.subscriptions.push(observablestate$.subscribe(this.state$));
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
    const _state$ = this.store.select(UserStateState.userstate(stateguid));
    this.subscriptions.push(_state$.subscribe(this.state$));
  }

  messages: IMessage[] = [];
  value?: string;
  randomvalue: Number;
  setValue(value: string) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  joinGame(value: ISignalrMessage<unknown>) {
    if (value.gameid === this.guid?.toString()) {
      console.log('join game', value);
      this.messages.push({
        type: MessageTypeEnum.message,
        message: `join game player ${value.connectionid}`
      });

      const joinedplayers = this.state$.value.joinedplayers ?? [];
      const guid = Guid.parse(value.connectionid!);

      this.store.dispatch(new UpdateUserStateAction(this.guid!, { ...this.state$.value, joinedplayers: [...joinedplayers, guid] }));
    }
  }

  IsPestCard(card: ICard) {
    return (card.special === SpecialEnum.joker)
       || (card.number === 0) // index 0 is card-value A
       || (card.number === 1) // index 1 is card-value 2
       || (card.number === 6)
       || (card.number === 7)
       || (card.number === 10)       // jack
  }



}

