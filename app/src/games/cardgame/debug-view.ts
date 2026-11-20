import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PageElement } from "@/engine/element";
import { UserType, type SignalrMessage } from "@/engine/messages";
import { HttpError, signalr } from "@/engine/signalr";

interface CallResult {
  success: boolean;
  status?: number;
  statusText?: string;
  body?: string;
}

const RECEIVE_TIMEOUT_MS = 8000;

function toCallResult(error: unknown): CallResult {
  if (error instanceof HttpError) return { success: false, status: error.status, statusText: error.statusText, body: error.body };
  return { success: false, body: error instanceof Error ? error.message : String(error) };
}

// SignalR diagnostics for the card-game engine.
@customElement("engine-debug")
export class EngineDebug extends PageElement {
  private client = signalr();
  @state() private negotiateResult?: CallResult;
  @state() private messageResult?: CallResult;
  @state() private receiveResult?: CallResult;
  private pending?: { off: () => void; timer: number };

  connectedCallback(): void {
    super.connectedCallback();
    this.watch(this.client.state);
    this.watch(this.client.lastError);
    this.watch(this.client.log);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.cancelPending();
  }

  private async testNegotiate() {
    this.negotiateResult = undefined;
    try {
      const r = await this.client.testNegotiate();
      this.negotiateResult = { success: true, status: r.status, statusText: r.statusText, body: r.body };
    } catch (error) {
      this.negotiateResult = toCallResult(error);
    }
  }

  private async testSendMessage() {
    this.messageResult = undefined;
    const stamp = Date.now();
    try {
      await this.client.send({ type: "debug.ping", usertype: UserType.undefined, payload: { stamp } });
      this.messageResult = { success: true, body: `message sent (${stamp})` };
    } catch (error) {
      this.messageResult = toCallResult(error);
    }
  }

  private testReceiveMessage() {
    this.cancelPending();
    this.receiveResult = undefined;
    const type = "debug.echo";
    const stamp = Date.now();
    let settled = false;
    const finish = (result: CallResult) => {
      if (settled) return;
      settled = true;
      this.cancelPending();
      this.receiveResult = result;
    };
    const off = this.client.on<{ stamp: number }>(type, (message: SignalrMessage<{ stamp: number }>) => {
      if (message?.payload?.stamp === stamp) finish({ success: true, body: `message received (${stamp})` });
    });
    const timer = window.setTimeout(
      () => finish({ success: false, body: `timeout: no broadcast received for (${stamp}) within ${RECEIVE_TIMEOUT_MS}ms` }),
      RECEIVE_TIMEOUT_MS
    );
    this.pending = { off, timer };
    this.client.send({ type, usertype: UserType.undefined, payload: { stamp } }).catch(error => finish(toCallResult(error)));
  }

  private cancelPending() {
    if (!this.pending) return;
    window.clearTimeout(this.pending.timer);
    this.pending.off();
    this.pending = undefined;
  }

  private result(r?: CallResult, showStatusAlways = false) {
    if (!r) return nothing;
    return html`
      <div class="mt-2 ${r.success ? "text-success" : "text-danger"}">
        ${showStatusAlways || r.status ? html`<div>Status: ${r.status} ${r.statusText}</div>` : nothing}
        <pre>${r.body}</pre>
      </div>`;
  }

  render() {
    const error = this.client.lastError.value;
    return html`
      <div class="container">
        <h1>SignalR debug</h1>
        <p>
          Connection state: <strong>${this.client.state.value}</strong>
          <button class="btn btn-sm btn-secondary ms-2" @click=${() => this.client.start()}>Reconnect</button>
        </p>
        ${error ? html`<div class="alert alert-danger">${error}</div>` : nothing}
        <div class="row">
          <div class="col">
            <button class="btn btn-primary" @click=${() => this.testNegotiate()}>Test negotiate endpoint</button>
            ${this.result(this.negotiateResult, true)}
          </div>
          <div class="col">
            <button class="btn btn-primary" @click=${() => this.testSendMessage()}>Send test message</button>
            ${this.result(this.messageResult)}
          </div>
          <div class="col">
            <button class="btn btn-primary" @click=${() => this.testReceiveMessage()}>Receive test message</button>
            ${this.result(this.receiveResult)}
          </div>
        </div>
        <h2 class="mt-3">Connection log</h2>
        <ul class="list-unstyled">${this.client.log.value.map(line => html`<li>${line}</li>`)}</ul>
      </div>`;
  }
}
