const $ = (id) => document.getElementById(id);

const state = {
  name: "",
  intent: "",
  dump: "",
  knobs: { grounding: 50, scaffolding: 50, wit: 50, jokes: 50 },
  lemonade: { base: "", model: "" },
  keep: [],
  drop: [],
  compiled: null,
  limits: { dumpChars: 720, intentChars: 160 },
  presets: [],
};

function knobLabel(id, n) {
  const v = Number(n);
  if (id === "grounding") return v > 66 ? "scientific" : v < 34 ? "heuristic" : "mixed";
  if (id === "scaffolding") return v > 66 ? "cheerleader" : v < 34 ? "hands-off" : "light structure";
  if (id === "wit") return v > 66 ? "dry" : v < 34 ? "earnest" : "occasional";
  if (id === "jokes") return v > 66 ? "never literal" : v < 34 ? "check in" : "camouflage";
  return String(v);
}

function paintCounts() {
  const d = state.dump.length;
  const max = state.limits.dumpChars;
  $("dumpCount").textContent = `${d} / ${max}`;
  $("intentCount").textContent = `${state.intent.length} / ${state.limits.intentChars}`;
  $("dump").classList.toggle("over", d > max * 0.9);
  const reject = $("reject");
  if (d > max) {
    reject.hidden = false;
    reject.textContent = `Too much. Cap is ${max} characters. Distill a shorter dump — do not paste a biography.`;
  } else if (d > max * 0.85) {
    reject.hidden = false;
    reject.textContent = "Getting long. Distill will keep only durable policy.";
  } else {
    reject.hidden = true;
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
  $("hook").textContent = `${location.origin}/v1/chat/completions`;
  paintKnobs();
  paintCounts();
  const c = state.compiled;
  $("prompt").textContent = c?.prompt || "";
  $("meter").textContent = c ? `${c.estTokens} tok · ${c.chars} ch` : "—";
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
  const res = await fetch(path, {
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
  try {
    applyServer(await api("POST", "/api/compile", payload()));
  } catch (err) {
    $("reject").hidden = false;
    $("reject").textContent = err.message;
  }
});

$("distillBtn").addEventListener("click", async () => {
  const btn = $("distillBtn");
  btn.disabled = true;
  btn.textContent = "Distilling…";
  try {
    applyServer(await api("POST", "/api/distill", payload()));
  } catch (err) {
    $("reject").hidden = false;
    $("reject").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Distill with Lemonade";
  }
});

$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("prompt").textContent);
  $("copyBtn").textContent = "Copied";
  setTimeout(() => ($("copyBtn").textContent = "Copy prompt"), 1200);
});

$("copyCurl").addEventListener("click", async () => {
  const curl = `curl ${location.origin}/v1/chat/completions -H "Content-Type: application/json" -d "{\\"model\\":\\"${state.lemonade.model}\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"ping\\"}]}"`;
  await navigator.clipboard.writeText(curl);
  $("copyCurl").textContent = "Copied";
  setTimeout(() => ($("copyCurl").textContent = "Copy curl"), 1200);
});

for (const id of ["name", "intent", "dump", "base", "model", "grounding", "scaffolding", "wit", "jokes"]) {
  $(id).addEventListener("input", collect);
}

(async function boot() {
  applyServer(await api("GET", "/api/state"));
  renderPresets();
  health();
})();
