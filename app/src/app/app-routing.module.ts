import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabcreatorComponent } from './components/tabcreator/tabcreator.component';
import { TabhostComponent } from './components/tabhost/tabhost.component';
import { TabmanagerComponent } from './components/tabmanager/tabmanager.component';
import { DebugComponent } from './components/debugtab/debug.component';
const routes: Routes = [
  {
    path: '', component: TabmanagerComponent, children: [
      { path: 'create', component: TabcreatorComponent },
      { path: 'debug', component: DebugComponent },
      { path: 'tabs/:tab', component: TabhostComponent },
      { path: '**', redirectTo: 'create', pathMatch: 'full' }
    ]
  },
  // { path: '', redirectTo: 'tabs/create', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
