import { Guid } from "guid-typescript";
import { UserTypeEnum } from "./signalrmodels";

export interface ITabRecord {
  title: string;
  userType: UserTypeEnum;
  implementationName: string;
  stateguid: Guid; // guid that references state in the UserState store
}
