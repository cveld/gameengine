import { html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { PageElement } from "@/engine/element";
import { UserType } from "@/engine/messages";
import { signalr } from "@/engine/signalr";
import { cardView, coveredCard, Suit } from "./cards";
import type { Game1 } from "./game1";
import { RoundStatus } from "./game1.models";
import type { Player1 } from "./player1";
import { TabStore } from "./tabs";
import "./debug-view";

// Routes inside the page: /engine/create, /engine/debug, /engine/tabs/<index>.
type Route = { view: "create" } | { view: "debug" } | { view: "tab"; index: number };

function parseRoute(pathname: string): Route | null {
  const rest = pathname.replace(/^\/engine\/?/, "").replace(/\/+$/, "");
  if (rest === "create") return { view: "create" };
  if (rest === "debug") return { view: "debug" };
  const match = /^tabs\/(\d+)$/.exec(rest);
  if (match) return { view: "tab", index: Number(match[1]) };
  return null;
}

@customElement("engine-app")
export class EngineApp extends PageElement {
  private store = new TabStore();
  @state() private route: Route = { view: "create" };

  connectedCallback(): void {
    super.connectedCallback();
    signalr(); // connect early, so other tabs can find this one
    this.watch(this.store.tabs);
    window.addEventListener("popstate", this.syncRoute);
    this.syncRoute();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.syncRoute);
  }

  private syncRoute = () => {
    const route = parseRoute(window.location.pathname);
    if (!route || (route.view === "tab" && route.index >= this.store.tabs.value.length)) {
      history.replaceState(null, "", "/engine/create");
      this.route = { view: "create" };
    } else {
      this.route = route;
    }
  };

  private navigate(event: Event, path: string) {
    event.preventDefault();
    history.pushState(null, "", path);
    this.syncRoute();
  }

  private link(path: string, label: string, active: boolean) {
    return html`<li class="nav-item"><a class="nav-link ${active ? "active" : ""}" href=${path} @click=${(e: Event) => this.navigate(e, path)}>${label}</a></li>`;
  }

  render() {
    const tabs = this.store.tabs.value;
    const r = this.route;
    return html`
      <ul class="nav nav-tabs">
        <li class="nav-item"><a class="nav-link" href="/">Home</a></li>
        ${this.link("/engine/create", "Create", r.view === "create")}
        ${this.link("/engine/debug", "Debug", r.view === "debug")}
        ${tabs.map((tab, i) => this.link(`/engine/tabs/${i}`, tab.title, r.view === "tab" && r.index === i))}
      </ul>
      ${r.view === "create" ? this.renderCreate() : nothing}
      ${r.view === "debug" ? html`<engine-debug></engine-debug>` : nothing}
      ${r.view === "tab" && tabs[r.index]
        ? tabs[r.index].userType === UserType.game
          ? html`<game1-view .game=${tabs[r.index].instance as Game1}></game1-view>`
          : html`<player1-view .player=${tabs[r.index].instance as Player1}></player1-view>`
        : nothing}`;
  }

  private renderCreate() {
    return html`
      <div class="container">
        <div class="row">
          Welcome with the game engine single page app edition! Here you can create new tabs. A tab can host a game engine, or a player.
        </div>
        <div class="row">
          <h1>Create game engine</h1>
          <button class="btn btn-primary" @click=${() => this.store.createGame()}>Create game</button>
        </div>
        <div class="row">
          <h1>Create player</h1>
          <button class="btn btn-primary" @click=${() => this.store.createPlayer()}>Create player</button>
        </div>
      </div>`;
  }
}

@customElement("game1-view")
export class Game1View extends PageElement {
  @property({ attribute: false }) game?: Game1;
  private watched?: Game1;

  updated(): void {
    if (this.game && this.watched !== this.game) {
      this.watched = this.game;
      this.watch(this.game.state);
      this.watch(this.game.messages);
    }
  }

