// Reads raw responses in <dir> and prints a markdown table. Fails if any field is missing.
import fs from "node:fs";
const dir = process.argv[2];
const need = (v, what) => { if (v === undefined || v === null) throw new Error(`missing ${what}`); return v; };
const rows = [];
for (const n of [1, 2, 3]) for (const mode of ["baseline", "contract"]) {
  const f = `${dir}/p${n}_${mode}`;
  const j = JSON.parse(fs.readFileSync(`${f}.json`, "utf8"));
  if (j.error) throw new Error(`${f}: ${JSON.stringify(j.error)}`);
  const lat = Number(fs.readFileSync(`${f}.latency_s`, "utf8"));
  const t = j.timings || {};
  rows.push({ n, mode,
    prompt: need(j.usage?.prompt_tokens, `${f} prompt_tokens`),
    comp: need(j.usage?.completion_tokens, `${f} completion_tokens`),
    lat, ppTps: t.prompt_per_second, tgTps: t.predicted_per_second,
    finish: j.choices[0].finish_reason,
    reply: j.choices[0].message.content.replace(/\s+/g, " ").trim() });
}
const f1 = (x) => (x === undefined ? "n/a" : Number(x).toFixed(1));
let md = "| # | mode | prompt tok | completion tok | latency s | prompt tok/s | gen tok/s | finish | reply (max 64 tok) |\n|---|---|---|---|---|---|---|---|---|\n";
for (const r of rows) md += `| ${r.n} | ${r.mode} | ${r.prompt} | ${r.comp} | ${r.lat.toFixed(1)} | ${f1(r.ppTps)} | ${f1(r.tgTps)} | ${r.finish} | ${r.reply.replace(/\|/g, "\\|")} |\n`;
fs.writeFileSync(`${dir}/table.md`, md);
console.log(md);
