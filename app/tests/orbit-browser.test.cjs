// Optional browser smoke suite. Supply ORBIT_PLAYWRIGHT_MODULE for an existing
// Playwright installation; this project has no Playwright runtime dependency.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.ORBIT_PLAYWRIGHT_MODULE || "playwright");

const root = path.resolve(process.env.ORBIT_TEST_ROOT || path.join(__dirname, "../src"));
let browser, server, origin;
const errors = [];
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png" };

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = path.resolve(root, "." + pathname);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      // Support Angular routes only when running against a built app.
      const index = path.join(root, "index.html");
      if (fs.existsSync(index) && !path.extname(pathname)) file = index;
      else { res.writeHead(404).end(); return; }
    }
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

async function withPage(options, run) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 850 }, reducedMotion: "reduce", ...options });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(origin + "/assets/orbit/index.html");
    await page.waitForFunction(() => {
      const canvas = document.getElementById("scene");
      return canvas && canvas.width > 300 && document.getElementById("status").hidden;
    });
    await run(page);
  } finally {
    await context.close();
  }
}

const screenshot = page => page.locator("#scene").screenshot();
const sameImage = (actual, expected, message = "Rendered images should match") => assert.ok(actual.equals(expected), message);
const differentImage = (actual, expected, message = "Rendered images should differ") => assert.ok(!actual.equals(expected), message);

async function visualDifference(page, a, b) {
  return page.evaluate(async ([first, second]) => {
    async function decode(data) {
      const image = new Image();
      image.src = "data:image/png;base64," + data;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    }
    const x = await decode(first), y = await decode(second);
    if (x.length !== y.length) return Infinity;
    let difference = 0;
    for (let i = 0; i < x.length; i++) difference += Math.abs(x[i] - y[i]);
    return difference / x.length;
  }, [a.toString("base64"), b.toString("base64")]);
}

test("three sculptures render without WebGL errors and have distinct output", async () => {
  await withPage({}, async page => {
    assert.equal(await page.locator("#status").isVisible(), false, await page.locator("#status").textContent());
    const images = [];
    for (const shape of [0, 1, 2]) {
      await page.locator(`[data-shape="${shape}"]`).click();
      assert.equal(await page.locator(`[data-shape="${shape}"]`).getAttribute("aria-pressed"), "true");
      images.push(await screenshot(page));
      assert.equal(await page.evaluate(() => document.getElementById("scene").getContext("webgl").getError()), 0);
    }
    differentImage(images[0], images[1]);
    differentImage(images[1], images[2]);
    assert.ok(images.every(image => image.length > 20000), "Sculptures should produce nontrivial rendered images");
    if (process.env.ORBIT_SCREENSHOT) {
      await page.locator('[data-shape="0"]').click();
      await page.screenshot({ path: process.env.ORBIT_SCREENSHOT });
    }
  });
});

test("pause freezes all animation, while play advances it", async () => {
  await withPage({}, async page => {
    assert.equal(await page.locator("#play").textContent(), "Play");
    const frozen = await screenshot(page);
    await page.waitForTimeout(180);
    sameImage(await screenshot(page), frozen);
    await page.locator("#play").click();
    const playing = await screenshot(page);
    await page.waitForTimeout(180);
    differentImage(await screenshot(page), playing);
    await page.locator("#play").click();
    const paused = await screenshot(page);
    await page.waitForTimeout(180);
    sameImage(await screenshot(page), paused);
  });
});

test("wireframe, rain, camera drag, zoom and reset work while paused", async () => {
  await withPage({}, async page => {
    const initial = await screenshot(page);
    await page.locator("#wireframe").check();
    differentImage(await screenshot(page), initial);
    await page.locator("#wireframe").uncheck();
    sameImage(await screenshot(page), initial);
    await page.locator("#rain").uncheck();
    differentImage(await screenshot(page), initial);
    await page.locator("#rain").check();
    const box = await page.locator("#scene").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 30, { steps: 4 });
    await page.mouse.up();
    differentImage(await screenshot(page), initial);
    await page.mouse.wheel(0, -2000);
    await page.waitForFunction(() => Number(document.getElementById("zoom").value) === 1.65);
    assert.equal(await page.locator("#zoom-value").textContent(), "1.65×");
    await page.locator("#reset").click();
    sameImage(await screenshot(page), initial);
  });
});

