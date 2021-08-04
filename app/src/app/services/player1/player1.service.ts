import { Injectable } from '@angular/core';
import { UserTypeEnum } from 'src/app/shared/signalrmodels';
import { SignalrService } from '../signalr/SignalrService';

@Injectable()
export class Player1Service {

  constructor(private signalr: SignalrService) {
    this.randomvalue = Math.random();
    signalr.sendSignalrMessage({
      type: 'join',
      usertype: UserTypeEnum.player
    }).subscribe();
  }

  value?: string;
  randomvalue: Number;
  setValue(value: string) {
    this.value = value;
  }

  getValue() {
    return this.value;
  }
}
