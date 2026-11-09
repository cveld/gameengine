const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const installMockXR = require("./helpers/mock-xr.cjs");
const installMockAudio = require("./helpers/mock-audio.cjs");
const { chromium } = require(process.env.ORBIT_PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(process.env.ORBIT_TEST_ROOT || path.join(__dirname, "../src"));
let browser, server, origin;

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if ((!fs.existsSync(file) || !fs.statSync(file).isFile()) && process.env.ORBIT_TEST_ROOT && !path.extname(pathname)) {
      file = path.join(root, "index.html");
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
    res.setHeader("Content-Type", mime[path.extname(file)] || "text/plain");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function withXR(config, run) {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1100, height: 850 } });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.addInitScript(installMockXR, config);
    if (config.mockAudio) await page.addInitScript(installMockAudio);
    await page.goto(origin + "/assets/orbit/index.html");
    await page.waitForFunction(() => document.getElementById("scene").width > 300 && document.getElementById("status").hidden);
    if (config.supported !== false) await page.waitForFunction(() => !document.getElementById("enter-vr").disabled);
    await run(page);
    assert.deepEqual(errors, []);
  } catch (error) {
    const statuses = await Promise.all(["status", "vr-status", "ar-free-status"].map(id =>
      page.locator("#" + id).textContent({ timeout: 1000 }).catch(() => "(page unavailable)")));
    console.error("XR test status:", page.url(), ...statuses, errors, error.message);
    throw error;
  } finally { await context.close(); }
}
async function start(page, mode = "vr") {
  await page.locator("#enter-" + mode).click();
  await page.waitForFunction(value => document.documentElement.classList.contains(value + "-active"), mode);
}

for (const mode of ["vr", "ar", "ar-free"]) {
  test(`Tracked hands grab, place and change shapes in ${mode} without native gesture double-actions`, async () => {
    await withXR({}, async page => {
      await start(page, mode);
      const result = await page.evaluate(mode => {
        const device = mockXR.device, initialPlay = document.getElementById("play").textContent;
        const input = { handedness: "right", hand: new Map(["thumb-tip", "index-finger-tip", "middle-finger-tip"]
          .map(name => [name, { position: [0, 0, 0] }])) };
        const hand = (x, gap = 0.08, middleGap = 0.08) => {
          const thumb = [x - gap / 2, 1.6, -1.8];
          input.hand.get("thumb-tip").position = thumb;
          input.hand.get("index-finger-tip").position = [x + gap / 2, 1.6, -1.8];
          input.hand.get("middle-finger-tip").position = [thumb[0] + middleGap, 1.6, -1.8];
        };
        device.inputSources = [input];
        hand(0.4); device.step(100);
        const initial = mockXR.positions.at(-1);
        hand(0.4, 0.01); device.step(116);
        const grabbed = mockXR.positions.at(-1);
        hand(0.6, 0.01); device.step(132);
        const moved = mockXR.positions.at(-1);
        for (const type of ["select", "squeeze"]) {
          const event = new Event(type); event.inputSource = input; device.dispatchEvent(event);
        }
        const play = document.getElementById("play").textContent;
        const unchangedShape = document.getElementById("shape-name").textContent;
        hand(0.6); device.step(148);
        hand(0.9); device.step(164);
        const placed = mockXR.positions.at(-1);
        input.handedness = "left";
        hand(0.9); device.step(200);
        hand(0.9, 0.08, 0.01);
        for (const time of [300, 400, 500, 600]) device.step(time);
        const changedShape = document.getElementById("shape-name").textContent;
        const afterShape = mockXR.positions.at(-1);
        if (mode === "ar-free") device.resetOrigin(2, 0, 3, Math.PI / 2);
        device.inputSources = []; device.step(700);
        return { initialPlay, play, initial, grabbed, moved, placed, unchangedShape,
          changedShape, afterShape, final: mockXR.positions.at(-1), error: device.pixels().error,
          features: mockXR.requests[0].options.optionalFeatures };
      }, mode);
      assert.ok(result.features.includes("hand-tracking"));
      assert.deepEqual(result.grabbed, result.initial, "Grabbing must not snap the center to the fingers");
      assert.ok(Math.abs(result.moved[0] - result.initial[0] - 0.2) < 1e-5);
      assert.deepEqual(result.placed, result.moved);
      assert.deepEqual(result.afterShape, result.placed);
      assert.deepEqual(result.final, result.placed);
      assert.equal(result.initialPlay, result.play);
      assert.equal(result.unchangedShape, "Trefoil knot");
      assert.equal(result.changedShape, "Rippling torus");
      assert.equal(result.error, 0);
    });
  });
}

test("Unavailable hand joints leave controller movement, shape and pause actions usable", async () => {
  await withXR({ noHandAPI: true }, async page => {
    await start(page, "ar");
    const result = await page.evaluate(() => {
      const device = mockXR.device;
      const controller = { handedness: "left", gamepad: { mapping: "xr-standard",
        axes: [0, 0, 1, 0], buttons: [] } };
      const hand = { handedness: "right", hand: new Map([
        ["thumb-tip", { position: [0, 1.6, -1.8] }],
        ["index-finger-tip", { position: [0, 1.6, -1.8] }]
      ]) };
      device.inputSources = [hand, controller];
      device.step(100); const initial = mockXR.positions.at(-1);
      device.step(200); const moved = mockXR.positions.at(-1);
      for (const type of ["select", "squeeze"]) {
        const event = new Event(type);
        event.inputSource = { handedness: "right", gamepad: {} };
        device.dispatchEvent(event);
      }
      return { initial, moved, play: document.getElementById("play").textContent,
        shape: document.getElementById("shape-name").textContent, ended: device.ended };
    });
    assert.ok(result.moved[0] > result.initial[0]);
    assert.equal(result.play, "Pause");
    assert.equal(result.shape, "Rippling torus");
    assert.equal(result.ended, false);
  });
});

