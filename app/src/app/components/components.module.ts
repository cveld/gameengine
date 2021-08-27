import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { AppRoutingModule } from "../app-routing.module";
import { CardComponent } from "../card/card.component";
import { Game1Component } from "../game1/game1/game1.component";
import { Player1Component } from "../game1/player1/player1.component";
import { TabcreatorComponent } from "./tabcreator/tabcreator.component";
import { TabhostComponent } from "./tabhost/tabhost.component";
import { TabmanagerComponent } from "./tabmanager/tabmanager.component";

@NgModule({
  declarations: [
    TabmanagerComponent,
    Player1Component,
    TabcreatorComponent,
    TabhostComponent,
    Game1Component,
    CardComponent
  ],
  imports: [
    AppRoutingModule,
    CommonModule
  ]
})
export class ComponentsModule { }
