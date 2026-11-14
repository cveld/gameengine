# Tiles and Orbit integration

Updated on November 9, 2026. The original inspection was followed by a
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
- `/orbit`: Orbit chooser (added November 11, 2026); classic Orbit moved to
  `/orbit/classic`, the Orbit Catch game is at `/orbit/catch`
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
- `xr-hands.js`: optional tracked-joint sampling and tested direct-grab,
  release, tracking-loss and shape-gesture state machines.
- `xr-diagnostics.js`: pure session-profile selection and bounded, locally
  copyable diagnostics; requested features remain distinct from browser grants.
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
Controller input uses `xr-standard` mappings. Optional direct hand manipulation
is described below. The session has no HTML panels or virtual camera locomotion.

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

#### Quest boundary and walking around the room

On November 8, 2026 the user asked about disabling the Quest boundary in AR
to walk around the whole room. Orbit does not clamp physical headset movement:
the +/-3 meter limits above apply only to controller-driven sculpture placement.
Do not remove those object limits as a supposed fix for the headset's boundary.
The current WebXR app does not control the Quest system's Boundary/Guardian.

Prefer a room-scale boundary covering the actual clear floor area rather than
a stationary play circle. Do not include furniture, stairs or other hazards
just to enlarge the boundary.

ArborXR's first-party device-management guide, "How to disable the Boundary on
Meta Quest Devices" (updated June 23, 2026), documents a developer-mode path:
Settings > System > Developer > Custom Settings > Physical Space Features off.
That option is a system-level development override, not an Orbit AR-only toggle.
Availability depends on the device/software configuration; the guide excludes
Horizon Managed Services Shared Mode. Do not promise that disabling physical
space features preserves passthrough and tracking on the user's Quest 2.
On November 9, 2026 the user confirmed that turning this setting off also
removed passthrough on their Quest 2. This override is therefore not a working
solution for their walk-around AR goal. Re-enable Physical Space Features;
retain a room-scale boundary over the actual clear floor area. The agent
has not independently tested the headset.

Reference:

```text
https://help.arborxr.com/en/articles/8638529-how-to-disable-the-boundary-on-meta-quest-devices
```

On November 9, 2026 a standards review identified an experimental browser path:
request the optional `unbounded` feature and try an `unbounded` reference space,
falling back to the current local-floor/local path if unavailable. WebXR defines
this space for free movement over larger distances; it does not specify a
Guardian-disable switch. Quest 2 support and the browser's boundary behavior
while retaining passthrough have not been confirmed. That initial review did not
change the application; the separate experiment below was subsequently added.

Later on November 9 the user reported that the "create a new boundary here"
system dialog still appears after the experiment. The selected reference-space
label was not reported, so this does not establish whether the browser granted
`unbounded` or Orbit used its fallback. It does establish that the experiment
has not solved the user's boundary-free AR goal. Do not present it as a fix.

A follow-up online review read the WebXR specification and Meta's OpenXR
`meta_boundary_visibility.h`. The former defines unbounded tracking, not a
Quest Boundary/Guardian-disable function. The latter defines the **native**
`xrRequestBoundaryVisibilityMETA` API and a runtime capability check,
`supportsBoundaryVisibility`, and permits a suppression-not-allowed result.
It is not a JavaScript WebXR API; Quest 2 support was not verified. No confirmed
Quest 2 browser workaround retaining passthrough was found. Do not recommend
turning off Physical Space Features again given the user's earlier passthrough
loss. A native application would be a separate investigation, not an extra
WebXR session option.

#### Working native APK reference

Later on November 9 the user reported a working native APK with full AR and
no Guardian from another session. That session's latest user feedback confirms
success after installation of Makepad's MR-only example. Its source was read
without modifying the other session's active project:

```text
C:\work\git\github\makepad\makepad\examples\xr\resources\android\README.md
C:\work\git\github\makepad\makepad\examples\xr\resources\android\AndroidManifest.xml.template
C:\work\git\github\makepad\makepad\platform\src\os\linux\openxr.rs
```