for (const [config, expected] of [
  [{}, ["unbounded"]],
  [{ failUnbounded: true }, ["unbounded", "local-floor"]],
  [{ failUnbounded: true, failFloor: true }, ["unbounded", "local-floor", "local"]]
]) {
  test(`Free-roam AR selects ${expected.at(-1)} tracking with honest boundary messaging`, async () => {
    await withXR(config, async page => {
      await start(page, "ar-free");
      const result = await page.evaluate(() => {
        mockXR.device.step(100);
        return { request: mockXR.requests[0], spaces: mockXR.spaces, pixels: mockXR.device.pixels(),
          classes: document.documentElement.className };
      });
      assert.equal(result.request.mode, "immersive-ar");
      assert.deepEqual(result.request.options.optionalFeatures, ["unbounded", "local-floor", "hand-tracking"]);
      assert.deepEqual(result.spaces, expected);
      assert.match(result.classes, /ar-active/);
      assert.ok(result.pixels.transparent.every(count => count > 10000));
      assert.ok(result.pixels.counts.every(count => count > 5000));
      assert.equal(result.pixels.error, 0);
      const status = await page.locator("#ar-free-status").textContent();
      assert.match(status, /does not disable the headset safety boundary/);
      assert.match(status, expected.length === 1 ? /Unbounded tracking selected/ :
        new RegExp(`Unbounded tracking unavailable; using ${expected.at(-1)} tracking`));
      assert.equal(await page.locator("#enter-ar").isDisabled(), true);
      assert.equal(await page.locator("#enter-vr").isDisabled(), true);
      await page.locator("#enter-ar-free").click();
      await page.waitForFunction(() => !document.documentElement.classList.contains("xr-active"));
      assert.equal(await page.evaluate(() => document.activeElement.id), "enter-ar-free");
      assert.equal(await page.locator("#enter-ar").isDisabled(), false);
      assert.equal(await page.locator("#enter-vr").isDisabled(), false);
      await start(page, "ar");
      assert.deepEqual(await page.evaluate(() => mockXR.requests.at(-1).options.optionalFeatures), ["local-floor", "hand-tracking"]);
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ar-free-active")), false);
    });
  });
}

test("Free-roam AR keeps scene coordinates and stereo orientation through repeated origin translations and rotations", async () => {
  await withXR({}, async page => {
    await start(page, "ar-free");
    const result = await page.evaluate(() => {
      const device = mockXR.device;
      device.step(100);
      const initial = { position: mockXR.positions.at(-1), matrices: mockXR.matrices.slice(-2) };
      device.resetOrigin(5, 0.3, -2, Math.PI / 3);
      device.step(200);
      const first = { position: mockXR.positions.at(-1), matrices: mockXR.matrices.slice(-2) };
      device.resetOrigin(-3, -0.2, 4, -Math.PI / 2);
      device.step(300);
      const second = { position: mockXR.positions.at(-1), matrices: mockXR.matrices.slice(-2) };
      device.step(400, 8, 1.6, 8, Math.PI / 4);
      return { initial, first, second, walked: mockXR.positions.at(-1), offsets: mockXR.offsets,
        ended: device.ended };
    });
    assert.deepEqual(result.first.position, result.initial.position);
    assert.deepEqual(result.second.position, result.initial.position);
    assert.deepEqual(result.walked, result.initial.position, "Head movement must never move or clamp the sculpture");
    for (const frame of [result.first, result.second]) {
      frame.matrices.forEach((matrix, eye) => matrix.forEach((value, i) =>
        assert.ok(Math.abs(value - result.initial.matrices[eye][i]) < 1e-5)));
    }
    assert.equal(result.offsets.length, 3, "The newest native-origin correction must precede the older correction");
    assert.equal(result.ended, false);
  });
});

test("Free-roam AR retains controller placement and drops the reset frame time delta", async () => {
  await withXR({ failUnbounded: true }, async page => {
    await start(page, "ar-free");
    const result = await page.evaluate(() => {
      const device = mockXR.device;
      device.inputSources = [{ handedness: "left", gamepad: { mapping: "xr-standard", axes: [0, 0, 1, 0], buttons: [] } }];
      device.step(0); device.step(100);
      const moved = mockXR.positions.at(-1);
      device.resetOrigin(3, 0, 2, Math.PI / 2); device.step(10000);
      const reset = mockXR.positions.at(-1);
      device.step(10100);
      const resumed = mockXR.positions.at(-1);
      return { moved, reset, resumed };
    });
    assert.deepEqual(result.reset, result.moved);
    assert.ok(Math.abs(result.resumed[0] - result.moved[0] - 0.06) < 1e-5);
    assert.ok(Math.abs(result.resumed[2] - result.moved[2]) < 1e-5);
  });
});

test("Free-roam AR handles an origin reset before initial placement and starts fresh on re-entry", async () => {
  await withXR({}, async page => {
    await start(page, "ar-free");
    const first = await page.evaluate(() => {
      mockXR.device.resetOrigin(2, 0, 3, Math.PI / 2);
      mockXR.device.step(100);
      return mockXR.positions.at(-1);
    });
    assert.ok(Math.abs(first[0]) < 1e-5);
    assert.ok(Math.abs(first[2] + 1.8) < 1e-5);
    await page.locator("#enter-ar-free").click();
    await start(page, "ar-free");
    const fresh = await page.evaluate(() => {
      mockXR.device.step(0, 2, 1.7, 3);
      return mockXR.positions.at(-1);
    });
    assert.ok(Math.abs(fresh[0] - 2) < 1e-5);
    assert.ok(Math.abs(fresh[2] - 1.2) < 1e-5);
  });
});

for (const config of [{}, { failOffset: true }]) {
  test(`Free-roam AR returns safely when a reset ${config.failOffset ? "cannot be compensated" : "has an unknown transform"}`, async () => {
    await withXR(config, async page => {
      await start(page, "ar-free");
      await page.evaluate(known => {
        mockXR.device.step(100);
        mockXR.device.resetOrigin(3, 0, 2, 0, known);
      }, Boolean(config.failOffset));
      await page.waitForFunction(() => mockXR.device.ended);
      assert.match(await page.locator("#ar-free-status").textContent(), /tracking changed.*Returning to the browser/);
      assert.equal(await page.evaluate(() => mockXR.device.callbacks.size), 0);
      assert.equal(await page.locator("#enter-ar-free").isDisabled(), false);
    });
  });
}

test("Free-roam AR shares AR capability checks", async () => {
  await withXR({ arSupported: false }, async page => {
    assert.equal(await page.locator("#enter-ar").isDisabled(), true);
    assert.equal(await page.locator("#enter-ar-free").isDisabled(), true);
    assert.match(await page.locator("#ar-free-status").textContent(), /No immersive.*support/);
  });
});

test("Free-roam AR rejects opaque passthrough and never requests VR as a fallback", async () => {
  await withXR({ arBlendMode: "opaque" }, async page => {
    await page.locator("#enter-ar-free").click();
    await page.waitForFunction(() => mockXR.device?.ended);
    assert.match(await page.locator("#ar-free-status").textContent(), /cannot display the real environment/);
    assert.deepEqual(await page.evaluate(() => mockXR.requests.map(request => request.mode)), ["immersive-ar"]);
  });
});

