import { Injectable } from '@angular/core';
import { Action, NgxsAfterBootstrap, NgxsOnChanges, NgxsOnInit, NgxsSimpleChange, Select, Selector, State, StateContext } from '@ngxs/store';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { GameService } from '../services/game/game.service';
import { PlayerService } from '../services/player/player.service';
import { ITab } from '../shared/ITab';
import { ITabRecord } from '../shared/ITabRecord';
import { UserTypeEnum } from '../shared/signalrmodels';
import { AddTabAction } from './tabs.actions';

export class TabStateModel {
  tabs: ITabRecord[] = [];
}
@State<TabStateModel>({
  name: 'tabs',
  defaults: {
    tabs: []
  }
})
@Injectable()
export class TabsState implements NgxsOnInit, NgxsOnChanges, NgxsAfterBootstrap {
  constructor(private gameService: GameService, private playerService: PlayerService) {
    console.log('tabsstate contructor', this.tabs$);
  }
  ngxsAfterBootstrap(ctx?: StateContext<any>): void {
    console.log('tabsState.ngxsAfterBootstrap', ctx, ctx?.getState());
  }
  ngxsOnInit(ctx?: StateContext<any>) {
    var result = ctx?.getState();
    console.log('tabsState.ngxsOnInit', ctx, result, this.tabs$);
    this.tabs$?.subscribe(model => this.maintainLiveTabs(model));
  }
  ngxsOnChanges(change: NgxsSimpleChange<any>): void {
    console.log('tabsState.ngxsOnChanges', change);

  }
  @Action(AddTabAction)
  addTab(ctx: StateContext<TabStateModel>, action: AddTabAction) {
    const state = ctx.getState();
    action.tab.state = undefined;
    const newstate = { tabs: [...state.tabs, action.tab] };
    ctx.setState(newstate);
  }

  @Select((state: any) => state.tabs) tabs$?: Observable<TabStateModel>;

  livetabs$ = new BehaviorSubject<Map<ITabRecord, ITab>>(new Map<ITabRecord, ITab>());

  maintainLiveTabs(tabStateModel: TabStateModel) {
    console.log('maintainLiveTabs before', this.livetabs$);
    const oldlivetabs = this.livetabs$.value;
    const newlivetabs = new Map<ITabRecord, ITab>();
    tabStateModel.tabs.forEach(value => {
      if (oldlivetabs.has(value)) {
        // reuse existing instance
        newlivetabs.set(value, oldlivetabs.get(value)!);
      } else {
        // create
        if (value.userType === UserTypeEnum.game) {
          newlivetabs.set(value, this.gameService.dehydrateGame(value)!);
        } else {
          newlivetabs.set(value, this.playerService.dehydratePlayer(value)!);
        }
      }
    });
    this.livetabs$.next(newlivetabs);
  }
}
