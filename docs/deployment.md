# Deployment pipeline

Updated on November 20, 2026.

`.github/workflows/azure-static-web-apps-gentle-field-09d23da03.yml` deploys the
site to Azure Static Web Apps (`gentle-field-09d23da03`) and the separate
Highscores Function App (`func-gameengine-highscores`).

## Why it is incremental

Measured on run #99 (commit `e53cea4`, November 20, 2026) the old pipeline took
2 min 34 s for every push, whatever changed: about 13 s to build the deploy
action's container, 37 s `npm install` without a cache, about 33 s `ng build`
(including Angular's ngcc step), about 20 s copying and rebuilding the API, and
about 35 s upload plus deployment polling. The games under `app/src/assets` are
never compiled; `ng build` only copies them.

## What runs now

The build happens in the workflow itself; the Static Web Apps action only
uploads prebuilt output (`skip_app_build`, `skip_api_build`).

| Part | Rebuilt when | Otherwise |
|---|---|---|
| Angular bundle (`ng build`, Node 16 from `app/.nvmrc`) | anything under `app/` changes except `src/assets`, `tests`, `scripts`, Markdown, spec files and `staticwebapp.config.json` | restored from the GitHub Actions cache |
| `app/node_modules` | `app/package-lock.json` changes | restored from the cache (includes ngcc output) |
| Game assets, favicon, `staticwebapp.config.json`, version stamp | every run (plain copy, then `scripts/stamp-build.cjs`) | — |
| Managed API for SignalR (`api-build/`: `dist`, production `node_modules`, `host.json`, `package*.json`) | anything under `api/` changes | restored from the cache |
| Highscores Function App | `api/` differs between the push's `before` and `after` commits, or the previous commit is unknown (new branch, force push) | job skipped |
| Whole workflow | — | pushes that only touch `docs/**`, `*.md` or `LICENSE` do not run |

Cache keys are content hashes computed before anything is built, so a cache hit
always matches the sources. The Angular build is cached without assets and
without the version stamp; both are added on every run. Caches created on
`main` are also used by pull requests.

The run summary (Actions run page) states whether the Angular bundle and the
API were reused or rebuilt.

## Forcing a full deployment

Run the workflow manually (Actions -> Azure Static Web Apps CI/CD -> Run
workflow) with **full** checked. That ignores the build caches and also deploys
the Highscores Function App. Use it when a deployment looks stale, for example
after a failed Function App deployment, which a later push without `api/`
changes would not retry.

## Adding things

- New game under `app/src/assets/<game>`: assets only, no Angular rebuild.
  The tile, route and wrapper are Angular changes and do trigger one rebuild.
- If the Angular build starts depending on a new file outside `app/` (or on a
  file excluded from the key above), add it to the `angular` key in the
  "Compute cache keys" step, or bump the key's `v1` prefix to invalidate caches.
