import { Injectable, Injector } from '@angular/core';
import { Game1Component } from 'src/app/game1/game1.component';
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
    const instance1 = injector.get(Game1Service);
    const val1 = instance1.getValue();
    const tab : ITab = {
      title: "Game",
      component: Game1Component,
      state: instance1
    }
    return tab;
  }
}
