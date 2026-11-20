import { html, type TemplateResult } from "lit";

// The "your name" card shared by the presence games (Memory, Simon).
export function joinForm(opts: {
  name: string;
  recent: string[];
  onInput: (name: string) => void;
  onJoin: (name: string) => void;
}): TemplateResult {
  const submit = () => {
    const name = opts.name.trim();
    if (name) opts.onJoin(name);
  };
  return html`
    <div class="card mb-4" style="max-width: 400px;">
      <div class="card-body">
        <label for="playerName" class="form-label">Jouw naam</label>
        <div class="input-group">
          <input id="playerName" class="form-control" .value=${opts.name} placeholder="Naam" autofocus
                 @input=${(e: InputEvent) => opts.onInput((e.target as HTMLInputElement).value)}
                 @keyup=${(e: KeyboardEvent) => e.key === "Enter" && submit()}>
          <button class="btn btn-primary" @click=${submit}>Meedoen</button>
        </div>
        ${opts.recent.length ? html`
          <div class="d-flex flex-wrap gap-1 mt-2">
            ${opts.recent.map(p => html`<button type="button" class="btn btn-sm btn-outline-secondary" @click=${() => opts.onJoin(p)}>${p}</button>`)}
          </div>` : ""}
      </div>
    </div>`;
}

export function presenceHeader(opts: {
  title: string;
  joined: boolean;
  count: number;
  name: string;
  onSwitch: () => void;
}): TemplateResult {
  return html`
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1>${opts.title}</h1>
      <div class="d-flex gap-2 align-items-center">
        ${opts.joined ? html`
          <span class="badge rounded-pill text-bg-success">
            <i class="bi bi-circle-fill" style="font-size: 0.5rem;"></i>
            ${opts.count} ${opts.count === 1 ? "speler" : "spelers"} online
          </span>
          <button class="btn btn-outline-secondary btn-sm" @click=${opts.onSwitch}>
            <i class="bi bi-person-circle"></i> ${opts.name} &middot; Wissel
          </button>` : ""}
        <a href="/" class="btn btn-outline-secondary btn-sm">Terug naar start</a>
      </div>
    </div>`;
}