test("Free-roam AR startup warnings preserve selected tracking information", async () => {
  await withXR({ startupError: "INVALID_OPERATION" }, async page => {
    await start(page, "ar-free");
    await page.evaluate(() => mockXR.device.step(100));
    assert.match(await page.locator("#ar-free-status").textContent(), /Unbounded tracking selected.*first-frame checks passed/);
  });
});

test("Free-roam AR cannot resurrect a session ended during reference-space negotiation", async () => {
  await withXR({ deferSpace: true }, async page => {
    await page.locator("#enter-ar-free").click();
    await page.waitForFunction(() => Boolean(mockXR.finishSpace));
    assert.equal(await page.locator("#enter-ar").isDisabled(), true);
    assert.equal(await page.locator("#enter-vr").isDisabled(), true);
    await page.evaluate(async () => { await mockXR.device.end(); mockXR.finishSpace(); });
    await page.waitForFunction(() => !document.getElementById("enter-ar-free").disabled);
    assert.equal(await page.evaluate(() => mockXR.device.callbacks.size), 0);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("xr-active")), false);
  });
});

test("VR uses an RGBA layer without optional MSAA/compositor depth and draws opaque stereo output", async () => {
  await withXR({ requireRGBA: true }, async page => {
    const context = await page.evaluate(() => ({
      request: mockXR.contextRequests[0], webgl2: Boolean(document.getElementById("scene").getContext("webgl2"))
    }));
    assert.equal(context.request.type, "webgl2");
    assert.equal(context.request.attributes.xrCompatible, true);
    assert.equal(context.webgl2, true);
    await start(page);
    const result = await page.evaluate(() => {
      mockXR.device.step(100);
      return { options: mockXR.layerOptions[0], pixels: mockXR.device.pixels() };
    });
    assert.equal(result.options.alpha, true);
    assert.equal(result.options.antialias, false);
    assert.equal(result.options.ignoreDepthValues, true);
    assert.deepEqual(result.pixels.transparent, [0, 0]);
    assert.ok(result.pixels.counts.every(count => count > 5000));
    assert.equal(result.pixels.error, 0);
    await page.locator("#wireframe").check();
    const wire = await page.evaluate(() => { mockXR.device.step(200); return mockXR.device.pixels(); });
    assert.deepEqual(wire.opaque, [512 * 512, 512 * 512], "VR wireframe must also retain opaque background alpha");
    assert.ok(wire.counts.every(count => count > 1000));
  });
});

for (const mode of ["vr", "ar"]) {
  test(`${mode.toUpperCase()} retains stereo rendering for all sculptures on the WebGL 1 fallback`, async () => {
    await withXR({ webgl1Only: true }, async page => {
      assert.equal(await page.evaluate(() => document.getElementById("scene").getContext("webgl2")), null);
      await start(page, mode);
      for (const shape of [0, 1, 2]) {
        await page.locator(`[data-shape="${shape}"]`).click();
        const pixels = await page.evaluate(() => { mockXR.device.step(100); return mockXR.device.pixels(); });
        assert.equal(pixels.error, 0);
        assert.ok(pixels.counts.every(count => count > 5000));
      }
      await page.locator("#wireframe").check();
      const wire = await page.evaluate(() => { mockXR.device.step(200); return mockXR.device.pixels(); });
      assert.equal(wire.error, 0);
      assert.ok(wire.counts.every(count => count > 1000));
      if (mode === "vr") assert.deepEqual(wire.transparent, [0, 0]);
      else assert.ok(wire.transparent.every(count => count > 10000));
    });
  });
}

test("VR framebuffer failure returns to the browser with an actionable diagnostic", async () => {
  await withXR({ incompleteFramebuffer: true }, async page => {
    await start(page);
    await page.evaluate(() => mockXR.device.step(100));
    await page.waitForFunction(() => mockXR.device.ended);
    assert.match(await page.locator("#vr-status").textContent(), /framebuffer is incomplete/);
    assert.equal(await page.locator("#enter-vr").textContent(), "Enter VR");
    assert.equal(await page.locator("#play").isDisabled(), false);
    assert.equal(await page.evaluate(() => mockXR.device.callbacks.size), 0);
  });
});

for (const mode of ["vr", "ar"]) {
  for (const webgl1Only of [false, true]) {
    test(`${mode.toUpperCase()} validates stereo output after one pre-frame error on WebGL ${webgl1Only ? 1 : 2}`, async () => {
      await withXR({ startupError: "INVALID_OPERATION", webgl1Only }, async page => {
        await start(page, mode);
        const first = await page.evaluate(() => {
          mockXR.device.step(100);
          return { ended: mockXR.device.ended,
            pixels: mockXR.device.ended ? null : mockXR.device.pixels() };
        });
        assert.equal(first.ended, false, "A latched startup error must not prevent validating an otherwise valid frame");
        assert.equal(first.pixels.error, 0);
        assert.ok(first.pixels.counts.every(count => count > 5000));
        if (mode === "ar") assert.ok(first.pixels.transparent.every(count => count > 10000));
        else assert.deepEqual(first.pixels.transparent, [0, 0]);
        assert.match(await page.locator("#" + mode + "-status").textContent(),
          /first-frame checks passed.*startup warning.*0x502 INVALID_OPERATION/);
        const second = await page.evaluate(() => { mockXR.device.step(200); return mockXR.device.pixels(); });
        assert.equal(second.error, 0);
        await page.locator("#enter-" + mode).click();
        await page.waitForFunction(() => mockXR.device.ended);
        await start(page, mode);
        await page.evaluate(() => mockXR.device.step(300));
        assert.equal(await page.evaluate(() => mockXR.device.ended), false, "A new session gets its own bounded recovery");
      });
    });
  }
}

test("AR still rejects a genuine uniform error after a pre-frame startup warning", async () => {
  await withXR({ startupError: "INVALID_OPERATION", failPhase: "shader uniforms" }, async page => {
    await start(page, "ar");
    await page.evaluate(() => mockXR.device.step(100));
    await page.waitForFunction(() => mockXR.device.ended);
    assert.match(await page.locator("#ar-status").textContent(), /0x502 INVALID_OPERATION at left shader uniforms/);
  });
});

