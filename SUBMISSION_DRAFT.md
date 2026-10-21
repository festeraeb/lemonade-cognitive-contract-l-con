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
quality. No evaluation of that has been run; see section 5.

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

The implementation report with benchmark numbers was not available (null). No L-con
end-to-end test against Lemonade has been run for this draft. The only measurement is local and offline:

Command (from repo root): `node docs/measurements/contract_chars.mjs`
Output (`docs/measurements/contract_chars.out`), compiled contract length in characters, name "x", no keep/drop bullets:

```
Science day	702
ADHD burnout	780
Dry wit / not literal	662
Thom default	698
```

All four are under the 1400-char contract cap in `lib/limits.js`. The README's "about 300
tokens" is NOT verified: these are characters, no tokenizer was run.

Not measured: latency overhead of the proxy, distill success rate per `source`, any quality effect on model output.
[[FILL: add a measured run against Lemonade, with command and output, before submitting]]

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

Binding is loopback only. I did not run this exact sequence for the draft. `package.json` says node >=18 while the README says 22+; unresolved.

## 7. Limitations (known, honest)

- No automated tests in the repo (`git ls-files` shows none).
- No quality evaluation; the benefit is a HYPOTHESIS.
- The proxy does not support streaming specially: it reads the whole upstream body with `upstream.text()` before replying, so `stream: true` is not streamed incrementally (from reading `server.js`, not tested).
- No upstream auth: it sends no `Authorization` header, so it will not work against a Lemonade started with `LEMONADE_API_KEY`.
- The README says over-cap requests return 413; the proxy code returns 400 `too_much`. Docs and code disagree.
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
