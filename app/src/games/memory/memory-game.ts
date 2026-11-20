import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PageElement } from "@/engine/element";
import { joinForm, presenceHeader } from "@/engine/join-form";
import { PresenceRoom, type PresenceResult } from "@/engine/presence";
import { profile } from "@/engine/profile";
import "./memory.css";

const SYMBOLS = ["🍎", "🍌", "🍇", "🍓", "🍒", "🍋", "🥝", "🍍"];

interface MemoryCard {
  index: number;
  symbol: string;
  flipped: boolean;
  matched: boolean;
}

export interface MemoryResult extends PresenceResult {
  moves: number;
  durationMs: number;
}

const room = new PresenceRoom<MemoryResult>("memory", r => `${r.moves} zetten in ${(r.durationMs / 1000).toFixed(1)}s`);

@customElement("memory-game")
export class MemoryGame extends PageElement {
  @state() private name = "";
  @state() private joined = false;
  @state() private recent: string[] = [];
  @state() private cards: MemoryCard[] = [];
  @state() private moves = 0;
  @state() private finished = false;
  private startedAt = 0;
  private selected: number[] = [];
  private lockBoard = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.watch(room.presence);
    this.watch(room.results);
    this.newBoard();
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
  }

  private newBoard() {
    const symbols = [...SYMBOLS, ...SYMBOLS]
      .map(symbol => ({ symbol, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ symbol }) => symbol);
    this.cards = symbols.map((symbol, index) => ({ index, symbol, flipped: false, matched: false }));
    this.moves = 0;
    this.finished = false;
    this.selected = [];
    this.lockBoard = false;
    this.startedAt = Date.now();
  }

  private flip(card: MemoryCard) {
    if (this.lockBoard || card.flipped || card.matched || !this.joined) return;
    card.flipped = true;
    this.selected.push(card.index);
    this.requestUpdate();
    if (this.selected.length < 2) return;

    this.moves++;
    this.lockBoard = true;
    const [first, second] = this.selected.map(index => this.cards[index]);
    if (first.symbol === second.symbol) {
      first.matched = true;
      second.matched = true;
      this.selected = [];
      this.lockBoard = false;
      if (this.cards.every(c => c.matched)) {
        this.finished = true;
        room.report({ name: room.name ?? "Onbekend", moves: this.moves, durationMs: Date.now() - this.startedAt });
      }
    } else {
      setTimeout(() => {
        first.flipped = false;
        second.flipped = false;
        this.selected = [];
        this.lockBoard = false;
        this.requestUpdate();
      }, 700);
    }
  }

  render() {
    const presence = room.presence.value;
    return html`
      <div class="container py-4">
        ${presenceHeader({ title: "Geheugenspel", joined: this.joined, count: presence.size, name: this.name, onSwitch: () => this.switchProfile() })}
        ${!this.joined ? joinForm({ name: this.name, recent: this.recent, onInput: v => (this.name = v), onJoin: n => this.joinAs(n) }) : html`
          <div class="row">
            <div class="col-lg-8">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>Zetten: <strong>${this.moves}</strong></div>
                <button class="btn btn-sm btn-outline-secondary" @click=${() => this.newBoard()}>Nieuw spel</button>
              </div>
              ${this.finished ? html`<div class="alert alert-success">Opgelost in ${this.moves} zetten! Goed gedaan, ${room.name}.</div>` : ""}
              <div class="memory-board">
                ${this.cards.map(card => html`
                  <div class="memory-tile ${card.flipped || card.matched ? "flipped" : ""} ${card.matched ? "matched" : ""}" @click=${() => this.flip(card)}>
                    <div class="memory-tile-inner">
                      <div class="memory-tile-front">?</div>
                      <div class="memory-tile-back">${card.symbol}</div>
                    </div>
                  </div>`)}
              </div>
            </div>
            <div class="col-lg-4">
              <h2 class="h5">Wie speelt er (${presence.size})</h2>
              <ul class="list-group mb-4">
                ${[...presence.values()].map(entry => html`<li class="list-group-item">${entry.name}</li>`)}
              </ul>
              <h2 class="h5">Resultatenhistorie</h2>
              <table class="table table-sm">
                <thead><tr><th>Naam</th><th>Zetten</th><th>Tijd</th></tr></thead>
                <tbody>
                  ${room.results.value.map(r => html`<tr><td>${r.name}</td><td>${r.moves}</td><td>${(r.durationMs / 1000).toFixed(1)}s</td></tr>`)}
                </tbody>
              </table>
            </div>
          </div>`}
      </div>`;
  }
}
