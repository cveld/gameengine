import "@/engine/base";
import { html, render } from "lit";
import { games } from "@/engine/catalog";

render(html`
  <div class="container py-5">
    <h1 class="mb-4">Game engine</h1>
    <div class="row g-4">
      ${games.filter(g => !g.hidden).map(game => html`
        <div class="col-md-4">
          <a href=${game.route} class="text-decoration-none text-dark">
            <div class="card h-100 shadow-sm tile">
              <div class="card-body text-center py-5">
                ${game.icon.bootstrap
                  ? html`<i class="bi ${game.icon.bootstrap}" style="font-size: 3rem;" aria-hidden="true"></i>`
                  : html`<span style="font-size: 3rem; line-height: 1;" aria-hidden="true">${game.icon.emoji}</span>`}
                <h2 class="card-title mt-3">${game.title}</h2>
                <p class="card-text text-muted">${game.description}</p>
              </div>
            </div>
          </a>
        </div>`)}
    </div>
  </div>
`, document.getElementById("app")!);
