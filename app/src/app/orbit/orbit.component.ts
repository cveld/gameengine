import { Component, ElementRef, HostListener, OnDestroy, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { newPairingKey, normalizeKey, safeReport } from './orbit-relay-protocol';
import { OrbitTelemetryService } from './orbit-telemetry.service';

@Component({
  selector: 'app-orbit',
  templateUrl: './orbit.component.html',
  styleUrls: ['./orbit.component.scss']
})
export class OrbitComponent implements OnDestroy {
  readonly orbitUrl: SafeResourceUrl;
  frameHeight = 800;
  wirelessKey = '';
  sharing = false;
  connecting = false;
  wirelessStatus = 'Not sharing';
  private latestReport = '';
  private relayTimer?: number;
  private expiresAt = 0;
  private lastRelay = 0;
  private subscription: Subscription;

  @ViewChild('orbitFrame') private orbitFrame?: ElementRef<HTMLIFrameElement>;

  constructor(sanitizer: DomSanitizer, private relay: OrbitTelemetryService) {
    this.orbitUrl = sanitizer.bypassSecurityTrustResourceUrl('assets/orbit/index.html');
    this.subscription = relay.status$.subscribe(value => this.wirelessStatus = value);
  }
  get monitorLink() { return window.location.origin + '/orbit/diagnostics#' + normalizeKey(this.wirelessKey); }
  async startSharing() {
    if (this.connecting || this.sharing) return;
    if (!this.wirelessKey.trim()) this.wirelessKey = newPairingKey();
    this.connecting = true;
    try {
      if (!await this.relay.connect(this.wirelessKey)) return;
      this.sharing = true;
      this.expiresAt = Date.now() + 15 * 60 * 1000;
      this.lastRelay = 0;
      this.publishLatest();
      this.relayTimer = window.setInterval(() => {
        this.orbitFrame?.nativeElement.contentWindow?.postMessage({ type: 'orbit:request-report' }, window.location.origin);
        this.publishLatest();
      }, 1000);
    } catch { this.sharing = false; }
    finally { this.connecting = false; }
  }
  private publishLatest() {
    if (!this.sharing) return;
    if (Date.now() >= this.expiresAt) { this.stopSharing(); return; }
    if (this.latestReport && Date.now() - this.lastRelay >= 1000) {
      this.lastRelay = Date.now(); void this.relay.publish(this.latestReport);
    }
  }
  async copyMonitorLink() {
    const field = document.getElementById('orbit-monitor-url') as HTMLInputElement | null;
    try { await navigator.clipboard.writeText(this.monitorLink); }
    catch { field?.focus(); field?.select(); this.wirelessStatus = 'Select and copy the private link manually'; }
  }
  stopSharing() {
    clearInterval(this.relayTimer); this.relay.disconnect();
    this.sharing = false; this.connecting = false;
  }
  ngOnDestroy() { this.stopSharing(); this.subscription.unsubscribe(); }

  @HostListener('window:message', ['$event'])
  onFrameMessage(event: MessageEvent): void {
    // Only the same-origin Orbit frame may resize this page.
    if (event.origin !== window.location.origin ||
        !this.orbitFrame?.nativeElement.contentWindow ||
        event.source !== this.orbitFrame.nativeElement.contentWindow) {
      return;
    }
    if (event.data?.type === 'orbit:xr-report' && typeof event.data.report === 'string') {
      try { this.latestReport = safeReport(event.data.report); this.publishLatest(); } catch { /* Ignore invalid frame data. */ }
      return;
    }
    if (event.data?.type !== 'orbit:resize') return;
    const height = event.data.height;
    if (typeof height === 'number' && Number.isFinite(height) && height >= 200 && height <= 5000) {
      this.frameHeight = Math.ceil(height);
    }
  }
}
