import { Injectable, Injector } from '@angular/core';
import { Guid } from 'guid-typescript';
import { Game1Component } from 'src/app/components/game1/game1.component';
import { IStateguidConsumer } from '../../shared/IStateguidConsumer';
import { ITab } from 'src/app/shared/ITab';
import { ITabRecord } from 'src/app/shared/ITabRecord';
import { UserTypeEnum } from 'src/app/shared/signalrmodels';
import { Game1Service } from '../game1/game1.service';

@Injectable({
  providedIn: 'root'
})
export class GameService {

  constructor(private injector: Injector) { }

  createGame() {
    const injector = Injector.create({
      parent: this.injector,
      providers: [{
        provide: Game1Service,
        //useClass: Game1Service,
        //deps: []
      }]
    });
    //const instance = injector.get(Game1Service);
    const guid = Guid.create();
    const tab : ITabRecord = {
      title: "Game",
      userType: UserTypeEnum.game,
      implementationName: 'Game1',
      stateguid: guid
      //component: Game1Component,
      //state: instance
    }
    return tab;
  }

  dehydrateGame(tabRecord: ITabRecord) {
    const injector = Injector.create({
      parent: this.injector,
      providers: [{
        provide: Game1Service,
        //useClass: Game1Service,
        //deps: []
      }]
    });
    const instance = injector.get(Game1Service);
    (instance as IStateguidConsumer).setStateguid(tabRecord.stateguid);
    const tab : ITab = {
      title: tabRecord.title,
      component: Game1Component,
      state: instance,
      stateguid: tabRecord.stateguid
    }
    return tab;
  }
}
