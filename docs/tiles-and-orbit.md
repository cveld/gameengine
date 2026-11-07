# Tiles and Orbit integration

Updated on November 7, 2026. The original inspection was followed by a
user-requested WebGL browser adaptation.

## Home-page tile structure

The home page is `app/src/app/home/home.component.html`. Each tile is a Bootstrap
card inside a `col-md-4`, with an Angular `routerLink`, an icon, a title, and a
description. Hover styling is in `home.component.scss`.

The existing destinations at inspection time were:

- `/engine`: card-game engine
- `/memory`: memory game
- `/simon`: Simon Says
- `/maze`: Dungeon Maze
- `/maze-rooms`: Dungeon Maze rooms
- `/flappy-muis`: Flappy Muis
- `/orbit`: Orbit browser edition (added after the original inspection)
- `/coop`: Tandem Ruimteschip (preserved when integrating the newer main branch)

Routes are registered in `app/src/app/app-routing.module.ts`. Page components
are declared in `app/src/app/components/components.module.ts`, which is imported
by `app/src/app/app.module.ts`; do not assume new pages should be declared
directly in `AppModule`.

## Embedded browser-game pattern

Maze, Maze Rooms, and Flappy Muis use Angular wrapper components around static
HTML games under `app/src/assets/`.

For a representative implementation, read:

- `app/src/app/flappy-muis/flappy-muis.component.ts`
- `app/src/app/flappy-muis/flappy-muis.component.html`
- `app/src/app/flappy-muis/flappy-muis.component.scss`
- `app/src/assets/flappy-muis/index.html`

The wrapper uses `DomSanitizer.bypassSecurityTrustResourceUrl` with a hard-coded
local asset URL and renders it in a titled iframe. Keep trusted URLs fixed;
do not apply the sanitizer bypass to arbitrary user-provided URLs.

`app/angular.json` includes `src/assets` in the build assets. A browser-based
addition following this pattern needs an asset entry point, an Angular wrapper,
a component declaration, a route, and a home-page tile.

## Orbit source location and architecture

The user supplied this source directory:

```text
C:\data\PersonalOneDrive\OneDrive\Projects\2026-11 Omarchy Lucas\orbit
```

Read the parent project's `AGENTS.md` and `orbit/README.md` before working on
Orbit. The parent instructions identify this as source code, not an assumed
installed Windows executable.

Orbit is a native desktop playground for animated 3D sculptures: a trefoil
knot, a rippling torus, and a fluted sphere. Its README describes animated
spikes, rain, camera orbit and zoom, tempo, pause, and wireframe controls.

- The original Linux/Omarchy edition is C++17 and Qt Quick, with sources under
  `orbit/src`.
- The Windows edition is .NET 10, WinUI 3, and Win2D under `orbit/windows`.
- Before changing the Windows edition, read `orbit/windows/AGENTS.md` and
  `orbit/windows/README.md`.
- Keep the Qt edition intact when working on the Windows edition.

The documented Windows startup command is:

```powershell
& 'C:\data\PersonalOneDrive\OneDrive\Projects\2026-11 Omarchy Lucas\orbit\windows\run.ps1'
```

Use `-NoBuild` only when the current sources have already been built. Orbit was
not built or started during this inspection.

## Orbit browser edition

The user explicitly chose Orbit in the browser, suggesting WebGL. The home tile
now routes to `/orbit`, using `app/src/app/orbit/orbit.component.*` as the iframe
wrapper. The fixed asset URL is `assets/orbit/index.html`.

The browser edition is a JavaScript/WebGL adaptation, not a compiled Qt/WinUI
binary and not a launcher for the local desktop installation. No files in the
original Orbit directory are modified.

Assets are self-contained under `app/src/assets/orbit`:

- `index.html` and `style.css`: responsive viewer and native HTML controls.
- `geometry.js`: the three parametrically defined surfaces, spike placement,
  spike extension and living deformation adapted from `orbit/src/scene.cpp`.
  It also exports its geometry functions through CommonJS for Node tests.
- `orbit.js`: WebGL 1 shaders, flat-lit triangles, wireframe lines, stars, light
  motes and rain; pointer/keyboard input and renderer lifecycle.
- `LICENSE`: the original Orbit MIT license and copyright attribution.

There are no CDN imports, new application dependencies, telemetry, persistence,
or backend requirements for Orbit. Geometry buffers are reused; the GPU handles
rotation, projection, depth testing and lighting. This is intentionally a browser
adaptation rather than exact visual parity with the native renderer.

Controls include shape selection, play/pause, tempo, zoom, wireframe, rain and
reset. Drag or touch to orbit, use a two-finger pinch, wheel or Zoom slider to zoom, and
double-click to reset only the camera. Keyboard shortcuts are Space, 1/2/3,
W, G, R and ?. Form-control keyboard behavior takes precedence.

Reduced-motion preference starts the viewer paused. Animation stops while the
document is hidden or the renderer is paused; control/camera changes still draw
a frame. WebGL context loss disables controls and displays a status; restoration
recreates GPU resources with the current shape and controls. Unsupported WebGL
displays guidance instead of a blank, apparently working viewer.

