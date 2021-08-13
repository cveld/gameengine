import { Injectable } from '@angular/core';
import { Guid } from 'guid-typescript';
import { IStateguidConsumer } from 'src/app/shared/IStateGuidConsumer';
import { UserTypeEnum } from 'src/app/shared/signalrmodels';
import { SignalrService } from '../signalr/SignalrService';

@Injectable()
export class Player1Service implements IStateguidConsumer {

  constructor(private signalr: SignalrService) {
    this.randomvalue = Math.random();
    signalr.sendSignalrMessage({
      type: 'join',
      usertype: UserTypeEnum.player
    }).subscribe();
  }

  guid?: Guid;

  setStateguid = (stateguid: Guid) => {
    this.guid = stateguid;
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
