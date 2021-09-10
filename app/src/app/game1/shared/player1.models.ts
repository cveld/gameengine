import { Guid } from "guid-typescript";
import { ICard, SuitEnum } from "src/app/card/card.models";
import { DirectionEnum, RoundStatusEnum } from "./game1.models";

export interface IPlayer1State {
  gameid?: Guid;
  cardsToTake?: number;
  stacksize?: number;
  playedcards?: Array<ICard>;
  myturn?: boolean;
  myindex?: number;
  direction?: DirectionEnum;
  joinedplayers?: Guid[];
  selectedSuit?: SuitEnum;
  mycards?: Array<ICard>;
  players?: Array<number>;
  allowedops?: Array<string>;
  roundstatus?: RoundStatusEnum;
  lastroundresult?: number; // which player has won
}

