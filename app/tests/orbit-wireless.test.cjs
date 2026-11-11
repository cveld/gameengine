const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const WebSocketServer = require("../node_modules/ws").Server;
const { chromium } = require(process.env.ORBIT_PLAYWRIGHT_MODULE || "playwright");
const installMockXR = require("./helpers/mock-xr.cjs");
const root = path.resolve(process.env.ORBIT_TEST_ROOT || path.join(__dirname, "../dist/gameengine"));

test("Wireless XR reports cross real SignalR clients without USB, plaintext poses or unsolicited sharing", async () => {
  const packets = [];
  const hub = new WebSocketServer({ noServer: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://" + req.headers.host);
    const json = value => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)); };
    if (url.pathname === "/api/negotiate") { json({ url: url.origin + "/hub", accessToken: "local-test-token" }); return; }
    if (url.pathname === "/hub/negotiate") {
      json({ negotiateVersion: 1, connectionId: "test", connectionToken: Math.random().toString(36),
        availableTransports: [{ transport: "WebSockets", transferFormats: ["Text"] }] }); return;
    }
    if (url.pathname === "/api/messages") {
      let body = "";
      req.on("data", value => body += value);
      req.on("end", () => {
        const message = JSON.parse(body);
        if (message.type === "orbit.xr.report.v1") packets.push(message);
        for (const client of hub.clients) client.send(JSON.stringify({
          type: 1, target: message.type, arguments: [message]
        }) + "\x1e");
        json({});
      }); return;
    }
    let file = path.resolve(root, "." + url.pathname);
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, "index.html");
    res.setHeader("Content-Type", ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript" })[path.extname(file)] || "text/plain");
    fs.createReadStream(file).pipe(res);
  });
  server.on("upgrade", (req, socket, head) => hub.handleUpgrade(req, socket, head, ws => hub.emit("connection", ws)));
  hub.on("connection", ws => ws.on("message", bytes => {
    for (const chunk of bytes.toString().split("\x1e").filter(Boolean)) {
      if (JSON.parse(chunk).protocol) ws.send("{}\x1e");
    }
  }));
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`, key = "12".repeat(16);
    browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await context.addInitScript(installMockXR, { enabledFeatures: ["local", "hand-tracking"] });
    const publisher = await context.newPage(), monitor = await context.newPage(), errors = [];
    for (const page of [publisher, monitor]) page.on("pageerror", error => errors.push(error.message));
    await publisher.goto(origin + "/orbit/classic");
    const frame = publisher.frameLocator("app-orbit iframe");
    await frame.locator("#scene").waitFor();
    assert.equal(packets.length, 0);
    await monitor.goto(origin + "/orbit/diagnostics#" + key);
    await monitor.getByRole("button", { name: "Connect", exact: true }).click();
    await publisher.locator(".wireless-panel summary").click();
    await publisher.locator(".wireless-panel input").first().fill(key);
    await publisher.getByRole("button", { name: "Start sharing" }).click();
    await frame.locator("#help").click();
    // The dialog is centred in the tall embedded frame; bring each control into the phone viewport.
    const reveal = async locator => {
      const box = await locator.boundingBox();
      await publisher.evaluate(offset => window.scrollBy(0, offset), box.y - 300);
      return locator;
    };
    await (await reveal(frame.locator("#ar-minimal"))).check();
    await (await reveal(frame.locator("#ar-minimal-hands"))).check();
    await (await reveal(frame.locator("#shortcuts form button"))).click();
    await frame.locator("#enter-ar").click();
    await publisher.waitForFunction(() => document.querySelector("app-orbit iframe").contentDocument.documentElement.classList.contains("ar-active"));
    await frame.locator("#scene").evaluate(() => {
      const device = mockXR.device;
      device.inputSources = [{ handedness: "right", hand: new Map([
        ["thumb-tip", { position: [0.1, 1.6, -1.8] }],
        ["index-finger-tip", { position: [0.18, 1.6, -1.8] }],
        ["middle-finger-tip", { position: [0.1, 1.68, -1.8] }]
      ]) }];
      device.step(100);
    });
    await monitor.waitForFunction(() => {
      try { return JSON.parse(document.querySelector("textarea").value).attempt?.handSample?.validHands === 1; }
      catch { return false; }
    });
    const report = JSON.parse(await monitor.locator("textarea").inputValue());
    assert.equal(report.attempt.profile, "minimal-local-hands");
    assert.deepEqual(report.attempt.enabledFeatures, ["local", "hand-tracking"]);
    assert.equal(report.attempt.referenceSpace, "local");
    assert.ok(packets.length > 0);
    for (const packet of packets) {
      assert.deepEqual(Object.keys(packet.payload).sort(), ["data", "iv", "version"]);
      assert.equal(JSON.stringify(packet).includes(key), false);
      assert.equal(JSON.stringify(packet).includes("handSample"), false);
    }
    await publisher.getByRole("button", { name: "Stop sharing" }).click();
    await new Promise(resolve => setTimeout(resolve, 300));
    const stoppedCount = packets.length;
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.equal(packets.length, stoppedCount);
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    if (browser) await browser.close();
    for (const client of hub.clients) client.terminate();
    await new Promise(resolve => hub.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
});