test("AR validates a startup flag appearing between pose retrieval and the first draw", async () => {
  await withXR({ startupError: "INVALID_OPERATION", startupErrorAfterPose: true }, async page => {
    await start(page, "ar");
    await page.evaluate(() => mockXR.device.step(100));
    assert.equal(await page.evaluate(() => mockXR.device.ended), false);
    assert.match(await page.locator("#ar-status").textContent(), /first-frame checks passed.*before first XR frame/);
    assert.equal(await page.evaluate(() => mockXR.device.pixels().error), 0);
  });
});

test("AR does not tolerate other pre-frame errors", async () => {
  await withXR({ startupError: "INVALID_ENUM" }, async page => {
    await start(page, "ar");
    await page.evaluate(() => mockXR.device.step(100));
    await page.waitForFunction(() => mockXR.device.ended);
    assert.match(await page.locator("#ar-status").textContent(), /0x500 INVALID_ENUM/);
  });
});

test("AR stops when a startup error recurs instead of accepting an ongoing failure", async () => {
  await withXR({ startupError: "INVALID_OPERATION", repeatStartupError: true }, async page => {
    await start(page, "ar");
    await page.evaluate(() => mockXR.device.step(100));
    assert.equal(await page.evaluate(() => mockXR.device.ended), false);
    await page.evaluate(() => mockXR.device.step(200));
    await page.waitForFunction(() => mockXR.device.ended);
    assert.match(await page.locator("#ar-status").textContent(), /0x502 INVALID_OPERATION at XR recovery frame complete/);
  });
});

for (const phase of ["geometry upload", "shader uniforms", "drawArrays"]) {
  test(`XR reports real INVALID_OPERATION at ${phase} rather than an undifferentiated 0x502`, async () => {
    await withXR({ failPhase: phase }, async page => {
      await start(page);
      if (phase === "geometry upload") await page.locator("#wireframe").check();
      await page.evaluate(() => mockXR.device.step(100));
      await page.waitForFunction(() => mockXR.device.ended);
      const status = await page.locator("#vr-status").textContent();
      assert.match(status, /WebGL 0x502 INVALID_OPERATION/);
      assert.ok(status.includes("at " + (phase === "geometry upload" ? "" : "left ") + phase), status);
      assert.equal(await page.evaluate(() => mockXR.device.callbacks.size), 0);
    });
  });
}

test("XR attributes setup errors to compatibility, not the first eye draw", async () => {
  await withXR({ failPhase: "compatibility" }, async page => {
    await page.locator("#enter-vr").click();
    await page.waitForFunction(() => mockXR.device?.ended);
    assert.match(await page.locator("#vr-status").textContent(),
      /WebGL 0x502 INVALID_OPERATION at XR compatibility \/ renderer setup/);
    assert.equal(await page.evaluate(() => mockXR.layerOptions.length), 0);
  });
});

for (const mode of ["vr", "ar"]) {
  test(`${mode.toUpperCase()} survives real context loss/restoration during XR compatibility`, async () => {
    await withXR({ restoreDuringCompatibility: true }, async page => {
      await start(page, mode);
      const output = await page.evaluate(() => {
        mockXR.device.step(100);
        return { restored: mockXR.compatibilityRestored, ended: mockXR.device.ended,
          pixels: mockXR.device.pixels() };
      });
      assert.equal(output.restored, true);
      assert.equal(output.ended, false);
      assert.equal(output.pixels.error, 0);
      assert.ok(output.pixels.counts.every(count => count > 5000));
      await page.locator("#enter-" + mode).click();
      await page.waitForFunction(() => mockXR.device.ended);
      assert.equal(await page.locator("#status").isVisible(), false);
      assert.equal(await page.locator("#play").isDisabled(), false);
    });
  });
}

test("VR startup without a renderable frame does not leave an indefinite black session", async () => {
  await withXR({ watchdogMs: 500 }, async page => {
    await start(page);
    await page.waitForFunction(() => mockXR.device.ended);
    assert.match(await page.locator("#vr-status").textContent(), /renderable headset frame/);
    assert.equal(await page.locator("#enter-vr").isDisabled(), false);
  });
});

test("XR pulse breathes around the fixed anchor and freezes with pause", async () => {
  await withXR({}, async page => {
    await page.locator("#pulse").check();
    await page.locator("#play").click();
    await start(page, "ar");
    const before = await page.evaluate(() => {
      mockXR.device.step(0);
      const anchor = mockXR.positions.at(-1);
      mockXR.device.step(300);
      return { anchor, pulse: mockXR.pulses.at(-1) };
    });
    await page.locator("#play").click();
    const after = await page.evaluate(() => {
      mockXR.device.step(400, 0.2);
      return { anchor: mockXR.positions.at(-1), pulse: mockXR.pulses.at(-1) };
    });
    assert.deepEqual(after.anchor, before.anchor);
    assert.equal(after.pulse, before.pulse);
    assert.ok(after.pulse >= 0.927 && after.pulse <= 1.073);
    await page.locator("#pulse").uncheck();
    const off = await page.evaluate(() => { mockXR.device.step(500); return mockXR.pulses.at(-1); });
    assert.equal(off, 1);
  });
});

test("XR spatial sound follows the sculpture; thumbstick click toggles once and visibility mutes", async () => {
  await withXR({ mockAudio: true }, async page => {
    assert.equal(await page.locator("#sound").textContent(), "Sound off");
    await page.locator("#sound").click();
    await page.locator("#play").click();
    await start(page, "ar");
    const output = await page.evaluate(() => {
      const device = mockXR.device, context = mockAudio.contexts[0];
      device.step(0, 0.4, 1.7);
      const master = context.nodes[0], panner = context.nodes[1];
      const initial = { level: master.gain.value, source: [panner.positionX.value, panner.positionY.value, panner.positionZ.value],
        anchor: mockXR.positions.at(-1), listener: [context.listener.positionX.value, context.listener.positionY.value] };
      const controller = { handedness: "right", gamepad: { mapping: "xr-standard", axes: [0, 0, 0, 0],
        buttons: [{ pressed: false }, {}, {}, { pressed: true }] } };
      device.inputSources = [controller];
      device.step(100);
      const muted = document.getElementById("sound").textContent;
      device.step(200);
      const held = document.getElementById("sound").textContent;
      controller.gamepad.buttons[3].pressed = false; device.step(300);
      controller.gamepad.buttons[3].pressed = true; device.step(400);
      const unmuted = document.getElementById("sound").textContent;
      device.visibilityState = "hidden"; device.dispatchEvent(new Event("visibilitychange"));
      const hiddenLevel = master.gain.value;
      device.visibilityState = "visible"; device.dispatchEvent(new Event("visibilitychange"));
      device.step(10000);
      return { initial, muted, held, unmuted, hiddenLevel,
        resumed: document.getElementById("sound").textContent };
    });
    assert.ok(output.initial.level > 0);
    assert.deepEqual(output.initial.source, output.initial.anchor);
    assert.deepEqual(output.initial.listener, [0.4, 1.7]);
    assert.equal(output.muted, "Sound off");
    assert.equal(output.held, "Sound off");
    assert.equal(output.unmuted, "Sound on");
    assert.equal(output.hiddenLevel, 0);
    assert.equal(output.resumed, "Sound on", "A held click after focus returns must not toggle again");
  });
});

