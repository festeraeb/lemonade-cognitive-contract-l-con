const $ = (id) => document.getElementById(id);

// Works both at site root (/) and under a subpath (/lcon/) behind a proxy.
const BASE = location.pathname.replace(/\/[^/]*$/, "");

const state = {
  name: "",
  intent: "",
  dump: "",
  knobs: { grounding: 50, scaffolding: 50, wit: 50, jokes: 50 },
  lemonade: { base: "", model: "" },
  keep: [],
  drop: [],
  compiled: null,
  limits: {},
  presets: [],
};

function words(s) {
  const t = String(s || "").trim();
  return t ? t.split(/\s+/).length : 0;
}

function knobLabel(id, n) {
  const v = Number(n);
  if (id === "grounding") return v > 66 ? "scientific" : v < 34 ? "heuristic" : "mixed";
  if (id === "scaffolding") return v > 66 ? "cheerleader" : v < 34 ? "hands-off" : "light structure";
  if (id === "wit") return v > 66 ? "dry" : v < 34 ? "earnest" : "occasional";
  if (id === "jokes") return v > 66 ? "never literal" : v < 34 ? "check in" : "camouflage";
  return String(v);
}

function paintCounts() {
  const dumpMax = state.limits.dumpChars || 8000;
  const d = state.dump.length;
  $("dumpCount").textContent = `${d.toLocaleString()} chars · ${words(state.dump).toLocaleString()} words · cap ${dumpMax.toLocaleString()}`;
  $("intentCount").textContent = `${state.intent.length} / ${state.limits.intentChars ?? 160}`;
  $("nameCount").textContent = `${state.name.length} / ${state.limits.nameChars ?? 40}`;
  $("dump").classList.toggle("over", d > dumpMax * 0.95);

  const reject = $("reject");
  if (d > dumpMax) {
    reject.hidden = false;
    reject.textContent = `Over the ${dumpMax.toLocaleString()}-char cap — trim it or let Distill keep only the durable policy.`;
  } else if (d > (state.limits.dumpWarn ?? dumpMax * 0.8)) {
    reject.hidden = false;
    reject.textContent = "Getting long. Distill will keep only the durable policy and drop the rest.";
  } else {
    reject.hidden = true;
  }

  const c = state.compiled;
  const cap = state.limits.contractChars || 1400;
  if (c) {
    const pct = Math.min(100, Math.round((c.chars / cap) * 100));
    $("meterFill").style.width = pct + "%";
    $("meter").textContent = `${c.estTokens} tok · ${c.chars}/${cap} ch`;
  } else {
    $("meterFill").style.width = "0%";
    $("meter").textContent = "— tok";
  }
}

function paintKnobs() {
  for (const id of ["grounding", "scaffolding", "wit", "jokes"]) {
    $(id).value = state.knobs[id];
  }
  $("gVal").textContent = knobLabel("grounding", state.knobs.grounding);
  $("sVal").textContent = knobLabel("scaffolding", state.knobs.scaffolding);
  $("wVal").textContent = knobLabel("wit", state.knobs.wit);
  $("jVal").textContent = knobLabel("jokes", state.knobs.jokes);
}

function paint() {
  $("name").value = state.name;
  $("intent").value = state.intent;
  $("dump").value = state.dump;
  $("base").value = state.lemonade.base;
  $("model").value = state.lemonade.model;
  $("hook").textContent = `${location.origin}${BASE}/v1/chat/completions`;
  paintKnobs();
  paintCounts();
  const c = state.compiled;
  $("prompt").textContent = c?.prompt || "";
  const keep = state.keep || [];
  $("keepBox").hidden = !keep.length;
  $("keepList").innerHTML = keep.map((k) => `<li>${escapeHtml(k)}</li>`).join("");
  const note = state.distill;
  $("distillNote").textContent = note
    ? note.error
      ? `Distill fell back (${note.source}): ${note.error}`
      : `Distill: ${note.source}${note.model ? " · " + note.model : ""}`
    : "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function collect() {
  state.name = $("name").value;
  state.intent = $("intent").value;
  state.dump = $("dump").value;
  state.lemonade.base = $("base").value.trim();
  state.lemonade.model = $("model").value.trim();
  state.knobs.grounding = Number($("grounding").value);
  state.knobs.scaffolding = Number($("scaffolding").value);
  state.knobs.wit = Number($("wit").value);
  state.knobs.jokes = Number($("jokes").value);
  paintKnobs();
  paintCounts();
}

