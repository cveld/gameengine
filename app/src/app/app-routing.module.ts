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
  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