The manifest requires `com.oculus.feature.BOUNDARYLESS_APP` and
`com.oculus.feature.PASSTHROUGH`, and declares
`com.oculus.permission.BOUNDARY_VISIBILITY`. The native renderer submits system
passthrough behind transparent virtual content. The other session previously
reported runtime rejection of its contextual suppression request; the working
variant subsequently added the MR-only app classification. Do not conflate
native API support, request acceptance and a boundaryless application manifest,
or attribute success to `unbounded` tracking.

This is useful positive evidence that native boundaryless AR is possible on
the user's setup, correcting the earlier lack of a working native reference.
It is not evidence that Quest Browser exposes equivalent controls to WebXR.
An Android package manifest is not a web-app manifest or a WebXR session feature.
The remaining investigation is browser/vendor support for a contextual AR-only
policy, not whether the headset can do it at all. No confirmed WebXR switch was
found in this review. A native wrapper would require actual XR integration;
packaging a web page alone does not establish WebXR support or boundary behavior.
Keep this MR-only manifest away from opaque VR modes, as its source README warns.

#### Minimal AR comparison and browser diagnostics

On November 9, 2026, after the user reported a working native boundaryless APK,
reviewed primary sources again. The web search tool returned empty output, so
the official sample/specification and Meta's published native reference were
retrieved directly over HTTPS instead of relying on search snippets.

The current official `immersive-ar-session.html` requests `immersive-ar` without
optional features and selects `local` tracking. Orbit's standard AR instead
requests optional `local-floor` and `hand-tracking`, trying `local-floor` before
`local`. Added an opt-in **Minimal AR test** under **Shortcuts** to isolate that
request/reference-space difference. It affects **Enter AR** only, requesting
no optional features and only `local`. It does not reproduce the entire sample
renderer or change the existing transparent compositor path. The standard AR,
VR and free-roam profiles remain unchanged. The checkbox is locked during
startup and active sessions and is not persisted across reloads.

Minimal AR does not request hand tracking, so use controllers for this A/B
test. Uncheck it to restore the existing hand-enabled AR experience. It reuses
standard AR placement/reset behavior, not persistent spatial anchors. Do not
describe this experiment as guaranteed boundaryless AR.

Meta's native reference describes boundaryless apps as standalone APKs with no
fully immersive/non-passthrough moments; it separately describes contextual
suppression with an active passthrough layer. Neither Android manifest flags
nor `OVRManager` properties are WebXR session features. The WebXR specification
allows browser/runtime safety overlays and defines `enabledFeatures` as actual
granted features. No equivalent browser Guardian-disable API was confirmed by
this review. The native APK remains evidence of native support, not a browser
capability. Do not add invented `boundaryless` features.

Chromium's current OpenXR implementation distinguishes `local`, `local-floor`
and `bounded-floor`, with `bounded-floor` mapped to native STAGE and a separate
local-floor space. Do not assert that requesting `local-floor` necessarily uses
STAGE or causes Guardian setup. The minimal profile is a controlled comparison,
not an established diagnosis of the Quest Browser implementation.

The read-only **Last XR attempt** report records browser user agent, secure
context, WebGL version, mode support, profile, requested versus enabled
features, selected reference space, blend mode, first rendered frame and input
capabilities. Unsupported/missing `enabledFeatures` stays `null`, never inferred
from requested features. Startup warnings, errors, visibility, input changes,
resets and termination are bounded to 24 events with 200-character details.
No per-frame DOM logging, room/head/hand poses, device IDs, URLs or telemetry
fields are collected. Error messages are included; review before sharing.
The report remains available after failure/exit and starts fresh on retry.
Copying is opt-in with a selected-text fallback if clipboard access is denied.
The diagnostics live in the scrollable mobile dialog, not the immersive view.

Quest comparison steps:

1. Leave Physical Space Features and passthrough enabled.
2. Open **Shortcuts**, enable **Minimal AR test**, close the dialog, then use
   **Enter AR**. Clear your walking space; do not disregard system warnings.
