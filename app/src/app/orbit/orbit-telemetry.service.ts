import { Injectable, Injector } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { HubConnectionState } from '@microsoft/signalr';
import { SignalrService } from '../services/signalr/SignalrService';
import { ISignalrMessage, UserTypeEnum } from '../shared/signalrmodels';
import { createReportCodec, EncryptedReport, newPairingKey, ORBIT_REPORT_EVENT } from './orbit-relay-protocol';

@Injectable({ providedIn: 'root' })
export class OrbitTelemetryService {
  readonly status$ = new BehaviorSubject('Not connected');
  readonly report$ = new BehaviorSubject<{ report: string; receivedAt: number } | null>(null);
  private signalr?: SignalrService;
  private codec?: AwaitedCodec;
  private generation = 0;
  private sequence = 0;
  private source = newPairingKey();
  private busy = false;
  private subscriptions = new Subscription();
  private seen = new Map<string, number>();
  constructor(private injector: Injector) {}

  async connect(key: string) {
    this.disconnect();
    const generation = this.generation;
    this.status$.next('Preparing encrypted diagnostics');
    try {
      const codec = await createReportCodec(key);
      if (generation !== this.generation) return false;
      this.codec = codec;
      this.signalr = this.injector.get(SignalrService);
      this.signalr.addHandler<EncryptedReport>(ORBIT_REPORT_EVENT, this.receive);
      this.subscriptions = new Subscription();
      this.subscriptions.add(this.signalr.state$.subscribe(state => this.status$.next(
        state === HubConnectionState.Connected ? 'Connected; waiting for diagnostics' : 'SignalR: ' + state)));
      this.subscriptions.add(this.signalr.lastError$.subscribe(error => {
        if (error) this.status$.next('Connection error: ' + error.slice(0, 160));
      }));
      return true;
    } catch (error) {
      this.status$.next(error instanceof Error ? error.message : 'Could not connect diagnostics');
      throw error;
    }
  }

  async publish(report: string) {
    if (!this.codec || !this.signalr || this.busy || this.signalr.state$.value !== HubConnectionState.Connected) return;
    const generation = this.generation, codec = this.codec;
    this.busy = true;
    try {
      const payload = await codec.seal(report, this.source, this.sequence++);
      if (generation !== this.generation) return;
      this.subscriptions.add(this.signalr.sendSignalrMessage({
        type: ORBIT_REPORT_EVENT, gameid: codec.room, connectionid: this.source,
        usertype: UserTypeEnum.undefined, payload
      }).subscribe({
        next: () => this.status$.next('Encrypted report sent'),
        error: () => this.status$.next('Diagnostic delivery failed')
      }));
    } catch { this.status$.next('Diagnostic report could not be encrypted'); }
    finally { if (generation === this.generation) this.busy = false; }
  }

  private receive = async (message: ISignalrMessage<EncryptedReport>) => {
    const codec = this.codec, generation = this.generation;
    if (!codec || message.gameid !== codec.room || message.connectionid === this.source || !message.payload) return;
    try {
      const result = await codec.open(message.payload);
      if (generation !== this.generation || result.sequence <= (this.seen.get(result.source) ?? -1)) return;
      if (!this.seen.has(result.source) && this.seen.size >= 8) return;
      this.seen.set(result.source, result.sequence);
      this.report$.next({ report: result.report, receivedAt: Date.now() });
      this.status$.next('Live diagnostics received');
    } catch { /* Untrusted broadcasts from other clients cannot become diagnostics. */ }
  };

  disconnect() {
    this.generation++; this.busy = false; this.codec = undefined; this.seen.clear();
    this.subscriptions.unsubscribe();
    this.signalr?.removeHandler(ORBIT_REPORT_EVENT, this.receive);
    this.report$.next(null); this.status$.next('Not connected');
  }
}
type AwaitedCodec = ReturnType<typeof createReportCodec> extends Promise<infer T> ? T : never;
