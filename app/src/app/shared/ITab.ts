import { Guid } from "guid-typescript";

export interface ITab {
  title: string;
  component?: any;
  state?: any;
  stateguid: Guid;
}
