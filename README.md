# L-con

Lemonade **Cognitive Contract**. A small local panel that compiles a short system prompt from sliders and a capped dump. It does not change model weights.

A first-pass Lemonade model **distills** messy notes into keep/drop bullets. Any OpenAI-compatible client can talk to L-con’s `/v1` hook; the compiled contract is prepended on the way to Lemonade.

## Why

Large models burn tokens guessing tone: scientific vs cheerleader, whether a self-loathing joke is literal, how much ADHD scaffolding to use. Put that in a ~300-token contract instead of a biography.

## Run

```bat
cd C:\Users\thom\L-con
node server.js
```

Or double-click `start.cmd`. Open [http://127.0.0.1:7740](http://127.0.0.1:7740).

Default upstream is `https://cesarops.com/lemonade/v1` (model `nauti-recovery`). Point **Upstream base** at a local Lemonade (`http://127.0.0.1:13306/v1`) if you have one.

## Panel

| Control | What to put |
|---|---|
| Today | One sentence. Session intent only. 160 characters. |
| Dump | Durable facts. Cap **720** characters. Memoirs are rejected. |
| Grounding | Heuristic ↔ scientific reasoning |
| Load | Hands-off ↔ burnout cheerleader (one step) |
| Wit | Earnest ↔ dry |
| Jokes | Check-in ↔ never take self-loathing jokes literally |
| Distill | Lemonade cleans the dump; local compile always works without it |

Example chips fill both dump and knobs: Science day, ADHD burnout, Dry wit / not literal, Thom default.

## Hook

Point the client at L-con, not Lemonade:

```
POST http://127.0.0.1:7740/v1/chat/completions
```

L-con prepends the compiled system message, then forwards to the configured Lemonade base. `GET /v1/models` is passed through.

## Limits

Too much context is the failure mode this tool exists to prevent. The backend returns HTTP 413 if dump/today exceed the cap. Distill is instructed to drop therapy, life story, and option avalanches.

## Lemonade challenge

This is an app/workflow integration: OpenAI-compatible middleware plus a desktop panel. MIT licensed. Weights stay stock.
