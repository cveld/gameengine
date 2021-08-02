import { Component, OnInit } from '@angular/core';
import { TabManagerService } from '../services/tabmanager/tabmanager.service';

@Component({
  selector: 'app-tabcreator',
  templateUrl: './tabcreator.component.html',
  styleUrls: ['./tabcreator.component.scss']
})
export class TabcreatorComponent implements OnInit {

  constructor(private tabManagerService: TabManagerService) { }

  ngOnInit(): void {
  }

  createGameClicked() {
    this.tabManagerService.addTab('game');
  }

  createPlayerClicked() {
    this.tabManagerService.addTab('player');
  }

}
