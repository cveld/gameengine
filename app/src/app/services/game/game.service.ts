import { Injectable, Injector } from '@angular/core';
import { Game1Component } from 'src/app/components/game1/game1.component';
import { ITab } from 'src/app/shared/ITab';
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
    const tab : ITab = {
      title: "Game",
      component: Game1Component,
      //state: instance
    }
    return tab;
  }
}
