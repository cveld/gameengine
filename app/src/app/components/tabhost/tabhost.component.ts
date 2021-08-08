import { Component, ComponentFactoryResolver, ComponentRef, Injector, NgZone, OnInit, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { BehaviorSubject, Observable } from 'rxjs';
import { ITab } from 'src/app/shared/ITab';
import { TabsState } from 'src/app/store/tabs.state';
import { IStateConsumer } from '../../shared/IStateConsumer';
import { Game1Component } from '../game1/game1.component';

@Component({
  selector: 'app-tabhost',
  templateUrl: './tabhost.component.html',
  styleUrls: ['./tabhost.component.scss']
})
export class TabhostComponent implements OnInit {
  constructor(
    private injector: Injector,
    private viewContainerRef: ViewContainerRef,
    private componentFactoryResolver: ComponentFactoryResolver,
    private route: ActivatedRoute,
    private router: Router,
    private tabsState: TabsState,
    private ngzone: NgZone) {
      console.log('tabhost constructor');
     }

  currentComponentRef?: ComponentRef<unknown>;

  myevent = new Subject<ITab>();

  ngOnInit() {
    this.myevent.subscribe(tab => {
    });


    //this.myevent.complete();

    this.route.paramMap.subscribe(map => {
      if (this.currentComponentRef) {
        this.currentComponentRef.destroy();
      }

      const tabid = parseInt(map.get('tab')!);
      if (isNaN(tabid)) {
        console.log(`Could not parse tabid ${map.get('tab')}.`);
        this.router.navigate(['']);
        return;
      }

      this.tabsState.livetabs$?.subscribe(tabsModel => {
        const tabs = Array.from(tabsModel);
        if (tabid >= tabs.length) {
          console.log(`Tabid ${tabid} is larger than the available tabs.`);
          this.router.navigate(['']);
          return;
        }

        const [_, tab] = tabs[tabid];

        //let resolver = this.componentFactoryResolver.resolveComponentFactory(tab.component!);
        console.log('tab', tab);
        let resolver = this.componentFactoryResolver.resolveComponentFactory(tab.component);
        let componentRef = this.viewContainerRef.createComponent(resolver);
        this.currentComponentRef = componentRef;
        (componentRef.instance as IStateConsumer).setState(tab.state);
      });
    });


  } // ngOnInit
}
