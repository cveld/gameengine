// The game engine tab: owns the deck and the rules, and tells each player what they see.
import { UserType, type SignalrMessage } from "@/engine/messages";
import { Value } from "@/engine/observable";
import { signalr } from "@/engine/signalr";
import { type Card, CardType, Special, Suit, suits } from "./cards";
import { Direction, type DrawCard, Game1Ops, type Game1State, idOf, type PlayCard, type Player1State, RoundStatus } from "./game1.models";

export enum MessageType {
  message = "message",
  error = "error"
}

export interface GameMessage {
  type: MessageType;
  message: string;
}

export const emptyGame1State = (): Game1State => ({ started: false, players: [], joinedplayers: [] });

function generateDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of suits) {
    for (let number = 0; number < 13; number++) cards.push({ type: CardType.regular, suit, number });
  }
  return cards;
}

function shuffle<T>(array: T[]): T[] {
  let m = array.length;
  while (m) {
    const i = Math.floor(Math.random() * m--);
    [array[m], array[i]] = [array[i], array[m]];
  }
  return array;
}

function generateRandomCards(): Card[] {
  const jokerBlack: Card = { type: CardType.special, suit: Suit.clubs, special: Special.joker };
  const jokerRed: Card = { type: CardType.special, suit: Suit.diamonds, special: Special.joker };
  const deck = generateDeck();
  return shuffle([...deck, ...deck, jokerRed, jokerRed, jokerBlack, jokerBlack]);
}

export function isPestCard(card: Card): boolean {
  return card.special === Special.joker
    || card.number === 0 // ace
    || card.number === 1 // 2
    || card.number === 6 // 7
    || card.number === 7 // 8
    || card.number === 10; // jack
}

function validSuit(suit?: Suit): boolean {
  return suit === Suit.spades || suit === Suit.clubs || suit === Suit.diamonds || suit === Suit.hearts;
}

const last = <T>(array: T[]) => array[array.length - 1];

export class Game1 {
  readonly state: Value<Game1State>;
  readonly messages = new Value<GameMessage[]>([]);
  private client = signalr();

  constructor(readonly guid: string, initial?: Game1State) {
    this.state = new Value(initial ?? emptyGame1State());
    this.client.on(Game1Ops.join, m => this.joinGame(m));
    this.client.on(Game1Ops.querygames, () => this.queryGames());
    this.client.on<DrawCard>(Game1Ops.drawcard, m => this.drawCard(m));
    this.client.on<PlayCard>(Game1Ops.playcard, m => this.playCard(m));
  }

  private note(type: MessageType, message: string) {
    this.messages.set([...this.messages.value, { type, message }]);
  }

  private commit(next: Game1State) {
    this.state.set(next);
    this.sendPlayerStates(next);
  }

  stopGame(): void {
    this.state.set({ ...this.state.value, started: false });
  }

  startGame(): void {
    const current = this.state.value;
    if (!current.joinedplayers || current.joinedplayers.length < 2) {
      this.note(MessageType.error, "at least two players required");
      return;
    }
    const stack = generateRandomCards();
    const players = current.joinedplayers.map(() => stack.splice(-7, 7));
    const playedcards: Card[] = [];
    for (;;) {
      const card = stack.pop()!;
      playedcards.push(card);
      if (!isPestCard(card)) break;
    }
    this.commit({
      ...current,
      started: true,
      playedcards,
      players,
      direction: Direction.clockwise,
      turn: 0,
      cardsToTake: 0,
      roundstatus: RoundStatus.started,
      stack
    });
  }

  private sendPlayerStates(state: Game1State) {
    const counts = state.players?.map(p => p.length) ?? [];
    state.joinedplayers.forEach((playerId, index) => {
      const payload: Player1State = {
        cardsToTake: state.cardsToTake,
        allowedops: [],
        myindex: index,
        stacksize: state.stack?.length,
        myturn: state.turn === index,
        direction: state.direction,
        selectedSuit: state.selectedSuit,
        lastroundresult: state.lastroundresult,
        playedcards: state.playedcards,
        joinedplayers: state.joinedplayers,
        mycards: state.players?.[index],
        players: counts,
        roundstatus: state.roundstatus
      };
      this.client.send<Player1State>({ type: Game1Ops.updateplayer, usertype: UserType.game, gameid: this.guid, connectionid: playerId, payload }).catch(() => {});
    });
  }

  private playerIndex(message: SignalrMessage<unknown>): number {
    if (message.gameid !== this.guid) return -1;
    const state = this.state.value;
    const index = state.joinedplayers.findIndex(id => id === message.connectionid);
    // Only the player who is on turn may act.
    return index !== -1 && state.turn === index ? index : -1;
  }

