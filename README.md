# L-con — Lemonade Cognitive Contract

> **Repo:** https://github.com/festeraeb/lemonade-cognitive-contract-l-con
> **MIT licensed.** No model weights are bundled or modified.

A small, zero-dependency **OpenAI-compatible proxy + panel** that compiles a short *cognitive contract* (~300 tokens) from a messy brain-dump and prepends it to every chat request before it reaches Lemonade (or any OpenAI-compatible backend).

Large language models burn tokens guessing tone: scientific vs. cheerleader, whether a self-loathing joke is literal, how much ADHD scaffolding to use. **L-con** turns those into explicit session instructions so the model can spend its tokens on the actual task.

---

## 1. Why

- **Tone policy, not personality:** the contract is session-scoped; model weights are never touched.
- **Cap-fit:** dump ≤ 8,000 chars, intent ≤ 160 chars, contract ≤ 1,400 chars, proxy payload ≤ 16,000 chars.
- **Drop the noise:** distill compresses "I am an idiot ha ha" into "Self-loathing jokes are camouflage. Do not take them literally."
- **Cheap and offline-safe:** the panel works without an upstream; if Lemonade is unreachable, `/api/distill` falls back to a local keyword-based cleaner.

---

## 2. Prerequisites

- **Node.js 22+** (uses built-in `fetch`/`AbortSignal.timeout`; no `npm install` required).
- A reachable **OpenAI-compatible base URL** for the *distill* step (any Lemonade, vLLM, llama.cpp, OpenRouter, etc.). The **proxy itself** can talk to *any* OpenAI-compatible target.

---

## 3. Install

```bash
git clone https://github.com/festeraeb/lemonade-cognitive-contract-l-con
cd lemonade-cognitive-contract-l-con
# no deps; nothing to build
node server.js
```

Open the panel: <http://127.0.0.1:7740>.

To change the port or listen address:

```bash
LCON_PORT=8080 node server.js
```

The server binds `127.0.0.1` by default — only loopback. If you want LAN or internet access, terminate at a reverse proxy (nginx, caddy, traefik, …) — **do not** expose this directly with the public default upstream, since the proxy will happily forward `Authorization` headers to whatever base you configured.

---

## 4. Configure

L-con persists state to `data/state.json`. You can configure via the panel (recommended) or by editing the JSON:

```json
{
  "name": "thom",
  "intent": "Scientific grounding. Keep me on the rails.",
  "knobs": { "grounding": 86, "scaffolding": 42, "wit": 72, "jokes": 70 },
  "lemonade": {
    "base": "http://127.0.0.1:13321/v1",
    "model": "nauti-recovery"
  }
}
```

| Knob | 0–33 | 34–66 | 67–100 |
|---|---|---|---|
| `grounding` | heuristic | mixed | scientific |
| `scaffolding` | hands-off | light | cheerleader (burnout) |
| `wit` | earnest | occasional | dry |
| `jokes` | check-in | camouflage | never literal |

`grounding` and `scaffolding` are also loaded from **presets** — the panel ships four:

| Preset | Intent | Knobs |
|---|---|---|
| Science day | Scientific grounding. Name mechanisms and uncertainty. | 92 / 18 / 62 / 78 |
| ADHD burnout | Burnout day. One track. Warm, no option dump. | 28 / 88 / 35 / 55 |
| Dry wit / not literal | Stay on the actual bug. Match dry wit. | 55 / 40 / 90 / 88 |
| Thom default *(mixed)* | Scientific grounding. Keep me on the rails. | 86 / 42 / 72 / 70 |

### Environment variables

| Var | Default | What |
|---|---|---|
| `LCON_PORT` | `7740` | TCP port the server binds (loopback). |
| `LCON_MAX_PROXY_CHARS` | `16000` | Hard cap on `compiled.prompt + Σ messages`. Over-limit requests get `400 too_much`. |

---

## 5. Use the panel

