import { Component, OnInit } from '@angular/core';
import { TabManagerService } from '../services/tabmanager/tabmanager.service';

@Component({
  selector: 'app-tabmanager',
  templateUrl: './tabmanager.component.html',
  styleUrls: ['./tabmanager.component.scss']
})
export class TabmanagerComponent implements OnInit {

  constructor(private tabManagerService: TabManagerService) { }

  tabs$ = this.tabManagerService.tabs$;

  ngOnInit(): void {
  }

}
