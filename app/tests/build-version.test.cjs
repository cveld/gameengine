const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveVersion, stampHTML, stampBuild, validCommit } = require("../scripts/stamp-build.cjs");
const commit = "0123456789abcdef0123456789abcdef01234567";
const marker = "<span data-build-version>Commit: development</span>";

test("Version stamping shows a short commit with the full commit as tooltip and is idempotent", () => {
  const stamped = stampHTML(marker, { commit, dirty: false });
  assert.match(stamped, /Commit: 0123456<\/span>/);
  assert.ok(stamped.includes(`title="${commit}"`));
  assert.equal(stampHTML(stamped, { commit, dirty: false }), stamped);
  assert.match(stampHTML(marker, { commit, dirty: true }), /Commit: 0123456 \(local changes\)/);
  assert.equal(stampHTML(marker.replace("data-build-version", 'data-build-version=""'), { commit }), stamped);
});
test("Invalid commits and absent or duplicate version markers fail rather than claiming an update", () => {
  for (const value of ["main", "<script>", "", null]) assert.equal(validCommit(value), false);
  assert.throws(() => stampHTML(marker, { commit: "main" }));
  assert.throws(() => stampHTML("no marker", { commit }));
  assert.throws(() => stampHTML(marker + marker, { commit }));
});
test("GitHub builds use the event commit, while local builds detect pending changes", () => {
  assert.deepEqual(resolveVersion(".", { GITHUB_SHA: commit }, () => { throw new Error("Should not call Git"); }), {
    commit, dirty: false
  });
  const run = (command, args) => args[0] === "rev-parse" ? commit + "\n" : " M app/src/index.html\n";
  assert.deepEqual(resolveVersion(".", {}, run), { commit, dirty: true });
});
test("Prepared CI metadata survives a builder without Git and both pages receive the same version", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gameengine-build-version-"));
  const assets = path.join(root, "assets"), orbit = path.join(assets, "orbit");
  const prepared = path.join(root, ".build-commit.json"), index = path.join(root, "index.html");
  const orbitIndex = path.join(orbit, "index.html");
  try {
    fs.mkdirSync(assets); fs.mkdirSync(orbit);
    fs.writeFileSync(prepared, JSON.stringify({ commit, dirty: false }));
    const version = resolveVersion(root, {}, () => { throw new Error("Git unavailable"); });
    fs.writeFileSync(index, marker);
    fs.writeFileSync(orbitIndex, marker + '<script src="xr.js"></script><link href="style.css"><a href="LICENSE">License</a>');
    stampBuild(root, version);
    const stampedOrbit = fs.readFileSync(orbitIndex, "utf8");
    assert.ok(stampedOrbit.startsWith(fs.readFileSync(index, "utf8")));
    assert.ok(stampedOrbit.includes(`src="xr.js?v=${commit}"`));
    assert.ok(stampedOrbit.includes(`href="style.css?v=${commit}"`));
    assert.ok(stampedOrbit.includes('href="LICENSE"'));
    stampBuild(root, version);
    assert.equal(fs.readFileSync(orbitIndex, "utf8"), stampedOrbit);
    fs.writeFileSync(orbitIndex, "missing marker");
    assert.throws(() => stampBuild(root, { commit: "f".repeat(40), dirty: false }));
    assert.ok(fs.readFileSync(index, "utf8").includes(commit), "Do not partly restamp a failed build");
  } finally {
    // Only explicitly created files/directories are removed, without recursive deletion.
    for (const file of [prepared, index, orbitIndex]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(orbit); fs.rmdirSync(assets); fs.rmdirSync(root);
  }
});
