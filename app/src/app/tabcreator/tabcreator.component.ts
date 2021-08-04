import { Component, ComponentFactoryResolver, OnInit, ViewContainerRef } from '@angular/core';
import { GameService } from '../services/game/game.service';
import { PlayerService } from '../services/player/player.service';
import { TabManagerService } from '../services/tabmanager/tabmanager.service';
import { ITab } from '../shared/ITab';

@Component({
  selector: 'app-tabcreator',
  templateUrl: './tabcreator.component.html',
  styleUrls: ['./tabcreator.component.scss']
})
export class TabcreatorComponent implements OnInit {

  constructor(
    private tabManagerService: TabManagerService,
    private componentFactoryResolver: ComponentFactoryResolver,
    private gameService: GameService,
    private playerService: PlayerService,
    private viewContainerRef: ViewContainerRef
  ) { }

  ngOnInit(): void {
  }

  createGameClicked() {
    // let resolver = this.componentFactoryResolver.resolveComponentFactory(GameComponent);
    // this.viewContainerRef.createComponent(resolver);
    const tab = this.gameService.createGame();
    this.tabManagerService.addTab(tab);
  }

  createPlayerClicked() {
    const tab = this.playerService.createPlayer();
    this.tabManagerService.addTab(tab);
  }

}
