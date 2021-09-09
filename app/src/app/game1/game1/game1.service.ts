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
import { Draft, produce } from 'immer';
import { DirectionEnum } from '../shared/game1.models';
import { Dir } from 'fs';

export interface IGame1State {
  started: boolean;
  joinedplayers: Array<Guid>;
  players: Array<Array<ICard>>;
  turn?: number; // which player has the turn
  direction?: DirectionEnum;
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
      direction: DirectionEnum.clockwise,
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
          direction: nextState.direction,
          lastroundresult: nextState.lastroundresult,
          playedcards: nextState.playedcards,
          joinedplayers: nextState.joinedplayers,
          mycards: nextState.players?.[index],
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

  takeLast<T>(array: Array<T>) {
    return array[array.length-1];
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

    // validate if played card is allowed
    if (currentState.cardsToTake! > 0) {
      // only jokers or 2's are allowed in this game state
      if (playcard.number === 1 // 2
         || playcard.special === SpecialEnum.joker)  {
           // passthrough
      } else {
        return;
      }
    } else {
      if (playcard.special === SpecialEnum.joker || playcard.number === 10) {
        // Joker or Jack passes through
      } else {
        const topcard = this.takeLast(currentState.playedcards!);
        if (playcard.suit === topcard.suit || playcard.number === topcard.number) {
          // same suit or same number passes through
        }
        else {
          // other cards are not allowed
          this.messages.push({
            type: MessageTypeEnum.error,
            message: "Card not allowed"
          })
          return;
        }
      }
    }

    // validations passed. Selected card can be played.

    const nextState = produce(currentState, draft => {
      draft.players[playerindex].splice(value.payload?.index!, 1);
      draft.playedcards?.push(playcard);
      if (playcard.special === SpecialEnum.joker) {
        // player plays a joker. Other player must draw 5 cards if not countered
        draft.cardsToTake! += 5;
      }
      if (playcard.number === 1) {
        // player plays a 2. Other player must draw 2 cards if not countered
        draft.cardsToTake! += 2;
      }

      // check if player's hand is empty
      if (draft.players[playerindex].length === 0) {
        // check if player ending with last card flag correctly
        // and, if it not a pest card
        if (!value.payload?.sayLastCard || this.IsPestCard(playcard)) {
          // if so, the player gets a penalty card
          this.drawonecard(draft, playerindex);
        }
        else {
          // if not, the round ends
          draft.lastroundresult = playerindex;
          draft.roundstarted = false;
          draft.turn = -1; // end of round, nobody is on turn
        }
      }

      if (draft.roundstarted) {
        switch (playcard.number) {
          case 6:
            // player plays 7. Keeps the turn
            break;
          case 7:
            // player plays 8. Next player is skipped
            this.nextTurn(draft, 2);
            break;
          // @ts-expect-error
          // allow for falling through the case statement
          case 0:
            // player plays ace. Game's direction changes
            draft.direction = draft.direction === DirectionEnum.clockwise ? DirectionEnum.counterclockwise : DirectionEnum.clockwise;
          default:
            this.nextTurn(draft, 1);
        }
      }
    });
    this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
    this.sendPlayerStates(nextState);
  }
  // utility function that draws one card from the stack
  // and adds it to the active player's hand.
  // also, if the stack is depleted, cleans up played card, and reshuffles the stack
  drawonecard(draft: Draft<IGame1State>, playerindex: number) {
    const drawcard = draft.stack?.pop();
    draft.players[playerindex].push(drawcard!);
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
        this.drawonecard(draft, playerindex);
      }
      draft.cardsToTake = 0;
      this.nextTurn(draft, 1);
    });

    this.store.dispatch(new UpdateUserStateAction(this.guid!, nextState));
    this.sendPlayerStates(nextState);
  }

  nextTurn(draft: Draft<IGame1State>, increment: number) {
    if (draft.direction === DirectionEnum.clockwise) {
      draft.turn = (draft.turn!+increment) % draft.joinedplayers.length;
    } else {
      draft.turn = (draft.turn!-increment) % draft.joinedplayers.length;
    }

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