3. After exit or a cancelled boundary prompt, open **Shortcuts** and
   **Copy XR report**. If the prompt blocks session creation, reference space
   and enabled features may correctly still be unknown.
4. Repeat with Minimal AR off, and optionally with **Enter free-roam AR**.
   Compare the reports and whether the system boundary prompt appeared.
5. A prompt that occurs before the browser returns an XR session cannot be
   suppressed by later JavaScript reference-space selection.

Primary references retrieved during this review:

```text
https://raw.githubusercontent.com/immersive-web/webxr-samples/main/immersive-ar-session.html
https://raw.githubusercontent.com/immersive-web/webxr/main/index.bs
https://raw.githubusercontent.com/meta-quest/agentic-tools/main/skills/hz-unity-meta-core-sdk/references/boundaryless.md
https://raw.githubusercontent.com/chromium/chromium/main/device/vr/openxr/openxr_api_wrapper.cc
```

Validation: 33 pure Node checks passed (geometry, XR math, hands, sound and
diagnostics), plus 7 focused Chromium cases. The browser cases cover minimal
local-only AR with transparent stereo, unknown versus granted features and
input capabilities, denied startup plus both clipboard paths, the 390×844
mobile dialog, existing AR/free-roam hand gestures, and opaque VR rendering.
The minimal profile and rendering/gesture regressions used the existing built
Angular app with updated static assets copied in; no dependency/lockfile or
Angular wrapper changes and no full rebuild were needed. These are synthetic XR
checks with real WebGL, not a physical Quest boundaryless-AR confirmation.

##### Local-only AR with optional hands

Subsequently the user reported that Guardian apparently no longer activates,
but hand gestures no longer work. No XR report was supplied, so do not claim
that boundaryless operation is independently confirmed or infer which features
were granted. With the no-feature minimal profile, missing articulated hand
input is expected: the hand-input specification requires requesting
`hand-tracking` to access articulated hand poses.

Added **Hand tracking in minimal AR** as a separate opt-in checkbox under
**Shortcuts**. Enable **Minimal AR test** first, then enable the hand option,
close the dialog and start a new **Enter AR** session. This selects profile
`minimal-local-hands`: optional features `["hand-tracking"]`, reference space
`local` only. No floor/unbounded feature is reintroduced. Both experiment
settings are locked during pending/active XR; the hand setting is also disabled
when minimal AR is off. Leaving the hand option off retains the known
no-feature comparison. VR/free-roam and standard AR ignore the extra checkbox.

The existing thumb/index grab-and-place and left thumb/middle shape gesture
logic is reused without changing its thresholds or controller fallback.
Hand tracking remains optional: denied support does not intentionally reject
AR. Check `enabledFeatures` and input capabilities in the XR report; a visible
passthrough image of the user's hands does not establish articulated tracking.
On the Quest, compare hand response and the boundary prompt with and without
this one extra feature; neither outcome is guaranteed by the browser API.

The hand-input specification was retrieved directly after the web tool again
returned empty output:

```text
https://raw.githubusercontent.com/immersive-web/webxr-hand-input/main/index.bs
```

##### Visible deployed commit

The user requested a visible commit hash to distinguish published versions.
The website shell and standalone/embedded Orbit now have a footer version
label, also included in the XR report. Source/dev-server pages say
`Commit: development`. `npm run build` runs `scripts/stamp-build.cjs` through
`postbuild`, stamping the same seven-character commit and full-hash tooltip
into both built HTML files. Local pending changes add `(local changes)`.
There is no runtime fetch of a newer version label that could mislabel cached
older Orbit assets, and no hardcoded self-referential commit in source.

The workflow prepares ignored `.build-commit.json` from `GITHUB_SHA` before
the hosted build and explicitly uses `npm run build`; prepared metadata is
the fallback if Git is unavailable in the build container. Missing/duplicate
HTML markers and invalid hashes fail stamping rather than inventing a version.
When using the direct Angular CLI, run `node scripts/stamp-build.cjs` afterward.
This hook uses the project's default `dist/gameengine` output path.
Orbit's script/style URLs receive the same commit as a cache-busting query;
Angular production bundles already have content hashes. Reload the page after
deployment; an older cached HTML document still displays its older label.
No controls are added to the immersive compositor view.

