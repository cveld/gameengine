import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PageElement } from "@/engine/element";
import { joinForm, presenceHeader } from "@/engine/join-form";
import { PresenceRoom, type PresenceResult } from "@/engine/presence";
import { profile } from "@/engine/profile";
import "./simon.css";

type SimonColor = "green" | "red" | "yellow" | "blue";
const COLORS: SimonColor[] = ["green", "red", "yellow", "blue"];
const STEP_DELAY_MS = 600;
const TONE_FREQUENCIES: Record<SimonColor, number> = {
  green: 329.63, // E4
  red: 220.0, // A3
  yellow: 392.0, // G4
  blue: 261.63 // C4
};

export interface SimonResult extends PresenceResult {
  score: number;
}

const room = new PresenceRoom<SimonResult>("simon", r => `Score ${r.score}`);
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const shortDate = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

@customElement("simon-game")
export class SimonGame extends PageElement {
  @state() private name = "";
  @state() private joined = false;
  @state() private recent: string[] = [];
  @state() private playing = false;
  @state() private showingSequence = false;
  @state() private activeColor?: SimonColor;
  @state() private score = 0;
  @state() private message = "Druk op start om te beginnen";
  private sequence: SimonColor[] = [];
  private playerStep = 0;
  private audioCtx?: AudioContext;

  connectedCallback(): void {
    super.connectedCallback();
    this.watch(room.presence);
    this.watch(room.results);
    this.recent = profile.recent();
    const active = profile.active();
    if (active) this.joinAs(active);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    room.leave();
  }

  private joinAs(name: string) {
    this.name = name;
    profile.setActive(name);
    this.recent = profile.recent();
    room.join(name);
    this.joined = true;
  }

  private switchProfile() {
    room.leave();
    profile.clearActive();
    this.name = "";
    this.joined = false;
    this.playing = false;
  }

  private start() {
    this.ensureAudioContext();
    this.sequence = [];
    this.score = 0;
    this.playerStep = 0;
    this.playing = true;
    void this.nextRound();
  }

  private pick(color: SimonColor) {
    if (!this.playing || this.showingSequence) return;
    void this.flash(color, 150);
    if (color === this.sequence[this.playerStep]) {
      this.playerStep++;
      if (this.playerStep === this.sequence.length) {
        this.score++;
        setTimeout(() => this.nextRound(), STEP_DELAY_MS);
      }
      return;
    }
    this.endGame();
  }

  private async nextRound() {
    this.sequence.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
    this.playerStep = 0;
    this.showingSequence = true;
    this.message = "Kijk goed...";
    for (const color of this.sequence) {
      await sleep(STEP_DELAY_MS / 2);
      await this.flash(color, STEP_DELAY_MS / 2);
    }
    this.showingSequence = false;
    this.message = "Jouw beurt";
  }

  private async flash(color: SimonColor, duration: number) {
    this.activeColor = color;
    this.playTone(color, duration);
    await sleep(duration);
    this.activeColor = undefined;
  }

  private endGame() {
    this.playing = false;
    this.message = `Game over! Score: ${this.score}`;
    this.playFailureSound();
    room.report({ name: this.name || "Onbekend", score: this.score });
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctor();
    }
    if (this.audioCtx.state === "suspended") void this.audioCtx.resume();
    return this.audioCtx;
  }

  private beep(type: OscillatorType, frequency: number, seconds: number) {
    const ctx = this.ensureAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + seconds);
  }

  private playTone(color: SimonColor, durationMs: number) {
    this.beep("sine", TONE_FREQUENCIES[color], durationMs / 1000);
  }

  private playFailureSound() {
    this.beep("sawtooth", 110, 0.4);
  }

  render() {
    const presence = room.presence.value;
    const results = room.results.value;
    const pad = (color: SimonColor) => html`
      <button type="button" class="simon-pad ${color} ${this.activeColor === color ? "active" : ""}"
              ?disabled=${!this.playing || this.showingSequence} @click=${() => this.pick(color)}></button>`;
    return html`
      <div class="container py-4">
        ${presenceHeader({ title: "Simon Says", joined: this.joined, count: presence.size, name: this.name, onSwitch: () => this.switchProfile() })}
        ${!this.joined ? joinForm({ name: this.name, recent: this.recent, onInput: v => (this.name = v), onJoin: n => this.joinAs(n) }) : html`
          <div class="row">
            <div class="col-lg-8">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>Score: <strong>${this.score}</strong></div>
                <button class="btn btn-sm btn-outline-secondary" @click=${() => this.start()} ?disabled=${this.showingSequence}>
                  ${this.playing ? "Opnieuw starten" : "Start"}
                </button>
              </div>
              <p class="text-muted">${this.message}</p>
              <div class="simon-board">${COLORS.map(pad)}</div>
            </div>
            <div class="col-lg-4">
              <h2 class="h5">Wie speelt er (${presence.size})</h2>
              <ul class="list-group mb-4">
                ${[...presence.values()].map(entry => html`<li class="list-group-item">${entry.name}</li>`)}
                ${presence.size ? "" : html`<li class="list-group-item text-muted">Niemand anders online.</li>`}
              </ul>
              <h2 class="h5">Geschiedenis</h2>
              <table class="table table-sm">
                <thead><tr><th>Naam</th><th>Score</th><th>Datum</th></tr></thead>
                <tbody>
                  ${results.map(r => html`<tr><td>${r.name}</td><td>${r.score}</td><td>${shortDate.format(r.completedAt)}</td></tr>`)}
                  ${results.length ? "" : html`<tr><td colspan="3" class="text-muted">Nog geen spellen gespeeld.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>`}
      </div>`;
  }
}
