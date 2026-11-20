// Applies the URL rewrites of public/staticwebapp.config.json, like Azure Static
// Web Apps (and the Vite dev server) do, for the local test servers.
const fs = require("node:fs");
const path = require("node:path");
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../../public/staticwebapp.config.json"), "utf8"));
const routes = config.routes.filter(route => route.rewrite);

module.exports = function rewrite(pathname) {
  const hit = routes.find(({ route }) => route.endsWith("/*")
    ? pathname === route.slice(0, -2) || pathname.startsWith(route.slice(0, -1))
    : pathname === route || pathname === route + "/");
  return hit ? hit.rewrite : pathname;
};
