import { Component, OnInit } from '@angular/core';
import { SignalrService } from '../services/signalr/SignalrService';
import { IStateConsumer } from '../shared/IStateConsumer';

@Component({
  selector: 'app-game1',
  templateUrl: './game1.component.html',
  styleUrls: ['./game1.component.scss']
})
export class Game1Component implements OnInit, IStateConsumer {

  constructor() {
    this.value = Math.random();
  }
  setState: (state: any) => void = (state) => {
    this.value = state.randomvalue;
  }

  ngOnInit(): void {
  }

  value: Number;
}
