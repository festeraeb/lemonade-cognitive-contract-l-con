import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { distill, lemonadeHealth } from "../lib/distill.js";

function stub(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      let b = "";
      req.on("data", (c) => (b += c));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, body: b ? JSON.parse(b) : null });
        handler(req, res, seen);
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, seen, base: `http://127.0.0.1:${srv.address().port}/api/v1` }));
  });
}
const reply = (content) => (req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ choices: [{ message: { content } }] }));
};

test("distill: parses JSON from upstream, source=lemonade, hits POST /chat/completions", async () => {
  const s = await stub(reply('noise {"today":"fix bug","keep":["ADHD: one track"],"drop":["menus"]} tail'));
  try {
    const r = await distill({ dump: "adhd rough day", intent: "x", lemonade: { base: s.base, model: "m1" } });
    assert.equal(r.source, "lemonade");
    assert.equal(r.today, "fix bug");
    assert.deepEqual(r.keep, ["ADHD: one track"]);
    assert.deepEqual(r.drop, ["menus"]);
    assert.equal(s.seen[0].method, "POST");
    assert.equal(s.seen[0].url, "/api/v1/chat/completions");
    assert.equal(s.seen[0].body.model, "m1");
    assert.match(s.seen[0].body.messages[1].content, /adhd rough day/);
  } finally { s.srv.close(); }
});

test("distill: different dump reaches upstream user message (input affects request)", async () => {
  const s = await stub(reply('{"today":"t","keep":[],"drop":[]}'));
  try {
    await distill({ dump: "AAA", intent: "", lemonade: { base: s.base } });
    await distill({ dump: "BBB", intent: "", lemonade: { base: s.base } });
    assert.match(s.seen[0].body.messages[1].content, /AAA/);
    assert.match(s.seen[1].body.messages[1].content, /BBB/);
  } finally { s.srv.close(); }
});

test("distill: unparseable reply -> parse-fallback with keyword bullets and raw kept", async () => {
  const s = await stub(reply("not json"));
  try {
    const r = await distill({ dump: "I have ADHD and dry wit", intent: "go", lemonade: { base: s.base } });
    assert.equal(r.source, "parse-fallback");
    assert.equal(r.raw, "not json");
    assert.ok(r.keep.some((k) => /ADHD/.test(k)));
    assert.ok(r.keep.some((k) => /dry wit/i.test(k)));
  } finally { s.srv.close(); }
});

test("distill: HTTP error -> error-fallback with the error message surfaced", async () => {
  const s = await stub((req, res) => { res.writeHead(500); res.end("boom"); });
  try {
    const r = await distill({ dump: "hello", intent: "", lemonade: { base: s.base } });
    assert.equal(r.source, "error-fallback");
    assert.match(r.error, /HTTP 500 boom/);
  } finally { s.srv.close(); }
});

test("distill: unreachable upstream -> error-fallback", async () => {
  const r = await distill({ dump: "hello", intent: "", lemonade: { base: "http://127.0.0.1:1/v1" } });
  assert.equal(r.source, "error-fallback");
  assert.ok(r.error);
});

test("distill: keep bullets and drop are clipped to limits", async () => {
  const keep = Array.from({ length: 9 }, () => "w".repeat(400));
  const s = await stub(reply(JSON.stringify({ today: "t", keep, drop: [] })));
  try {
    const r = await distill({ dump: "d", intent: "", lemonade: { base: s.base } });
    assert.equal(r.keep.length, 6);
    assert.ok(r.keep.every((k) => k.length <= 140));
    assert.deepEqual(r.drop, ["therapy", "life story"]);
  } finally { s.srv.close(); }
});

test("lemonadeHealth: lists model ids from GET /models; reports failure otherwise", async () => {
  const s = await stub((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] })); });
  try {
    const h = await lemonadeHealth(s.base);
    assert.deepEqual(h, { ok: true, url: `${s.base}/models`, models: ["a", "b"] });
    assert.equal(s.seen[0].url, "/api/v1/models");
  } finally { s.srv.close(); }
  const bad = await lemonadeHealth("http://127.0.0.1:1/v1");
  assert.equal(bad.ok, false);
  assert.ok(bad.error);
});