Validation for these additions: 22 Node tests and 5 focused browser cases
passed. Coverage includes local-only hand grab/place/shape changes, optional
hand-feature denial with controller fallback, the original no-feature minimal
profile, mobile dialog layout, and matching website/iframe commit labels with
cache-busted asset URLs and the version in the XR report. Workflow YAML was
parsed successfully. `npm run build` completed with the postbuild stamp:
718.03 kB initial bundle, above the existing 500 kB warning budget but below the
1 MB error budget. No dependency or lockfile contents changed. These checks
do not establish Guardian behavior on the physical Quest.

##### Quest follow-up, November 10, 2026

The user selected both minimal-AR checkboxes and entered AR, but reported
Guardian active and no hand gestures. This combination has therefore not
achieved the user's boundary-free, hand-interactive AR goal. The earlier report
of apparently absent Guardian with the no-feature profile is not a verified fix.
Do not attribute the new boundary prompt specifically to the hand feature
without a repeatable comparison and the actual headset report.

Deployment was checked rather than assumed: GitHub run `42715185469` for
`f92b4000064a939a1f585add20a73609c00bbcf4` completed successfully. Its log
records both version stamping and deployment completion on November 9 at
22:51 UTC. Direct HTTPS checks on November 10 returned HTTP 200 and
`Commit: f92b400` in both the website shell and Orbit HTML. Orbit's XR script
URL includes that commit, and the live profile module contains
`minimal-local-hands`. This confirms the server deployment, not the version
actually loaded in the user's Quest tab.

For both checkboxes, the code requests only optional `hand-tracking` and
selects `local`; the 5 profile/diagnostic unit tests were re-run successfully.
Requesting an optional feature does not prove it was granted or that valid
joint poses are being supplied. The next required evidence is the user's
**Copy XR report** after the failed attempt: build version, profile, requested
and enabled features, reference space, input sources and joint-pose API
availability. `enabledFeatures: null` means unknown, not a denial.
Existing diagnostics identify hand sources but do not count valid joint poses,
so even a hand-enabled report would not by itself establish functioning
gesture recognition. No speculative rendering, permission or safety-boundary
changes were made during this follow-up.

##### Quest permissions and retrieving the report from a PC

On November 10 the user explained that copying from the headset is difficult
and that no new hand-permission prompt appears, despite earlier approval in
free-roam AR. Do not equate the lack of a new dialog with permission denial.
WebXR permissions consider session mode and features; articulated hand input
requires the `hand-tracking` feature in each requested session. A previous
generic XR/spatial-tracking approval is not proof of a hand feature grant.
Browser consent UI and reuse of previous decisions are not controlled by Orbit.
Normal AR and free-roam AR here both use `immersive-ar` on the same origin;
they are different feature profiles, not different websites or XR session modes.
VR uses `immersive-vr`. The actual granted features still require evidence.

The local PC already has Android Platform Tools. At this check, ADB reported
an authorized device and `ro.product.model` returned `Quest 2`. No browser
contents were read, no headset settings were changed, and USB versus wireless
transport was not inferred from that check.

For interactive remote debugging, enable developer/USB debugging if needed,
use a data-capable USB connection and approve the headset's USB debugging
authorization. On PC Chrome open `chrome://inspect/#devices`, enable
**Discover USB devices**, then **inspect** the relevant Orbit tab when exposed
by Quest Browser. This is the Android/Chromium remote-debugging route; the
authorized ADB connection alone does not prove a browser target is listed.
The user's existing native APK setup may already satisfy these prerequisites.

In the remote DevTools console, this read-only command copies the existing
report to the PC clipboard, handling either the Angular parent or direct asset:

```javascript
copy((document.querySelector("app-orbit iframe")?.contentDocument ?? document)
  .querySelector("#xr-report").value);
```

