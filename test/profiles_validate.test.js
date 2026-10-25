import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateProfiles, EXAMPLE_PROFILES } from "../lib/model_side.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOOD = [{ id: "p1", match: ["qwen3-4b*"], steers: [{ id: "s1", text: "Lead with the evidence." }] }];

test("validateProfiles accepts good profiles, the examples and an empty list", () => {
  assert.equal(validateProfiles(GOOD), null);
  assert.equal(validateProfiles(EXAMPLE_PROFILES), null);
  assert.equal(validateProfiles([]), null);
});

test("validateProfiles returns a message string for malformed profiles", () => {
  const bad = [
    "nope",
    {},
    [null],
    [{ match: ["a*"], steers: [] }],
    [{ id: "", match: ["a*"], steers: [] }],
    [{ id: "p", match: "a*", steers: [] }],
    [{ id: "p", match: [], steers: [] }],
    [{ id: "p", match: [""], steers: [] }],
    [{ id: "p", match: ["a*"] }],
    [{ id: "p", match: ["a*"], steers: [{ id: "s" }] }],
    [{ id: "p", match: ["a*"], steers: [{ text: "t" }] }],
    [{ id: "p", match: ["a*"], steers: [{ id: "s", text: "" }] }],
    [{ id: "p", match: ["a*"], steers: [{ id: "s", text: "t" }, { id: "s", text: "u" }] }],
  ];
  for (const p of bad) {
    const msg = validateProfiles(p);
    assert.equal(typeof msg, "string", `expected a message for ${JSON.stringify(p)}`);
    assert.ok(msg.length > 0);
  }
});

let child, lcon, dataDir;
before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lcon-prof-"));
  fs.writeFileSync(path.join(dataDir, "state.json"), JSON.stringify({
    name: "tester", intent: "unit test", knobs: { grounding: 50, scaffolding: 50, wit: 50, jokes: 50 }, keep: [], drop: [],
    lemonade: { base: "http://127.0.0.1:9/api/v1", model: "default-model" },
  }));
  child = spawn(process.execPath, ["server.js"], { cwd: ROOT, env: { ...process.env, LCON_PORT: "0", LCON_DATA_DIR: dataDir } });
  lcon = await new Promise((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (d) => { out += d; const m = out.match(/L-con panel\s+(http:\/\/127\.0\.0\.1:\d+)/); if (m) resolve(m[1]); });
    child.on("exit", (c) => reject(new Error(`server exited ${c}`)));
    setTimeout(() => reject(new Error("server start timeout")), 8000);
  });
});
after(() => { child?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const put = (body) => fetch(`${lcon}/api/state`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("PUT /api/state rejects malformed modelProfiles with 400 bad_profiles and keeps the old ones", async () => {
  assert.equal((await put({ modelProfiles: GOOD })).status, 200);
  const r = await put({ modelProfiles: [{ id: "p", match: "not-a-list", steers: [] }] });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.code, "bad_profiles");
  assert.equal(typeof j.error, "string");
  const state = await (await fetch(`${lcon}/api/state`)).json();
  assert.deepEqual(state.modelProfiles, GOOD);
});

test("PUT /api/state without modelProfiles is not affected", async () => {
  const r = await put({ intent: "still fine" });
  assert.equal(r.status, 200);
});