test("AR uses passthrough transparency with stereo opaque sculpture geometry", async () => {
  await withXR({}, async page => {
    await start(page, "ar");
    const result = await page.evaluate(() => {
      mockXR.device.step(100);
      return { request: mockXR.requests[0], layer: mockXR.layerOptions[0], image: mockXR.device.pixels() };
    });
    assert.equal(result.request.mode, "immersive-ar");
    assert.equal(result.layer.alpha, true);
    assert.equal(result.image.error, 0);
    assert.ok(result.image.transparent.every(count => count > 100000), "Passthrough needs clear alpha outside the sculpture");
    assert.ok(result.image.opaque.every(count => count > 5000), "The sculpture itself must be opaque");
    assert.ok(result.image.counts.every(count => count > 5000));
    assert.notEqual(result.image.hashes[0], result.image.hashes[1]);
    assert.equal(await page.locator("#enter-ar").textContent(), "Exit AR");
    assert.equal(await page.locator("#enter-vr").isDisabled(), true);
  });
});

test("AR sculpture stays fixed while walking around its front, sides and back", async () => {
  await withXR({}, async page => {
    await start(page, "ar");
    const output = await page.evaluate(() => {
      const positions = [], images = [];
      // Walk a circle around the object at (0, 1.6, -1.8), looking inward.
      for (const [i, angle] of [0, Math.PI / 2, Math.PI, -Math.PI / 2].entries()) {
        const x = 1.8 * Math.sin(angle), z = -1.8 + 1.8 * Math.cos(angle);
        mockXR.device.step(i * 100, x, 1.6, z, angle);
        positions.push(mockXR.positions.at(-1));
        images.push(mockXR.device.pixels());
      }
      mockXR.device.inputSources = [{ handedness: "left", gamepad: { mapping: "xr-standard", axes: [0, 0, 0, 0] } }];
      for (let i = 4; i < 20; i++) mockXR.device.step(i * 100, -1.8, 1.6, -1.8, -Math.PI / 2);
      return { positions, images, afterStick: mockXR.positions.at(-1) };
    });
    for (const p of output.positions) assert.deepEqual(p, output.positions[0]);
    assert.deepEqual(output.afterStick, output.positions[0], "A neutral stick must keep placement world-locked");
    for (const image of output.images) {
      assert.equal(image.error, 0);
      assert.ok(image.counts.every(count => count > 5000), "Each viewpoint should see a spatial sculpture");
      assert.ok(image.transparent.every(count => count > 100000));
    }
    assert.notDeepEqual(output.images[0].hashes, output.images[1].hashes);
    assert.notDeepEqual(output.images[0].hashes, output.images[2].hashes);
  });
});

test("AR left stick moves the object relative to horizontal gaze and release keeps its new position", async () => {
  await withXR({}, async page => {
    await start(page, "ar");
    const result = await page.evaluate(() => {
      const device = mockXR.device;
      const controller = { handedness: "left", gamepad: { mapping: "xr-standard", axes: [0, 0, 1, 0] } };
      device.step(0);
      const initial = mockXR.positions.at(-1);
      device.inputSources = [controller];
      device.step(100);
      const right = mockXR.positions.at(-1);
      controller.gamepad.axes = [0, 0, 0, -1];
      device.step(200, 0, 1.6, 0, Math.PI / 2);
      const turned = mockXR.positions.at(-1);
      controller.gamepad.axes = [0, 0, 0, 0];
      device.step(300, 1, 1.9, -0.4, -Math.PI / 2);
      const released = mockXR.positions.at(-1);
      controller.gamepad.axes = [0, 0, 0.1, -0.1];
      device.step(400);
      return { initial, right, turned, released, deadzone: mockXR.positions.at(-1), image: device.pixels() };
    });
    assert.ok(Math.abs(result.right[0] - result.initial[0] - 0.06) < 1e-5);
    assert.ok(Math.abs(result.turned[0] - result.right[0] + 0.06) < 1e-5);
    assert.equal(result.turned[1], result.initial[1]);
    assert.equal(result.turned[2], result.initial[2]);
    assert.deepEqual(result.released, result.turned);
    assert.deepEqual(result.deadzone, result.turned);
    assert.equal(result.image.error, 0);
    assert.ok(result.image.transparent.every(count => count > 100000));
  });
});

test("AR left trigger changes height without toggling pause; right trigger and grip retain their actions", async () => {
  await withXR({}, async page => {
    await start(page, "ar");
    const result = await page.evaluate(() => {
      const device = mockXR.device;
      device.step(0);
      const initial = mockXR.positions.at(-1), playBefore = document.getElementById("play").textContent;
      const inputSource = { handedness: "left", gamepad: {
        mapping: "xr-standard", axes: [0, 0, 1, -1], buttons: [{ pressed: true }]
      } };
      device.inputSources = [inputSource];
      device.step(100);
      const raised = mockXR.positions.at(-1);
      const leftSelect = new Event("select");
      Object.defineProperty(leftSelect, "inputSource", { value: inputSource });
      device.dispatchEvent(leftSelect);
      const afterLeft = document.getElementById("play").textContent;
      const rightSelect = new Event("select");
      Object.defineProperty(rightSelect, "inputSource", { value: { handedness: "right" } });
      device.dispatchEvent(rightSelect);
      const afterRight = document.getElementById("play").textContent;
      device.dispatchEvent(new Event("squeeze"));
      inputSource.gamepad.axes = [0, 0, 0, 1];
      device.step(200);
      const lowered = mockXR.positions.at(-1);
      inputSource.gamepad.axes = [0, 0, 0, 0];
      device.step(300, 0.5);
      return { initial, raised, lowered, released: mockXR.positions.at(-1),
        playBefore, afterLeft, afterRight, shape: document.getElementById("shape-name").textContent };
    });
    assert.equal(result.raised[0], result.initial[0], "Height mode must not strafe");
    assert.equal(result.raised[2], result.initial[2]);
    assert.ok(Math.abs(result.raised[1] - result.initial[1] - 0.06) < 1e-5);
    assert.ok(Math.abs(result.lowered[1] - result.initial[1]) < 1e-5);
    assert.deepEqual(result.released, result.lowered);
    assert.equal(result.afterLeft, result.playBefore);
    assert.notEqual(result.afterRight, result.playBefore);
    assert.equal(result.shape, "Rippling torus");
  });
});

