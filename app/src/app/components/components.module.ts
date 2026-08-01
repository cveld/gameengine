import { CommonModule } from "@angular/common";
import { NgModule } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { AppRoutingModule } from "../app-routing.module";
import { CardComponent } from "../card/card.component";
import { Game1Component } from "../game1/game1/game1.component";
import { Player1Component } from "../game1/player1/player1.component";
import { TabcreatorComponent } from "./tabcreator/tabcreator.component";
import { TabhostComponent } from "./tabhost/tabhost.component";
import { TabmanagerComponent } from "./tabmanager/tabmanager.component";
import { DebugComponent } from "./debugtab/debug.component";
import { HomeComponent } from "../home/home.component";
import { MemoryComponent } from "../memory/memory.component";
import { SimonComponent } from "../simon/simon.component";

@NgModule({
  declarations: [
    TabmanagerComponent,
    Player1Component,
    TabcreatorComponent,
    TabhostComponent,
    Game1Component,
    CardComponent,
    DebugComponent,
    HomeComponent,
    MemoryComponent,
    SimonComponent
  ],
  imports: [
    AppRoutingModule,
    CommonModule,
    FormsModule
  ]
})
export class ComponentsModule { }