Do this after the failed session attempt, preferably after exiting XR. Use
only the known Orbit page, not unrelated browser tabs. The report remains in
the page after exit; refreshing first would discard that attempt. Review the
copied report before sharing. A photo of the relevant report fields is a
low-setup fallback if remote inspection is unavailable.

Primary documentation retrieved directly over HTTPS:

```text
https://developer.chrome.com/docs/devtools/remote-debugging/
https://www.w3.org/TR/webxr/
https://www.w3.org/TR/webxr-hand-input-1/
```

#### Experimental free-roam AR entrance

On November 9, 2026, added **Enter free-roam AR** beside the existing VR and AR
buttons. This still requests `immersive-ar`, never a VR session or a native
Boundary/Guardian override. Both AR entrances share the AR capability check.
The normal AR/VR entrances retain their existing optional `local-floor` feature
and `local-floor` / `local` reference-space selection.

The experimental entrance requests optional features `unbounded` and
`local-floor`, then tries reference spaces in this order:

1. `unbounded`;
2. `local-floor` if unbounded is unavailable;
3. `local` if floor tracking is also unavailable.

Its status reports the actual selected space, explicitly identifies fallback,
and warns that it does not disable the headset safety boundary. Keep Quest
Physical Space Features enabled to retain passthrough. The same transparent
RGBA stereo renderer, controller object movement, animation and opt-in spatial
sound are used. No controls are added to the immersive headset view. Only the
active entrance becomes an exit button; other entrances cannot start a second
session. Exit returns keyboard focus to the entrance used.

Known reference-origin resets preserve the entire scene coordinate system
through an offset reference space, retaining placement, orientation and
controller/audio coordinates. The reset listener stays on the original,
un-offset space so every reset has an unambiguous native-origin frame.
Inverse corrections are composed newest-first when rebuilding the scene space;
translations and rotations do not commute. This work happens only on significant
resets, not each frame. The time delta is cleared to prevent held input
from causing an extra movement step immediately after a reset. This behavior
also applies when the experimental entrance falls back to local tracking.
Normal AR/VR retain their existing recenter-on-reset behavior.

The current WebXR specification defines `XRReferenceSpaceEvent.transform` as
the **post-event native origin in the pre-event coordinate system**. Therefore
the replacement uses `getOffsetReferenceSpace(event.transform.inverse)` to
cancel the change. The samples' `immersive-ar-session.html` reset handler fetched
on November 9 passes `evt.transform` directly; that detail was not copied.
Synthetic translation-plus-rotation tests exercise the specified direction and
compare both eye view-projection matrices, not just the sculpture position.

If the runtime cannot supply a reset transform, or offset creation fails, the
experiment ends with an actionable message instead of silently moving the object
to a potentially unsafe new location. Re-enter to place it again. Unbounded
tracking may drift gradually without a reset event; this is not a persistent
real-world anchor implementation and does not guarantee tracking stability over
large areas. Orbit cannot detect obstacles or change Quest system safety policy.
Actual unbounded support, passthrough, audio and boundary behavior on Quest 2
still require on-device verification; synthetic tests are not headset evidence.

Focused validation on November 9, 2026:

- 16 geometry, XR-math and sound unit tests passed.
- 12 new free-roam AR checks passed, including both reference-space fallbacks,
  repeated translated/rotated origins, controller placement across a reset,
  resets before placement, re-entry, unavailable AR, opaque passthrough rejection,
  startup diagnostics and ending during reference-space negotiation.
- Existing normal VR opaque stereo and AR transparent stereo checks passed.
- All seven 44-pixel mobile touch-target/layout sizes passed, as did the built
  Angular `/orbit` iframe auto-height/rotation check.
- JavaScript syntax checks and `git diff --check` passed. No dependency or
  lockfile changes were made; working-copy CRLF endings were preserved.

