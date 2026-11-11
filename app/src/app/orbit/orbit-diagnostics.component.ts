import { Component, OnDestroy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { newPairingKey, normalizeKey } from './orbit-relay-protocol';
import { OrbitTelemetryService } from './orbit-telemetry.service';

@Component({
  selector: 'app-orbit-diagnostics',
  templateUrl: './orbit-diagnostics.component.html',
  styleUrls: ['./orbit-diagnostics.component.scss']
})
export class OrbitDiagnosticsComponent implements OnDestroy {
  key = '';
  connected = false;
  connecting = false;
  report = '';
  receivedAt = 0;
  now = Date.now();
  status = 'Not connected';
  handStatus = 'No XR report received';
  private subscriptions = new Subscription();
  private timer = window.setInterval(() => this.now = Date.now(), 1000);
  constructor(route: ActivatedRoute, private relay: OrbitTelemetryService) {
    const fragment = normalizeKey(route.snapshot.fragment || '');
    if (/^[a-f0-9]{32}$/.test(fragment)) this.key = fragment;
    this.subscriptions.add(relay.status$.subscribe(value => this.status = value));
    this.subscriptions.add(relay.report$.subscribe(value => {
      if (value) {
        this.report = value.report; this.receivedAt = value.receivedAt;
        const attempt = JSON.parse(value.report).attempt;
        const granted = attempt?.enabledFeatures === null ? 'unknown' :
          attempt?.enabledFeatures?.includes('hand-tracking') ? 'granted' : 'not granted';
        const sample = attempt?.handSample;
        this.handStatus = 'Hand feature: ' + granted + ' | ' + (attempt?.profile || 'no session') +
          (sample ? ' | Sources: ' + sample.sources + ' | Valid hands: ' + sample.validHands +
            ' | Near object: ' + sample.nearbyHands + ' | Emulated joints: ' + sample.emulatedJoints : ' | No current hand samples');
      }
    }));
  }
  generate() { if (!this.connected) this.key = newPairingKey(); }
  async copyKey() {
    try { await navigator.clipboard.writeText(this.key); }
    catch {
      const field = document.getElementById('orbit-pairing-key') as HTMLInputElement | null;
      field?.focus(); field?.select(); this.status = 'Copy the selected pairing key manually';
    }
  }
  async connect() {
    if (this.connecting || this.connected) return;
    this.connecting = true;
    try { this.connected = await this.relay.connect(this.key); }
    catch { this.connected = false; }
    finally { this.connecting = false; }
  }
  disconnect() { this.relay.disconnect(); this.connected = false; }
  get age() { return this.receivedAt ? Math.max(0, Math.floor((this.now - this.receivedAt) / 1000)) : null; }
  ngOnDestroy() { clearInterval(this.timer); this.disconnect(); this.subscriptions.unsubscribe(); }
}
