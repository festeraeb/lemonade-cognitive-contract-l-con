import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compile } from "../lib/compile.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let upstream, seen = [], child, lcon, dataDir;
const KNOBS = { grounding: 86, scaffolding: 42, wit: 72, jokes: 70 };
const STATE = { name: "tester", intent: "unit test", knobs: KNOBS, keep: [], drop: [] };

before(async () => {
  upstream = http.createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: b ? JSON.parse(b) : null });
      if (req.url.endsWith("/models")) { res.writeHead(200, { "Content-Type": "application/json" }); return res.end('{"data":[{"id":"stub-model"}]}'); }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "stub reply" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${upstream.address().port}/api/v1`;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lcon-test-"));
  fs.writeFileSync(path.join(dataDir, "state.json"), JSON.stringify({ ...STATE, lemonade: { base, model: "default-model" } }));
  child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, LCON_PORT: "0", LCON_DATA_DIR: dataDir, LCON_MAX_PROXY_CHARS: "3000" } });
  lcon = await new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (d) => { out += d; const m = out.match(/L-con panel\s+(http:\/\/127\.0\.0\.1:\d+)/); if (m) resolve(m[1]); });
    child.on("exit", (c) => reject(new Error(`server exited ${c}`)));
    setTimeout(() => reject(new Error("server start timeout")), 8000);
  });
});
after(() => { child?.kill(); upstream?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const post = (body, headers = {}) =>
  fetch(`${lcon}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const expected = compile(STATE).prompt;

test("proxy: no client system message -> contract inserted as first system turn, user message kept", async () => {
  seen = [];
  const r = await post({ messages: [{ role: "user", content: "hi" }], max_tokens: 5 });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).choices[0].message.content, "stub reply");
  const b = seen[0].body;
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].url, "/api/v1/chat/completions");
  assert.deepEqual(b.messages, [{ role: "system", content: expected }, { role: "user", content: "hi" }]);
  assert.equal(b.max_tokens, 5);
  assert.equal(r.headers.get("x-l-con-chars"), String(expected.length));
});

test("proxy: existing system message -> contract merged in front, no second system turn", async () => {
  seen = [];
  await post({ messages: [{ role: "system", content: "CLIENT SYS" }, { role: "user", content: "q" }] });
  const m = seen[0].body.messages;
  assert.equal(m.length, 2);
  assert.equal(m[0].content, `${expected}\n\nCLIENT SYS`);
  assert.equal(m[1].content, "q");
});

test("proxy: model defaults to state model, client model wins, extra fields pass through", async () => {
  seen = [];
  await post({ messages: [{ role: "user", content: "a" }], temperature: 0.2 });
  await post({ model: "client-model", messages: [{ role: "user", content: "a" }] });
  assert.equal(seen[0].body.model, "default-model");
  assert.equal(seen[0].body.temperature, 0.2);
  assert.equal(seen[1].body.model, "client-model");
});

test("proxy: over-cap payload rejected with 400 too_much and never reaches upstream", async () => {
  seen = [];
  const r = await post({ messages: [{ role: "user", content: "x".repeat(3000) }] });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.code, "too_much");
  assert.equal(j.limit, 3000);
  assert.equal(seen.length, 0);
});

test("proxy: client Authorization header is not forwarded upstream", async () => {
  seen = [];
  await post({ messages: [{ role: "user", content: "a" }] }, { Authorization: "Bearer secret" });
  assert.equal(seen[0].headers.authorization, undefined);
});

test("proxy: alias /api/v1/chat/completions and GET /v1/models passthrough", async () => {
  seen = [];
  const r = await fetch(`${lcon}/api/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "a" }] }) });
  assert.equal(r.status, 200);
  const m = await fetch(`${lcon}/v1/models`);
  assert.deepEqual(await m.json(), { data: [{ id: "stub-model" }] });
  assert.equal(seen[1].url, "/api/v1/models");
});

test("proxy: invalid JSON body -> 400", async () => {
  const r = await fetch(`${lcon}/v1/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{nope" });
  assert.equal(r.status, 400);
});

test("api: PUT /api/state rejects over-cap intent with 413 and state changes alter the proxied contract", async () => {
  const bad = await fetch(`${lcon}/api/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: "z".repeat(161) }) });
  assert.equal(bad.status, 413);
  await fetch(`${lcon}/api/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ knobs: { grounding: 5 } }) });
  seen = [];
  await post({ messages: [{ role: "user", content: "a" }] });
  assert.match(seen[0].body.messages[0].content, /Prefer practical heuristics/);
});

test("api: POST /api/compile and /api/distill reject an over-cap dump with 413 too_much", async () => {
  const big = JSON.stringify({ dump: "x".repeat(20000) });
  for (const route of ["compile", "distill"]) {
    const r = await fetch(`${lcon}/api/${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: big });
    assert.equal(r.status, 413, route);
    assert.equal((await r.json()).code, "too_much", route);
  }
});

test("proxy: unreachable upstream -> 500 JSON error with cause (fails loudly, no fake reply)", async () => {
  await fetch(`${lcon}/api/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lemonade: { base: "http://127.0.0.1:1/v1" } }) });
  const r = await post({ messages: [{ role: "user", content: "a" }] });
  assert.equal(r.status, 500);
  const j = await r.json();
  assert.ok(j.error);
  assert.equal(j.choices, undefined);
});

test("proxy: model profiles add a per-model steer, report it, and the scoreboard steers by outcome", async () => {
  const profiles = [
    { id: "qwen3-4b", match: ["qwen3-4b*"], steers: [{ id: "objection-first", text: "Before agreeing, give the strongest objection." }, { id: "evidence-first", text: "Lead with the evidence." }] },
  ];
  const put = await fetch(`${lcon}/api/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modelProfiles: profiles, lemonade: { base: `http://127.0.0.1:${upstream.address().port}/api/v1` } }) });
  assert.equal(put.status, 200);

  seen = [];
  const r = await post({ model: "Qwen3-4B-Instruct-2507-GGUF", messages: [{ role: "user", content: "plan?" }] });
  assert.equal(r.status, 200);
  const steerId = r.headers.get("x-l-con-steer");
  assert.ok(["objection-first", "evidence-first"].includes(steerId));
  assert.match(seen[0].body.messages[0].content, /\nModel notes: .+\nIf this contract conflicts/);

  // A model with no matching profile gets no steer and no header.
  seen = [];
  const other = await post({ model: "some-other-model", messages: [{ role: "user", content: "x" }] });
  assert.equal(other.headers.get("x-l-con-steer"), null);
  assert.doesNotMatch(seen[0].body.messages[0].content, /Model notes/);

  // Scoreboard: objection-first keeps helping, evidence-first keeps hurting -> objection-first is chosen.
  const rec = (steer, outcome) =>
    fetch(`${lcon}/api/scoreboard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "Qwen3-4B-Instruct-2507-GGUF", steerId: steer, outcome }) });
  for (let i = 0; i < 6; i++) {
    assert.equal((await rec("objection-first", "helped")).status, 200);
    assert.equal((await rec("evidence-first", "hurt")).status, 200);
  }
  assert.equal((await rec("evidence-first", "maybe")).status, 400);
  const again = await post({ model: "Qwen3-4B-Instruct-2507-GGUF", messages: [{ role: "user", content: "plan?" }] });
  assert.equal(again.headers.get("x-l-con-steer"), "objection-first");
  const board = await (await fetch(`${lcon}/api/scoreboard`)).json();
  assert.equal(board.models["Qwen3-4B-Instruct-2507-GGUF"]["objection-first"].helped, 6);
});