These are 38 distinct focused checks, not a rerun of the full 103-check suite.
The monolithic reused-browser run was stopped after repeated navigation
timeouts before the page DOM existed, including on unchanged flat-view tests.
Focused cases were then run in separate Node invocations with a fresh browser.
One `local-floor` case still timed out during navigation but passed on rerun;
the final repeated-origin test was also rerun after the original-space listener
and correction composition were finalized. Do not treat these local browser
startup failures as proof of a Quest rendering issue, or relax the production
XR startup watchdog to make a synthetic test pass.

Specification references:

```text
https://www.w3.org/TR/webxr/
https://immersive-web.github.io/webxr/spatial-tracking-explainer.html
https://raw.githubusercontent.com/immersive-web/webxr/main/index.bs
https://raw.githubusercontent.com/immersive-web/webxr-samples/main/immersive-ar-session.html
https://raw.githubusercontent.com/meta-quest/Meta-OpenXR-SDK/main/OpenXR/meta_openxr_preview/meta_boundary_visibility.h
```

#### Hand tracking and direct manipulation

Added on November 9, 2026. The standard profiles for all three XR entrances
request optional `hand-tracking` alongside their existing reference-space features. A runtime
without hand tracking can still start XR and use controllers. Enable hand
tracking on the headset and allow browser access; optional-feature requests
alone do not prove hardware/runtime support.

- Either hand: first open the hand, then pinch thumb/index near the sculpture
  to grab. Move the pinched hand and open the fingers to place the object.
  The initial center-to-pinch offset is retained so grabbing does not snap the
  sculpture's center to the fingers.
- Left hand: with the index finger open and neither hand grabbing, pinch
  thumb/middle finger for 0.3 seconds to advance through the three shapes.
  Release before repeating. This is deliberately distinct from the grab pinch.
- A 22 mm pinch threshold and 35 mm release threshold reduce flicker. Grab
  proximity uses an approximate 0.95 m bounding sphere including the sculptures'
  spikes; this is not exact mesh collision or distant ray selection.
- Only one hand owns a grab. Direct placement relocates the sculpture's anchor
  and is not restricted to the controller's +/-3 m adjustment offset. Controller
  translation waits while a hand owns the object. Rotation, controller shape
  selection and controller pause retain their existing actions.
- Missing, denied, emulated or non-finite joint poses release a grab at its last
  position. Visibility/pose loss, reference-space reset, a frame gap over 250 ms
  or a hand jump over 0.5 m between samples also release safely. A closed pinch
  cannot reacquire until an open hand is observed, preventing recovery jumps.
- Native hand `select`/`squeeze` events are ignored: the hand-input standard
  allows overlapping pinch actions, which must not also pause or change shape
  during direct manipulation.

Joints are read with `XRFrame.getJointPose` in the same active reference space as
the sculpture and stereo eyes. There is no room collision, persistent anchor,
two-hand scaling, hand-driven rotation or rendered virtual hand mesh. In AR the
user sees real hands through passthrough; logical hand interaction also works
in VR but hand meshes are not drawn. No immersive HTML controls are added.
Physical Quest 2 gesture recognition, permissions and comfort still need testing.

Focused validation: 35 checks passed (29 unit tests, including 13 hand-state/
sampling checks; one hand-interaction browser check per XR entrance; a
controller fallback check with unavailable hand joints; the existing VR RGBA
stereo check; and the 390x844 mobile touch-target/layout check). Browser checks
used separate fresh-browser invocations and the updated assets copied into the
existing Angular build. No full browser-suite or new Angular build was run for
this asset-only change. A Float32 intermediate grab-offset rounding issue was
fixed and covered explicitly. JavaScript syntax and whitespace checks passed.
No dependencies or lockfile contents changed.

Primary references read online:

```text
https://raw.githubusercontent.com/immersive-web/webxr-hand-input/main/index.bs
https://raw.githubusercontent.com/immersive-web/webxr-samples/main/immersive-hands.html
```

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

## Orbit chooser and Orbit Catch

