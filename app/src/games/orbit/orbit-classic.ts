import { html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { PageElement } from "@/engine/element";
import { newPairingKey, normalizeKey, safeReport } from "./relay-protocol";
import { OrbitTelemetry } from "./telemetry";
import "./orbit.css";

// Classic Orbit: the static WebGL/WebXR viewer in a frame, plus the optional
// wireless diagnostics relay from the Quest to a PC.
@customElement("orbit-classic")
export class OrbitClassic extends PageElement {
  private relay = new OrbitTelemetry();
  @query("iframe") private frame?: HTMLIFrameElement;
  @state() private frameHeight = 800;
  @state() private wirelessKey = "";
  @state() private sharing = false;
  @state() private connecting = false;
  private latestReport = "";
  private relayTimer?: number;
  private expiresAt = 0;
  private lastRelay = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.watch(this.relay.status);
    window.addEventListener("message", this.onFrameMessage);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopSharing();
    window.removeEventListener("message", this.onFrameMessage);
  }

  private get monitorLink() {
    return window.location.origin + "/orbit/diagnostics#" + normalizeKey(this.wirelessKey);
  }

  private async startSharing() {
    if (this.connecting || this.sharing) return;
    if (!this.wirelessKey.trim()) this.wirelessKey = newPairingKey();
    this.connecting = true;
    try {
      if (!(await this.relay.connect(this.wirelessKey))) return;
      this.sharing = true;
      this.expiresAt = Date.now() + 15 * 60 * 1000;
      this.lastRelay = 0;
      this.publishLatest();
      this.relayTimer = window.setInterval(() => {
        this.frame?.contentWindow?.postMessage({ type: "orbit:request-report" }, window.location.origin);
        this.publishLatest();
      }, 1000);
    } catch {
      this.sharing = false;
    } finally {
      this.connecting = false;
    }
  }

  private publishLatest() {
    if (!this.sharing) return;
    if (Date.now() >= this.expiresAt) {
      this.stopSharing();
      return;
    }
    if (this.latestReport && Date.now() - this.lastRelay >= 1000) {
      this.lastRelay = Date.now();
      void this.relay.publish(this.latestReport);
    }
  }

  private async copyMonitorLink() {
    const field = this.querySelector<HTMLInputElement>("#orbit-monitor-url");
    try {
      await navigator.clipboard.writeText(this.monitorLink);
    } catch {
      field?.focus();
      field?.select();
      this.relay.status.set("Select and copy the private link manually");
    }
  }

  private stopSharing() {
    window.clearInterval(this.relayTimer);
    this.relay.disconnect();
    this.sharing = false;
    this.connecting = false;
  }

  private onFrameMessage = (event: MessageEvent) => {
    // Only the same-origin Orbit frame may resize or navigate this page.
    if (event.origin !== window.location.origin || !this.frame?.contentWindow || event.source !== this.frame.contentWindow) return;
    const data = event.data;
    if (data?.type === "orbit:back") {
      window.location.assign("/orbit");
    } else if (data?.type === "orbit:xr-report" && typeof data.report === "string") {
      try {
        this.latestReport = safeReport(data.report);
        this.publishLatest();
      } catch {
        /* Ignore invalid frame data. */
      }
    } else if (data?.type === "orbit:resize") {
      const height = data.height;
      if (typeof height === "number" && Number.isFinite(height) && height >= 200 && height <= 5000) this.frameHeight = Math.ceil(height);
    }
  };

  render() {
    return html`
      <div class="orbit-fit">
        <iframe src="/assets/orbit/index.html" title="Orbit — interactive 3D sculptures" class="orbit-fit-frame orbit-frame"
                style="height: ${this.frameHeight}px" allow="fullscreen; xr-spatial-tracking"></iframe>
        <details class="wireless-panel">
          <summary>Wireless XR diagnostics</summary>
          <div class="wireless-body">
            <p>Pair once before walking. Then keep this page open on the Quest and read reports on your PC without USB. Reports are encrypted before the existing SignalR relay; anyone with the key can read them. Sharing stops after 15 minutes. No room poses or remote controls.</p>
            <label>Pairing key <input .value=${this.wirelessKey} ?disabled=${this.sharing || this.connecting} maxlength="64" autocomplete="off" spellcheck="false"
                   placeholder="Paste a key from the PC console, or leave empty to generate"
                   @input=${(e: InputEvent) => (this.wirelessKey = (e.target as HTMLInputElement).value)}></label>
            <div class="wireless-actions">
              <button @click=${() => this.startSharing()} ?disabled=${this.sharing || this.connecting}>Start sharing</button>
              <button @click=${() => this.stopSharing()} ?disabled=${!this.sharing && !this.connecting}>Stop sharing</button>
              <a href="/orbit/diagnostics" target="_blank">Open PC console</a>
            </div>
            <p role="status">${this.relay.status.value}</p>
            ${this.sharing ? html`
              <label>PC link — keep private <input id="orbit-monitor-url" .value=${this.monitorLink} readonly aria-label="Private PC diagnostics link"></label>
              <button @click=${() => this.copyMonitorLink()}>Copy PC link</button>` : nothing}
          </div>
        </details>
      </div>`;
  }
}