  private playCard(message: SignalrMessage<PlayCard>) {
    const playerIndex = this.playerIndex(message);
    if (playerIndex === -1) return;
    const current = this.state.value;
    const playcard = current.players[playerIndex][message.payload?.index!];
    if (!playcard) return;

    // Validate whether the played card is allowed.
    if (current.cardsToTake! > 0) {
      // Only jokers or 2's are allowed while cards have to be taken.
      if (!(playcard.number === 1 || playcard.special === Special.joker)) return;
    } else {
      const topcard = last(current.playedcards!);
      const jokerOrJack = playcard.special === Special.joker || playcard.number === 10;
      const followsChosenSuit = (topcard.special === Special.joker || topcard.number === 10) && current.selectedSuit === playcard.suit;
      const matchesTop = topcard.number !== 10 && topcard.special !== Special.joker && (playcard.suit === topcard.suit || playcard.number === topcard.number);
      if (!jokerOrJack && !followsChosenSuit && !matchesTop) {
        this.note(MessageType.error, "Card not allowed");
        return;
      }
    }
    if (playcard.number === 10 && !validSuit(message.payload?.selectSuit)) return;

    const draft = structuredClone(current);
    draft.players[playerIndex].splice(message.payload!.index, 1);
    draft.playedcards?.push(playcard);
    if (playcard.special === Special.joker) draft.cardsToTake! += 5; // next player draws 5 unless countered
    if (playcard.number === 1) draft.cardsToTake! += 2; // a 2: next player draws 2 unless countered
    if (playcard.number === 10) draft.selectedSuit = message.payload?.selectSuit; // jack: the player picks a suit

    if (draft.players[playerIndex].length === 0) {
      // Ending without saying "last card", or on a pest card, costs a penalty card.
      if (!message.payload?.sayLastCard || isPestCard(playcard)) {
        this.drawOneCard(draft, playerIndex);
      } else {
        draft.lastroundresult = playerIndex;
        draft.roundstatus = RoundStatus.finished;
        draft.turn = -1; // end of round, nobody is on turn
      }
    }

    if (draft.roundstatus === RoundStatus.started) {
      switch (playcard.number) {
        case 6: // a 7: the player keeps the turn
          break;
        case 7: // an 8: the next player is skipped
          this.nextTurn(draft, 2);
          break;
        case 0: // an ace: the direction changes
          draft.direction = draft.direction === Direction.clockwise ? Direction.counterclockwise : Direction.clockwise;
          this.nextTurn(draft, 1);
          break;
        default:
          this.nextTurn(draft, 1);
      }
    }
    this.commit(draft);
  }

  // Draws one card from the stack into a player's hand.
  private drawOneCard(draft: Game1State, playerIndex: number) {
    const card = draft.stack?.pop();
    if (card) draft.players[playerIndex].push(card);
  }

  private drawCard(message: SignalrMessage<DrawCard>) {
    const playerIndex = this.playerIndex(message);
    if (playerIndex === -1) return;
    const current = this.state.value;
    const topcard = last(current.playedcards!);
    if (topcard.special === Special.joker && !validSuit(message.payload?.selectSuit)) return;

    const draft = structuredClone(current);
    if (topcard.special === Special.joker) draft.selectedSuit = message.payload?.selectSuit;
    const count = draft.cardsToTake === 0 ? 1 : draft.cardsToTake!;
    for (let i = 0; i < count; i++) this.drawOneCard(draft, playerIndex);
    draft.cardsToTake = 0;
    this.nextTurn(draft, 1);
    this.commit(draft);
  }

  private nextTurn(draft: Game1State, increment: number) {
    const n = draft.joinedplayers.length;
    draft.turn = draft.direction === Direction.clockwise ? (draft.turn! + increment) % n : (draft.turn! - increment + n) % n;
  }

  private queryGames() {
    this.client.send({ type: Game1Ops.querygamesresult, usertype: UserType.game, gameid: this.guid }).catch(() => {});
  }

  private joinGame(message: SignalrMessage<unknown>) {
    if (message.gameid !== this.guid || !message.connectionid) return;
    const current = this.state.value;
    const joined = current.joinedplayers ?? [];
    if (joined.includes(message.connectionid)) return;
    this.note(MessageType.message, `join game player ${message.connectionid}`);
    this.commit({ ...current, joinedplayers: [...joined, idOf(message.connectionid)] });
  }
}
