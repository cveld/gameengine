import * as signalR from "@microsoft/signalr";
import { Value } from "./observable";
import type { SignalrMessage } from "./messages";

const API_BASE = "";

/**
 * One SignalR connection per page. Every client receives every message sent through
 * /api/messages; handlers filter on type, game id and connection id.
 */
export class SignalrClient {
  readonly connection: signalR.HubConnection;
  readonly state = new Value<signalR.HubConnectionState>(signalR.HubConnectionState.Disconnected);
  readonly lastError = new Value<string | undefined>(undefined);
  readonly log = new Value<string[]>([]);
  private restartTimer?: number;

  constructor() {
    this.connection = new signalR.HubConnectionBuilder()
      .withAutomaticReconnect()
      .withUrl(`${API_BASE}/api`)
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.connection.onreconnecting(error => {
      this.logLine(`Reconnecting: ${error?.message ?? ""}`);
      this.state.set(this.connection.state);
    });
    this.connection.onreconnected(() => {
      this.logLine("Reconnected");
      this.lastError.set(undefined);
      this.state.set(this.connection.state);
    });
    this.connection.onclose(error => {
      const message = error?.message ?? "connection closed";
      this.logLine(`Disconnected: ${message}`);
      this.lastError.set(message);
      this.state.set(this.connection.state);
      // Automatic reconnect gives up after a few attempts (e.g. a phone tab in
      // the background); keep trying so the connection always comes back.
      this.scheduleRestart();
    });

    // Back in the tab or online again: reconnect right away.
    document.addEventListener("visibilitychange", this.ensureConnected);
    window.addEventListener("online", this.ensureConnected);
    void this.start();
  }

  get connected(): boolean {
    return this.state.value === signalR.HubConnectionState.Connected;
  }

  private ensureConnected = () => {
    if (document.visibilityState === "hidden") return;
    if (this.connection.state === signalR.HubConnectionState.Disconnected) {
      window.clearTimeout(this.restartTimer);
      void this.start();
    }
  };

  private scheduleRestart() {
    window.clearTimeout(this.restartTimer);
    this.restartTimer = window.setTimeout(() => this.ensureConnected(), 3000);
  }

  start(): Promise<void> {
    if (this.connection.state !== signalR.HubConnectionState.Disconnected) return Promise.resolve();
    this.logLine("Connecting...");
    this.state.set(this.connection.state);
    return this.connection.start()
      .then(() => {
        this.logLine("Connected");
        this.lastError.set(undefined);
        this.state.set(this.connection.state);
      })
      .catch(error => {
        const message = error?.message ?? String(error);
        this.logLine(`Failed to connect: ${message}`);
        this.lastError.set(message);
        this.state.set(this.connection.state);
        this.scheduleRestart();
      });
  }

  private logLine(message: string) {
    const line = `${new Date().toLocaleTimeString()} - ${message}`;
    console.log(line);
    this.log.set([...this.log.value, line].slice(-50));
  }

  on<T>(type: string, handler: (message: SignalrMessage<T>) => void): () => void {
    this.connection.on(type, handler);
    return () => this.connection.off(type, handler);
  }

  /** Broadcasts a message to every connected client. */
  async send<T>(message: SignalrMessage<T>): Promise<void> {
    const response = await fetch(`${API_BASE}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    if (!response.ok) throw new HttpError(response.status, response.statusText, await response.text());
  }

  /** Calls negotiate directly so failures show the raw HTTP status and body. */
  async testNegotiate(): Promise<{ status: number; statusText: string; body: string }> {
    const response = await fetch(`${API_BASE}/api/negotiate`, { method: "POST" });
    const body = await response.text();
    if (!response.ok) throw new HttpError(response.status, response.statusText, body);
    return { status: response.status, statusText: response.statusText, body };
  }
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly statusText: string, readonly body: string) {
    super(`HTTP ${status} ${statusText}`);
  }
}

let shared: SignalrClient | undefined;

/** The page's SignalR client, created (and connected) on first use. */
export function signalr(): SignalrClient {
  if (!shared) shared = new SignalrClient();
  return shared;
}

export { signalR };
