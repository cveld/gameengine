import { Guid } from "guid-typescript";
import { ICard } from "src/app/card/card.models";
import { DirectionEnum } from "./game1.models";

export interface IPlayer1State {
  gameid?: Guid;
  cardsToTake?: number;
  stacksize?: number;
  playedcards?: Array<ICard>;
  myturn?: boolean;
  myindex?: number;
  direction?: DirectionEnum;
  joinedplayers?: Guid[];
  mycards?: Array<ICard>;
  players?: Array<number>;
  allowedops?: Array<string>;
  roundstarted?: boolean;
  lastroundresult?: number; // which player has won
}

