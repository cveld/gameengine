import { Component, ComponentFactoryResolver, ComponentRef, Injector, OnInit, ViewContainerRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TabManagerService } from '../services/tabmanager/tabmanager.service';
import { IStateConsumer } from '../shared/IStateConsumer';

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
    private tabManagerService: TabManagerService) { }

  currentComponentRef?: ComponentRef<unknown>;
  ngOnInit() {
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
      if (tabid >= this.tabManagerService.tabs$.value.length) {
        console.log(`Tabid ${tabid} is larger than the available tabs.`);
        this.router.navigate(['']);
        return;
      }
      const tab = this.tabManagerService.tabs$.value[tabid];

      let resolver = this.componentFactoryResolver.resolveComponentFactory(tab.component!);
      let componentRef = this.viewContainerRef.createComponent(resolver);
      this.currentComponentRef = componentRef;
      (componentRef.instance as IStateConsumer).setState(tab.state);

    });
  }
}
