import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabcreatorComponent } from './components/tabcreator/tabcreator.component';
import { TabhostComponent } from './components/tabhost/tabhost.component';
import { TabmanagerComponent } from './components/tabmanager/tabmanager.component';
import { DebugComponent } from './components/debugtab/debug.component';
import { HomeComponent } from './home/home.component';
import { MemoryComponent } from './memory/memory.component';
import { SimonComponent } from './simon/simon.component';
import { MazeComponent } from './maze/maze.component';
import { MazeRoomsComponent } from './maze-rooms/maze-rooms.component';
import { FlappyMuisComponent } from './flappy-muis/flappy-muis.component';
import { CoopComponent } from './coop/coop.component';
import { OrbitComponent } from './orbit/orbit.component';
import { OrbitDiagnosticsComponent } from './orbit/orbit-diagnostics.component';
import { OrbitChooserComponent } from './orbit-chooser/orbit-chooser.component';
import { OrbitCatchComponent } from './orbit-catch/orbit-catch.component';
const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'engine', component: TabmanagerComponent, children: [
      { path: 'create', component: TabcreatorComponent },
      { path: 'debug', component: DebugComponent },
      { path: 'tabs/:tab', component: TabhostComponent },
      { path: '**', redirectTo: 'create', pathMatch: 'full' }
    ]
  },
  { path: 'memory', component: MemoryComponent },
  { path: 'simon', component: SimonComponent },
  { path: 'maze', component: MazeComponent },
  { path: 'maze-rooms', component: MazeRoomsComponent },
  { path: 'flappy-muis', component: FlappyMuisComponent },
  { path: 'coop', component: CoopComponent },
  { path: 'orbit/diagnostics', component: OrbitDiagnosticsComponent },
  { path: 'orbit/classic', component: OrbitComponent },
  { path: 'orbit/catch', component: OrbitCatchComponent },
  { path: 'orbit', component: OrbitChooserComponent },
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
