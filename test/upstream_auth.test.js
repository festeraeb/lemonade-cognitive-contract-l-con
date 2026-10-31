import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = "test-upstream-key-7f3a";
let upstream, seen = [], child, lcon, dataDir, logs = "";

before(async () => {
  upstream = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers });
      res.writeHead(200, { "Content-Type": "application/json" });
      if (req.url.endsWith("/models")) return res.end('{"data":[{"id":"stub-model"}]}');
      res.end(JSON.stringify({ choices: [{ message: { content: '{"today":"t","keep":[],"drop":[]}' } }] }));
    });
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${upstream.address().port}/api/v1`;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lcon-auth-"));
  fs.writeFileSync(path.join(dataDir, "state.json"), JSON.stringify({ name: "t", intent: "auth test", knobs: {}, keep: [], drop: [], lemonade: { base, model: "m" } }));
  child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, LCON_PORT: "0", LCON_DATA_DIR: dataDir, LEMONADE_API_KEY: KEY } });
  child.stderr.on("data", (d) => (logs += d));
  lcon = await new Promise((resolve, reject) => {
    child.stdout.on("data", (d) => { logs += d; const m = logs.match(/L-con panel\s+(http:\/\/127\.0\.0\.1:\d+)/); if (m) resolve(m[1]); });
    child.on("exit", (c) => reject(new Error(`server exited ${c}`)));
    setTimeout(() => reject(new Error("server start timeout")), 8000);
  });
});
after(() => { child?.kill(); upstream?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const json = { "Content-Type": "application/json" };

test("auth: chat proxy sends the LEMONADE_API_KEY bearer upstream", async () => {
  seen = [];
  const r = await fetch(`${lcon}/v1/chat/completions`, { method: "POST", headers: json, body: JSON.stringify({ messages: [{ role: "user", content: "a" }] }) });
  assert.equal(r.status, 200);
  assert.equal(seen[0].headers.authorization, `Bearer ${KEY}`);
});

test("auth: a client's own Authorization header never replaces the configured key", async () => {
  seen = [];
  await fetch(`${lcon}/v1/chat/completions`, { method: "POST", headers: { ...json, Authorization: "Bearer client-secret" }, body: JSON.stringify({ messages: [{ role: "user", content: "a" }] }) });
  assert.equal(seen[0].headers.authorization, `Bearer ${KEY}`);
});

test("auth: /v1/models passthrough and /api/health send the bearer", async () => {
  seen = [];
  await fetch(`${lcon}/v1/models`);
  const h = await (await fetch(`${lcon}/api/health`)).json();
  assert.equal(h.lemonade.ok, true);
  assert.equal(seen.length, 2);
  for (const s of seen) assert.equal(s.headers.authorization, `Bearer ${KEY}`, s.url);
});

test("auth: distill sends the bearer upstream", async () => {
  seen = [];
  const r = await fetch(`${lcon}/api/distill`, { method: "POST", headers: json, body: JSON.stringify({ dump: "short dump" }) });
  assert.equal(r.status, 200);
  assert.equal(seen[0].url, "/api/v1/chat/completions");
  assert.equal(seen[0].headers.authorization, `Bearer ${KEY}`);
});

test("auth: the key never appears in API responses, state.json or logs", async () => {
  const bodies = [
    await (await fetch(`${lcon}/api/state`)).text(),
    await (await fetch(`${lcon}/api/state`, { method: "PUT", headers: json, body: JSON.stringify({ intent: "x" }) })).text(),
    await (await fetch(`${lcon}/api/health`)).text(),
    fs.readFileSync(path.join(dataDir, "state.json"), "utf8"),
    logs,
  ];
  for (const b of bodies) assert.ok(!b.includes(KEY), "key leaked");
});
