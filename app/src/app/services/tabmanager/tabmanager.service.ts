import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ITab } from '../../shared/ITab';

@Injectable()
export class TabManager2Service {
  tabs$: BehaviorSubject<ReadonlyArray<ITab>>;
  constructor() {
    this.tabs$ = new BehaviorSubject<ReadonlyArray<ITab>>([]);
    console.log('TabManagerService constructed');
  }
  addTab(tab: ITab) {
    this.tabs$.next(this.tabs$.value.concat(tab));
  }
}
