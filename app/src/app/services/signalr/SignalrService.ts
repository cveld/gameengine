import * as signalR from "@microsoft/signalr";
import { Injectable, OnDestroy } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject } from "rxjs";
import { environment } from "../../../environments/environment";
import { ISignalrMessage } from "../../shared/signalrmodels";
@Injectable({
  providedIn: 'root',
})
export class SignalrService implements OnDestroy {
  connection: signalR.HubConnection;

  state$ = new BehaviorSubject<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected);
  lastError$ = new BehaviorSubject<string | undefined>(undefined);
  log$ = new BehaviorSubject<string[]>([]);

  constructor(private httpClient: HttpClient) {
    this.connection = new signalR.HubConnectionBuilder()
    .withAutomaticReconnect()
    .withUrl(`${environment.apiBaseUrl}/api`)
    .configureLogging(signalR.LogLevel.Information)
    .build();

    this.connection.onreconnecting(error => {
      this.logLine(`Reconnecting: ${error?.message ?? ''}`);
      this.state$.next(this.connection.state);
    });
    this.connection.onreconnected(() => {
      this.logLine('Reconnected');
      this.lastError$.next(undefined);
      this.state$.next(this.connection.state);
    });
    this.connection.onclose(error => {
      const message = error?.message ?? 'connection closed';
      this.logLine(`Disconnected: ${message}`);
      this.lastError$.next(message);
      this.state$.next(this.connection.state);
    });

    this.start();
  }

  ngOnDestroy(): void {
    this.connection.stop();
  }

  start() {
    this.logLine('Connecting...');
    this.state$.next(this.connection.state);
    return this.connection.start()
      .then(() => {
        this.logLine('Connected');
        this.lastError$.next(undefined);
        this.state$.next(this.connection.state);
      })
      .catch(error => {
        const message = error?.message ?? String(error);
        this.logLine(`Failed to connect: ${message}`);
        this.lastError$.next(message);
        this.state$.next(this.connection.state);
      });
  }

  private logLine(message: string) {
    const line = `${new Date().toLocaleTimeString()} - ${message}`;
    console.log(line);
    this.log$.next([...this.log$.value, line].slice(-50));
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

  // Bypasses the SignalR client so failures surface the raw HTTP status/body
  // instead of the client's generic "failed to negotiate" error.
  testNegotiate() {
    return this.httpClient.post(`${environment.apiBaseUrl}/api/negotiate`, {}, { observe: 'response' as const });
  }
}
