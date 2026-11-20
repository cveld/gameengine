// Browser tests of the built site (run `npm run build` first): navigation, the
// embedded games and the multiplayer games over a local SignalR stand-in.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const startSite = require("./helpers/fake-site-server.cjs");

const root = path.resolve(process.env.SITE_TEST_ROOT || path.join(__dirname, "../dist"));
const skip = !fs.existsSync(path.join(root, "index.html")) && "build the site first (npm run build)";
let chromium, site, browser;
const errors = [];

before(async () => {
  if (skip) return;
  ({ chromium } = require(process.env.ORBIT_PLAYWRIGHT_MODULE || "playwright"));
  site = await startSite(root);
  browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
});
after(async () => {
  await browser?.close();
  await site?.close();
});

async function page(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, ...options });
  const p = await context.newPage();
  p.on("pageerror", e => errors.push(e.message));
  return p;
}

test("home lists every game and each tile opens its page", { skip }, async () => {
  const p = await page();
  await p.goto(site.origin + "/");
  const links = await p.$$eval(".tile", tiles => tiles.map(t => t.closest("a").getAttribute("href")));
  assert.deepEqual(links, ["/engine", "/memory", "/simon", "/maze", "/maze-rooms", "/flappy-muis", "/coop", "/orbit", "/marble-race"]);
  assert.match(await p.textContent(".build-version"), /Commit: [0-9a-f]{7}/);
  for (const [href, check] of [
    ["/memory", "h1:has-text('Geheugenspel')"], ["/simon", "h1:has-text('Simon Says')"], ["/coop", "h1:has-text('Tandem Ruimteschip')"],
    ["/engine", "a.nav-link.active:has-text('Create')"], ["/orbit", "text=Which Orbit do you want to play?"],
    ["/maze", "iframe[src='/assets/maze/index.html']"], ["/maze-rooms", "iframe[src='/assets/maze-rooms/index.html']"],
    ["/flappy-muis", "iframe[src='/assets/flappy-muis/index.html']"], ["/marble-race", "iframe[src='/assets/marble-race/index.html']"]
  ]) {
    await p.goto(site.origin + "/");
    await p.click(`a[href='${href}']`);
    await p.waitForURL(site.origin + href);
    await p.waitForSelector(check);
  }
  await p.context().close();
});

test("unknown URLs show the home page and the engine redirects to Create", { skip }, async () => {
  const p = await page();
  await p.goto(site.origin + "/does-not-exist");
  await p.waitForSelector("h1:has-text('Game engine')");
  await p.goto(site.origin + "/engine/tabs/7");
  await p.waitForURL(site.origin + "/engine/create");
  await p.context().close();
});

test("embedded games navigate back through their own links", { skip }, async () => {
  const p = await page();
  await p.goto(site.origin + "/marble-race");
  await p.frameLocator("iframe").locator("#back-link").click();
  await p.waitForURL(site.origin + "/");
  await p.goto(site.origin + "/orbit/catch");
  await p.frameLocator("iframe").locator("#back-link").click();
  await p.waitForURL(site.origin + "/orbit");
  await p.click("a[href='/orbit/classic']");
  await p.frameLocator("orbit-classic iframe").locator("#scene").waitFor();
  await p.context().close();
});

test("memory and simon show who is online across browsers", { skip }, async () => {
  for (const game of ["memory", "simon"]) {
    const a = await page(), b = await page();
    await a.goto(`${site.origin}/${game}`);
    await a.fill("#playerName", "Alice");
    await a.click("button:has-text('Meedoen')");
    await b.goto(`${site.origin}/${game}`);
    await b.fill("#playerName", "Bob");
    await b.press("#playerName", "Enter");
    for (const p of [a, b]) {
      await p.waitForSelector(".badge:has-text('2 spelers online')");
      assert.deepEqual((await p.$$eval(".list-group-item", li => li.map(x => x.textContent.trim()))).sort(), ["Alice", "Bob"]);
    }
    await b.close();
    await a.waitForSelector(".badge:has-text('1 speler online')");
    await a.context().close();
  }
});

