import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PageElement } from "@/engine/element";
import { newPairingKey, normalizeKey } from "./relay-protocol";
import { OrbitTelemetry } from "./telemetry";
import "./orbit.css";

// PC console that receives the encrypted XR reports from a Quest running Orbit.
@customElement("orbit-diagnostics")
export class OrbitDiagnostics extends PageElement {
  private relay = new OrbitTelemetry();
  @state() private key = "";
  @state() private connected = false;
  @state() private connecting = false;
  @state() private now = Date.now();
  @state() private handStatus = "No XR report received";
  private timer?: number;

  connectedCallback(): void {
    super.connectedCallback();
    const fragment = normalizeKey(window.location.hash.slice(1));
    if (/^[a-f0-9]{32}$/.test(fragment)) this.key = fragment;
    this.watch(this.relay.status);
    this.track(this.relay.report.subscribe(value => {
      if (!value) return;
      try {
        const attempt = JSON.parse(value.report).attempt;
        const granted = attempt?.enabledFeatures === null ? "unknown" : attempt?.enabledFeatures?.includes("hand-tracking") ? "granted" : "not granted";
        const sample = attempt?.handSample;
        this.handStatus = "Hand feature: " + granted + " | " + (attempt?.profile || "no session") +
          (sample ? " | Sources: " + sample.sources + " | Valid hands: " + sample.validHands +
            " | Near object: " + sample.nearbyHands + " | Emulated joints: " + sample.emulatedJoints : " | No current hand samples");
      } catch {
        /* reports are validated by the relay */
      }
    }));
    this.timer = window.setInterval(() => (this.now = Date.now()), 1000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this.timer);
    this.disconnect();
  }

  private generate() {
    if (!this.connected) this.key = newPairingKey();
  }

  private async copyKey() {
    try {
      await navigator.clipboard.writeText(this.key);
    } catch {
      const field = this.querySelector<HTMLInputElement>("#orbit-pairing-key");
      field?.focus();
      field?.select();
      this.relay.status.set("Copy the selected pairing key manually");
    }
  }

  private async connect() {
    if (this.connecting || this.connected) return;
    this.connecting = true;
    try {
      this.connected = await this.relay.connect(this.key);
    } catch {
      this.connected = false;
    } finally {
      this.connecting = false;
    }
  }

  private disconnect() {
    this.relay.disconnect();
    this.connected = false;
  }

  render() {
    const report = this.relay.report.value;
    const age = report ? Math.max(0, Math.floor((this.now - report.receivedAt) / 1000)) : null;
    return html`
      <main class="diagnostics">
        <h1>Orbit wireless diagnostics</h1>
        <p>Use the same pairing key on the Quest Orbit page. Reports contain feature grants and hand-pose counts, not room coordinates. This console is read-only.</p>
        <label>Pairing key <input id="orbit-pairing-key" .value=${this.key} ?readonly=${this.connected || this.connecting} maxlength="64" autocomplete="off" spellcheck="false"
               @input=${(e: InputEvent) => (this.key = (e.target as HTMLInputElement).value)}></label>
        <div class="actions">
          <button @click=${() => this.generate()} ?disabled=${this.connected || this.connecting}>Generate key</button>
          <button @click=${() => this.copyKey()} ?disabled=${!this.key}>Copy key</button>
          <button @click=${() => this.connect()} ?disabled=${this.connected || this.connecting}>Connect</button>
          <button @click=${() => this.disconnect()} ?disabled=${!this.connected && !this.connecting}>Disconnect</button>
          <a href="/orbit">Back to Orbit</a>
        </div>
        <p role="status">${this.relay.status.value}</p>
        <p><strong>${this.handStatus}</strong></p>
        ${age !== null ? html`<p>Last report: ${age} seconds ago ${age > 5 ? html`<strong>— stale; check the Quest or connection</strong>` : nothing}</p>` : nothing}
        <label>Latest XR report <textarea .value=${report?.report ?? ""} readonly rows="22" spellcheck="false"></textarea></label>
        <p>The relay uses the existing game SignalR service. Reports are encrypted with the pairing key before sending. Anyone holding that key can read them; do not share it publicly. No remote controls or stored history.</p>
      </main>`;
  }
}
