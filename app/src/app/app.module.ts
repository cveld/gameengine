import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { TabmanagerComponent } from './tabmanager/tabmanager.component';
import { Player1Component } from './player1/player1.component';
import { TabcreatorComponent } from './tabcreator/tabcreator.component';
import { TabhostComponent } from './tabhost/tabhost.component';
import { Game1Component } from './game1/game1.component';

@NgModule({
  declarations: [
    AppComponent,
    TabmanagerComponent,
    Player1Component,
    TabcreatorComponent,
    TabhostComponent,
    Game1Component
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
