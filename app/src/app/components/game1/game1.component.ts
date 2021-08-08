import { Component, OnInit } from '@angular/core';
import { Game1Service } from '../../services/game1/game1.service';
import { SignalrService } from '../../services/signalr/SignalrService';
import { IStateConsumer } from '../../shared/IStateConsumer';

@Component({
  selector: 'app-game1',
  templateUrl: './game1.component.html',
  styleUrls: ['./game1.component.scss']
})
export class Game1Component implements OnInit {

  constructor() {
    this.value = Math.random();
    console.log('game1component constructed');
  }
  game1Service?: Game1Service;
  setState: (state: Game1Service) => void = (state) => {
    this.value = state.randomvalue;
    this.game1Service = state;
  }

  ngOnInit(): void {
  }

  value: Number;
}
