// Encrypted relay of Orbit XR diagnostics over the shared SignalR connection.
import { UserType, type SignalrMessage } from "@/engine/messages";
import { Value } from "@/engine/observable";
import { signalr, type SignalrClient } from "@/engine/signalr";
import { createReportCodec, type EncryptedReport, newPairingKey, ORBIT_REPORT_EVENT } from "./relay-protocol";

type Codec = Awaited<ReturnType<typeof createReportCodec>>;

export class OrbitTelemetry {
  readonly status = new Value("Not connected");
  readonly report = new Value<{ report: string; receivedAt: number } | null>(null);
  private client?: SignalrClient;
  private codec?: Codec;
  private generation = 0;
  private sequence = 0;
  private source = newPairingKey();
  private busy = false;
  private cleanups: (() => void)[] = [];
  private seen = new Map<string, number>();

  constructor(private getClient: () => SignalrClient = signalr) {}

  async connect(key: string): Promise<boolean> {
    this.disconnect();
    const generation = this.generation;
    this.status.set("Preparing encrypted diagnostics");
    try {
      const codec = await createReportCodec(key);
      if (generation !== this.generation) return false;
      this.codec = codec;
      const client = (this.client = this.getClient());
      this.cleanups.push(client.on<EncryptedReport>(ORBIT_REPORT_EVENT, this.receive));
      this.cleanups.push(client.state.subscribe(() =>
        this.status.set(client.connected ? "Connected; waiting for diagnostics" : "SignalR: " + client.state.value)));
      this.cleanups.push(client.lastError.subscribe(error => {
        if (error) this.status.set("Connection error: " + error.slice(0, 160));
      }));
      return true;
    } catch (error) {
      this.status.set(error instanceof Error ? error.message : "Could not connect diagnostics");
      throw error;
    }
  }

  async publish(report: string): Promise<void> {
    const client = this.client;
    if (!this.codec || !client || this.busy || !client.connected) return;
    const generation = this.generation;
    const codec = this.codec;
    this.busy = true;
    try {
      const payload = await codec.seal(report, this.source, this.sequence++);
      if (generation !== this.generation) return;
      client.send({ type: ORBIT_REPORT_EVENT, gameid: codec.room, connectionid: this.source, usertype: UserType.undefined, payload })
        .then(() => this.status.set("Encrypted report sent"), () => this.status.set("Diagnostic delivery failed"));
    } catch {
      this.status.set("Diagnostic report could not be encrypted");
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }

  private receive = async (message: SignalrMessage<EncryptedReport>) => {
    const codec = this.codec;
    const generation = this.generation;
    if (!codec || message.gameid !== codec.room || message.connectionid === this.source || !message.payload) return;
    try {
      const result = await codec.open(message.payload);
      if (generation !== this.generation || result.sequence <= (this.seen.get(result.source) ?? -1)) return;
      if (!this.seen.has(result.source) && this.seen.size >= 8) return;
      this.seen.set(result.source, result.sequence);
      this.report.set({ report: result.report, receivedAt: Date.now() });
      this.status.set("Live diagnostics received");
    } catch {
      /* Untrusted broadcasts from other clients cannot become diagnostics. */
    }
  };

  disconnect(): void {
    this.generation++;
    this.busy = false;
    this.codec = undefined;
    this.seen.clear();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.report.set(null);
    this.status.set("Not connected");
  }
}