test("memory: matching all pairs reports a result to everyone", { skip }, async () => {
  const a = await page(), b = await page();
  await b.goto(`${site.origin}/memory`);
  await b.fill("#playerName", "Watcher");
  await b.click("button:has-text('Meedoen')");
  await a.goto(`${site.origin}/memory`);
  await a.fill("#playerName", "Solver");
  await a.click("button:has-text('Meedoen')");
  // Solve by reading the symbols from the DOM.
  const symbols = await a.$$eval(".memory-tile-back", els => els.map(e => e.textContent));
  const seen = new Map();
  for (let i = 0; i < symbols.length; i++) {
    if (!seen.has(symbols[i])) { seen.set(symbols[i], i); continue; }
    await a.click(`.memory-tile >> nth=${seen.get(symbols[i])}`);
    await a.click(`.memory-tile >> nth=${i}`);
  }
  await a.waitForSelector(".alert-success:has-text('Opgelost in 8 zetten')");
  await b.waitForSelector("td:has-text('Solver')");
  await a.context().close(); await b.context().close();
});

test("coop: two players share a room, the host counts down and the guest follows", { skip }, async () => {
  const touch = { viewport: { width: 400, height: 800 } };
  const a = await page(touch), b = await page(touch);
  await a.goto(`${site.origin}/coop`);
  await a.fill("#coopName", "Host");
  await a.fill("#coopRoom", "TEST");
  await a.click("button:has-text('Meedoen')");
  await a.waitForURL(`${site.origin}/coop?room=TEST`);
  await b.goto(`${site.origin}/coop?room=TEST`);
  await b.fill("#coopName", "Guest");
  await b.click("button:has-text('Meedoen')");
  await a.waitForSelector(".coop-hint:has-text('met Guest')");
  await b.waitForSelector(".coop-hint:has-text('met Host')");
  assert.match(await a.textContent(".coop-hint strong"), /links \/ rechts/);
  assert.match(await b.textContent(".coop-hint strong"), /omhoog \/ omlaag/);
  // The host's simulation reaches the guest: the countdown ends and items fall.
  await b.waitForFunction(() => document.querySelector("coop-game").gameState.phase === "playing", null, { timeout: 15000 });
  // The guest's steering reaches the host.
  const before = await a.evaluate(() => document.querySelector("coop-game").gameState.shipY);
  await b.keyboard.down("ArrowUp");
  await a.waitForFunction(y => document.querySelector("coop-game").gameState.shipY < y - 20, before);
  await b.keyboard.up("ArrowUp");
  // The browser's back button leaves the room (the host joined from the lobby).
  await a.goBack();
  await a.waitForURL(`${site.origin}/coop`);
  await a.waitForSelector("#coopRoom");
  await b.waitForFunction(() => !document.querySelector(".coop-hint").textContent.includes("Host"), null, { timeout: 15000 });
  // Forward re-joins it.
  await a.goForward();
  await a.waitForSelector(".coop-hint:has-text('met Guest')");
  await a.context().close(); await b.context().close();
});

test("card engine: a game tab deals to two player tabs who play over SignalR", { skip }, async () => {
  const host = await page(), players = await page();
  await host.goto(`${site.origin}/engine`);
  await host.click("button:has-text('Create game')");
  await host.click("a.nav-link:has-text('Game')");
  await host.waitForURL(`${site.origin}/engine/tabs/0`);
  const gameId = (await host.textContent("p:has-text('game1 id')")).replace("game1 id:", "").trim();

  await players.goto(`${site.origin}/engine/create`);
  await players.click("button:has-text('Create player')");
  await players.click("button:has-text('Create player')");
  for (const tab of [0, 1]) {
    await players.click(`a[href='/engine/tabs/${tab}']`);
    await players.waitForSelector(`p:has-text('player1 id')`);
    await players.click("button:has-text('Query games')");
    await players.click(`p:has-text('${gameId}') button:has-text('Join')`);
  }
  await host.waitForFunction(() => document.querySelectorAll("game1-view ol")[1].children.length === 2);
  await host.click("button:has-text('Start game')");
  await host.waitForSelector("h2:has-text('Stack (count = ')");
  await players.click("a[href='/engine/tabs/0']");
  await players.waitForSelector("text=My turn = true");
  assert.equal(await players.locator("player1-view h1:has-text('My cards') ~ img").count(), 7);
  // Drawing a card passes the turn and grows the hand.
  await players.click("player1-view h1:has-text('Stack') + img");
  await players.waitForSelector("text=My turn = false");
  assert.ok(await players.locator("player1-view h1:has-text('My cards') ~ img").count() >= 8);
  await players.click("a[href='/engine/tabs/1']");
  await players.waitForSelector("text=My turn = true");
  // Tabs survive a reload of the page.
  await players.reload();
  await players.waitForSelector("a[href='/engine/tabs/1']");
  await host.context().close(); await players.context().close();
});

test("no page errors", { skip }, () => {
  assert.deepEqual(errors, []);
});
