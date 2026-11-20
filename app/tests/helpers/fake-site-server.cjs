// Serves the built site (dist/) with the Static Web Apps rewrites and a minimal
// stand-in for the API: /api/negotiate plus /api/messages, which broadcasts each
// message to every connected SignalR client over a local WebSocket hub.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const WebSocketServer = require("ws").Server;
const rewrite = require("./swa-routes.cjs");

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml"
};

module.exports = async function startSite(root, onMessage = () => {}) {
  const hub = new WebSocketServer({ noServer: true });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://" + req.headers.host);
    const json = value => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)); };
    if (url.pathname === "/api/negotiate") { json({ url: url.origin + "/hub", accessToken: "local-test-token" }); return; }
    if (url.pathname === "/hub/negotiate") {
      json({ negotiateVersion: 1, connectionId: "test", connectionToken: Math.random().toString(36),
        availableTransports: [{ transport: "WebSockets", transferFormats: ["Text"] }] });
      return;
    }
    if (url.pathname === "/api/messages") {
      let body = "";
      req.on("data", value => (body += value));
      req.on("end", () => {
        const message = JSON.parse(body);
        onMessage(message);
        for (const client of hub.clients) client.send(JSON.stringify({ type: 1, target: message.type, arguments: [message] }) + "\x1e");
        json({});
      });
      return;
    }
    let file = path.resolve(root, "." + rewrite(decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) file = path.join(root, "index.html");
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  server.on("upgrade", (req, socket, head) => hub.handleUpgrade(req, socket, head, ws => hub.emit("connection", ws)));
  hub.on("connection", ws => ws.on("message", bytes => {
    for (const chunk of bytes.toString().split("\x1e").filter(Boolean)) {
      if (JSON.parse(chunk).protocol) ws.send("{}\x1e");
    }
  }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(resolve => { for (const c of hub.clients) c.terminate(); server.close(resolve); })
  };
};