function payload() {
  collect();
  return {
    name: state.name,
    intent: state.intent,
    dump: state.dump,
    knobs: state.knobs,
    lemonade: state.lemonade,
    keep: state.keep,
    drop: state.drop,
  };
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function applyServer(data) {
  Object.assign(state, data);
  if (data.lemonade) state.lemonade = data.lemonade;
  if (data.knobs) state.knobs = data.knobs;
  paint();
}

function flash(btn, okText) {
  const orig = btn.dataset.orig || btn.textContent;
  btn.dataset.orig = orig;
  btn.textContent = okText;
  btn.classList.add("flash");
  setTimeout(() => {
    btn.textContent = orig;
    btn.classList.remove("flash");
  }, 1100);
}

function renderPresets() {
  const box = $("examples");
  box.innerHTML = "";
  for (const p of state.presets || []) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.title = p.blurb;
    b.textContent = p.name;
    b.addEventListener("click", () => {
      state.intent = p.intent || p.example.slice(0, 160);
      state.dump = p.example;
      state.knobs = { ...p.knobs };
      paint();
      for (const c of box.children) c.classList.remove("on");
      b.classList.add("on");
    });
    box.appendChild(b);
  }
}

async function health() {
  try {
    const h = await api("GET", "/api/health");
    $("dot").className = "dot " + (h.lemonade?.ok ? "ok" : "bad");
    $("statusText").textContent = h.lemonade?.ok
      ? `lemonade up · ${(h.lemonade.models || []).slice(0, 2).join(", ") || "models ok"}`
      : `lemonade unreachable · panel still compiles locally`;
  } catch {
    $("dot").className = "dot bad";
    $("statusText").textContent = "l-con health failed";
  }
}

$("compileBtn").addEventListener("click", async () => {
  const btn = $("compileBtn");
  btn.disabled = true;
  try {
    applyServer(await api("POST", "/api/compile", payload()));
    flash(btn, "✓ Compiled");
  } catch (err) {
    $("reject").hidden = false;
    $("reject").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$("distillBtn").addEventListener("click", async () => {
  const btn = $("distillBtn");
  btn.disabled = true;
  btn.textContent = "✦ Distilling…";
  try {
    applyServer(await api("POST", "/api/distill", payload()));
    flash(btn, "✓ Distilled");
  } catch (err) {
    $("reject").hidden = false;
    $("reject").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "✦ Distill with Lemonade";
  }
});

$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("prompt").textContent);
    flash($("copyBtn"), "✓ Copied");
  } catch {
    $("copyBtn").textContent = "Ctrl+C failed — select manually";
  }
});

$("copyCurl").addEventListener("click", async () => {
  const url = `${location.origin}${BASE}/v1/chat/completions`;
  const curl = `curl ${url} -H "Content-Type: application/json" -d '{"model":"${state.lemonade.model}","messages":[{"role":"user","content":"ping"}]}'`;
  try {
    await navigator.clipboard.writeText(curl);
    flash($("copyCurl"), "✓ Copied");
  } catch {
    $("copyCurl").textContent = "clipboard blocked";
  }
});

for (const id of ["name", "intent", "dump", "base", "model", "grounding", "scaffolding", "wit", "jokes"]) {
  $(id).addEventListener("input", collect);
}

// Auto-grow the dump box so long paragraphs never feel cramped.
const dumpEl = $("dump");
dumpEl.addEventListener("input", () => {
  dumpEl.style.height = "auto";
  dumpEl.style.height = Math.min(560, Math.max(230, dumpEl.scrollHeight)) + "px";
});

(async function boot() {
  applyServer(await api("GET", "/api/state"));
  renderPresets();
  health();
})();
