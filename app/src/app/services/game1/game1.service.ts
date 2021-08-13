import { Injectable } from '@angular/core';
import { Store } from '@ngxs/store';
import { TabsState } from 'src/app/store/tabs/tabs.state';
import { UpdateUserStateAction } from 'src/app/store/userstate/userstate.actions';
import { SignalrService } from '../signalr/SignalrService';
import { Guid } from "guid-typescript";
import { IStateguidConsumer } from '../../shared/IStateGuidConsumer';
import { UserStateState } from 'src/app/store/userstate/userstate.state';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { IUserState } from 'src/app/shared/IUserState';
@Injectable()
export class Game1Service implements IStateguidConsumer {
  startGame() {
    const index = this.tabsState.statetotabindexmap.get(this)!;
    this.store.dispatch(new UpdateUserStateAction(this.guid!, { started: true }));
  }

  guid?: Guid;
  state$ = this.store.select(UserStateState.userstate).pipe(map(filterFn => filterFn(this.guid)));

  constructor(
    private signalr: SignalrService,
    private tabsState: TabsState,
    private userState: UserStateState,
    private store: Store) {
    this.randomvalue = Math.random();
    this.signalr.addHandler('join', () => this.joinGame());
  }
  setStateguid = (stateguid: Guid) => {
    this.guid = stateguid;
  }

  messages: string[] = [];
  value?: string;
  randomvalue: Number;
  setValue(value: string) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }

  joinGame() {
    console.log('join game');
    this.messages.push('join game');
  }

}
