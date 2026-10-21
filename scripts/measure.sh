#!/usr/bin/env bash
# Reproduces docs/measurements/2026-10-21/. Sends 3 fixed prompts to Lemonade twice each:
# direct (no contract) and through L-con (contract prepended). Sequential, max_tokens 64, temperature 0.
# Usage: LEMONADE_BASE=http://127.0.0.1:18305/api/v1 MODEL=Qwen3-14B-GGUF scripts/measure.sh [outdir]
set -euo pipefail
: "${LEMONADE_BASE:?set LEMONADE_BASE, e.g. http://127.0.0.1:18305/api/v1}"
: "${MODEL:?set MODEL, e.g. Qwen3-14B-GGUF}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/docs/measurements/2026-10-21}"
PORT="${LCON_MEASURE_PORT:-17740}"
mkdir -p "$OUT"
DATA="$(mktemp -d)"
cat > "$DATA/state.json" <<JSON
{"name":"thom","intent":"Scientific grounding on today's work. Keep me on the rails.",
 "knobs":{"grounding":86,"scaffolding":42,"wit":72,"jokes":70},"keep":[],
 "drop":["therapy session","option avalanche","invented citations"],
 "lemonade":{"base":"$LEMONADE_BASE","model":"$MODEL"}}
JSON
LCON_PORT="$PORT" LCON_DATA_DIR="$DATA" node "$ROOT/server.js" > "$DATA/server.log" 2>&1 &
LPID=$!
trap 'kill $LPID 2>/dev/null || true; rm -rf "$DATA"' EXIT
for i in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/api/presets" && break; sleep 0.2; done
curl -s "http://127.0.0.1:$PORT/api/state" | node -e 'const s=JSON.parse(require("fs").readFileSync(0));require("fs").writeFileSync(process.argv[1],s.compiled.prompt+"\n")' "$OUT/contract.txt"

PROMPTS=(
 "I keep getting distracted while debugging a flaky test. What should I do next?"
 "lol I'm such an idiot, I broke the build again. What do I check first?"
 "Why can a thermal throttle show up as latency spikes?"
)
for n in 1 2 3; do
  p="${PROMPTS[$((n-1))]}"
  body="$(node -e 'console.log(JSON.stringify({model:process.argv[1],messages:[{role:"user",content:process.argv[2]}],max_tokens:64,temperature:0,stream:false,chat_template_kwargs:{enable_thinking:false}}))' "$MODEL" "$p")"
  printf '%s' "$p" > "$OUT/prompt$n.txt"
  for mode in baseline contract; do
    if [ "$mode" = baseline ]; then url="$LEMONADE_BASE/chat/completions"; else url="http://127.0.0.1:$PORT/v1/chat/completions"; fi
    echo "prompt $n $mode ..." >&2
    curl -sS -m 900 -X POST "$url" -H 'Content-Type: application/json' -d "$body" \
      -o "$OUT/p${n}_${mode}.json" -w '%{time_total}\n' > "$OUT/p${n}_${mode}.latency_s"
  done
done
node "$ROOT/scripts/summarize.mjs" "$OUT"
