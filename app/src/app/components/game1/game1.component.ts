import { Component, OnInit } from '@angular/core';
import { Store } from '@ngxs/store';
import { Observable } from 'rxjs';
import { TabsState } from 'src/app/store/tabs/tabs.state';
import { UpdateUserStateAction } from 'src/app/store/userstate/userstate.actions';
import { Game1Service } from '../../services/game1/game1.service';
import { SignalrService } from '../../services/signalr/SignalrService';
import { IStateConsumer } from '../../shared/IStateConsumer';

@Component({
  selector: 'app-game1',
  templateUrl: './game1.component.html',
  styleUrls: ['./game1.component.scss']
})
export class Game1Component implements OnInit {

  constructor(private store: Store, private tabsState: TabsState) {
    this.value = Math.random();
    console.log('game1component constructed');
  }
  game1Service?: Game1Service;
  setState: (state: Game1Service) => void = (state) => {
    this.value = state.randomvalue;
    this.game1Service = state;
    this.state$ = state.state$;
  }

  state$?: Observable<any>;

  ngOnInit(): void {
  }

  value: Number;

  startGameClicked() {
    this.game1Service!.startGame();
  }
}
