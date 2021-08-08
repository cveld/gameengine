import { UserTypeEnum } from "./signalrmodels";

export interface ITabRecord {
  title: string;
  userType: UserTypeEnum;
  implementationName: string;
  state: any;
}
