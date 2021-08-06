import { ITab } from "../shared/ITab";

export class AddTab {
  static readonly type = '[Tabs] Add tab';
  constructor(public tab: ITab) {}
}
