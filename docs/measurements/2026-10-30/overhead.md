# L-con proxy overhead, measured 2026-10-30 (task E3)

Question: is L-con's Node.js proxy slow or heavy enough that a Rust port is worth doing before the
entry? The Rust-first rule allows another language where it is measured adequate, so this is the
measurement.

## Setup

- Upstream: stock Lemonade `lemond-stock` on cesarops3 (`127.0.0.1:13420`, Lemonade 2026.43.3,
  `llamacpp:rocm`), reached from t440 over `ssh -L 18305:127.0.0.1:13420 cesarops3`.
- Model: `Qwen3-14B-GGUF` (Q4_0, 8.1 GB) loaded on the RX 6700 XT, `--ctx-size 8192`,
  `enable_thinking: false`.
- L-con: this worktree at 199ea4a, `node server.js`, Node v22.23.3, on t440.
- Both the direct and the L-con path cross the same ssh tunnel, so the tunnel cost cancels.

## 1. Quality-side table (unchanged script)

`LEMONADE_BASE=http://127.0.0.1:18305/api/v1 MODEL=Qwen3-14B-GGUF bash scripts/measure.sh docs/measurements/2026-10-30`
wrote `table.md` and the raw `p*_{baseline,contract}.json` beside this file. Generation speed is the
same with and without the contract (36.5 to 38.2 tok/s); the contract adds about 170 prompt tokens.

## 2. Proxy overhead

20 sequential requests per path, `max_tokens: 1`, `temperature: 0`, same prompt, so the model's
work is the same and the difference is the proxy. Script: `scripts/overhead.sh` (added with this
measurement).

```
node_rss_kb 76160
node_version v22.23.3
n 20 direct_p50_ms 36.4 direct_p95_ms 82.1
n 20 lcon_p50_ms 41.6 lcon_p95_ms 68.8
added_p50_ms 5.2 added_median_of_pairs_ms 3.1
```

## Decision

Added latency through L-con: about 3 to 5 ms per request (p50), on replies that take 1.7 to 2.2 s
for 64 tokens on this card, so under 0.3 percent of a real reply. Resident memory of the Node
process: 76 MB.

The plan's threshold was "added p50 under 5 ms and RSS under 60 MB closes the port question".
The latency is at the line and the memory is over it, but neither is a user-visible cost: a Rust
port would save roughly 70 MB of RAM and a few milliseconds per request and buy nothing else the
entry needs. **No Rust port for the entry.** L-con stays zero-dependency Node, which is also what
makes it run anywhere Lemonade runs. Revisit only if L-con is ever placed on a memory-starved host
(the 15 GB cesarops3 is the smallest server, and it runs the model, not L-con).

Everything above is one machine, one model, one day; it answers the port question, not a
benchmark claim.
