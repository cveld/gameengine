import { Component, OnDestroy, OnInit } from '@angular/core';
import { Guid } from 'guid-typescript';
import { Observable } from 'rxjs';
import { Player1Service } from 'src/app/game1/player1/player1.service';
import { IPlayer1State } from '../shared/player1.models';

@Component({
  selector: 'app-player1',
  templateUrl: './player1.component.html',
  styleUrls: ['./player1.component.scss']
})
export class Player1Component implements OnInit, OnDestroy {

  constructor() { }
  ngOnDestroy(): void {
    console.log(`Player1Component[${this.player1Service?.guid}].ngOnDestroy`);
  }

  ngOnInit(): void {
  }

  player1Service?: Player1Service;
  state$?: Observable<IPlayer1State>;
  setState(state: Player1Service) {
    this.player1Service = state;
    this.games =  this.player1Service.games;
    this.state$ = this.player1Service.state$;
  }

  games: Map<string, string> = new Map<string, string>();

  queryGames() {
    this.player1Service?.queryGames();
  }

  join(guidstr: string) {
    const guid = Guid.parse(guidstr);
    this.player1Service?.joinGame(guid);
  }
}
