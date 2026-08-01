import { ITabRecord } from "../../shared/ITabRecord";

export class AddTabAction {
  static readonly type = '[Tabs] Add tab';
  constructor(public tab: ITabRecord) {}
}
