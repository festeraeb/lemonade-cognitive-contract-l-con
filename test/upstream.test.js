import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { upstreamFromEnv, DEFAULT_UPSTREAM, defaultState } from "../lib/compile.js";
import { lemonadeHealth } from "../lib/distill.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("default upstream is Lemonade's own port", () => {
  assert.equal(DEFAULT_UPSTREAM, "http://127.0.0.1:13305/api/v1");
  assert.equal(upstreamFromEnv({}), DEFAULT_UPSTREAM);
  assert.equal(upstreamFromEnv({ LCON_UPSTREAM: "  " }), DEFAULT_UPSTREAM);
});

test("LCON_UPSTREAM accepts a bare address or a full base", () => {
  assert.equal(upstreamFromEnv({ LCON_UPSTREAM: "127.0.0.1:8000" }), "http://127.0.0.1:8000/api/v1");
  assert.equal(upstreamFromEnv({ LCON_UPSTREAM: "http://h:13305/" }), "http://h:13305/api/v1");
  assert.equal(upstreamFromEnv({ LCON_UPSTREAM: "http://h:8000/v1" }), "http://h:8000/v1");
  assert.equal(upstreamFromEnv({ LCON_UPSTREAM: "https://h/api/v1/" }), "https://h/api/v1");
});

test("defaultState uses no machine-specific address", () => {
  assert.ok(!JSON.stringify(defaultState()).includes("192.168"));
});

test("unreachable upstream: health message names the URL it tried", async () => {
  const h = await lemonadeHealth("http://127.0.0.1:1/api/v1");
  assert.equal(h.ok, false);
  assert.equal(h.url, "http://127.0.0.1:1/api/v1/models");
  assert.match(h.message, /http:\/\/127\.0\.0\.1:1\/api\/v1\/models/);
  assert.match(h.message, /LCON_UPSTREAM/);
});

async function run(env, dataDir) {
  const child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, LCON_PORT: "0", LCON_DATA_DIR: dataDir, ...env } });
  const lcon = await new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (d) => { out += d; const m = out.match(/L-con panel\s+(http:\/\/127\.0\.0\.1:\d+)/); if (m) resolve(m[1]); });
    child.on("exit", (c) => reject(new Error(`server exited ${c}`)));
    setTimeout(() => reject(new Error("server start timeout")), 8000);
  });
  return { child, lcon };
}

test("server with only LCON_UPSTREAM set talks to that upstream; state.json overrides it", async () => {
  const seen = [];
  const up = http.createServer((req, res) => { seen.push(req.url); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"data":[{"id":"env-model"}]}'); });
  await new Promise((r) => up.listen(0, "127.0.0.1", r));
  const addr = `127.0.0.1:${up.address().port}`;
  const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), "lcon-up1-"));
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "lcon-up2-"));
  let a, b;
  try {
    a = await run({ LCON_UPSTREAM: addr }, dir1);
    const h = await (await fetch(`${a.lcon}/api/health`)).json();
    assert.equal(h.lemonade.ok, true);
    assert.deepEqual(h.lemonade.models, ["env-model"]);
    assert.equal(seen[0], "/api/v1/models");
    // a saved state.json wins over the env var
    fs.writeFileSync(path.join(dir2, "state.json"), JSON.stringify({ lemonade: { base: "http://127.0.0.1:1/api/v1", model: "x" } }));
    b = await run({ LCON_UPSTREAM: addr }, dir2);
    const h2 = await (await fetch(`${b.lcon}/api/health`)).json();
    assert.equal(h2.lemonade.ok, false);
    assert.match(h2.lemonade.message, /127\.0\.0\.1:1\/api\/v1\/models/);
  } finally { a?.child.kill(); b?.child.kill(); up.close(); fs.rmSync(dir1, { recursive: true, force: true }); fs.rmSync(dir2, { recursive: true, force: true }); }
});

test("streaming: the first chunk reaches the client before the upstream has finished", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const up = http.createServer((req, res) => {
    if (req.url.endsWith("/models")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"data":[]}'); }
    req.resume();
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write('data: {"n":1}\n\n');
    gate.then(() => { res.write('data: {"n":2}\n\ndata: [DONE]\n\n'); res.end(); });
  });
  await new Promise((r) => up.listen(0, "127.0.0.1", r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lcon-st-"));
  let a;
  try {
    a = await run({ LCON_UPSTREAM: `127.0.0.1:${up.address().port}` }, dir);
    const r = await fetch(`${a.lcon}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "m", stream: true, messages: [{ role: "user", content: "hi" }] }) });
    const reader = r.body.getReader();
    const first = await Promise.race([reader.read(), new Promise((_, rej) => setTimeout(() => rej(new Error("first chunk not streamed")), 3000))]);
    assert.match(new TextDecoder().decode(first.value), /"n":1/);
    release();
    let rest = "";
    for (;;) { const { done, value } = await reader.read(); if (done) break; rest += new TextDecoder().decode(value); }
    assert.match(rest, /\[DONE\]/);
  } finally { release(); a?.child.kill(); up.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
