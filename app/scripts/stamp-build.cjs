const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const validCommit = value => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);

function resolveVersion(appRoot, env = process.env, run = execFileSync) {
  if (validCommit(env.GITHUB_SHA)) return { commit: env.GITHUB_SHA.toLowerCase(), dirty: false };
  try {
    const commit = run("git", ["rev-parse", "HEAD"], { cwd: appRoot, encoding: "utf8" }).trim();
    if (!validCommit(commit)) throw new Error("Invalid Git commit");
    const dirty = Boolean(run("git", ["status", "--porcelain"], { cwd: appRoot, encoding: "utf8" }).trim());
    return { commit: commit.toLowerCase(), dirty };
  } catch (error) {
    // The hosted builder may receive source files without the checkout's .git.
    const prepared = JSON.parse(fs.readFileSync(path.join(appRoot, ".build-commit.json"), "utf8"));
    if (!validCommit(prepared.commit) || typeof prepared.dirty !== "boolean") throw new Error("Invalid prepared build version");
    return prepared;
  }
}

function stampHTML(html, version) {
  if (!validCommit(version.commit)) throw new Error("Invalid build commit");
  const marker = /<span data-build-version(?:="")?(?: title="[^"]*")?>[^<]*<\/span>/g;
  const matches = html.match(marker);
  if (!matches || matches.length !== 1) throw new Error("Expected exactly one build version marker");
  const short = version.commit.slice(0, 7);
  const suffix = version.dirty ? " (local changes)" : "";
  return html.replace(marker, `<span data-build-version title="${version.commit}${suffix}">Commit: ${short}${suffix}</span>`);
}

function stampBuild(outputRoot, version) {
  const files = ["index.html", "assets/orbit/index.html"].map(file => path.join(outputRoot, file));
  // Validate both files before writing either; missing labels must fail the build.
  const stamped = files.map(file => stampHTML(fs.readFileSync(file, "utf8"), version));
  // Angular production bundles already have content hashes. Orbit's static
  // scripts/styles need the build commit in their URLs to avoid stale code.
  stamped[1] = stamped[1].replace(/(\s(?:src|href))="([\w./-]+\.(?:js|css))(?:\?v=[a-f0-9]+)?"/g,
    `$1="$2?v=${version.commit}"`);
  files.forEach((file, index) => fs.writeFileSync(file, stamped[index]));
}

if (require.main === module) {
  const appRoot = path.resolve(__dirname, "..");
  const version = resolveVersion(appRoot);
  if (process.argv.includes("--prepare")) {
    fs.writeFileSync(path.join(appRoot, ".build-commit.json"), JSON.stringify(version) + "\n");
  } else {
    stampBuild(path.join(appRoot, "dist/gameengine"), version);
    console.log(`Stamped website and Orbit: ${version.commit}${version.dirty ? " (local changes)" : ""}`);
  }
}

module.exports = { validCommit, resolveVersion, stampHTML, stampBuild };
