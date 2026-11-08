# Tiles and Orbit integration

Updated on November 8, 2026. The original inspection was followed by a
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
- `orbit.js`: GLSL ES 1.00 shaders on WebGL 2 (WebGL 1 fallback),
  flat-lit triangles, wireframe lines, stars, light
  motes and rain; pointer/keyboard input and renderer lifecycle.
- `xr.js`: independent immersive VR/AR capability detection, session lifecycle, per-eye
  WebXR rendering and controller input.
- `xr-math.js`: tested column-major matrix composition and world-locked
  sculpture placement.
- `sound.js`: gentle breathing-pulse envelope and locally synthesized spatial
  ambience, with opt-in playback, lifecycle cleanup and no audio downloads.
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

### WebXR / Quest

#### Quest feedback and VR compatibility mitigation

On November 8, 2026 the user reported that AR works on a physical Quest and
looks good, but entering VR produces a black screen. This supersedes the
earlier statement that no on-device feedback was available. The agent does
not have that headset; the exact VR failure has not been reproduced locally.

The initial mitigation preserved shared WebGL context creation and AR layer
settings. The Quest 2 follow-up below changes context selection, not AR's layer.
VR uses an alpha-capable RGBA layer like the working AR path, but explicitly
clears it with opaque alpha. VR disables optional layer MSAA and compositor
depth consumption; depth testing of the actual sculpture remains enabled.
AR keeps its transparent background and antialiased layer. The flat renderer's
blend/depth state is restored on XR exit.

These are compatibility mitigations, **not a confirmed diagnosis or confirmed
Quest VR fix**. Synthetic tests cannot reproduce every headset compositor/GPU
behavior. Initial framebuffer completeness and WebGL error checks now report
failures and return to the browser. After layer/reference-space setup, if a
visible session never receives a renderable frame, an eight-second watchdog exits
with a tracking/retry message. Hidden/blurred permission or system UI does not
trigger that timeout.
Setup/render diagnostics are shown below the relevant entry button and also
logged to the browser console. Retest Enter VR on the Quest; if it still fails,
the returned message can guide the next investigation.

#### Quest 2 WebGL 0x502 follow-up

On November 8, 2026 the user identified the headset as a **Quest 2** and
reported "webgl error 502". The existing Orbit diagnostic prints hexadecimal
WebGL codes; `0x502` is `INVALID_OPERATION`, not an HTTP 502 response.
The report alone does not identify the failing GPU call, and the exact
Quest 2 failure has not been reproduced locally.

The user then confirmed that both VR and AR examples at the Immersive Web
samples site work on the same Quest 2. That is evidence against a general lack
of immersive browser support, but not proof of a specific Orbit GPU failure.
Comparison with the current `immersive-vr-session.html`,
`immersive-ar-session.html` and `js/render/core/renderer.js` found that those
samples use a WebGL 2 context with `xrCompatible: true`. Orbit previously
created WebGL 1 without the initial XR-compatible flag.

Orbit now prefers WebGL 2 with that initial flag and retains WebGL 1 when
WebGL 2 context creation is unavailable. Both use the same shaders and retain
RGBA, flat transparency and the existing VR/AR layer settings. Khronos'
WebGL 2 specification explicitly supports GLSL ES 1.00 shaders, so no duplicate
shader implementation or third-party rendering dependency is needed.
This aligns context selection with the working examples; it remains a
compatibility change requiring physical-headset retesting, not a confirmed fix
for the Quest 2 report.

The former first-frame check read the accumulated WebGL error flag only after
both eyes were drawn. It could not distinguish setup errors from geometry,
framebuffer, shader or draw errors. Checks now identify compatibility setup,
layer setup, frame entry, geometry upload, framebuffer clear, each eye's
viewport, shader program, vertex attributes, uniforms and `drawArrays`.
They include the symbolic error name; errors produced by rendering stop the
session. A pre-frame error can use the bounded recovery described below.
Detailed render checks only run on the first frame, not continuously in the
headset's render loop.