Added on November 11, 2026 at the user's request. The home tile still routes to
`/orbit`, which is now `OrbitChooserComponent` (`app/src/app/orbit-chooser`):
the user first picks **Classic Orbit** (`/orbit/classic`, the existing
`OrbitComponent` and `assets/orbit/index.html`, unchanged) or **Orbit Catch**
(`/orbit/catch`, `app/src/app/orbit-catch`, iframe of
`assets/orbit-catch/index.html` with `allow="fullscreen; xr-spatial-tracking"`).
`/orbit/diagnostics` is unchanged. Browser tests that expected the classic
iframe at `/orbit` now use `/orbit/classic`.

Orbit Catch is a self-contained asset (no CDN or new dependencies):

- `game.js`: pure, Node-tested rules. 90-second round after a 3-second
  countdown. Orb 1, cube 2, gold gem 5 points; constant fall speeds of
  0.9/1.15/1.5 m/s. Objects spawn 0.35–1.6 m around the player's *current*
  horizontal position, 2.2–2.6 m above the floor, every 1.1 s shrinking to
  0.45 s; at most 12 at once. Every three consecutive catches raise the
  multiplier (max ×4); a floor hit is a miss and resets it.
- `catch.js`: WebGL 2/1 renderer (GLSL ES 1.00), immersive session, hands and
  flat fallback. AR requests optional `unbounded`, `local-floor`,
  `hand-tracking` and tries `unbounded` → `local-floor` → `local`; VR requests
  `local-floor`, `hand-tracking`. Opaque AR is rejected. Tracked hand joints
  are drawn as spheres and act as catchers (joint radius + 15 mm; the
  middle-finger metacarpal as a 6 cm palm). Without hands, controller grip
  poses are drawn and catch with an 8 cm radius, with haptic pulses. Floor
  height is 0 for `local-floor` (or when the head is above 0.9 m), otherwise
  head height − 1.55 m. VR draws a floor grid; AR keeps passthrough
  transparent. Landing markers show where objects will fall. After a round,
  `select` (pinch or trigger) restarts. Short synthesized sounds play after
  the entry gesture.
- `body.js` (added November 11, 2026 on request): virtual arms, hands and
  fingers. All 25 hand joints are spheres, joined by cylinder bones (thumb,
  four fingers, knuckle line), with a triangle-fan palm uploaded per frame.
  WebXR does not track elbows or shoulders, so shoulders are estimated from
  the head pose (yaw only: 0.18 m sideways, 0.24 m down, 0.06 m back) and
  elbows by two-bone IK (upper arm 0.30 m, forearm 0.27 m), bent towards the
  palm-to-wrist direction and downwards. Controllers attach the arm to the
  grip pose (grip +Z as forearm direction). These are plausible estimates,
  not tracked arms; catching still uses only hand joints/grips.
- `board.js`: the canvas-texture scoreboard is world-locked. It is placed
  once, 1.2 m ahead of the initial horizontal gaze and 0.15 m below eye
  height, and only turns (yaw) to face the player. Pinch on it (thumb/index,
  30 mm start, 55 mm release) or press a controller's grip (`squeezestart`)
  within its generous grab volume (+15 cm margin, ±20 cm depth; a flat quad
  is hard to judge in passthrough) to pick it up; it keeps the grab offset
  and stays where it is released. A pinch that starts away from the board
  never jumps onto it. While held, the hand point is smoothed with an
  adaptive filter (time constant 150 ms when nearly still, 20 ms when moving
  fast), and a tracking dropout of up to 300 ms keeps the grip. Hands and
  controllers that disconnect are dropped via `retain`, so the board can
  never stay held. One holder at a time. A free hand within reach turns the
  border white; a held board gets a gold border. A reference-space reset or
  new session places it again.
- `music.js`: synthesized techno at 128 BPM (Web Audio, no files): four-on-
  the-floor kick, clap on 2 and 4, closed/open hats, a resonant sawtooth
  bass on the off-16ths with a slow acid filter sweep over 8 bars, and
  minor-chord stabs with delay. Bar 0 is a hats-only intro; bars 14-15 of
  every 16 are a breakdown without kick and bass. It plays while a game
  runs and the page is visible, and stops when XR ends. The **Music** button
  toggles it; in XR, clicking the right thumbstick does too.
