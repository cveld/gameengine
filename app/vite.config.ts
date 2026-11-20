import { defineConfig, type Plugin } from "vite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const pagesDir = resolve(__dirname, "pages");
const publicDir = resolve(__dirname, "public");

// Every pages/**/index.html is its own entry (multi-page app, no client router).
function findPages(dir: string, found: Record<string, string> = {}): Record<string, string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) findPages(path, found);
    else if (name === "index.html") {
      const key = path.slice(pagesDir.length + 1).replace(/[\\/]?index\.html$/, "").replace(/[\\/]/g, "-") || "home";
      found[key] = path;
    }
  }
  return found;
}

// The dev server applies the same rewrites as Azure Static Web Apps
// (public/staticwebapp.config.json), so /maze or /engine/tabs/0 work locally too.
function staticWebAppRoutes(): Plugin {
  const config = JSON.parse(readFileSync(join(publicDir, "staticwebapp.config.json"), "utf8"));
  const routes: { route: string; rewrite: string }[] = config.routes.filter((r: { rewrite?: string }) => r.rewrite);
  const matches = (pattern: string, path: string) =>
    pattern.endsWith("/*") ? path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1)) : path === pattern || path === pattern + "/";
  return {
    name: "static-web-app-routes",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url || "/").split("?");
        const hit = routes.find(r => matches(r.route, path));
        if (hit) req.url = hit.rewrite + (query ? "?" + query : "");
        next();
      });
    }
  };
}

export default defineConfig({
  root: pagesDir,
  publicDir,
  appType: "mpa",
  plugins: [staticWebAppRoutes()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    // "assets/" holds the static games; bundled code goes elsewhere.
    assetsDir: "_app",
    target: "es2022",
    rollupOptions: { input: findPages(pagesDir) }
  },
  server: {
    proxy: { "/api": { target: "http://localhost:7071", changeOrigin: true } }
  }
});
