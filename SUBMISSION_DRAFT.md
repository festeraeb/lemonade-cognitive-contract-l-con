# L-con: AMD Lemonade Developer Challenge submission (DRAFT)

Status: draft written 2026-10-21. Not submitted. Every `[[FILL: ...]]` is for the operator.
Branch: `challenge/2026-10-21` (from `main`). No push has been done.

## Submission form fields (operator fills)

| Field | Value |
|---|---|
| Your name | [[FILL: name]] |
| AMD AI Developer Program account email | [[FILL: email]] |
| Discord handle | [[FILL: Discord handle]] |
| Project name | L-con (Lemonade Cognitive Contract) |
| Repository URL | [[FILL: confirm public URL; README names https://github.com/festeraeb/lemonade-cognitive-contract-l-con, not checked by me]] |
| Demo / recorded video link (bonus points) | [[FILL: demo link; none exists yet]] |
| Hardware used | [[FILL: hardware used for the demo run]] |
| Any other fields on the form | [[FILL: the form needs an AMD login; its fields were not seen]] |

## 1. Summary

L-con is a zero-dependency Node.js proxy and panel that sits in front of Lemonade's
OpenAI-compatible chat endpoint. It compiles a short "cognitive contract" (tone and
scaffolding policy) from sliders and a free-text brain dump, and prepends it to every
chat request. Model weights are never touched.

## 2. What it does

- Panel at `http://127.0.0.1:7740` with four sliders (grounding, scaffolding, wit, jokes), a one-line intent and a free-text dump.
- Compiles a deterministic contract (`lib/compile.js`) with hard length caps (`lib/limits.js`).
- "Distill" asks the upstream model to turn the dump into keep/drop bullets; the response reports its `source` (`lemonade`, `parse-fallback`, `error-fallback`, `local-fallback`) so a fallback is never passed off as model output.
- `POST /v1/chat/completions` (also `/api/v1/chat/completions`) forwards to the upstream with the contract merged into the leading system message, or inserted as one if absent.

## 3. Why it matters for local AI

Small local models spend tokens guessing tone. A short explicit session policy, applied
at the proxy, lets any OpenAI-compatible client benefit without client changes, and it
runs fully local on a Lemonade server. HYPOTHESIS: this improves small-model response
quality. No quality evaluation has been run; see section 5 for what was measured.

## 4. How Lemonade is used (endpoints)

Used by the code (from `server.js` and `lib/distill.js`, read by me; the base URL is configurable, e.g. `http://127.0.0.1:13305/api/v1`):

| Lemonade endpoint | Used for |
|---|---|
| `POST {base}/chat/completions` | proxied chat (contract prepended) and the distill call |
| `GET {base}/models` | `/v1/models` passthrough and the upstream reachability check in `/api/health` |

Not used: `/api/v1/health`, `/stats`, `/system-stats`, `/metrics`, `/responses`, `/load`, `/unload`.
L-con never calls `/unload`.

Facts about Lemonade from the earlier challenge research (primary sources, see its
notes): docs list `/v1` paths as also accepted under `/api/v1`; a live Lemonade 11.9.0
on the operator's cesarops3 answered `GET /api/v1/health` with HTTP 200, version 11.9.0,
model Qwen3-14B-GGUF. That check was a Lemonade check, not a test of L-con.

## 5. Measured results

All numbers below come from commands run on 2026-10-21 against live Lemonade 11.9.0 (cesarops3, Qwen3-14B-GGUF on CPU, ctx 4096, llamacpp cpu) through a temporary SSH tunnel.

Command: `LEMONADE_BASE=http://127.0.0.1:18305/api/v1 MODEL=Qwen3-14B-GGUF scripts/measure.sh` (3 fixed prompts, each once direct and once through L-con; `max_tokens` 64, `temperature` 0, `enable_thinking` false). Raw JSON and `table.md` are in `docs/measurements/2026-10-21/`.

Each number below is followed by the command that produced or re-checks it.

- Contract cost: +173 prompt tokens on Qwen3-14B's tokenizer (202/204/196 with contract vs 29/31/23 without). Command: `scripts/measure.sh` (above), read from `usage.prompt_tokens` in `docs/measurements/2026-10-21/p*_*.json` and tabulated by `node scripts/summarize.mjs docs/measurements/2026-10-21`. The README's earlier "about 300 tokens" claim was wrong and is replaced by this figure.
- Latency (s), baseline vs contract: P1 29.2 vs 61.1, P2 31.5 vs 31.9, P3 30.8 vs 30.6. The 61.1 s P1 contract run did not reproduce when an independent reviewer repeated P1 the same day (25.7 s baseline vs 31.4 s with the contract), so it is best read as noise, not as a cost of the contract; the stored data was not changed. Command: `cat docs/measurements/2026-10-21/p*_*.latency_s` (curl `time_total`).
- Generation speed: 2.5 tok/s baseline, 2.4 tok/s with contract (`table.md`, from `scripts/summarize.mjs`). All 6 replies hit the 64-token cap (`finish=length`), so completion length says nothing.
- Reply style (3 prompts): contract replies had no markdown headings or emoji; all 3 baseline replies used `###` headings or `---` rules and 2 of 3 used emoji. Check: read the replies in `docs/measurements/2026-10-21/table.md`.
- Compiled contract length per preset, `node docs/measurements/contract_chars.mjs`: 702 / 780 / 662 / 698 characters, under the 1400 cap (re-run today, same output).
- Tests: `cd L-con && npm test` gives 29 pass, 0 fail on Node v22.23.3 (compile/limits, distill against a stub HTTP server, proxy spawned in front of a stub upstream).

These measurements are anecdotal: 3 prompts, 1 run each, a CPU-only 14B model (Qwen3-14B-GGUF, about 2.5 tok/s), replies cut at 64 tokens. They show the contract changes reply style and costs prompt tokens; they do not show better answers. Quality benefit remains a HYPOTHESIS.

Not measured: any quality effect (3 prompts, 1 run each, anecdotal; benefit remains a HYPOTHESIS), the P1 latency outlier cause, streaming, upstream auth, and `/api/distill` against live Lemonade.

## 6. How to run

```bash
git clone [[FILL: repo URL]]
cd L-con
node server.js                 # Node 22+, no npm install; panel on http://127.0.0.1:7740
# In the panel set Upstream base to your Lemonade, e.g. http://127.0.0.1:13305/api/v1
curl -s -X POST http://127.0.0.1:7740/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"<model name from GET /v1/models>","messages":[{"role":"user","content":"hello"}],"max_tokens":64}'
```

Binding is loopback only. The measurement run used the proxy against live Lemonade; this exact curl sequence was not run verbatim. Tested only on Node v22.23.3; `package.json` says `>=18`, which was not tested, and the README says 22+ accordingly.

## 7. Limitations (known, honest)

- Automated tests: 29 (`npm test`), stub-based; nothing automated runs against live Lemonade.
- Over-cap contract truncation drops the final "task wins" precedence sentence (documented by a test, not fixed).
- No quality evaluation; the benefit is a HYPOTHESIS.
- The proxy does not support streaming specially: it reads the whole upstream body with `upstream.text()` before replying, so `stream: true` is not streamed incrementally (from reading `server.js`, not tested).
- No upstream auth: it sends no `Authorization` header, so it will not work against a Lemonade started with `LEMONADE_API_KEY`.
- Over-cap `PUT /api/state`, `/api/compile` and `/api/distill` fields return 413 `too_much`; over-cap proxy payloads return 400 `too_much` (README corrected from 413; both verified by tests).
- The proxy has no auth of its own and does not forward the client's `Authorization` header upstream (test-asserted).
- Measurement is 3 prompts, 1 run each, CPU-only at about 2.5 tok/s; no recorded demo exists yet.
- The README default upstream (`http://127.0.0.1:13321/v1`, model `nauti-recovery`) is the author's own setup, not a Lemonade default.
- Lemonade-specific features (stats, load/unload, health) are not used, so the integration is a thin OpenAI-compatible one.
- The Nauti-Monitor and Ori fixes are on unmerged branches and are not part of this submission or claimed as merged.

## 8. Licence

MIT (`LICENSE`, `package.json`). The challenge requires an open-source licence and names none. Lemonade is Apache-2.0.

## 9. Manual checklist for the operator

| Step | Link | Status |
|---|---|---|
| Join the AMD AI Developer Program | https://developer.amd.com/ai-developer-program | Not verified (link taken from the AMD page HTML; membership not checked) |
| Join Lemonade Discord, follow #AMDDevChallenge | https://discord.gg/5xXzkMu8Zk | Not verified (Discord not accessible to me; any rules posted there are unknown) |
| Fill the submission form | https://account.amd.com/en/member/ai-dev-program/lemonade-challenge.html | Not verified (needs AMD login; fields unknown) |
| Make the repo public with an open-source licence | [[FILL: repo URL]] | Not done by me; I pushed nothing |
| Record a short demo (bonus points) | [[FILL: demo link]] | Not done |
| Check the challenge is still open | https://www.amd.com/en/developer/resources/technical-articles/2026/join-the-lemonade-developer-challenge.html | Page says it runs "until supplies are exhausted". Last maintainer confirmation I know of is 2026-07-07 (issue #2035); current status unknown |
| Check eligibility (country, age) | none found | Not stated on the AMD page; unknown |

Prize wording on the AMD page: "may be eligible" for an AMD HP Ryzen AI Max+ 395 laptop. Not guaranteed.
Judging criteria: community impact (docs, clarity, usefulness), technical depth and quality, creativity.

## 10. How to record the demo (bonus points; not yet recorded)

Prerequisites: a reachable Lemonade (note its base URL and model name from `GET {base}/models`), Node 22+, a screen recorder. Keep generations short because CPU inference is slow; speed up or cut the waiting in editing and say so on screen.

Show, in this order:

1. Hardware and Lemonade: show the machine ([[FILL: hardware]]) and `curl -s {base}/health` or `{base}/models` so viewers see the live server and model.
2. Start L-con: `node server.js`, open `http://127.0.0.1:7740`, set Upstream base and model in the panel.
3. The contract: move the sliders, then `curl -s http://127.0.0.1:7740/api/state | jq .compiled.prompt` to show the compiled text (about 700 characters).
4. Same prompt twice: send one prompt directly to Lemonade, then through `POST http://127.0.0.1:7740/v1/chat/completions` (README curl, `max_tokens` 64) and show the reply style difference.
5. Measurement: run `LEMONADE_BASE={base} MODEL={model} scripts/measure.sh` (about 6 requests, several minutes on CPU; edit down) and end on the printed table, stating that it is 3 prompts, 1 run each.
6. Tests: `npm test` showing 29 pass.
7. Close with the limitations from section 7 (no quality evaluation, streaming not tested, no upstream auth).

Do not claim anything not shown on screen. Add the link to the form field above.

