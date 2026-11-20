import { html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { PageElement } from "@/engine/element";
import { gameHistory } from "@/engine/history";
import { profile } from "@/engine/profile";
import { moveAll, newState, SHIP_R, stepHost } from "./coop.logic";
import { COOP_H, COOP_W, type CoopResult, type CoopState } from "./coop.models";
import { CoopService } from "./coop.service";
import "./coop.css";

const HISTORY_GAME_KEY = "coop";
const BROADCAST_INTERVAL_MS = 100;

// Tandem Ruimteschip: two players steer ONE ship. The horizontal player only
// controls left/right, the vertical player only up/down. Catch stars together
// and dodge rocks. The host simulates; the guest sends its steering input and
// renders the host's state (extrapolated between updates).
@customElement("coop-game")
export class CoopGame extends PageElement {
  private coop = new CoopService();
  @query("canvas") private canvas?: HTMLCanvasElement;

  @state() private name = "";
  @state() private roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
  @state() private recent: string[] = [];
  @state() private joined = false;
  @state() private peerName?: string;
  @state() private roomFull = false;
  @state() private inviteCopied = false;
  @state() private phase: CoopState["phase"] = "waiting";
  private gameState: CoopState = newState({ h: "", v: "" }, "waiting");
  // Coarse pointer = phone/tablet: show touch hints instead of keyboard keys.
  private readonly isTouch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  private raf?: number;
  private lastFrame = 0;
  private lastBroadcast = 0;
  private myDir = 0;
  private resultSaved = false;
  private inviteTimer?: number;

  private get state(): CoopState {
    return this.gameState;
  }
  private set state(value: CoopState) {
    this.gameState = value;
    this.phase = value.phase;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this.recent = profile.recent();
    const active = profile.active();
    if (active) this.name = active;

    this.track(this.coop.peer.subscribe(peer => this.onPeerChanged(peer?.name)));
    this.track(this.coop.roomFull.subscribe(full => {
      this.roomFull = full;
      if (full) {
        this.leaveRoom();
        this.setRoomInUrl(undefined, true);
      }
    }));
    this.track(this.coop.guestInput.on(dir => {
      // The guest is always the vertical player.
      if (this.coop.isHost) this.state.dirV = dir;
    }));
    this.track(this.coop.remoteState.on(s => this.onRemoteState(s)));
    this.track(this.coop.restartRequested.on(() => {
      if (this.coop.isHost) this.restartAsHost();
    }));

    // The room lives in the URL (/coop?room=ABCD): that makes invite links work,
    // and the browser's back button leaves the room and returns to this lobby,
    // while forward re-joins it.
    window.addEventListener("popstate", this.syncWithUrl);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.syncWithUrl();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this.inviteTimer);
    this.leaveRoom();
    window.removeEventListener("popstate", this.syncWithUrl);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private syncWithUrl = () => {
    const room = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase().substring(0, 8);
    if (room && !this.joined) {
      this.roomCode = room;
      if (this.name.trim()) this.join();
    } else if (!room && this.joined) {
      this.leaveRoom();
    }
  };

  private get isHost() {
    return this.coop.isHost;
  }
  private get myAxis(): "h" | "v" {
    return this.isHost ? "h" : "v";
  }

  private join() {
    const name = this.name.trim();
    const room = this.roomCode.trim().toUpperCase();
    if (!name || !room) return;
    this.roomCode = room;
    profile.setActive(name);
    this.recent = profile.recent();
    this.roomFull = false;
    this.joined = true;
    this.peerName = undefined;
    this.state = newState(this.names(), "waiting");
    this.coop.join(room, name);
    this.setRoomInUrl(room);
    // The canvas only exists once the joined view has rendered.
    void this.updateComplete.then(() => this.startLoop());
  }

  // Back to the lobby via history, so the back button then leaves the game page.
  private exitRoom() {
    this.leaveRoom();
    this.setRoomInUrl(undefined);
  }

  private setRoomInUrl(room: string | undefined, replace = false) {
    const url = new URL(window.location.href);
    if (url.searchParams.get("room")?.toUpperCase() === room) return;
    if (room) url.searchParams.set("room", room);
    else url.searchParams.delete("room");
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  }

  private leaveRoom() {
    this.stopLoop();
    this.coop.leave();
    this.joined = false;
    this.peerName = undefined;
    this.myDir = 0;
  }

  private get inviteLink(): string {
    return `${window.location.origin}/coop?room=${encodeURIComponent(this.coop.room ?? this.roomCode)}`;
  }

  private async copyInvite() {
    const link = this.inviteLink;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API unavailable (e.g. insecure context): fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    this.inviteCopied = true;
    window.clearTimeout(this.inviteTimer);
    this.inviteTimer = window.setTimeout(() => (this.inviteCopied = false), 2000);
  }

  private restart() {
    if (this.isHost) this.restartAsHost();
    else this.coop.sendRestart();
  }

  // Pointer handlers for the on-screen buttons. Capturing the pointer keeps the
  // press alive when a thumb slides off the button; pointercancel (e.g. a system
  // gesture) always releases so the ship never keeps drifting.
  private press(e: PointerEvent, dir: number) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.setDir(dir);
  }

  private release(e: PointerEvent) {
    e.preventDefault();
    this.setDir(0);
  }

  private setDir(dir: number) {
    if (dir === this.myDir) return;
    this.myDir = dir;
    if (this.isHost) {
      this.state.dirH = dir;
    } else {
      this.state.dirV = dir; // optimistic local feedback
      this.coop.sendInput(dir);
    }
  }

  private names() {
    const me = this.name.trim();
    const other = this.peerName ?? "...";
    return this.isHost ? { h: me, v: other } : { h: other, v: me };
  }

  private onPeerChanged(peerName?: string) {
    this.peerName = peerName;
    if (!this.joined) return;
    if (peerName) {
      if (this.isHost) this.restartAsHost();
    } else {
      // Partner left: wait for a new one (we become host again).
      this.state = newState(this.names(), "waiting");
      this.myDir = 0;
    }
  }

  private restartAsHost() {
    this.resultSaved = false;
    this.myDir = 0;
    this.state = newState(this.names(), "countdown");
    this.coop.sendState(this.state);
  }

  private onRemoteState(s: CoopState) {
    // Keep our own steering immediately responsive.
    s.dirV = this.myDir;
    this.state = s;
    this.maybeSaveResult();
  }

  private maybeSaveResult() {
    if (this.state.phase !== "over" || this.resultSaved) return;
    this.resultSaved = true;
    const result: CoopResult = { names: [this.state.names.h, this.state.names.v], score: this.state.score, completedAt: Date.now() };
    gameHistory.add<CoopResult>({
      game: HISTORY_GAME_KEY,
      name: this.name,
      summary: `Score ${result.score} met ${this.peerName ?? "onbekend"}`,
      data: result,
      completedAt: result.completedAt
    });
  }

  // ---- input ----

  // Steering keys must never swallow typing (the name/room inputs live on the
  // same page), so ignore them unless we're in a game and not in a text field.
  private isSteeringContext(e: KeyboardEvent): boolean {
    if (!this.joined) return false;
    const t = e.target as HTMLElement | null;
    return !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable));
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.isSteeringContext(e)) return;
    const dir = this.keyToDir(e.key);
    if (dir === undefined) return;
    e.preventDefault();
    this.setDir(dir);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!this.joined) return;
    const dir = this.keyToDir(e.key);
    // Only stop if the released key matches the current direction.
    if (dir !== undefined && dir === this.myDir) this.setDir(0);
  };

  private keyToDir(key: string): number | undefined {
    const k = key.toLowerCase();
    if (this.myAxis === "h") {
      if (k === "arrowleft" || k === "a") return -1;
      if (k === "arrowright" || k === "d") return 1;
    } else {
      if (k === "arrowup" || k === "w") return -1;
      if (k === "arrowdown" || k === "s") return 1;
    }
    return undefined;
  }

  // ---- loop ----

  private startLoop() {
    this.stopLoop();
    this.lastFrame = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.tick(dt, now);
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stopLoop() {
    if (this.raf !== undefined) cancelAnimationFrame(this.raf);
    this.raf = undefined;
  }

  private tick(dt: number, now: number) {
    if (this.isHost) {
      if (!this.peerName) return;
      stepHost(this.state, dt);
      this.phase = this.state.phase;
      this.maybeSaveResult();
      if (now - this.lastBroadcast >= BROADCAST_INTERVAL_MS) {
        this.lastBroadcast = now;
        this.coop.sendState(this.state);
      }
    } else if (this.state.phase === "playing") {
      moveAll(this.state, dt);
    } else if (this.state.phase === "countdown") {
      this.state.countdown -= dt;
    }
  }

  // ---- rendering ----

  private draw() {
    const canvas = this.canvas;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const s = this.state;

    ctx.fillStyle = "#0b1026";
    ctx.fillRect(0, 0, COOP_W, COOP_H);

    ctx.font = "22px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const item of s.items) ctx.fillText(item.kind === "star" ? "⭐" : "🪨", item.x, item.y);

    // Ship.
    ctx.save();
    ctx.translate(s.shipX, s.shipY);
    ctx.fillStyle = s.hitFlash > 0 ? "#e74c3c" : "#ecf0f1";
    ctx.beginPath();
    ctx.moveTo(0, -SHIP_R - 4);
    ctx.lineTo(SHIP_R, SHIP_R);
    ctx.lineTo(0, SHIP_R - 6);
    ctx.lineTo(-SHIP_R, SHIP_R);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // HUD.
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`⭐ ${s.score}`, 12, 24);
    ctx.textAlign = "right";
    ctx.fillText("❤️".repeat(Math.max(0, s.lives)), COOP_W - 12, 24);

    if (s.phase !== "playing") {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, COOP_W, COOP_H);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 28px sans-serif";
      if (s.phase === "waiting") {
        ctx.fillText("Wachten op tweede speler...", COOP_W / 2, COOP_H / 2 - 10);
        ctx.font = "18px sans-serif";
        ctx.fillText(`Kamercode: ${this.coop.room ?? ""}`, COOP_W / 2, COOP_H / 2 + 28);
      } else if (s.phase === "countdown") {
        ctx.font = "bold 72px sans-serif";
        ctx.fillText(String(Math.max(1, Math.ceil(s.countdown))), COOP_W / 2, COOP_H / 2);
      } else {
        ctx.fillText("Game over!", COOP_W / 2, COOP_H / 2 - 10);
        ctx.font = "20px sans-serif";
        ctx.fillText(`Samen ${s.score} sterren gevangen`, COOP_W / 2, COOP_H / 2 + 30);
      }
    }
  }

  render() {
    const ready = !!this.name.trim() && !!this.roomCode.trim();
    const steer = (dir: number, label: string) => html`
      <button class="coop-btn" @pointerdown=${(e: PointerEvent) => this.press(e, dir)} @pointerup=${(e: PointerEvent) => this.release(e)}
              @pointercancel=${(e: PointerEvent) => this.release(e)} @contextmenu=${(e: Event) => e.preventDefault()}>${label}</button>`;
    return html`
      <div class="container py-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h1>Tandem Ruimteschip</h1>
          <div class="d-flex gap-2 align-items-center">
            ${this.joined ? html`<button class="btn btn-outline-secondary btn-sm" @click=${() => this.exitRoom()}>Kamer verlaten</button>` : ""}
            <a href="/" class="btn btn-outline-secondary btn-sm">Terug naar start</a>
          </div>
        </div>
        ${this.joined ? "" : html`
          <div class="card mb-4" style="max-width: 420px;">
            <div class="card-body">
              <p class="text-muted">
                Twee spelers, één schip. De ene speler stuurt links/rechts, de ander omhoog/omlaag.
                Vang samen sterren en ontwijk de rotsen. Spreek een kamercode af en doe mee!
              </p>
              ${this.roomFull ? html`<div class="alert alert-warning">Deze kamer zit al vol. Kies een andere code.</div>` : ""}
              <label for="coopName" class="form-label">Jouw naam</label>
              <input id="coopName" class="form-control mb-2" .value=${this.name} placeholder="Naam"
                     @input=${(e: InputEvent) => (this.name = (e.target as HTMLInputElement).value)}>
              ${this.recent.length ? html`
                <div class="d-flex flex-wrap gap-1 mb-2">
                  ${this.recent.map(p => html`<button type="button" class="btn btn-sm btn-outline-secondary" @click=${() => (this.name = p)}>${p}</button>`)}
                </div>` : ""}
              <label for="coopRoom" class="form-label">Kamercode</label>
              <div class="input-group">
                <input id="coopRoom" class="form-control text-uppercase" .value=${this.roomCode} maxlength="8"
                       @input=${(e: InputEvent) => (this.roomCode = (e.target as HTMLInputElement).value)}
                       @keyup=${(e: KeyboardEvent) => e.key === "Enter" && this.join()}>
                <button class="btn btn-primary" @click=${() => this.join()} ?disabled=${!ready}>Meedoen</button>
              </div>
            </div>
          </div>`}
      </div>
      ${this.joined ? html`
        <div class="coop-screen">
          <div class="coop-bar">
            <div class="coop-hint">
              <strong>${this.isHost ? "Jij: links / rechts" : "Jij: omhoog / omlaag"}</strong>
              ${this.peerName ? html`<span> &middot; met ${this.peerName}</span>` : ""}
              ${this.isTouch ? "" : html`<small class="d-block text-muted">Toetsen: ${this.isHost ? "← → of A D" : "↑ ↓ of W S"}</small>`}
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm ${this.inviteCopied ? "btn-success" : "btn-outline-light"}" @click=${() => this.copyInvite()}>
                ${this.inviteCopied ? "Link gekopieerd!" : "Uitnodigen"}
              </button>
              <button class="btn btn-outline-light btn-sm" @click=${() => this.exitRoom()}>Verlaten</button>
              <a href="/" class="btn btn-outline-light btn-sm">Start</a>
            </div>
          </div>
          <div class="coop-stage">
            <canvas width="480" height="640" class="coop-canvas"></canvas>
          </div>
          <div class="coop-controls">
            ${this.phase !== "over"
              ? html`${steer(-1, this.isHost ? "◀" : "▲")}${steer(1, this.isHost ? "▶" : "▼")}`
              : html`<button class="coop-btn coop-btn-restart" @click=${() => this.restart()}>Opnieuw spelen</button>`}
          </div>
        </div>` : ""}`;
  }
}
