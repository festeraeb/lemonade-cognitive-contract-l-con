import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, defaultState, PRESETS } from "./lib/compile.js";
import { LIMITS, rejectIfOver } from "./lib/limits.js";
import { distill, lemonadeHealth } from "./lib/distill.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const PORT = Number(process.env.LCON_PORT || 7740);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function loadState() {
  try {
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function send(res, status, body, headers = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    ...headers,
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > 2_000_000) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error("invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, "http://l-con").pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) {
    send(res, 403, { error: "no" });
    return true;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
  return true;
}

function mergeState(body) {
  const cur = loadState();
  const next = { ...cur, ...body };
  if (body?.knobs) next.knobs = { ...cur.knobs, ...body.knobs };
  if (body?.lemonade) next.lemonade = { ...cur.lemonade, ...body.lemonade };
  if ("dump" in (body || {})) rejectIfOver("Dump", next.dump, LIMITS.dumpChars);
  if ("intent" in (body || {})) rejectIfOver("Today", next.intent, LIMITS.intentChars);
  if ("name" in (body || {})) rejectIfOver("Name", next.name, LIMITS.nameChars);
  return next;
}

function compiledFrom(state) {
  return compile({
    name: state.name,
    intent: state.intent,
    knobs: state.knobs,
    keep: state.keep,
    drop: state.drop,
  });
}

async function proxyChat(req, res, state) {
  const body = await readBody(req);
  const compiled = compiledFrom(state);
  const messages = Array.isArray(body.messages) ? body.messages.slice() : [];
  const injected = [{ role: "system", content: compiled.prompt }, ...messages];
  const base = String(state.lemonade.base || "").replace(/\/$/, "");
  const payload = {
    ...body,
    model: body.model || state.lemonade.model,
    messages: injected,
  };
  const upstream = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await upstream.text();
  res.writeHead(upstream.status, {
    "Content-Type": upstream.headers.get("content-type") || "application/json",
    "Access-Control-Allow-Origin": "*",
    "X-L-Con-Chars": String(compiled.chars),
  });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }
    const url = new URL(req.url, "http://l-con");

    if (req.method === "GET" && url.pathname === "/api/presets") {
      send(res, 200, { presets: PRESETS, limits: LIMITS });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      const state = loadState();
      state.compiled = compiledFrom(state);
      send(res, 200, { ...state, limits: LIMITS, presets: PRESETS });
      return;
    }
    if (req.method === "PUT" && url.pathname === "/api/state") {
      const next = mergeState(await readBody(req));
      next.compiled = compiledFrom(next);
      saveState(next);
      send(res, 200, { ...next, limits: LIMITS });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/compile") {
      const next = mergeState(await readBody(req));
      next.compiled = compiledFrom(next);
      saveState(next);
      send(res, 200, next);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/distill") {
      const next = mergeState(await readBody(req));
      rejectIfOver("Dump", next.dump, LIMITS.dumpChars);
      const cleaned = await distill({
        dump: next.dump,
        intent: next.intent,
        lemonade: next.lemonade,
      });
      next.intent = cleaned.today || next.intent;
      next.keep = cleaned.keep;
      next.drop = cleaned.drop;
      next.distill = { source: cleaned.source, model: cleaned.model, error: cleaned.error };
      next.compiled = compiledFrom(next);
      saveState(next);
      send(res, 200, next);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      const state = loadState();
      const lemon = await lemonadeHealth(state.lemonade.base);
      send(res, 200, { lcon: true, port: PORT, lemonade: lemon });
      return;
    }
    if (req.method === "POST" && (url.pathname === "/v1/chat/completions" || url.pathname === "/api/v1/chat/completions")) {
      await proxyChat(req, res, loadState());
      return;
    }
    if (req.method === "GET" && (url.pathname === "/v1/models" || url.pathname === "/api/v1/models")) {
      const state = loadState();
      const base = String(state.lemonade.base || "").replace(/\/$/, "");
      const upstream = await fetch(`${base}/models`);
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(text);
      return;
    }

    if (req.method === "GET" && serveStatic(req, res)) return;
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, err.status || 500, { error: err.message, code: err.code || "error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`L-con panel  http://127.0.0.1:${PORT}`);
  console.log(`OpenAI hook  http://127.0.0.1:${PORT}/v1  (prepends the compiled contract)`);
});