1. Fill **Today** (one sentence, ≤ 160 chars).
2. Fill **Dump** — type freely, a few sentences or a full paragraph (≤ 8,000 chars). Distill trims it to durable policy.
3. Drag the four sliders — they populate the contract immediately.
4. Click **Compile locally** for a deterministic contract render (no upstream).
6. Click **Distill with Lemonade** to let the upstream model propose cleaner keep/drop bullets, then re-compile.
7. Hit **Copy curl** — that's the request any OpenAI-compatible client should send.

---

## 6. End-to-end

```bash
# What the panel does for you, on the command line:

# 1) Compile locally (no upstream needed)
curl -s http://127.0.0.1:7740/api/state | jq .compiled.prompt

# 2) Distill a messy dump via the upstream
curl -s -X POST http://127.0.0.1:7740/api/distill \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "thom",
    "intent": "Fix the bug",
    "dump": "Rough night, brain all over. ADHD mode. I am an idiot and everything is broken ha ha. Just want to ship one fix today."
  }' | jq .keep

# 3) Chat through the proxy — the contract is prepended automatically
curl -s -X POST http://127.0.0.1:7740/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "nauti-recovery",
    "messages": [
      { "role": "user", "content": "Why does my worker keep OOMing?" }
    ]
  }'
```

If your client already includes a `system` message of its own, L-con **merges** the contract into it instead of stacking a second system turn (a second system turn is silently ignored by chat templates).

---

## 7. HTTP API

| Method & Path | What |
|---|---|
| `GET /api/state` | full persisted state + live `compiled` |
| `PUT /api/state` | merge partial state (validates `dump`, `intent`, `name` against `LIMITS`) |
| `GET /api/presets` | preset list + limits |
| `POST /api/compile` | deterministic re-compile from current state |
| `POST /api/distill` | upstream-powered distill + re-compile |
| `GET /api/health` | liveness + upstream reachability |
| `POST /v1/chat/completions` | OpenAI-compatible proxy (contract prepended) |
| `GET /v1/models` | passthrough to upstream `/models` |

Errors return a JSON body with a `code` field (`too_much` if you bust a cap, `error` otherwise).

---

## 8. Lemonade integration

The proxy speaks standard `/v1/chat/completions`. To use it with the `Lemonade Server`:

```bash
# Start Lemonade on your machine (pick any port; L-con will hit /v1/chat/completions).
# In the L-con panel, set:
#   Upstream base:    http://127.0.0.1:PORT/v1
#   Distill model:    nauti-recovery    # or whatever your small/cheap model is
```

If you don't have Lemonade, any OpenAI-compatible endpoint will do — the panel **will keep working**; only the *Distill* button will degrade to the local fallback.

### Local fallback policy

`/api/distill` returns `source` so you know what produced the keep bullets:

- `lemonade` — upstream answered with parseable JSON
- `parse-fallback` — upstream answered, but JSON was malformed → regex extracted what it could
- `error-fallback` — upstream unreachable or timed out → keyword-based heuristic
- `local-fallback` — upstream URL was empty in the first place

All four return the same shape (`{today, keep[], drop[], source}`) so the panel UI stays stable.

---

## 9. Limits & why they exist

| Field | Cap | Source |
|---|---|---|
| `name` | 40 | `LIMITS.nameChars` |
| `intent` (Today) | 160 | `LIMITS.intentChars` |
| `dump` | 8000 | `LIMITS.dumpChars` |
| `keep` bullets | 6 | `LIMITS.keepBullets` |
| per-bullet | 140 | `LIMITS.keepBulletChars` |
| contract prompt | 1400 | `LIMITS.contractChars` |
| proxy payload | 16000 | `LIMITS.messagesChars` |

Caps are the *whole point* of the tool — they force the contract to stay cheap. Anything that violates a cap returns `413 too_much` from the API.

---

## 10. Files

```
L-con/
├── server.js            HTTP server (loopback :7740), API + proxy
├── lib/
│   ├── compile.js       Contract compiler + presets
│   ├── distill.js       Upstream distill call + local fallback
│   └── limits.js        All the caps in one place
├── public/              Panel UI (HTML + JS + CSS)
├── data/state.json      Persisted state (gitignored)
├── start.cmd            Windows launcher
└── README.md
```

---

## 11. License

MIT. See `LICENSE`.
