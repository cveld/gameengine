import { Component, OnInit } from '@angular/core';
import { TabsState } from 'src/app/store/tabs.state';

@Component({
  selector: 'app-tabmanager',
  templateUrl: './tabmanager.component.html',
  styleUrls: ['./tabmanager.component.scss']
})
export class TabmanagerComponent implements OnInit {

  constructor(private tabsState: TabsState) { }

  tabs$ = this.tabsState.tabs$;

  ngOnInit(): void {
  }

}
