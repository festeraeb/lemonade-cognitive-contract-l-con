#!/usr/bin/env bash
# E3: proxy overhead of L-con. 20 x max_tokens=1 requests direct vs through L-con, same model, same prompt.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE=${LEMONADE_BASE:-http://127.0.0.1:18305/api/v1}
MODEL=${MODEL:-Qwen3-14B-GGUF}
PORT=17741
DATA=$(mktemp -d)
cat > "$DATA/state.json" <<JSON
{"name":"thom","intent":"grounding","knobs":{"grounding":86,"scaffolding":42,"wit":72,"jokes":70},"keep":[],"drop":[],
 "lemonade":{"base":"$BASE","model":"$MODEL"}}
JSON
LCON_PORT=$PORT LCON_DATA_DIR=$DATA node "$ROOT/server.js" > "$DATA/server.log" 2>&1 &
LPID=$!
trap 'kill $LPID 2>/dev/null; rm -rf "$DATA"' EXIT
for i in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT/api/presets" && break; sleep 0.2; done
body=$(node -e 'console.log(JSON.stringify({model:process.argv[1],messages:[{role:"user",content:"Reply with the single word ok."}],max_tokens:1,temperature:0,stream:false,chat_template_kwargs:{enable_thinking:false}}))' "$MODEL")
for mode in direct lcon; do
  if [ $mode = direct ]; then url="$BASE/chat/completions"; else url="http://127.0.0.1:$PORT/v1/chat/completions"; fi
  : > "$DATA/$mode.txt"
  for n in $(seq 1 20); do
    curl -sS -m 120 -o /dev/null -w '%{time_total}\n' -X POST "$url" -H 'Content-Type: application/json' -d "$body" >> "$DATA/$mode.txt"
  done
done
echo "node_rss_kb $(grep VmRSS /proc/$LPID/status | awk '{print $2}')"
echo "node_version $(node --version)"
python3 - "$DATA/direct.txt" "$DATA/lcon.txt" <<'PY'
import sys, statistics
d=[float(x) for x in open(sys.argv[1])]; l=[float(x) for x in open(sys.argv[2])]
def q(v,p): v=sorted(v); return v[min(len(v)-1,int(round(p*(len(v)-1))))]
print(f"n {len(d)} direct_p50_ms {q(d,.5)*1000:.1f} direct_p95_ms {q(d,.95)*1000:.1f}")
print(f"n {len(l)} lcon_p50_ms {q(l,.5)*1000:.1f} lcon_p95_ms {q(l,.95)*1000:.1f}")
print(f"added_p50_ms {(q(l,.5)-q(d,.5))*1000:.1f} added_median_of_pairs_ms {statistics.median([b-a for a,b in zip(d,l)])*1000:.1f}")
PY
