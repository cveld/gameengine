import * as signalR from "@microsoft/signalr";
import { Injectable } from "@angular/core";
import { environment } from "../../environments/environment";
@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  connection: signalR.HubConnection;
  constructor() {
    this.connection = new signalR.HubConnectionBuilder()
    .withUrl(`${environment.apiBaseUrl}/api`)
    // .withUrl(`${apiBaseUrl}/api`, { headers: {
    //   ...
    // }})
    .configureLogging(signalR.LogLevel.Information)
    .build();
    console.log('Connecting...');
    this.connection.start();
  }


}
