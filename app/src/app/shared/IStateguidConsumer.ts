import { Guid } from "guid-typescript";

export interface IStateguidConsumer {
  setStateguid: (stateguid: Guid) => void
}
