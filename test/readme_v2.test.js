import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");

test("README has a v2 model-side section", () => {
  assert.match(readme, /^## Model side \(v2\)$/m);
});

test("README documents the v2 API and state fields", () => {
  for (const needle of ["GET /api/scoreboard", "POST /api/scoreboard", "modelProfiles", "X-L-Con-Steer", "helped", "neutral", "hurt", "docs/TWO_SIDED_CONTRACT.md"]) {
    assert.ok(readme.includes(needle), `README should mention ${needle}`);
  }
});

test("README no longer states the stale v1 test count", () => {
  assert.doesNotMatch(readme, /28 tests/);
  assert.doesNotMatch(readme, /28 pass/);
});

test("README makes no measured-quality claim for v2", () => {
  const section = readme.split(/^## Model side \(v2\)$/m)[1]?.split(/^## /m)[0] || "";
  assert.ok(section.length > 0, "section body missing");
  assert.match(section, /not (yet )?measured|no quality claim/i);
});