Omarchy theme/language synchronization and desktop Quit behavior are not
ported. Browser UI strings are English.

### Fullscreen

The Orbit header has a Fullscreen / Exit fullscreen toggle. It requests native
fullscreen for the asset document. Fullscreen is immersive: the canvas fills the
viewport and hides the header, controls, caption, hints and footer. Tap/click the
sculpture or press Enter to toggle the controls overlay; Tab also reveals it for
keyboard navigation. The overlay includes Exit fullscreen and Hide controls.
Dragging and pinching do not reveal controls. Browser-driven exit updates the button via
`fullscreenchange`. Unsupported fullscreen disables the toggle with explanatory
text; a rejected request leaves Orbit usable and displays a status message.
The iframe already grants `allow="fullscreen"`.

Fullscreen has no page scrolling; revealed header and control overlays can
scroll individually on short screens. Resize reports to the Angular parent are suppressed while
fullscreen is active and resume on exit, preserving embedded auto-height.

### Mobile-first behavior

The base CSS targets narrow touch screens; `min-width` breakpoints enhance the
layout for tablets and desktops. Buttons, toggle labels, sliders, the license
link and the Angular back link have touch targets of at least 44 CSS pixels.
The shape buttons have a minimum height of 52 pixels on phones. Settings use a
two-column grid with full-width play and reset buttons on phones.

The viewer height is width-based, not a fixed 390-pixel height or a percentage
of the iframe viewport. Its content reports `orbit:resize` to the Angular wrapper.
The wrapper accepts a finite 200–5000 pixel height only from its own same-origin
iframe, allowing the outer page to scroll normally without an inner iframe
scrollbar. This also handles rotation and content wrapping without a viewport
height feedback loop.

One pointer orbits; two pointers pinch to zoom within the existing 0.55–1.65
range. Lifting one finger resumes orbiting with the other. Cancellation,
context loss, page exit and camera reset clear gesture state. Browser page
scrolling and zooming remain available outside the sculpture canvas.

Mobile validation uses Chromium touch/viewport emulation, not a physical iPhone
or Android handset. It covers 320×568, 360×640, 390×844, 430×932, 568×320,
844×390 and 768×1024 layouts, plus embedded portrait/landscape resizing,
minimum touch targets, pinch limits and one-finger handoff.

## Orbit validation commands

Run from the repository root with a recent Node runtime (tested with Node 24):

```powershell
node --test app/tests/orbit-geometry.test.cjs
```

The optional browser smoke suite uses an existing Playwright installation,
without adding it to this app's dependencies:

```powershell
$env:ORBIT_PLAYWRIGHT_MODULE = 'C:\path\to\node_modules\playwright'
node --test app/tests/orbit-browser.test.cjs
```

It starts and stops its own loopback test server and headless browser. For
built-app tile navigation and direct-route tests, also set `ORBIT_TEST_ROOT` to
the absolute path of `app/dist/gameengine`. Set `ORBIT_SCREENSHOT` to an absolute
PNG path to optionally capture the desktop viewer.

The focused Angular wrapper tests are `orbit.component.spec.ts`. Use the Angular
CLI's `--include` option to run them without unrelated legacy tests.

### Results on November 7, 2026

- Geometry suite: 6 tests passed.
- Expanded headless Chromium suite against the mobile-first production build:
  26 checks passed, including immersive viewport filling on desktop and mobile,
  on-demand controls, pinch without revealing UI, exit after WebGL context loss,
  fullscreen toggling, API-driven exit, rejected and
  unsupported fullscreen, mobile embedded fullscreen restoration,
  the seven-size touch target matrix, two-finger
  pinch bounds and handoff, embedded auto-height after rotation, pause,
  visibility changes, context recovery, unsupported-WebGL fallback,
  tile navigation and direct `/orbit` loading.
- Application and spec TypeScript checks: passed.
- Focused Angular wrapper suite: 4 tests passed, including accepted/rejected
  resize messages. Use the installed Playwright Chromium **headless shell**
  executable as `CHROME_BIN`; it works directly with Karma's ChromeHeadless
  launcher. The full Chromium executable previously left an empty page target
  and needed a CDP workaround. No repository Karma configuration was changed.
- Production Angular build after preserving the newer main branch's co-op
  features: passed. The initial bundle is 717.90 kB, producing
  a warning against the configured 500 kB warning budget; the 1 MB error budget
  is not exceeded. No budget settings were changed.
- The pre-existing `app/package-lock.json` content was preserved unchanged.

## Repository and validation notes

`app/package.json` specifies Angular 12.2 and Node `16.x`. Build and test scripts
are `npm run build` and `npm test`, run from `app`.

On this laptop the available Node is 24 rather than the declared Node 16.
For the legacy Angular/Webpack build, the local validation command is:

```powershell
$env:NODE_OPTIONS = '--openssl-legacy-provider'
node node_modules/@angular/cli/bin/ng build --configuration production
```

Prefer the project's declared Node version in normal development. The direct CLI
command avoids npm 11/PowerShell argument parsing of extra script options.

`app/package-lock.json` was already modified before this work. Preserve that
unrelated change; do not overwrite or include it in an unrelated commit.