A separate, reproducible startup bug was fixed: `makeXRCompatible()` may
legitimately trigger context loss/restoration, but Orbit previously ended
the XR session on every context loss. During that compatibility operation
the session is now retained; the existing restoration handler recreates
programs, uniform locations and buffers before rendering resumes. Context
loss after compatibility still ends XR because its framebuffer is invalidated.
This behavior follows the Immersive Web Working Group's WebXR specification,
section `make-xr-compatible`. **It is not evidence that adapter switching
caused the reported Quest 2 0x502.**

Retesting on the physical Quest 2 is still required after deployment.
If it fails again, capture the entire returned diagnostic, especially the
text after `at`, and confirm whether Enter VR or Enter AR was selected.

Validation on November 8, 2026: all **83 checks passed** (30 flat-browser,
37 synthetic XR and 16 geometry/math/sound checks). The suite covers preferred
WebGL 2, forced WebGL 1 flat/VR/AR fallback, both-eye output, real context
loss/restoration during compatibility, and real WebGL `INVALID_OPERATION`
errors injected during setup, upload, uniforms and drawing. The compatibility
restoration regression fails against the prior committed assets and passes
with the fix. Browser tests used the existing built Angular app with updated
static assets copied in; no new Angular build or dependency/lockfile changes.
These are Chromium GPU/software-renderer tests, not physical Quest 2 tests.

#### AR pre-frame INVALID_OPERATION follow-up

Following commit `4c74453`, the user reported that **AR now also fails** on
the Quest 2 with `WebGL 0x502 INVALID_OPERATION at before first XR frame`.
This supersedes any assumption that the latest AR path is confirmed working.
It does not demonstrate that WebGL 2 itself is the cause: the checkpoint reads
an error already pending before the frame's geometry upload, framebuffer clear
and eye draws. The source of that original error on the headset remains unknown.

The former checkpoint aborted immediately without testing whether the actual
XR frame could render. A local regression with a real, latched WebGL error
reproduces that premature abort while leaving valid GPU resources available.
The renderer now allows **one** startup `INVALID_OPERATION` warning before the
first draw, records it in the console and entry status, and then runs the
normal strict framebuffer/upload/program/attribute/uniform/per-eye draw checks.
Successful first-frame checks are reported alongside the original warning.
Two subsequent frames are checked once each to reject recurring errors.
Other error types, repeated warnings before a valid pose, and new rendering
errors are still fatal. The startup watchdog and context-loss handling remain.

This is a bounded recovery path, not blanket error suppression or a confirmed
Quest fix. WebGL 2 selection and the VR/AR compositor settings are unchanged;
no new renderer toggle, dependencies or lockfile changes were introduced.
Physical AR and VR still need retesting after deployment.

Validation on November 8, 2026: all **91 checks passed** (30 flat-browser,
45 synthetic XR and 16 geometry/math/sound checks), including the final
audio adjustment. Eight new XR checks cover bounded recovery on WebGL 1/2
in VR/AR, a flag appearing during pose retrieval, and rejection of new
uniform errors, other error types and recurring startup errors. Stereo pixels
remain nonempty with transparent AR surroundings and opaque VR coverage.
The pre-frame AR regression fails before this change and passes afterward.
Tests used updated static assets in the existing Angular build; no new build
was required. No physical-headset validation was performed by the agent.

Use the asset directly in the Quest browser:

```text
https://gentle-field-09d23da03.azurestaticapps.net/assets/orbit/index.html
```

Choose **Enter VR**, not Fullscreen, and grant VR permission. The button requests
an `immersive-vr` session; the regular Fullscreen button remains the flat
browser-panel mode. The Angular wrapper additionally delegates
`xr-spatial-tracking` to its iframe so VR can also be entered from `/orbit`.
VR requires a secure context (HTTPS, or localhost for development) and browser
support for immersive WebXR.

The same three sculptures are rendered in a dark VR environment, with distinct
projection/view matrices for each eye and tracked head movement. The sculpture
is placed 1.8 meters in front of the initial horizontal gaze, at the initial
eye height, at a fixed physical scale of 0.30 meters per geometry unit. It stays
world-locked instead of following the head. Reference-space resets re-center it.
`local-floor` is optional; `local` is the fallback.

