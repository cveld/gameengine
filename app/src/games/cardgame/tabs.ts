// The tabs of the card-game engine page: each tab hosts a game engine or a player.
// Tabs and their state are kept in sessionStorage, so they survive a reload and
// a visit to another page in the same browser tab.
import { newId, Value } from "@/engine/observable";
import { UserType } from "@/engine/messages";
import { Game1 } from "./game1";
import type { Game1State, Player1State } from "./game1.models";
import { Player1 } from "./player1";

const STORAGE_KEY = "cardgame.tabs.v1";

export type LiveTab =
  | { title: "Game"; userType: UserType.game; stateguid: string; instance: Game1 }
  | { title: "Player"; userType: UserType.player; stateguid: string; instance: Player1 };

interface StoredTab {
  userType: UserType;
  stateguid: string;
  state: unknown;
}

export class TabStore {
  readonly tabs = new Value<LiveTab[]>([]);

  constructor() {
    let stored: StoredTab[] = [];
    try {
      stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      stored = [];
    }
    if (Array.isArray(stored)) {
      for (const tab of stored) {
        if (tab && typeof tab.stateguid === "string") this.add(tab.userType, tab.stateguid, tab.state);
      }
    }
  }

  createGame(): void {
    this.add(UserType.game, newId());
  }

  createPlayer(): void {
    this.add(UserType.player, newId());
  }

  private add(userType: UserType, guid: string, state?: unknown) {
    const tab: LiveTab = userType === UserType.game
      ? { title: "Game", userType, stateguid: guid, instance: new Game1(guid, state as Game1State | undefined) }
      : { title: "Player", userType: UserType.player, stateguid: guid, instance: new Player1(guid, state as Player1State | undefined) };
    tab.instance.state.subscribe(() => this.save());
    this.tabs.set([...this.tabs.value, tab]);
    this.save();
  }

  private save() {
    const data: StoredTab[] = this.tabs.value.map(t => ({ userType: t.userType, stateguid: t.stateguid, state: t.instance.state.value }));
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable */
    }
  }
}
