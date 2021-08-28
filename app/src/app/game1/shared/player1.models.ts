import { Guid } from "guid-typescript";
import { ICard } from "src/app/card/card.models";

export interface IPlayer1State {
  stacksize?: number;
  playedcards?: Array<ICard>;
  myturn?: boolean;
  myindex?: number;
  joinedplayers?: Guid[];
  mycards?: Array<ICard>;
  players?: Array<number>;
  allowedops?: Array<string>;
  roundstarted?: boolean;
  lastroundresult?: number; // which player has won
}

