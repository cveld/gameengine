import { Injectable } from '@angular/core';
import { SignalrService } from '../signalr/SignalrService';

@Injectable()
export class Game1Service {

  constructor(private signalr: SignalrService) {
    this.randomvalue = Math.random();
    this.signalr.addHandler('join', () => this.joinGame());
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