VR has no HTML control panels or forced camera locomotion. On standard tracked
controllers:

- Trigger (`select`): play/pause.
- Grip (`squeeze`): next sculpture.
- Left thumbstick up/down: move the sculpture closer/further away, within
  0.85–4.5 meters of its initial anchor.
- Right thumbstick: rotate the sculpture.
- Headset system menu: leave VR; the browser's Exit VR button is also available
  when the browser UI is accessible.

Head tracking keeps rendering even when sculpture animation is paused.
Geometry is updated/uploaded once per XR frame and reused for both eyes.
The XR session owns its animation loop; ordinary window frames are stopped until
VR ends. Ending/re-entering VR restores browser rendering and existing controls.
Missing tracking poses and hidden/blurred XR sessions do not advance animation.
Context loss and page exit end the XR session and restore/release resources.

The **Enter VR** mode is VR, not passthrough AR. The browser's flat rain, stars, halo and floor
effects are intentionally not rendered in VR: only the actual lit 3D sculpture
is shown, avoiding head-locked background graphics. Browser zoom controls remain
0.55–4× in flat mode; VR uses physical approach/head movement and the controller's
distance adjustment instead.

Sources used for API implementation: the Immersive Web Working Group's
`webxr-samples` immersive-vr-session and input-tracking examples.
Validation uses synthetic XR sessions with actual WebGL shader/framebuffer
rendering. The user has now reported successful physical Quest AR, but
**the updated VR path has not been verified on a physical headset**.
Controller mappings, comfort, performance and the new sound still need an
on-device check.

### Breathing pulse and spatial sound

**Pulse** gently scales the sculpture around its fixed anchor (at most +/-7.3%)
and modulates its lighting. It uses the shared animation time, so Tempo changes
its pace and Pause freezes it. Reduced-motion preference disables Pulse by
default and starts paused; the checkbox can explicitly enable it.
There is no strobe or camera movement. The same effect works in flat, VR and AR.

**Sound off/on** opts into quiet synthesized ambience: detuned triangle/sine
voices, a low-pass filter, slowly changing chords and a soft echo. No external
music files, CDN, network calls or new dependencies are used. The envelope
follows the same breathing clock; pauses and hidden/blurred/tracking-lost sessions
fade to silence. With Pulse disabled, ambience has steady volume. Browser/headset
volume still determines actual loudness.

On November 8, 2026 the user reported hearing very little music on the headset.
The chord voices were moved up one octave to 220/261.6/329.6 Hz with a 110 Hz
bass voice, replacing the bass-heavy 55–164.8 Hz mix. Voice gains are balanced
at 0.18 and maximum master gain was raised from 0.10 to 0.16. This targets
clearer, more audible ambience without introducing autoplay or downloaded music.
Mute, pause, visibility fading, pulse modulation and spatial attenuation remain.
Audibility on the actual Quest speakers still needs confirmation; device volume
matters, and Sound must be on with the animation playing.

After that audio-only adjustment, seven focused sound/pulse/browser/XR checks
passed against the updated built assets. Real OfflineAudioContext output has
RMS above 0.01 and peak below 0.15 in the tested excerpt, with exact silence
when muted. Opt-in, pause/visibility fading, spatial placement, controller
mute and audio initialization retries remain covered. The earlier 83-check
run preceded this final audio adjustment; a second full suite was not run.

In XR, an HRTF panner follows the sculpture's reference-space position, including
AR placement changes, while the listener follows headset position/orientation.
Click the **right thumbstick** to toggle sound without an HTML panel; holding
the click toggles only once. Enter XR unlocks an initially silent audio graph
from the entry gesture, so sound can later be enabled using the controller.
Sound is off until the user opts in. Missing/denied audio reports a retry hint
without preventing graphics or XR entry. Contexts/nodes are released on page exit.

API references: the Immersive Web Working Group's `webxr` and
`webxr-gamepads-module` specifications, and the W3C `web-audio-api` specification.

Validation for the pulse/sound and VR compatibility changes on November 8, 2026:

