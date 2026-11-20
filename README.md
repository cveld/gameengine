# gameengine
Engine for building API enabled game engines

# How to build locally
* Set up an Azure SignalR Service instance
* Copy connectionstring to local.settings.json

# How to host in an Azure Static Web Site Resource
* Add connectionstring to settings
# Site
The site in `app/` is a Vite + TypeScript + Lit multi-page app; see
[app/README.md](app/README.md). The API (SignalR negotiate/messages and
highscores) is in `api/`. Deployment: [docs/deployment.md](docs/deployment.md).
