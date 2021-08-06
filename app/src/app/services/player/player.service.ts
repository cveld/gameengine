import { Injectable, Injector } from '@angular/core';
import { Game1Component } from 'src/app/components/game1/game1.component';
import { Player1Component } from 'src/app/components/player1/player1.component';
import { ITab } from 'src/app/shared/ITab';
import { Game1Service } from '../game1/game1.service';
import { Player1Service } from '../player1/player1.service';

@Injectable({
  providedIn: 'root'
})
export class PlayerService {

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
    //const instance = injector.get(Player1Service);
    const tab : ITab = {
      title: "Player",
      component: Player1Component,
      //state: instance
    }
    return tab;
  }
}