- Flat browser mode: pointer or arrow keys move a catcher in a single lane.

As with classic free-roam AR, `unbounded` does not disable the Quest boundary.
Validation on November 11, 2026: 8 rule tests passed; a headless Chromium smoke
test passed for flat play and synthetic AR/VR sessions (unbounded → local-floor
fallback, hand-joint catches, exit) with no page errors; production build
passed (735 kB initial, existing 500 kB warning budget); a built-app check
navigated home → chooser → Orbit Catch → back → Classic Orbit. Not yet tested
on a physical Quest: hand-catch feel, spawn distances, unbounded support and
floor estimation need on-device checks.

### Compact layout without scrolling (Quest browser)

Added on November 11, 2026. The three Orbit pages (`/orbit`, `/orbit/classic`,
`/orbit/catch`) no longer show a title or container padding: only a slim 44 px
`.orbit-bar` (global in `app/src/styles.scss`) with the back link remains. The
classic page's wireless diagnostics `<details>` moved into that bar.

At viewport widths of 900 px and up, `.orbit-fit` makes the embedded game fill
the viewport height minus the shell's version footer (`--build-version-height`,
42 px), so the page does not scroll. The Angular wrapper then ignores the
asset's `orbit:resize` height (CSS `height: auto !important` on the iframe). The
assets use the same `(min-width: 900px)` breakpoint to fit their own viewport:
`.playground` / `.catch` get `height: 100vh`, a compact header and controls, and
a flexible stage. Below 900 px the previous behavior is unchanged (content-sized
classic iframe, 85vh Orbit Catch frame). In fit mode the classic wireless panel
floats over the left of the game and Orbit Catch's "How to play" is a collapsed
floating `<details>`. Keep both breakpoints in sync.

Checked in the built app at 1280x640, 1024x600 and 1280x720 with Chromium: no
page or iframe scrolling, no `h1`, back link at the top. The actual Quest 2
browser viewport size has not been measured; if it is narrower than 900 CSS
pixels the old, scrolling layout applies.

## Orbit validation commands

Run from the repository root with a recent Node runtime (tested with Node 24):

```powershell
node --test app/tests/orbit-geometry.test.cjs
node --test app/tests/orbit-xr-math.test.cjs
node --test app/tests/orbit-xr-hands.test.cjs
node --test app/tests/orbit-xr-diagnostics.test.cjs
node --test app/tests/build-version.test.cjs
node --test app/tests/orbit-sound.test.cjs
node --test app/tests/orbit-catch-game.test.cjs
node --test app/tests/orbit-catch-body.test.cjs
node --test app/tests/orbit-catch-board-music.test.cjs
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

### Branch inventory snapshot, November 9, 2026

After fetching, `git ls-remote --heads origin` reports only `main` on GitHub.
Local branches are `main` and `feature/flappy-muis-highscores`. The retained
`origin/feature/flappy-muis-highscores` ref is stale, not a live remote branch.
No refs or branches were deleted during this inspection.

The Flappy Muis high-score feature was merged in PR #5 on October 4, 2026
(merge commit `55870d9`; feature tip `471b6f8` is an ancestor of main).
The local feature branch additionally contains old Orbit commit `42184ba`.
Main already contains its Orbit implementation as `e14d39a`: `git range-diff`
shows only the updated documentation note about the main/co-op build, and
the original Orbit component, asset and test files match. No feature merge
is needed based on this snapshot. Refresh refs and inspect local changes
before any future cleanup; do not infer remote existence from stale refs.

Later on November 9, 2026, the user explicitly requested cleanup. After
rechecking the tip and confirming that no worktree used the branch, the local
`feature/flappy-muis-highscores` branch and its stale remote-tracking ref were
removed. Only `main` remains locally and on GitHub. No remote branch deletion
was needed, no source files changed, and pending documentation edits were kept.

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