test("visibility changes stop animation and resume without changing play preference", async () => {
  await withPage({}, async page => {
    await page.locator("#play").click();
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const hidden = await screenshot(page);
    await page.waitForTimeout(180);
    sameImage(await screenshot(page), hidden);
    assert.equal(await page.locator("#play").getAttribute("aria-pressed"), "true");
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(180);
    differentImage(await screenshot(page), hidden);
  });
});

test("keyboard shortcuts do not override focused form controls", async () => {
  await withPage({}, async page => {
    await page.locator("#scene").focus();
    await page.keyboard.press("3");
    assert.equal(await page.locator("#shape-name").textContent(), "Fluted sphere");
    await page.keyboard.press("w");
    assert.equal(await page.locator("#wireframe").isChecked(), true);
    await page.keyboard.press("g");
    assert.equal(await page.locator("#rain").isChecked(), false);
    await page.locator("#tempo").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.locator("#tempo-value").textContent(), "1.05×");
    await page.keyboard.press("r");
    assert.equal(await page.locator("#shape-name").textContent(), "Fluted sphere");
    await page.locator("#scene").focus();
    await page.keyboard.press("?");
    assert.equal(await page.locator("#shortcuts").evaluate(element => element.open), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#shortcuts").evaluate(element => element.open), false);
  });
});

test("mobile layout fits and touch can orbit the sculpture", async () => {
  await withPage({ viewport: { width: 390, height: 850 }, isMobile: true, hasTouch: true }, async page => {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const initial = await screenshot(page);
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 150, y: 180 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 210, y: 210 }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await session.detach();
    differentImage(await screenshot(page), initial);
  });
});

for (const [width, height] of [[320, 568], [360, 640], [390, 844], [430, 932], [568, 320], [844, 390], [768, 1024]]) {
  test(`mobile controls fit with 44px touch targets at ${width}x${height}`, async () => {
    await withPage({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, async page => {
      const layout = await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll("button, .toggle, input[type=range], footer a"))
          .filter(element => !element.closest("dialog"));
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          targets: controls.map(element => {
            const box = element.getBoundingClientRect();
            return { name: element.id || element.textContent.trim(), width: box.width, height: box.height, left: box.left, right: box.right };
          })
        };
      });
      assert.equal(layout.overflow, false);
      for (const target of layout.targets) {
        assert.ok(target.height >= 44 && target.width >= 44, `${target.name} is too small: ${target.width}x${target.height}`);
        assert.ok(target.left >= 0 && target.right <= width, `${target.name} overflows the screen`);
      }
      await page.locator("#help").click();
      assert.equal(await page.locator("#shortcuts").evaluate(element => element.scrollWidth <= element.clientWidth), true);
      await page.getByRole("button", { name: "Back to the sculpture" }).click();
      if (width === 390 && process.env.ORBIT_MOBILE_SCREENSHOT) {
        await page.screenshot({ path: process.env.ORBIT_MOBILE_SCREENSHOT, fullPage: true });
      }
    });
  });
}

test("two-finger pinch zooms, clamps its range and hands off to one-finger orbit", async () => {
  await withPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async page => {
    const session = await page.context().newCDPSession(page);
    const box = await page.locator("#scene").boundingBox();
    const y = box.y + box.height / 2;
    const send = (type, points) => session.send("Input.dispatchTouchEvent", {
      type, touchPoints: points.map(([id, x]) => ({ id, x, y }))
    });
    await send("touchStart", [[0, 150]]);
    await send("touchStart", [[0, 150], [1, 210]]);
    await send("touchMove", [[0, 130], [1, 230]]);
    await page.waitForFunction(() => Number(document.getElementById("zoom").value) === 1.65);
    await send("touchMove", [[0, 180], [1, 185]]);
    await page.waitForFunction(() => Number(document.getElementById("zoom").value) === 0.55);
    await send("touchEnd", [[1, 185]]);
    const beforeOrbit = await screenshot(page);
    await send("touchMove", [[0, 240]]);
    differentImage(await screenshot(page), beforeOrbit);
    assert.equal(await page.locator("#zoom-value").textContent(), "0.55×");
    await send("touchCancel", []);
    await page.locator("#reset").click();
    assert.equal(await page.locator("#zoom-value").textContent(), "1.00×");
    await session.detach();
  });
});

