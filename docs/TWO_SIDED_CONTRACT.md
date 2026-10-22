# L-con v2: the two-sided cognitive contract (design, 2026-10-22)

L-con v1 tells the model who the user is (tone, scaffolding, a one-line intent). It costs about 170 prompt tokens per
request, which the prompt cache absorbs after the first request of a session. Its value is a head start: a model
normally needs many turns to learn how a person writes, what they mean when they joke, and how much detail they
want, and it forgets all of that at the next session.

v2 adds the other side. People build the same kind of model of each AI ("the cheerleader agrees too fast", "the
skeptic wants to see the science"), and the Forge already records it: `cesarops-forge-v3` has per-model corrector
presets with an escalation ladder (`src/corrector_preset.rs`), a per-model quirk ledger with strengths, weaknesses and
corrector hints (`src/model_quirks.rs`, `var/model_quirks.jsonl`), and a model-by-role scorecard. The operator's
finding from that work: the same nudge can help one model and hurt another **even within one family**, so profiles
are matched per exact model first and per family only as a fallback, and every nudge is scored.

## Parts

1. **User side** (v1, unchanged): sliders, intent, keep and drop lists, compiled by `lib/compile.js`.
2. **Model side** (`lib/model_side.js`): a profile table matched on the request's `model` field: exact name first,
   then the longest matching pattern. A profile carries one or more candidate counter-steers, for example
   "before agreeing, give the strongest objection" for a model that flatters, or "lead with the evidence and the
   measurement" for a skeptic.
3. **Scoreboard** (`lib/scoreboard.js`): records, per exact model and per counter-steer, whether it helped, did
   nothing, or hurt (judged by the user or by a test), and picks the steer with the best lower-bound success rate once
   it has enough samples, exploring untested ones first. Stored locally, like everything else in L-con.
4. **Compile** (`lib/compile.js`): appends a short "Model notes" line for the chosen steer inside the existing
   length cap, and keeps the "task wins" precedence sentence last so truncation can never drop it (fixing the v1
   limitation where an over-cap contract lost that sentence).

## How it will be measured

The same request set with and without each part: count clarifying questions, misread actions, and, for a flattering
model, how often it pushes back on a deliberately flawed plan. No quality claim is made until that runs.
