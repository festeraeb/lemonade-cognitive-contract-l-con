// Prints compiled contract length in characters for each shipped preset (name "x", empty keep/drop).
// Run from repo root: node docs/measurements/contract_chars.mjs
import { compile, PRESETS } from "../../lib/compile.js";
for (const p of PRESETS) {
  const c = compile({ name: "x", intent: p.intent, knobs: p.knobs, keep: [], drop: [] });
  console.log(`${p.name}\t${c.chars}`);
}
