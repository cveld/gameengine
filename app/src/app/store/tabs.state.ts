import { Injectable } from '@angular/core';
import { Action, Select, State, StateContext } from '@ngxs/store';
import { Observable } from 'rxjs';
import { ITab } from '../shared/ITab';
import { AddTab } from './tabs.actions';

@State<ITab[]>({
  name: 'tabs',
  defaults: []
})
@Injectable()
export class TabsState {
  constructor() {
    console.log('tabsstate contructor');
  }
  @Action(AddTab)
  addTab(ctx: StateContext<ITab[]>, action: AddTab) {
    const state = ctx.getState();
    action.tab.state = undefined;
    const newstate = [...state, action.tab];
    ctx.setState(newstate);
  }

  @Select((state: any) => state.tabs) tabs$?: Observable<ITab[]>;
}
