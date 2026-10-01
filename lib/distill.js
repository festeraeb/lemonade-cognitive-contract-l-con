import { LIMITS, clip } from "./limits.js";

const DISTILL_SYSTEM = `You are L-con's first-pass cleaner. You do not chat. You compress a human dump into a tiny cognitive contract fragment.

Rules:
- Output JSON only. No markdown. No preamble.
- Keep at most ${LIMITS.keepBullets} bullets.
- Each keep bullet <= ${LIMITS.keepBulletChars} characters.
- Extract durable operator facts (ADHD, joke camouflage, wit) and today's intent.
- Drop life story, therapy, trauma narrative, token-wasting autobiography.
- If they insult themselves, record it as "jokes are not literal" — do not quote the insult.
- Never invent facts they did not say.

Schema:
{"today":"string","keep":["string"],"drop":["string"]}
`;

function extractJson(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fallback(dump, intent) {
  const today = clip(intent || dump, LIMITS.intentChars);
  const keep = [];
  const lower = dump.toLowerCase();
  if (/\badhd\b/.test(lower)) keep.push("ADHD: keep load low; one track.");
  if (/self-?loath|idiot|useless|hate myself/.test(lower)) {
    keep.push("Self-loathing jokes are camouflage. Do not take them literally.");
  }
  if (/dry wit|sarcasm/.test(lower)) keep.push("Match dry wit. Stay brief.");
  if (/science|ground/.test(lower)) keep.push("Scientific grounding today.");
  if (/burnout|overwhelm|cheer/.test(lower)) {
    keep.push("Burnout: cheerleader, one next step, no option dump.");
  }
  if (!keep.length) keep.push(clip(dump, LIMITS.keepBulletChars));
  return {
    today,
    keep: keep.slice(0, LIMITS.keepBullets),
    drop: ["therapy", "life story", "option avalanche"],
    source: "local-fallback",
  };
}

export async function distill({ dump, intent, lemonade }) {
  const base = String(lemonade?.base || "").replace(/\/$/, "");
  const model = lemonade?.model || "nauti-recovery";
  const user = [
    `Today field: ${intent || "(empty)"}`,
    `Dump: ${dump}`,
  ].join("\n");

  const url = `${base}/chat/completions`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 280,
        messages: [
          { role: "system", content: DISTILL_SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Lemonade distill HTTP ${res.status} ${errBody.slice(0, 180)}`);
    }
    const data = await res.json();
    const content =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "";
    const parsed = extractJson(content);
    if (!parsed) return { ...fallback(dump, intent), source: "parse-fallback", raw: content };
    const keep = (Array.isArray(parsed.keep) ? parsed.keep : [])
      .map((k) => clip(k, LIMITS.keepBulletChars))
      .filter(Boolean)
      .slice(0, LIMITS.keepBullets);
    const drop = (Array.isArray(parsed.drop) ? parsed.drop : [])
      .map((k) => clip(k, 80))
      .filter(Boolean)
      .slice(0, 4);
    return {
      today: clip(parsed.today || intent, LIMITS.intentChars),
      keep,
      drop: drop.length ? drop : ["therapy", "life story"],
      source: "lemonade",
      model,
    };
  } catch (err) {
    const fb = fallback(dump, intent);
    fb.source = "error-fallback";
    fb.error = String(err.message || err);
    return fb;
  } finally {
    clearTimeout(t);
  }
}

export async function lemonadeHealth(base) {
  const root = String(base || "").replace(/\/$/, "");
  const url = `${root}/models`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, status: res.status, url };
    const data = await res.json();
    const models = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
    return { ok: true, url, models: models.slice(0, 24) };
  } catch (err) {
    return { ok: false, url, error: String(err.message || err) };
  }
}