test("AR movement ignores invalid controllers and tracking gaps; reset and re-entry clear placement offsets", async () => {
  await withXR({}, async page => {
    await start(page, "ar");
    const output = await page.evaluate(() => {
      const device = mockXR.device;
      device.step(0);
      const initial = mockXR.positions.at(-1);
      const pad = { mapping: "", axes: [0, 0, 1, -1] };
      device.inputSources = [{ handedness: "left", gamepad: pad }];
      device.step(100);
      const invalid = mockXR.positions.at(-1);
      pad.mapping = "xr-standard"; pad.axes = [0, 0, NaN, Infinity];
      device.step(200);
      const nonfinite = mockXR.positions.at(-1);
      pad.axes = [0, 0, 1, 0]; device.step(300);
      const moved = mockXR.positions.at(-1);
      mockXR.missingPose = true; device.step(10000);
      mockXR.missingPose = false; device.step(11000);
      const recovered = mockXR.positions.at(-1);
      device.visibilityState = "hidden"; device.dispatchEvent(new Event("visibilitychange")); device.step(12000);
      device.visibilityState = "visible"; device.dispatchEvent(new Event("visibilitychange")); device.step(20000);
      const resumed = mockXR.positions.at(-1);
      pad.axes.fill(0);
      device.space.dispatchEvent(new Event("reset")); device.step(20100);
      return { initial, invalid, nonfinite, moved, recovered, resumed, reset: mockXR.positions.at(-1) };
    });
    assert.deepEqual(output.invalid, output.initial);
    assert.deepEqual(output.nonfinite, output.initial);
    assert.notDeepEqual(output.moved, output.initial);
    assert.deepEqual(output.recovered, output.moved);
    assert.deepEqual(output.resumed, output.moved);
    assert.deepEqual(output.reset, output.initial);
    await page.locator("#enter-ar").click();
    await start(page, "ar");
    const fresh = await page.evaluate(() => { mockXR.device.step(0); return mockXR.positions.at(-1); });
    assert.deepEqual(fresh, output.initial);
  });
});

test("VR and AR support are independent; ending AR restores the browser and allows VR", async () => {
  await withXR({ supported: false }, async page => {
    await page.waitForFunction(() => !document.getElementById("enter-ar").disabled);
    assert.equal(await page.locator("#enter-vr").isDisabled(), true);
    const before = await page.locator("#scene").screenshot();
    await start(page, "ar");
    await page.evaluate(() => mockXR.device.step(100));
    await page.locator("#enter-ar").click();
    await page.waitForFunction(() => !document.documentElement.classList.contains("xr-active"));
    assert.ok((await page.locator("#scene").screenshot()).equals(before));
    await page.evaluate(() => { mockXR.supported = true; navigator.xr.dispatchEvent(new Event("devicechange")); });
    await page.waitForFunction(() => !document.getElementById("enter-vr").disabled);
    await start(page);
    assert.equal(await page.locator("#enter-ar").isDisabled(), true);
    const vr = await page.evaluate(() => { mockXR.device.step(100); return mockXR.device.pixels(); });
    assert.deepEqual(vr.transparent, [0, 0], "VR retains its opaque dark environment");
  });
});

test("AR supports additive composition and wireframe keeps transparent surroundings", async () => {
  await withXR({ arBlendMode: "additive" }, async page => {
    await page.locator("#wireframe").check();
    await start(page, "ar");
    const result = await page.evaluate(() => {
      mockXR.device.step(100);
      return { image: mockXR.device.pixels(), layer: mockXR.layerOptions[0] };
    });
    assert.equal(result.layer.alpha, true);
    assert.equal(result.image.error, 0);
    assert.ok(result.image.transparent.every(count => count > 100000));
    assert.ok(result.image.counts.every(count => count > 1000));
  });
});

test("AR keeps the room-relative position when changing shape or pausing and ends on page exit", async () => {
  await withXR({}, async page => {
    await start(page, "ar");
    const result = await page.evaluate(() => {
      const device = mockXR.device;
      device.step(100);
      const initial = mockXR.positions.at(-1);
      device.dispatchEvent(new Event("squeeze"));
      device.dispatchEvent(new Event("select"));
      device.step(200, 0.6, 1.6, -0.5);
      const afterControls = mockXR.positions.at(-1);
      device.visibilityState = "visible-blurred";
      device.dispatchEvent(new Event("visibilitychange"));
      const beforeHidden = mockXR.draws.length;
      device.step(300);
      return { initial, afterControls, beforeHidden, afterHidden: mockXR.draws.length };
    });
    assert.deepEqual(result.afterControls, result.initial);
    assert.equal(result.beforeHidden, result.afterHidden);
    assert.equal(await page.locator("#shape-name").textContent(), "Rippling torus");
    assert.equal(await page.locator("#play").textContent(), "Pause");
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    await page.waitForFunction(() => mockXR.device.ended);
    assert.equal(await page.evaluate(() => mockXR.device.callbacks.size), 0);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("ar-active")), false);
  });
});

test("unsupported AR and opaque AR sessions never silently enter VR or hide the room", async () => {
  for (const config of [{ arSupported: false }, { arBlendMode: "opaque" }, { failRequest: true }, { failSetup: true }]) {
    await withXR(config, async page => {
      if (config.arSupported === false) {
        await page.waitForFunction(() => !document.getElementById("ar-status").hidden);
        assert.equal(await page.locator("#enter-ar").isDisabled(), true);
        assert.equal(await page.locator("#enter-vr").isDisabled(), false);
      } else {
        await page.locator("#enter-ar").click();
        await page.waitForFunction(() => !document.getElementById("ar-status").hidden && !document.getElementById("enter-ar").disabled);
        assert.match(await page.locator("#ar-status").textContent(), /AR could not start/);
        if (!config.failRequest) assert.equal(await page.evaluate(() => mockXR.device.ended), true);
        assert.equal(await page.evaluate(() => mockXR.requests[0].mode), "immersive-ar");
        assert.equal(await page.locator("#enter-vr").isDisabled(), false);
      }
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains("xr-active")), false);
      await page.locator('[data-shape="2"]').click();
      assert.equal(await page.locator("#shape-name").textContent(), "Fluted sphere");
    });
  }
});

