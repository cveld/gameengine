import { Component, ComponentFactoryResolver, OnInit, ViewContainerRef } from '@angular/core';
import { Select, Store } from '@ngxs/store';
import { Observable } from 'rxjs';
import { AddTab } from 'src/app/store/tabs.actions';
import { GameService } from '../../services/game/game.service';
import { PlayerService } from '../../services/player/player.service';
import { ITab } from '../../shared/ITab';

@Component({
  selector: 'app-tabcreator',
  templateUrl: './tabcreator.component.html',
  styleUrls: ['./tabcreator.component.scss']
})
export class TabcreatorComponent implements OnInit {

  constructor(
    private componentFactoryResolver: ComponentFactoryResolver,
    private gameService: GameService,
    private playerService: PlayerService,
    private viewContainerRef: ViewContainerRef,
    private store: Store
  ) { }

  ngOnInit(): void {
  }

  createGameClicked() {
    // let resolver = this.componentFactoryResolver.resolveComponentFactory(GameComponent);
    // this.viewContainerRef.createComponent(resolver);
    const tab = this.gameService.createGame();
    this.store.dispatch(new AddTab(tab));
  }

  createPlayerClicked() {
    const tab = this.playerService.createPlayer();
    this.store.dispatch(new AddTab(tab));
  }
}
