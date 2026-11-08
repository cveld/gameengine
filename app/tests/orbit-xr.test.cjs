const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const installMockXR = require("./helpers/mock-xr.cjs");
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
    await page.goto(origin + "/assets/orbit/index.html");
    await page.waitForFunction(() => document.getElementById("scene").width > 300 && document.getElementById("status").hidden);
    if (config.supported !== false) await page.waitForFunction(() => !document.getElementById("enter-vr").disabled);
    await run(page);
    assert.deepEqual(errors, []);
  } catch (error) {
    console.error("XR test status:", await page.locator("#status").textContent(),
      await page.locator("#vr-status").textContent(), errors);
    throw error;
  } finally { await context.close(); }
}
async function start(page) {
  await page.locator("#enter-vr").click();
  await page.waitForFunction(() => document.documentElement.classList.contains("vr-active"));
}

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
    assert.deepEqual(result.requests[0].options.optionalFeatures, ["local-floor"]);
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
      window.lostContext = document.getElementById("scene").getContext("webgl").getExtension("WEBGL_lose_context");
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

test("Angular iframe delegates spatial tracking and can start stereo VR", {
  skip: !process.env.ORBIT_TEST_ROOT
}, async () => {
  await withXR({}, async page => {
    await page.goto(origin + "/orbit");
    const iframe = page.locator("iframe.orbit-frame");
    await iframe.waitFor();
    assert.match(await iframe.getAttribute("allow"), /xr-spatial-tracking/);
    await page.frameLocator("iframe.orbit-frame").locator("#enter-vr").waitFor();
    const child = page.frames().find(frame => frame.url().includes("/assets/orbit/index.html"));
    await child.waitForFunction(() => !document.getElementById("enter-vr").disabled);
    await child.locator("#enter-vr").click();
    await child.waitForFunction(() => document.documentElement.classList.contains("vr-active"));
    const output = await child.evaluate(() => { mockXR.device.step(100); return mockXR.device.pixels(); });
    assert.equal(output.error, 0);
    assert.ok(output.counts.every(count => count > 5000));
    await child.locator("#enter-vr").click();
    await child.waitForFunction(() => !document.documentElement.classList.contains("vr-active"));
    await page.getByRole("link", { name: "Back to home" }).click();
    await page.waitForURL(origin + "/");
  });
});

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
