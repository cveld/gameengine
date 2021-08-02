import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ITab } from '../../shared/ITab';

@Injectable({
  providedIn: 'root'
})
export class TabManagerService {
  tabs$: BehaviorSubject<ReadonlyArray<ITab>> = new BehaviorSubject<ReadonlyArray<ITab>>([]);
  constructor() { }
  addTab(title: string) {
    this.tabs$.next(this.tabs$.value.concat({title: title}));
  }
}