test("XR renders both eyes with different projections, world placement and one upload per frame", async () => {
  await withXR({}, async page => {
    await start(page);
    const result = await page.evaluate(() => {
      const s = mockXR;
      s.draws.length = s.matrices.length = s.positions.length = s.viewports.length = 0; s.uploads = 0;
      s.device.step(1000);
      return { draws: s.draws, matrices: s.matrices, positions: s.positions,
        viewports: s.viewports, uploads: s.uploads, pixels: s.device.pixels(), requests: s.requests };
    });
    assert.equal(result.requests[0].mode, "immersive-vr");
    assert.deepEqual(result.requests[0].options.optionalFeatures, ["local-floor", "hand-tracking"]);
    assert.equal(result.draws.length, 2);
    assert.ok(result.uploads <= 1);
    assert.deepEqual(result.viewports, [[0, 0, 512, 512], [512, 0, 512, 512]]);
    assert.notDeepEqual(result.matrices[0], result.matrices[1]);
    assert.ok(Math.abs(result.positions[0][1] - 1.6) < 1e-5);
    assert.ok(Math.abs(result.positions[0][2] + 1.8) < 1e-5);
    assert.ok(result.pixels.counts.every(count => count > 5000));
    assert.notEqual(result.pixels.hashes[0], result.pixels.hashes[1]);
    assert.equal(result.pixels.error, 0);
    const movement = await page.evaluate(() => {
      mockXR.device.step(1100, 0.2, 1.6, -0.4);
      return { positions: mockXR.positions.slice(-2), matrices: mockXR.matrices.slice(-2) };
    });
    assert.deepEqual(movement.positions[0], result.positions[0], "The sculpture must stay world-locked");
    assert.notDeepEqual(movement.matrices[0], result.matrices[0], "Head movement must change the eye view");
  });
});

test("pause still renders headset poses; trigger/grip and sticks control the sculpture", async () => {
  await withXR({}, async page => {
    await start(page);
    const results = await page.evaluate(() => {
      const s = mockXR, device = s.device;
      device.step(0);
      const paused = device.pixels();
      device.step(100);
      const frozen = device.pixels();
      device.dispatchEvent(new Event("select"));
      device.step(200);
      const playing = device.pixels();
      const uploadsBefore = s.uploads;
      device.step(300);
      const uploadsPerFrame = s.uploads - uploadsBefore;
      device.dispatchEvent(new Event("select"));
      device.dispatchEvent(new Event("squeeze"));
      device.inputSources = [
        { handedness: "left", gamepad: { mapping: "xr-standard", axes: [0, 0, 0, -1] } },
        { handedness: "right", gamepad: { mapping: "xr-standard", axes: [0, 0, 1, 0.4] } }
      ];
      device.step(400);
      return { paused, frozen, playing, uploadsPerFrame, position: s.positions.at(-1), callbacks: device.callbacks.size };
    });
    assert.deepEqual(results.paused, results.frozen);
    assert.notDeepEqual(results.playing.hashes, results.frozen.hashes);
    assert.equal(results.uploadsPerFrame, 1);
    assert.equal(results.callbacks, 1, "Paused XR must keep tracking the headset");
    assert.ok(results.position[2] > -1.8);
    assert.equal(await page.locator("#shape-name").textContent(), "Rippling torus");
    assert.equal(await page.locator("#play").textContent(), "Play");
  });
});

test("tracking/visibility loss is safe; floor fallback and recenter work", async () => {
  await withXR({ failFloor: true }, async page => {
    await start(page);
    const result = await page.evaluate(() => {
      const s = mockXR, device = s.device;
      device.step(0);
      const count = s.draws.length;
      s.missingPose = true;
      device.step(100);
      const missingCount = s.draws.length;
      s.missingPose = false;
      device.visibilityState = "hidden";
      device.dispatchEvent(new Event("visibilitychange"));
      device.step(200);
      const hiddenCount = s.draws.length;
      device.visibilityState = "visible";
      device.dispatchEvent(new Event("visibilitychange"));
      device.space.dispatchEvent(new Event("reset"));
      device.step(5000, 2, 1.7, 3);
      return { count, missingCount, hiddenCount, spaces: s.spaces, position: s.positions.at(-1) };
    });
    assert.deepEqual(result.spaces, ["local-floor", "local"]);
    assert.equal(result.count, result.missingCount);
    assert.equal(result.count, result.hiddenCount);
    assert.ok(Math.abs(result.position[0] - 2) < 1e-5);
    assert.ok(Math.abs(result.position[2] - 1.2) < 1e-5);
  });
});

test("ending and re-entering VR restores the flat renderer and current shape", async () => {
  await withXR({}, async page => {
    await page.locator('[data-shape="2"]').click();
    const before = await page.locator("#scene").screenshot();
    await start(page);
    await page.evaluate(async () => { mockXR.device.step(100); await mockXR.device.end(); });
    await page.waitForFunction(() => !document.documentElement.classList.contains("vr-active"));
    assert.equal(await page.locator("#enter-vr").textContent(), "Enter VR");
    assert.equal(await page.locator("#shape-name").textContent(), "Fluted sphere");
    assert.ok((await page.locator("#scene").screenshot()).equals(before));
    await start(page);
    assert.equal(await page.evaluate(() => mockXR.sessions.length), 2);
    await page.locator("#enter-vr").click();
    await page.waitForFunction(() => !document.documentElement.classList.contains("vr-active"));
    assert.equal(await page.evaluate(() => mockXR.device.ended), true);
  });
});

test("all three sculptures render as stereo geometry in VR", async () => {
  await withXR({}, async page => {
    await start(page);
    const renders = await page.evaluate(() => {
      const device = mockXR.device, renders = [];
      for (let i = 0; i < 3; i++) {
        device.step(i * 100);
        renders.push(device.pixels());
        device.dispatchEvent(new Event("squeeze"));
      }
      return renders;
    });
    for (const render of renders) {
      assert.equal(render.error, 0);
      assert.ok(render.counts.every(count => count > 5000));
      assert.notEqual(render.hashes[0], render.hashes[1]);
    }
    assert.notDeepEqual(renders[0].hashes, renders[1].hashes);
    assert.notDeepEqual(renders[1].hashes, renders[2].hashes);
  });
});

