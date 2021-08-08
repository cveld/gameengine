import { enableProdMode, NgModule, NgModuleRef } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { StateStream } from '@ngxs/store';

if (environment.production) {
  enableProdMode();
}

declare global {
  interface Window {
    ngRef: NgModuleRef<AppModule>;
    ngStateStream: any;
  }
}



platformBrowserDynamic().bootstrapModule(AppModule).then(ref => {
  if (environment.production) {
    return
  }

  ref.onDestroy(() => {
    console.log('PlatformRef is destroyed', ref);
  })
  // Ensure Angular destroys itself on hot reloads.
  let oldState = window.ngStateStream;
  console.log(window.ngStateStream);
  // if (window['ngRef'] && !(window['ngRef'] as any).destroyed) {
  //   oldState = window['ngRef'].injector.get(StateStream, null);
  //   window['ngRef'].destroy();
  // }

  const newState = ref.injector.get(StateStream, null);
  // window['ngRef'] = ref;
  window.ngStateStream = newState;
  // ref.onDestroy(() => {
  //   console.log('destroyed');
  //   (window['ngRef'] as any).destroyed = true;
  // });

  if (oldState && newState) {
    const merged = {
      ...newState.getValue(),
      ...oldState.getValue()
    };
    console.log('Before newState.next');
    newState.next(merged);
    console.log('After newState.next');
  }

// Otherwise, log the boot error
})
  .catch(err => console.error(err));
