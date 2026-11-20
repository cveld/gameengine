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

Since November 20, 2026 the site is a Vite + TypeScript + Lit app (Angular was
removed), so the site build itself takes a few seconds and is no longer cached.
The build happens in the workflow; the Static Web Apps action only uploads
prebuilt output (`skip_app_build`, `skip_api_build`).

| Part | Rebuilt when | Otherwise |
|---|---|---|
| `app/node_modules` (Node 22 from `app/.nvmrc`) | `app/package-lock.json` changes | restored from the cache |
| Site (`npm run build`: `vite build` to `app/dist`, then `scripts/stamp-build.cjs`) | every run, a few seconds | — |
| Managed API for SignalR (`api-build/`: `dist`, production `node_modules`, `host.json`, `package*.json`) | anything under `api/` changes | restored from the cache |
| Highscores Function App | `api/` differs between the push's `before` and `after` commits, or the previous commit is unknown (new branch, force push) | job skipped |
| Type check and unit tests (`checks` job) | every run, in parallel with the deployment | — |
| Whole workflow | — | pushes that only touch `docs/**`, `*.md` or `LICENSE` do not run |

The `checks` job does not block the deployment: a red check shows up on the
commit or pull request, but the site is already deployed. Browser tests
(`npm run test:browser`) are run locally, not in CI.

Cache keys are content hashes computed before anything is installed. Caches
created on `main` are also used by pull requests; caches created in a pull
request are not visible to `main`.

The run summary (Actions run page) states whether the dependencies and the API
were reused.

## Forcing a full deployment

Run the workflow manually (Actions -> Azure Static Web Apps CI/CD -> Run
workflow) with **full** checked. That ignores the build caches and also deploys
the Highscores Function App. Use it when a deployment looks stale, for example
after a failed Function App deployment, which a later push without `api/`
changes would not retry.

## Adding things

- New static game: `app/public/assets/<game>/` plus a catalog entry and a
  rewrite (see `app/README.md`). Every build includes it.
- New dependency: change `app/package.json` and `app/package-lock.json`; the
  next run installs and caches it. Bump the `v1` in the `modules` key to force a
  fresh install.