  render() {
    if (!this.game) return nothing;
    const state = this.game.state.value;
    const played = state.playedcards ?? [];
    return html`
      <div class="container">
        <p>game1 id: ${this.game.guid}</p>
        <h1>Messages</h1>
        <ol>${this.game.messages.value.map(m => html`<li><span style=${m.type === "error" ? "color: red" : ""}>${m.message}</span></li>`)}</ol>
        <h1>Actions</h1>
        <div class="row">
          <div class="md-12">
            <button class="btn btn-primary mr-1" @click=${() => this.game!.startGame()}>Start game</button>
            <button class="btn btn-primary" @click=${() => this.game!.stopGame()}>Stop game</button>
          </div>
        </div>
        <h1>Joined players</h1>
        <ol>${state.joinedplayers.map(p => html`<li>${p}</li>`)}</ol>
        <h1>Game info</h1>
        <div>Game started = ${String(state.started)}</div>
        ${state.turn ? html`<div>Player's turn = ${state.joinedplayers[state.turn]}</div>` : nothing}
        ${state.cardsToTake ? html`<div>Cards to take = ${state.cardsToTake}</div>` : nothing}
        ${state.direction ? html`<div>Direction = ${state.direction}</div>` : nothing}
        ${state.selectedSuit ? html`<div>Selected suit = ${state.selectedSuit}</div>` : nothing}
        ${state.players?.length ? html`<h1>Cards</h1>` : nothing}
        ${state.players.map((hand, i) => html`<h2>Player ${state.joinedplayers[i]}</h2>${hand.map(card => cardView(card))}`)}
        ${state.playedcards ? html`<h2>Played (count = ${played.length})</h2>${[...played].reverse().map(card => cardView(card))}` : nothing}
        ${state.stack ? html`<h2>Stack (count = ${state.stack.length})</h2>${state.stack.map(card => cardView(card))}` : nothing}
      </div>`;
  }
}

@customElement("player1-view")
export class Player1View extends PageElement {
  @property({ attribute: false }) player?: Player1;
  private watched?: Player1;
  @state() private sayLastCard = false;
  @state() private selectSuit: Suit = Suit.hearts;

  updated(): void {
    if (this.player && this.watched !== this.player) {
      this.watched = this.player;
      this.watch(this.player.state);
      this.watch(this.player.games);
    }
  }

  render() {
    const player = this.player;
    if (!player) return nothing;
    const state = player.state.value;
    const played = state.playedcards ?? [];
    return html`
      <div class="container">
        <p>player1 id: ${player.guid}</p>
        <button class="btn btn-primary" @click=${() => player.queryGames()}>Query games</button>
        <h1>Games found</h1>
        ${player.games.value.map(id => html`<p>${id} <button class="btn btn-primary" @click=${() => player.joinGame(id)}>Join</button></p>`)}
        ${state.roundstatus && state.roundstatus !== RoundStatus.notstarted ? html`
          <h1>Game state</h1>
          <div>My turn = ${String(state.myturn)}</div>
          <div>Cards to take = ${state.cardsToTake}</div>
          <div>Direction = ${state.direction}</div>
          ${state.selectedSuit ? html`<div>Selected suit = ${state.selectedSuit}</div>` : nothing}
          <div>Last round result = ${state.lastroundresult}${state.myindex === state.lastroundresult ? html`<span> (me)</span>` : nothing}</div>
          ${state.playedcards ? html`<h2>Played (count = ${played.length})</h2>${[...played].reverse().map(card => cardView(card))}` : nothing}
          <h1>Stack (${state.stacksize})</h1>
          ${cardView(coveredCard, () => player.drawCard(this.selectSuit))}
          <h1>My cards</h1>
          ${(state.mycards ?? []).map((card, i) => cardView(card, () => player.playCard(i, this.sayLastCard, this.selectSuit)))}
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="sayLastCard" .checked=${this.sayLastCard}
                   @change=${(e: Event) => (this.sayLastCard = (e.target as HTMLInputElement).checked)}>
            <label class="form-check-label" for="sayLastCard">Say last card</label>
          </div>
          <div class="row">
            <div class="md-4">
              <div class="form-group">
                <label for="selectSuit">Select suit</label>
                <select class="form-control" id="selectSuit" .value=${this.selectSuit}
                        @change=${(e: Event) => (this.selectSuit = (e.target as HTMLSelectElement).value as Suit)}>
                  <option value="hearts">Hearts</option>
                  <option value="spades">Spades</option>
                  <option value="diamonds">Diamonds</option>
                  <option value="clubs">Clubs</option>
                </select>
              </div>
            </div>
          </div>
          <h1>Other cards</h1>
          <table>
            <thead><tr><th>Player</th><th>Number of cards</th></tr></thead>
            <tbody>
              ${(state.players ?? []).map((count, i) => html`<tr><td>${state.joinedplayers?.[i]}${state.myindex === i ? html`<span> (me)</span>` : nothing}</td><td>${count}</td></tr>`)}
            </tbody>
          </table>` : nothing}
      </div>`;
  }
}