test("embedded mobile viewer auto-sizes without nested scrolling after rotation", {
  skip: !process.env.ORBIT_TEST_ROOT
}, async () => {
  await withPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async page => {
    await page.goto(origin + "/orbit");
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const iframe = page.locator("iframe.orbit-frame");
      await iframe.waitFor();
      await page.waitForFunction(() => {
        const frame = document.querySelector("iframe.orbit-frame");
        const content = frame?.contentDocument?.querySelector(".playground");
        return content && Math.abs(frame.clientHeight - content.getBoundingClientRect().height) < 2;
      });
      const dimensions = await page.evaluate(() => {
        const frame = document.querySelector("iframe.orbit-frame");
        return {
          outerOverflow: document.documentElement.scrollWidth > innerWidth,
          innerOverflow: frame.contentDocument.documentElement.scrollHeight > frame.clientHeight + 1,
          frameHeight: frame.clientHeight
        };
      });
      assert.equal(dimensions.outerOverflow, false);
      assert.equal(dimensions.innerOverflow, false);
      assert.ok(dimensions.frameHeight >= 400 && dimensions.frameHeight < 1000);
      const footer = page.frameLocator("iframe.orbit-frame").getByRole("link", { name: "MIT license" });
      await footer.scrollIntoViewIfNeeded();
      const back = page.getByRole("link", { name: "Back to home" });
      assert.ok((await back.boundingBox()).height >= 44);
    }
  });
});

test("lost WebGL context recovers with the current controls and geometry", async () => {
  await withPage({}, async page => {
    await page.locator('[data-shape="2"]').click();
    const initial = await screenshot(page);
    await page.evaluate(() => {
      window.contextRecovery = document.getElementById("scene").getContext("webgl").getExtension("WEBGL_lose_context");
      window.contextRecovery.loseContext();
    });
    await page.waitForFunction(() => !document.getElementById("status").hidden);
    assert.equal(await page.locator("#play").isDisabled(), true);
    await page.evaluate(() => window.contextRecovery.restoreContext());
    await page.waitForFunction(() => document.getElementById("status").hidden);
    assert.equal(await page.locator("#shape-name").textContent(), "Fluted sphere");
    const difference = await visualDifference(page, await screenshot(page), initial);
    assert.ok(difference < 0.05, `Restored image changed by ${difference} channel values on average`);
  });
});

test("missing WebGL shows an actionable fallback", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type === "webgl" ? null : original.call(this, type, ...args);
      };
    });
    await page.goto(origin + "/assets/orbit/index.html");
    await page.waitForFunction(() => !document.getElementById("status").hidden);
    assert.match(await page.locator("#status").textContent(), /hardware acceleration/);
    assert.equal(await page.locator("#play").isDisabled(), true);
    await page.locator("#help").click();
    assert.equal(await page.locator("#shortcuts").evaluate(element => element.open), true);
  } finally {
    await context.close();
  }
});

test("home tile opens Orbit and its back link returns home in a built app", {
  skip: !process.env.ORBIT_TEST_ROOT
}, async () => {
  await withPage({}, async page => {
    await page.goto(origin);
    await page.locator('a[href="/orbit"]').click();
    await page.waitForURL("**/orbit");
    const iframe = page.frameLocator('iframe[title="Orbit — interactive 3D sculptures"]');
    await iframe.locator("#shape-name").waitFor();
    await page.getByRole("link", { name: "Back to home" }).click();
    await page.waitForURL(origin + "/");
    await page.goto(origin + "/orbit");
    await iframe.locator("#shape-name").waitFor();
  });
});

test("no unexpected JavaScript errors occurred", () => assert.deepEqual(errors, []));
