import { Component, OnInit } from '@angular/core';
import { TabsState } from 'src/app/store/tabs.state';

@Component({
  selector: 'app-tabmanager',
  templateUrl: './tabmanager.component.html',
  styleUrls: ['./tabmanager.component.scss']
})
export class TabmanagerComponent implements OnInit {

  constructor(private tabsState: TabsState) {
    console.log('TabmanagerComponent constructed')
  }

  tabs$ = this.tabsState.livetabs$;

  ngOnInit(): void {
    this.tabs$?.subscribe(tabs => {
      console.log('tabs$ subscribe', tabs);
    })
  }

}
