import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createCursorClient } from "./src/cursor-client.mjs";

const PUBLIC_DIR = join(fileURLToPath(new URL(".", import.meta.url)), "public");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const hits = new Map();

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 120) return true;
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function send(res, status, body, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers,
  });
  res.end(payload);
}

function publicError(error) {
  if (error.status === 401 || error.code === "unauthenticated") {
    return { status: 401, error: "這把 API key 無法登入。請到 Cursor 後台建立 User API Key（key_ 或 crsr_ 開頭）。" };
  }
  const message = String(error.message || "連不到 Cursor")
    .replace(/Bearer\s+\S+/gi, "Bearer [已隱藏]")
    .slice(0, 300);
  return { status: error.status && error.status < 500 ? error.status : 502, error: message };
}

function apiKey(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : "";
}

function safeFile(pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = normalize(join(PUBLIC_DIR, requested));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + sep)) return "";
  return file;
}

export function createApp({ cursorApiBase, fetchImpl } = {}) {
  const cursor = createCursorClient({ base: cursorApiBase, fetchImpl });

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const ip = req.socket.remoteAddress || "local";
      if (url.pathname.startsWith("/api/") && limited(ip)) {
        send(res, 429, { error: "請求太頻繁，請稍後再試。" });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/health") {
        send(res, 200, { ok: true });
        return;
      }

      const key = apiKey(req);
      if (req.method === "GET" && url.pathname === "/api/me") {
        send(res, 200, { account: await cursor.account(key) });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/automations") {
        const [account, automations] = await Promise.all([
          cursor.account(key).catch(() => ({ name: "", email: "" })),
          cursor.list(key),
        ]);
        send(res, 200, { account, automations });
        return;
      }

      const detail = url.pathname.match(/^\/api\/automations\/([0-9a-fA-F-]{36})$/);
      if (req.method === "GET" && detail) {
        send(res, 200, { automation: await cursor.get(key, detail[1]) });
        return;
      }
      const runs = url.pathname.match(/^\/api\/automations\/([0-9a-fA-F-]{36})\/runs$/);
      if (req.method === "GET" && runs) {
        send(res, 200, await cursor.runs(key, runs[1]));
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        send(res, 404, { error: "找不到這個路徑" });
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, { error: "不支援這個方法" });
        return;
      }

      const file = safeFile(decodeURIComponent(url.pathname));
      if (!file) {
        send(res, 400, { error: "路徑不正確" });
        return;
      }
      try {
        const info = await stat(file);
        if (!info.isFile()) {
          send(res, 404, { error: "找不到頁面" });
          return;
        }
      } catch {
        send(res, 404, { error: "找不到頁面" });
        return;
      }
      const type = TYPES[extname(file)] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": file.endsWith("index.html") ? "no-cache" : "public, max-age=300",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(file).on("error", () => {
        if (!res.headersSent) send(res, 404, { error: "找不到頁面" });
        else res.destroy();
      }).pipe(res);
    } catch (error) {
      const body = publicError(error);
      if (!res.headersSent) send(res, body.status, { error: body.error });
    }
  });
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  const server = createApp({ cursorApiBase: process.env.CURSOR_API_BASE });
  server.listen(port, host, () => {
    console.log(`Automations viewer listening on http://${host}:${port}`);
  });
}