test("controller distance is bounded and axes without xr-standard mapping are ignored", async () => {
  await withXR({}, async page => {
    await start(page);
    const result = await page.evaluate(() => {
      const device = mockXR.device, s = mockXR;
      device.step(0);
      device.inputSources = [{ handedness: "left", gamepad: { mapping: "standard", axes: [0, 0, 0, -1] } }];
      device.step(100);
      const ignored = s.positions.at(-1)[2];
      device.inputSources[0].gamepad.mapping = "xr-standard";
      for (let i = 2; i < 25; i++) device.step(i * 100);
      const near = s.positions.at(-1)[2];
      device.inputSources[0].gamepad.axes[3] = 1;
      for (let i = 25; i < 70; i++) device.step(i * 100);
      const far = s.positions.at(-1)[2];
      device.inputSources[0].gamepad.axes[3] = 0.1;
      device.step(7000);
      const deadzone = s.positions.at(-1)[2];
      return { ignored, near, far, deadzone };
    });
    assert.ok(Math.abs(result.ignored + 1.8) < 1e-5);
    assert.ok(Math.abs(result.near + 0.85) < 1e-5);
    assert.ok(Math.abs(result.far + 4.5) < 1e-5);
    assert.equal(result.deadzone, result.far);
  });
});

test("ending a session during compatibility setup never starts a stale XR frame loop", async () => {
  await withXR({ deferCompatibility: true }, async page => {
    await page.locator("#enter-vr").click();
    await page.waitForFunction(() => Boolean(mockXR.finishCompatibility));
    await page.evaluate(async () => {
      await mockXR.device.end();
      mockXR.finishCompatibility();
    });
    await page.waitForFunction(() => !document.getElementById("enter-vr").disabled);
    assert.equal(await page.evaluate(() => mockXR.device.callbacks.size), 0);
    assert.equal(await page.locator("#enter-vr").textContent(), "Enter VR");
    assert.equal(await page.locator("#status").isVisible(), false);
  });
});

test("page exit ends VR and a persisted page return can start a fresh session", async () => {
  await withXR({}, async page => {
    await start(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    await page.waitForFunction(() => mockXR.device.ended);
    assert.equal(await page.evaluate(() => mockXR.device.callbacks.size), 0);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await page.waitForFunction(() => !document.getElementById("enter-vr").disabled);
    await start(page);
    await page.evaluate(() => mockXR.device.step(100));
    assert.equal(await page.evaluate(() => mockXR.device.pixels().error), 0);
  });
});

test("graphics context loss ends VR and context recovery returns a usable browser renderer", async () => {
  await withXR({}, async page => {
    await start(page);
    await page.evaluate(() => {
      window.lostContext = (document.getElementById("scene").getContext("webgl2") || document.getElementById("scene").getContext("webgl")).getExtension("WEBGL_lose_context");
      lostContext.loseContext();
    });
    await page.waitForFunction(() => mockXR.device.ended && !document.getElementById("status").hidden);
    await page.evaluate(() => lostContext.restoreContext());
    await page.waitForFunction(() => document.getElementById("status").hidden);
    assert.equal(await page.locator("#enter-vr").textContent(), "Enter VR");
    assert.equal(await page.locator("#enter-vr").isDisabled(), false);
    assert.equal(await page.locator("#play").isDisabled(), false);
  });
});

test("capability changes do not disable Exit VR for an active session", async () => {
  await withXR({}, async page => {
    await start(page);
    await page.evaluate(() => {
      mockXR.supported = false;
      navigator.xr.dispatchEvent(new Event("devicechange"));
    });
    await page.waitForFunction(() => !document.getElementById("vr-status").hidden);
    assert.equal(await page.locator("#enter-vr").isDisabled(), false);
    await page.locator("#enter-vr").click();
    await page.waitForFunction(() => document.getElementById("enter-vr").disabled);
    assert.equal(await page.locator("#enter-vr").textContent(), "Enter VR");
  });
});

for (const mode of ["vr", "ar"]) {
  test(`Angular iframe delegates spatial tracking and can start stereo ${mode.toUpperCase()}`, {
    skip: !process.env.ORBIT_TEST_ROOT
  }, async () => {
    await withXR({}, async page => {
      await page.goto(origin + "/orbit");
      const iframe = page.locator("iframe.orbit-frame");
      await iframe.waitFor();
      assert.match(await iframe.getAttribute("allow"), /xr-spatial-tracking/);
      await page.frameLocator("iframe.orbit-frame").locator("#enter-" + mode).waitFor();
      const child = page.frames().find(frame => frame.url().includes("/assets/orbit/index.html"));
      await child.waitForFunction(value => !document.getElementById("enter-" + value).disabled, mode);
      await child.locator("#enter-" + mode).click();
      await child.waitForFunction(value => document.documentElement.classList.contains(value + "-active"), mode);
      const output = await child.evaluate(() => { mockXR.device.step(100); return mockXR.device.pixels(); });
      assert.equal(output.error, 0);
      assert.ok(output.counts.every(count => count > 5000));
      await child.locator("#enter-" + mode).click();
      await child.waitForFunction(() => !document.documentElement.classList.contains("xr-active"));
      await page.getByRole("link", { name: "Back to home" }).click();
      await page.waitForURL(origin + "/");
    });
  });
}

for (const config of [{ supported: false }, { failRequest: true }, { failSetup: true }]) {
  test(`XR fallback keeps ordinary Orbit usable: ${JSON.stringify(config)}`, async () => {
    await withXR(config, async page => {
      if (config.supported === false) {
        await page.waitForFunction(() => !document.getElementById("vr-status").hidden);
        assert.equal(await page.locator("#enter-vr").isDisabled(), true);
      } else {
        await page.locator("#enter-vr").click();
        await page.waitForFunction(() => !document.getElementById("vr-status").hidden &&
          !document.getElementById("enter-vr").disabled);
        assert.match(await page.locator("#vr-status").textContent(), /could not start/);
        if (config.failSetup) assert.equal(await page.evaluate(() => mockXR.device.ended), true);
      }
      await page.locator('[data-shape="1"]').click();
      assert.equal(await page.locator("#shape-name").textContent(), "Rippling torus");
      assert.equal(await page.locator("#status").isVisible(), false);
    });
  });
}
