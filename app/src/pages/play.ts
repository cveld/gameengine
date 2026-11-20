// Hosts a static game from public/assets in an iframe (maze, flappy muis,
// marble race, orbit catch). Which game is chosen from the URL path.
import "@/engine/base";
import "@/styles/play.css";
import { html, nothing, render } from "lit";
import { gameForPath } from "@/engine/catalog";

const game = gameForPath(window.location.pathname);
const root = document.getElementById("app")!;

if (!game || !game.embed) {
  window.location.replace("/");
} else {
  const embed = game.embed;
  document.title = game.title;
  let immersive = false;

  const frame = () => html`<iframe src=${embed.src} title=${game.title}
      class="${embed.layout === "fit" ? "orbit-fit-frame " : ""}${embed.frameClass ?? ""}"
      allow=${embed.allow ?? nothing}></iframe>`;

  const draw = () => render(embed.layout === "fit"
    ? html`<div class="orbit-fit ${embed.frameClass ?? ""}-fit ${immersive ? "immersive" : ""}">${frame()}</div>`
    : html`
      <div class="container-fluid py-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h1>${game.title}</h1>
          <a href="/" class="btn btn-outline-secondary btn-sm">Terug naar start</a>
        </div>
        <div class="game-frame-wrap">${frame()}</div>
      </div>`, root);
  draw();

  window.addEventListener("message", event => {
    // Only the same-origin game frame may navigate; the targets are fixed in the catalog.
    const iframe = root.querySelector("iframe");
    if (event.origin !== window.location.origin || !iframe?.contentWindow || event.source !== iframe.contentWindow) return;
    const type = event.data?.type;
    if (embed.back && type === embed.back.message) {
      window.location.assign(embed.back.target);
    } else if (embed.immersiveMessage && type === embed.immersiveMessage) {
      immersive = event.data.on === true;
      draw();
    }
  });
}