- 29 flat-browser checks, 29 synthetic XR checks, 6 geometry tests, 6 XR math
  tests and 4 sound lifecycle/pulse tests passed, including a targeted rerun of
  the expanded phone iframe height check (74 individual checks total).
- Real WebGL framebuffers verify stereo geometry, opaque VR/wireframe coverage,
  transparent AR, pulse freeze and renderer recovery. Real OfflineAudioContext
  rendering verifies nonempty, bounded synthesized samples and muted silence.
  Synthetic audio tests cover spatial positions, controller mute, pause/visibility,
  denied/missing audio and retry after partial initialization.
- Flat-browser tests use deterministic unsupported-XR availability rather than
  the host headset service, and wait for capability-message layout before taking
  snapshots. Touch tests target canvas bounds, not a hard-coded screen position.
  The phone iframe height guard now allows up to 1200 pixels for the added controls;
  exact content/iframe height agreement and no nested/horizontal scrolling remain
  required.
- Updated static assets were copied into the previously built Angular app.
  No new Angular build, application dependencies or lockfile changes were needed.
  These tests do not confirm that the reported physical Quest VR fault is fixed.

### Passthrough AR / walk-around sculpture

Choose the separate **Enter AR** button in the Quest browser and allow the
headset's AR permissions. This requests `immersive-ar`, independently of
`immersive-vr` support. Only one session can run at a time; exit one mode before
entering the other. Unsupported or rejected AR displays a message and never
silently falls back to VR.

AR renders a transparent background in an alpha-enabled XR layer, allowing
the headset compositor to show passthrough (or a supported additive transparent
display). The actual sculpture is rendered as opaque stereo geometry. Opaque
AR composition is rejected rather than covering the room with a dark background.
The application does not access camera image data.

The sculpture floats 1.8 meters ahead at the initial eye height and keeps a
fixed reference-space position and physical scale. Physically move sideways,
closer or around its back to see other sides; headset pose/projection changes
the view, not the sculpture position. To move the object deliberately in AR:

- Left thumbstick: move left/right and forward/back relative to the headset's
  current horizontal gaze, at up to 0.6 meters per second.
- Hold the left trigger and push that thumbstick up/down: raise/lower the object.
  In this height mode, left/right input is ignored. The left trigger does not
  also toggle pause when released.
- Release the stick: keep the new reference-space position, even when walking,
  turning, pausing or changing shape.
- Right trigger: play/pause. Grip: next sculpture. Right thumbstick: rotation.

Diagonal movement is normalized, small stick drift is ignored, and offsets
are limited to +/-3 meters on each horizontal reference-space axis and +/-2
meters vertically relative to initial placement. These are travel limits, not
room boundaries or obstacle detection. Tracking/visibility gaps do not cause
catch-up movement. Reference-space reset or a new session clears the offsets.
Only `xr-standard` controller input is handled; there is no hand-tracking drag
gesture. The session has no HTML panels or virtual camera locomotion.

This is initial in-air placement, not plane detection or a saved room anchor.
There is no hit-test placement, room mesh, real-furniture occlusion, collision
detection or persistent placement between sessions. A headset reference-space
reset re-centers placement; merely walking/turning does not. Starting AR again
places the object ahead of the current initial gaze.

Clear a safe area before entering AR. The app cannot detect obstacles; use the
headset's boundary and avoid walking into furniture. The user has reported
successful Quest AR. New controls, sound, tracking accuracy
and the updated VR path still require additional on-device checks.

AR implementation follows the Immersive Web Working Group's
`webxr-samples/immersive-ar-session.html` example. Synthetic tests verify
framebuffer transparency, not the headset's passthrough compositor.
The AR movement modifier uses the group's `webxr-gamepads-module` mapping:
primary trigger `buttons[0]`, thumbstick `axes[2]` / `axes[3]`.

AR movement validation on November 8, 2026:

- All 24 XR browser checks and 27 normal browser regressions passed with the
  updated static assets copied into the previously built Angular app.
- All 6 geometry and 6 XR math tests passed. Added coverage includes horizontal
  gaze-relative translation, trigger-modified height, fixed placement on release,
  dead zones, invalid controller input, normalized diagonals, travel bounds,
  tracking gaps, reset/re-entry and unchanged right-trigger/grip actions.
