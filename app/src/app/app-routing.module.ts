import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabcreatorComponent } from './tabcreator/tabcreator.component';
import { TabhostComponent } from './tabhost/tabhost.component';
import { TabmanagerComponent } from './tabmanager/tabmanager.component';
const routes: Routes = [
  {
    path: '', component: TabmanagerComponent, children: [
      { path: 'create', component: TabcreatorComponent },
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
