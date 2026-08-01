import { Guid } from "guid-typescript";

export class UpdateUserStateAction {
  static readonly type = '[Userstate] Update state';
  constructor(public guid: Guid, public state: any) {}
}
