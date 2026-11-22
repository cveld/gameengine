const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const load = require("./helpers/load-typescript.cjs");
const src = path.join(__dirname, "../src");
const observable = load(path.join(src, "engine/observable.ts"));
const protocol = load(path.join(src, "games/orbit/relay-protocol.ts"));
const { OrbitTelemetry } = load(path.join(src, "games/orbit/telemetry.ts"), {
  "@/engine/messages": { UserType: { undefined: "undefined" } },
  "@/engine/observable": observable,
  "@/engine/signalr": { signalr: () => { throw new Error("tests inject a client"); } }
});
const key = "12".repeat(16);
const report = JSON.stringify({
  report: "Orbit XR diagnostics v1",
  environment: { userAgent: "Private Quest test agent", buildVersion: "Commit: test", pose: [1, 2, 3] },
  attempt: { mode: "immersive-ar", profile: "minimal-local-hands", state: "rendering",
    enabledFeatures: ["hand-tracking"], handSample: { validHands: 1, nearbyHands: 0, position: [4, 5, 6] } },
  events: [], secretRoomGeometry: { matrix: [1, 2, 3] }
});
class SignalRStub {
  state = new observable.Value("Connected");
  lastError = new observable.Value(undefined);
  handlers = new Map();
  sent = [];
  get connected() { return this.state.value === "Connected"; }
  on(type, handler) { this.handlers.set(type, handler); return () => this.handlers.delete(type); }
  send(message) { this.sent.push(message); return Promise.resolve(); }
}
function client() {
  const signalr = new SignalRStub();
  let requested = 0;
  const service = new OrbitTelemetry(() => { requested++; return signalr; });
  return { signalr, service, requested: () => requested };
}

test("Wireless reports whitelist diagnostics and strip pose/room fields", () => {
  const safe = JSON.parse(protocol.safeReport(report));
  assert.equal(safe.environment.pose, undefined);
  assert.equal(safe.attempt.handSample.position, undefined);
  assert.equal(safe.secretRoomGeometry, undefined);
  assert.equal(safe.attempt.handSample.validHands, 1);
  assert.throws(() => protocol.safeReport("x".repeat(17000)));
  assert.throws(() => protocol.safeReport('{"report":"other"}'));
});
test("AES-GCM roundtrips without plaintext/key leakage and rejects tampered/wrong-key ciphertext", async () => {
  const codec = await protocol.createReportCodec(key);
  const encrypted = await codec.seal(report, "quest", 1);
  assert.equal(JSON.stringify(encrypted).includes("Private Quest"), false);
  assert.equal(JSON.stringify(encrypted).includes(key), false);
  assert.equal(codec.room.includes(key), false);
  const decoded = await codec.open(encrypted);
  assert.equal(JSON.parse(decoded.report).attempt.handSample.validHands, 1);
  const wrong = await protocol.createReportCodec("34".repeat(16));
  await assert.rejects(wrong.open(encrypted));
  // Always change the first character: replacing it with a fixed "A" was a no-op
  // whenever the random ciphertext already started with "A" (1 in 64 runs).
  const tampered = (encrypted.data[0] === "A" ? "B" : "A") + encrypted.data.slice(1);
  await assert.rejects(codec.open({ ...encrypted, data: tampered }));
  await assert.rejects(codec.open({ ...encrypted, iv: "AAA=" }));
  await assert.rejects(codec.open({ ...encrypted, data: "x".repeat(30001) }));
});
test("Pairing uses random 128-bit keys and rejects simple room codes", async () => {
  assert.match(protocol.newPairingKey(), /^[a-f0-9]{32}$/);
  assert.notEqual(protocol.newPairingKey(), protocol.newPairingKey());
  await assert.rejects(protocol.createReportCodec("123456"));
  const formatted = key.match(/.{4}/g).join("-");
  assert.equal((await protocol.createReportCodec(formatted)).room, (await protocol.createReportCodec(key)).room);
});
test("Relay is opt-in, delivers encrypted snapshots, suppresses replays and detaches without stopping shared SignalR", async () => {
  const publisher = client(), monitor = client();
  assert.equal(publisher.requested(), 0);
  await publisher.service.publish(report);
  assert.equal(publisher.signalr.sent.length, 0);
  await publisher.service.connect(key); await monitor.service.connect(key);
  await publisher.service.publish(report);
  const packet = publisher.signalr.sent[0];
  await monitor.signalr.handlers.get(protocol.ORBIT_REPORT_EVENT)(packet);
  const received = monitor.service.report.value;
  assert.equal(JSON.parse(received.report).attempt.handSample.validHands, 1);
  await monitor.signalr.handlers.get(protocol.ORBIT_REPORT_EVENT)(packet);
  assert.equal(monitor.service.report.value, received);
  monitor.service.disconnect();
  assert.equal(monitor.signalr.handlers.size, 0);
  assert.equal(monitor.signalr.state.value, "Connected");
});
test("Disconnection during encryption drops the in-flight packet", async () => {
  const publisher = client();
  await publisher.service.connect(key);
  let resolve;
  publisher.service.codec.seal = () => new Promise(done => resolve = done);
  const pending = publisher.service.publish(report);
  publisher.service.disconnect(); resolve({ version: 1, iv: "", data: "" });
  await pending;
  assert.equal(publisher.signalr.sent.length, 0);
});
test("Wrong-room and invalid broadcasts cannot populate a monitor", async () => {
  const monitor = client();
  await monitor.service.connect(key);
  const receive = monitor.signalr.handlers.get(protocol.ORBIT_REPORT_EVENT);
  await receive({ gameid: "other-room", payload: { version: 1, data: "", iv: "" } });
  await receive({ gameid: monitor.service.codec.room, payload: { version: 1, data: "", iv: "" } });
  assert.equal(monitor.service.report.value, null);
});
