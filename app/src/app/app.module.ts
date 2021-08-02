import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { TabmanagerComponent } from './tabmanager/tabmanager.component';
import { GameComponent } from './game/game.component';
import { PlayerComponent } from './player/player.component';
import { TabcreatorComponent } from './tabcreator/tabcreator.component';

@NgModule({
  declarations: [
    AppComponent,
    TabmanagerComponent,
    GameComponent,
    PlayerComponent,
    TabcreatorComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