- No Angular source or dependency changes were needed, so no new Angular build
  was run for this asset-only change. Physical Quest validation is still pending.

Initial AR validation on November 8, 2026 (before movement controls):

- 21 synthetic XR browser tests passed against the production build, including
  transparent/opaque pixel coverage, stereo output, front/side/back walk-around
  poses, fixed placement during controller input, shape changes and pause,
  additive composition, independent VR/AR support, exit recovery and unsupported,
  denied or opaque AR sessions and both entry modes from the Angular iframe.
- All 27 existing browser regressions and 6 geometry / 4 XR math tests passed.
  Mobile touch targets, iframe auto-height, fullscreen and tile navigation remain
  covered. The source-asset run also passed (19 XR / 24 browser tests, with
  built-app-only checks skipped).
- The production build passed. Initial bundle: 717.92 kB, with the existing
  500 kB warning budget exceeded; the 1 MB error budget is not exceeded.
  No application dependencies or build budgets were changed.
- These checks simulate headset poses and session events using real WebGL
  framebuffer rendering. They do not validate physical Quest passthrough,
  controller mappings, comfort, tracking accuracy or performance.

Initial VR validation on November 8, 2026 (before the AR addition):

- 14 synthetic XR browser tests passed against the production build: per-eye
  viewports and projections, actual nonempty/different WebGL eye images,
  world-locked head movement, three sculptures, controller input/range limits,
  pose loss, visibility changes, recenter/floor fallback, session cancellation,
  page lifecycle, context loss/recovery, capability changes, permission/setup
  errors and entry from the Angular iframe.
- 27 existing browser regression checks passed against the production build.
- 6 geometry tests, 4 XR math tests and 4 Angular wrapper tests passed.
- Application/spec TypeScript checks and the production build passed.
- Initial bundle: 717.92 kB; the existing 500 kB warning budget is exceeded,
  while the 1 MB error budget is not. Budget settings were not changed.

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

One pointer orbits; two pointers pinch to zoom within the 0.55–4.00
range. Lifting one finger resumes orbiting with the other. Cancellation,
context loss, page exit and camera reset clear gesture state. Browser page
scrolling and zooming remain available outside the sculpture canvas.

Mobile validation uses Chromium touch/viewport emulation, not a physical iPhone
or Android handset. It covers 320×568, 360×640, 390×844, 430×932, 568×320,
844×390 and 768×1024 layouts, plus embedded portrait/landscape resizing,
minimum touch targets, pinch limits and one-finger handoff.

The maximum zoom was increased from 1.65× to 4× on November 8, 2026 for closer
detail inspection. Wheel and pinch limits are read from the slider attributes,
so all three inputs share the same range. The starting/reset zoom remains 1×.
Zoom changes projection magnification, not camera distance; close-up views
intentionally crop parts of the sculpture at the viewport edges.

Validation on November 8: 27 browser checks and 6 geometry tests passed.
Browser checks used both source assets and the existing built Angular app with
the updated static assets copied into its asset directory; no new Angular build
was needed for this asset-only change. Coverage includes 4× slider close-ups
for all three sculptures, wheel/pinch limits, immersive pinch and camera reset.

## Orbit validation commands

Run from the repository root with a recent Node runtime (tested with Node 24):

```powershell
node --test app/tests/orbit-geometry.test.cjs
node --test app/tests/orbit-xr-math.test.cjs
node --test app/tests/orbit-sound.test.cjs
```

The optional browser smoke suite uses an existing Playwright installation,
without adding it to this app's dependencies:

```powershell
$env:ORBIT_PLAYWRIGHT_MODULE = 'C:\path\to\node_modules\playwright'
node --test app/tests/orbit-browser.test.cjs
node --test app/tests/orbit-xr.test.cjs
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

`app/package-lock.json` initially appeared modified, but later inspection
confirmed its contents matched Git exactly. On November 8 the user requested
CRLF line endings in the working copy; that conversion left Git clean. No
dependency versions changed. Preserve any future unrelated lockfile edits.
