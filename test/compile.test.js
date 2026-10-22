import test from "node:test";
import assert from "node:assert/strict";
import { compile, PRESETS } from "../lib/compile.js";
import { LIMITS, band, clip, rejectIfOver } from "../lib/limits.js";

const knobs = { grounding: 50, scaffolding: 50, wit: 50, jokes: 50 };

test("band thresholds: <34 ->0, 34..66 ->1, >66 ->2, NaN ->1", () => {
  assert.deepEqual([0, 33, 33.9].map(band), [0, 0, 0]);
  assert.deepEqual([34, 50, 66].map(band), [1, 1, 1]);
  assert.deepEqual([67, 100].map(band), [2, 2]);
  assert.equal(band("abc"), 1);
});

test("clip collapses whitespace and truncates", () => {
  assert.equal(clip("  a \n\t b  ", 10), "a b");
  assert.equal(clip("abcdefghij", 4), "abcd");
  assert.equal(clip(null, 5), "");
});

test("rejectIfOver throws 413 too_much over the cap and trims otherwise", () => {
  assert.throws(() => rejectIfOver("Dump", "x".repeat(11), 10), (e) => e.status === 413 && e.code === "too_much");
  assert.equal(rejectIfOver("Dump", " ok ", 10), "ok");
});

test("compile: changed knob band changes the contract (policy line selected by band)", () => {
  const lo = compile({ name: "t", intent: "i", knobs: { ...knobs, grounding: 10 } });
  const hi = compile({ name: "t", intent: "i", knobs: { ...knobs, grounding: 90 } });
  assert.notEqual(lo.prompt, hi.prompt);
  assert.match(lo.prompt, /Prefer practical heuristics/);
  assert.match(hi.prompt, /scientific reasoning/);
});

test("compile: same band, different value -> identical prompt (deterministic)", () => {
  const a = compile({ name: "t", intent: "i", knobs: { ...knobs, wit: 40 } });
  const b = compile({ name: "t", intent: "i", knobs: { ...knobs, wit: 60 } });
  assert.equal(a.prompt, b.prompt);
});

test("compile: name, intent, keep and drop appear in output; chars matches length", () => {
  const c = compile({ name: "Ada", intent: "ship fix", knobs, keep: ["one track"], drop: ["menus"] });
  assert.match(c.prompt, /Operator: Ada\./);
  assert.match(c.prompt, /Today: ship fix/);
  assert.match(c.prompt, /Keep \(cleaned\):\n- one track/);
  assert.match(c.prompt, /Do not:\n- menus/);
  assert.equal(c.chars, c.prompt.length);
  assert.equal(c.estTokens, Math.ceil(c.chars / 4));
});

test("compile: keep capped at keepBullets and each bullet clipped", () => {
  const bullets = (c) => c.prompt.split("Keep (cleaned):\n")[1].split("\nIf this contract")[0].split("\n");
  const short = Array.from({ length: 10 }, (_, i) => `k${i}`);
  assert.equal(bullets(compile({ name: "t", intent: "i", knobs, keep: short })).length, LIMITS.keepBullets);
  // Long bullets are clipped; the precedence sentence is kept, so the body may lose its tail first.
  const long = Array.from({ length: 10 }, (_, i) => `k${i}-` + "z".repeat(300));
  assert.ok(bullets(compile({ name: "t", intent: "i", knobs, keep: long })).every((l) => l.length <= 2 + LIMITS.keepBulletChars));
});

test("compile: drop capped at 4 and each clipped to 80", () => {
  const c = compile({ name: "t", intent: "i", knobs, drop: ["a", "b", "c", "d", "e".repeat(200), "f"] });
  const lines = c.prompt.split("Do not:\n")[1].split("\nIf this contract")[0].split("\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[3], "- d");
  const c2 = compile({ name: "t", intent: "i", knobs, drop: ["e".repeat(200)] });
  assert.ok(c2.prompt.includes("- " + "e".repeat(80) + "\n"));
});

test("compile: an over-cap contract cuts the body and keeps the precedence sentence last", () => {
  const keep = Array.from({ length: 6 }, () => "y".repeat(140));
  const c = compile({ name: "n".repeat(100), intent: "q".repeat(500), knobs, keep, drop: ["d".repeat(200), "e", "f", "g"], modelSteer: "z".repeat(400) });
  assert.equal(c.chars <= LIMITS.contractChars, true);
  assert.match(c.prompt, /the task wins\. If it conflicts about tone or load, this contract wins\.$/);
});

test("compile: a model steer is added as one clipped 'Model notes' line before the precedence sentence", () => {
  const c = compile({ name: "t", intent: "i", knobs, modelSteer: "Before agreeing, give the strongest objection." });
  const lines = c.prompt.split("\n");
  assert.equal(lines[lines.length - 2], "Model notes: Before agreeing, give the strongest objection.");
  const long = compile({ name: "t", intent: "i", knobs, modelSteer: "w".repeat(500) });
  assert.ok(long.prompt.includes("Model notes: " + "w".repeat(LIMITS.modelSteerChars) + "\n"));
  assert.doesNotMatch(compile({ name: "t", intent: "i", knobs }).prompt, /Model notes/);
});

test("compile: output never exceeds contractChars", () => {
  const keep = Array.from({ length: 6 }, () => "y".repeat(140));
  const c = compile({ name: "n".repeat(100), intent: "q".repeat(500), knobs, keep, drop: ["d".repeat(200), "e", "f", "g"] });
  assert.ok(c.chars <= LIMITS.contractChars, `${c.chars} > ${LIMITS.contractChars}`);
});

test("compile: empty name falls back to 'operator'; empty intent omits Today", () => {
  const c = compile({ name: "", intent: "", knobs });
  assert.match(c.prompt, /Operator: operator\./);
  assert.doesNotMatch(c.prompt, /Today:/);
});

test("every preset compiles under the cap and presets are distinct", () => {
  const prompts = PRESETS.map((p) => compile({ name: "x", intent: p.intent, knobs: p.knobs }));
  for (const c of prompts) assert.ok(c.chars <= LIMITS.contractChars);
  assert.equal(new Set(prompts.map((c) => c.prompt)).size, PRESETS.length);
});
