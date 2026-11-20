// A player tab: finds games, joins one and plays its cards.
import { UserType, type SignalrMessage } from "@/engine/messages";
import { Value } from "@/engine/observable";
import { signalr } from "@/engine/signalr";
import type { Suit } from "./cards";
import { type DrawCard, Game1Ops, idOf, type PlayCard, type Player1State } from "./game1.models";

export class Player1 {
  readonly state: Value<Player1State>;
  readonly games = new Value<string[]>([]);
  private client = signalr();

  constructor(readonly guid: string, initial?: Player1State) {
    this.state = new Value(initial ?? {});
    this.client.on(Game1Ops.querygamesresult, m => {
      if (m.gameid && !this.games.value.includes(m.gameid)) this.games.set([...this.games.value, m.gameid]);
    });
    this.client.on<Player1State>(Game1Ops.updateplayer, m => this.updatePlayer(m));
  }

  private updatePlayer(message: SignalrMessage<Player1State>) {
    if (message.connectionid !== this.guid) return;
    this.state.set({
      ...this.state.value,
      ...message.payload,
      gameid: message.gameid,
      joinedplayers: (message.payload?.joinedplayers as unknown[] | undefined)?.map(idOf)
    });
  }

  private send<T>(type: string, gameid: string | undefined, payload?: T) {
    this.client.send<T>({ type, usertype: UserType.player, connectionid: this.guid, gameid, payload }).catch(() => {});
  }

  queryGames(): void {
    this.send(Game1Ops.querygames, undefined);
  }

  joinGame(gameid: string): void {
    this.send(Game1Ops.join, gameid);
  }

  drawCard(selectSuit: Suit): void {
    this.send<DrawCard>(Game1Ops.drawcard, this.state.value.gameid, { selectSuit });
  }

  playCard(index: number, sayLastCard: boolean, selectSuit: Suit): void {
    this.send<PlayCard>(Game1Ops.playcard, this.state.value.gameid, { index, sayLastCard, selectSuit });
  }
}
