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
import { Game1Ops, IPlaycard } from '../shared/ops';
import { cpuUsage } from 'process';
import { CardTypeEnum, ICard, SpecialEnum, getSuitColor, suits, SuitEnum, getCoveredCards } from 'src/app/card/card.models';
import { IPlayer1State } from '../shared/player1.models';
import { updateItem } from '@ngxs/store/operators';
import { produce } from 'immer';

export interface IGame1State {
  started: boolean;
  joinedplayers: Array<Guid>;
  players: Array<Array<ICard>>;
  turn?: number; // which player has the turn
  roundstarted?: boolean;
  stack?: Array<ICard>;
  playedcards?: Array<ICard>;
  lastroundresult?: number;
  cardsToTake?: number; // adding jokers and 2's
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
    const cards = new Array<ICard>();
    suits.forEach(suit => {
      for (let number = 0; number < 13; number++) {
        const card : ICard = {
          type: CardTypeEnum.regular,
          suit: suit,
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
    const jokerblack : ICard = {
      type: CardTypeEnum.special,
      suit: SuitEnum.clubs,
      special: SpecialEnum.joker
    };
    const jokerred : ICard = {
      type: CardTypeEnum.special,
      suit: SuitEnum.diamonds,
      special: SpecialEnum.joker
    };

    const deck = this.generateDeck();
    const cards = [...deck, ...deck, jokerred, jokerred, jokerblack, jokerblack];

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
      cardsToTake: 0,
      roundstarted: true,
      stack: stack
    };
    this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
    this.sendPlayerStates(nextState);
  }
  sendPlayerStates(nextState: IGame1State) {
    nextState.joinedplayers.forEach((playerid, index) => {
      const players: number[] = [];
      nextState.players?.forEach(player => {
        players.push(player.length);
      });
      this.signalr.sendSignalrMessage<IPlayer1State>({
        type: Game1Ops.updateplayer,
        usertype: UserTypeEnum.game,
        gameid: this.guid?.toString(),
        connectionid: playerid.toString(),
        payload: {
          cardsToTake: nextState.cardsToTake,
          allowedops: [],
          myindex: index,
          stacksize: nextState.stack?.length,
          myturn: nextState.turn === index,
          lastroundresult: nextState.lastroundresult,
          playedcards: nextState.playedcards,
          joinedplayers: nextState.joinedplayers,
          mycards: nextState.players[index],
          players: players,
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
    this.signalr.addHandler(Game1Ops.drawcard, value => this.drawcard(value));
    this.signalr.addHandler<IPlaycard>(Game1Ops.playcard, value => this.playcard(value));
    // const observablestate$ = this.store.select(UserStateState.userstate).pipe(map(filterFn => filterFn(this.guid)));
    // this.subscriptions.push(observablestate$.subscribe(this.state$));
  }
  playcard(value: ISignalrMessage<IPlaycard>): void {
    if (value.gameid !== this.guid?.toString()) {
      return;
    }
    const currentState = this.state$.value;
    const playerindex = currentState.joinedplayers.findIndex(g => g.toString() === value.connectionid!);
    if (playerindex === -1) {
      // player not found
      return
    }
    if (currentState.turn !== playerindex) {
      // player is not on turn
      return
    }

    const playcard = currentState.players[playerindex][value.payload?.index!];

    const nextState = produce(currentState, draft => {
      draft.players[playerindex].splice(value.payload?.index!, 1);
      if (draft.players[playerindex].length === 0) {
        draft.lastroundresult = playerindex;
      }
      draft.playedcards?.push(playcard);
      draft.turn = (draft.turn!+1) % draft.joinedplayers.length;
    });
    this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
    this.sendPlayerStates(nextState);
  }
  drawcard(value: ISignalrMessage<unknown>): void {
    if (value.gameid !== this.guid?.toString()) {
      return;
    }
    const currentState = this.state$.value;
    const playerindex = currentState.joinedplayers.findIndex(g => g.toString() === value.connectionid!);
    if (playerindex === -1) {
      // player not found
      return
    }
    if (currentState.turn !== playerindex) {
      // player is not on turn
      return
    }

    const nextState = produce(currentState, draft => {
      const numberOfCards = draft.cardsToTake === 0 ? 1 : draft.cardsToTake!;
      for (let i = 0; i < numberOfCards; i++) {
        const drawcard = draft.stack?.pop();
        draft.players[playerindex].push(drawcard!);
      }
      draft.turn = (draft.turn!+1) % draft.joinedplayers.length;
    });

    this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
    this.sendPlayerStates(nextState);
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
      const currentState = this.state$.value;
      const joinedplayers = currentState.joinedplayers ?? [];
      if (joinedplayers.find(v => v.toString() === value.connectionid)) {
        // already joined
        return;
      }
      this.messages.push({
        type: MessageTypeEnum.message,
        message: `join game player ${value.connectionid}`
      });

      const guid = Guid.parse(value.connectionid!);
      const nextState = { ...currentState, joinedplayers: [...joinedplayers, guid] };
      this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
      this.sendPlayerStates(nextState);
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

