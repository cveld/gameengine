import * as signalR from "@microsoft/signalr";
import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { environment } from "../../../environments/environment";
import { ISignalrMessage } from "../../shared/signalrmodels";
@Injectable({
  providedIn: 'root',
})
export class SignalrService {
  connection: signalR.HubConnection;
  constructor(private httpClient: HttpClient) {
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

  handlers = new Map<string, (message: ISignalrMessage<any>) => void>();

  addHandler<T>(type: string, handler: (message: ISignalrMessage<T>) => void) {
    this.handlers.set(type, handler);
    this.connection.on(type, handler);
  }

  sendSignalrMessage<T>(message: ISignalrMessage<T>) {
    return this.httpClient.post(`${environment.apiBaseUrl}/api/messages`, {
          ...message
        });
  }

}
