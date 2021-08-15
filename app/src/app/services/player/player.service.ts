import { Injectable, Injector } from '@angular/core';
import { Guid } from 'guid-typescript';
import { Game1Component } from 'src/app/components/game1/game1.component';
import { Player1Component } from 'src/app/components/player1/player1.component';
import { IStateguidConsumer } from 'src/app/shared/IStateguidConsumer';
import { ITab } from 'src/app/shared/ITab';
import { ITabRecord } from 'src/app/shared/ITabRecord';
import { UserTypeEnum } from 'src/app/shared/signalrmodels';
import { Game1Service } from '../game1/game1.service';
import { Player1Service } from '../player1/player1.service';

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  dehydratePlayer(value: ITabRecord): ITab {
    const injector = Injector.create({
      parent: this.injector,
      providers: [{
        provide: Player1Service,
        //useClass: Player1Service,
        //deps: []
      }]
    });
    const instance = injector.get(Player1Service);
    (instance as IStateguidConsumer).setStateguid(value.stateguid);
    return {
      title: value.title,
      component: Player1Component,
      state: instance,
      stateguid: value.stateguid
    }
  }

  constructor(private injector: Injector) { }

  createPlayer() {
    const injector = Injector.create({
      parent: this.injector,
      providers: [{
        provide: Player1Service,
        //useClass: Player1Service,
        //deps: []
      }]
    });

    const guid = Guid.create();
    const tab : ITabRecord = {
      title: "Player",
      userType: UserTypeEnum.player,
      implementationName: 'Player1',
      stateguid: guid
    }
    return tab;
  }
}
