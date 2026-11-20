# Gameengine site

A multi-page site built with [Vite](https://vitejs.dev/), TypeScript and
[Lit](https://lit.dev/). It replaced the Angular 12 app in November 2026.

## Layout

| Path | Contents |
|---|---|
| `pages/**/index.html` | One HTML entry per page (home, `memory/`, `simon/`, `coop/`, `engine/`, `play/`, `orbit/`, `orbit/classic/`, `orbit/diagnostics/`). Each loads one module from `src/pages/`. |
| `src/pages/*.ts` | Page entry points. |
| `src/engine/` | Shared code: `catalog.ts` (the games and tiles), `signalr.ts` (one SignalR connection per page, messages via `/api/messages`), `presence.ts` (who is online plus a results feed), `history.ts` and `profile.ts` (localStorage), `observable.ts` (`Value`/`Emitter`), `element.ts` (`PageElement`: Lit in the light DOM so Bootstrap applies), `join-form.ts`. |
| `src/games/<game>/` | Games written in TypeScript: `memory`, `simon`, `coop` (Tandem Ruimteschip), `cardgame` (the card-game engine with game and player tabs), `orbit` (Classic Orbit page, wireless diagnostics relay). |
| `public/assets/<game>/` | Static games served as-is (Orbit, Orbit Catch, Marble Race, Maze, Maze Rooms, Flappy Muis) and the card images. URLs stay `/assets/<game>/…`. |
| `public/staticwebapp.config.json` | URL rewrites for Azure Static Web Apps; the Vite dev server and the browser tests apply the same rewrites. |
| `scripts/stamp-build.cjs` | Stamps the commit into every page's footer and into Orbit (with cache-busting query strings). |
| `tests/` | Node tests (`npm test`) and browser tests (`npm run test:browser`). |

Pages:

- `/` home: tiles from `src/engine/catalog.ts`.
- `/memory`, `/simon`, `/coop`, `/engine` (with `/engine/create`, `/engine/debug`, `/engine/tabs/<n>` handled in the page).
- `/maze`, `/maze-rooms`, `/flappy-muis`, `/marble-race`, `/orbit/catch`: `pages/play/` shows the static game from the catalog in a frame. The frame may send `<prefix>:back` (fixed target from the catalog) and, for Marble Race, `marble:immersive`.
- `/orbit` chooser, `/orbit/classic` (frame plus wireless diagnostics), `/orbit/diagnostics` (PC console).

The card-game engine keeps its tabs in `sessionStorage`, so they survive a reload.

## Adding a game

- Static game: put it in `public/assets/<game>/`, add an entry with `embed` to
  `src/engine/catalog.ts` and a rewrite of its route to `/play/index.html` in
  `public/staticwebapp.config.json`.
- TypeScript game: add `src/games/<game>/`, a page in `pages/<game>/index.html`
  plus `src/pages/<game>.ts`, a catalog entry and a rewrite.

## Commands

Run from `app/` with Node 22 (`.nvmrc`):

```sh
npm ci
npm run dev           # http://localhost:5173, /api proxied to the Functions host on :7071
npm run build         # dist/, with the commit stamped into the footers
npm run typecheck
npm test              # unit tests (Node only)
npm run build && npm run test:browser   # Playwright tests against dist/ and public/
```

`npm run test:browser` uses an installed Playwright (`require("playwright")`, or
`ORBIT_PLAYWRIGHT_MODULE`). `tests/site.test.cjs` serves `dist/` with a local
SignalR stand-in and checks navigation, the embedded games, Memory, Simon, Co-op
and the card-game engine across browser pages. Two tests in `orbit-xr.test.cjs`
(VR/AR independence, Exit VR during capability changes) already failed on the
Angular version and still do.

Source/dev-server pages show `Commit: development`; only `npm run build`
stamps a commit (`(local changes)` when the checkout is dirty).
