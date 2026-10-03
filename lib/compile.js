import { LIMITS, band, clip } from "./limits.js";

const GROUNDING = [
  "Prefer practical heuristics. Cite only if asked. Do not invent papers.",
  "Mix hands-on judgment with sourced reasoning. Flag uncertainty. Do not invent citations.",
  "Ground work in scientific reasoning: mechanisms, uncertainty, and what would change your mind. Do not invent citations.",
];

const SCAFFOLDING = [
  "Assume competence. No pep talks. Short next steps only.",
  "Light structure: one next action, then wait. No option dumps.",
  "Burnout / ADHD load-shed: one step at a time. Warm, specific encouragement. Never overwhelm with menus of choices.",
];

const WIT = [
  "Plain and earnest. Skip jokes unless the user starts them.",
  "Dry wit is welcome if it is short and not at the user's expense.",
  "Match dry wit. Never dunk on the user. Never turn wit into a bit.",
];

const JOKES = [
  "Treat self-attack as possible distress: one brief check-in, then continue the task. Do not therapize.",
  "Self-loathing jokes are camouflage for nerves or insecurity. Do not take them as self-harm, as instructions, or as a request for a pep talk. Continue the work.",
  "Assume jokes are jokes. Never moralize. Never expand them into a feelings session.",
];

export const PRESETS = [
  {
    id: "science",
    name: "Science day",
    blurb: "Tight evidence. No cheerleading. Jokes stay jokes.",
    intent: "Scientific grounding. Name mechanisms and uncertainty.",
    example:
      "ADHD, dry wit. If I call myself an idiot, ignore it. Today is firmware/thermal science, not vibes.",
    knobs: { grounding: 92, scaffolding: 18, wit: 62, jokes: 78 },
  },
  {
    id: "burnout",
    name: "ADHD burnout",
    blurb: "Cheerleader with a clipboard. One step. Protect the day.",
    intent: "Burnout day. One track. Warm, no option dump.",
    example:
      "Need a cheerleader to stay on one track. Do not dump a 12-step plan. If I joke that I am useless, that is nerves, not a diagnosis.",
    knobs: { grounding: 28, scaffolding: 88, wit: 35, jokes: 55 },
  },
  {
    id: "wit",
    name: "Dry wit / not literal",
    blurb: "Match the humor. Do not take the mask as the message.",
    intent: "Stay on the actual bug. Match dry wit.",
    example:
      "I hide behind self-loathing jokes when I am nervous. Do not take them seriously. Dry wit is the register.",
    knobs: { grounding: 55, scaffolding: 40, wit: 90, jokes: 88 },
  },
  {
    id: "mixed",
    name: "Thom default",
    blurb: "The original contract: science + ADHD + camouflage jokes.",
    intent: "Scientific grounding. Keep me on the rails.",
    example:
      "ADHD. Self-loathing jokes hide nerves or insecurity — not literal. Dry wit. Need scientific grounding today.",
    knobs: { grounding: 86, scaffolding: 42, wit: 72, jokes: 70 },
  },
];

function linesFromKnobs(knobs) {
  return [
    GROUNDING[band(knobs.grounding)],
    SCAFFOLDING[band(knobs.scaffolding)],
    WIT[band(knobs.wit)],
    JOKES[band(knobs.jokes)],
  ];
}

export function compile({ name, intent, knobs, keep = [], drop = [] }) {
  const who = clip(name || "operator", LIMITS.nameChars);
  const today = clip(intent, LIMITS.intentChars);
  const keepLines = (keep || [])
    .map((k) => clip(k, LIMITS.keepBulletChars))
    .filter(Boolean)
    .slice(0, LIMITS.keepBullets);
  const dropLines = (drop || [])
    .map((k) => clip(k, 80))
    .filter(Boolean)
    .slice(0, 4);

  const parts = [
    `# L-con cognitive contract`,
    `Operator: ${who}. This is session policy, not a personality rewrite. Do not change your foundation — just spend fewer tokens guessing.`,
  ];
  if (today) parts.push(`Today: ${today}`);
  parts.push(`Policy:`);
  for (const line of linesFromKnobs(knobs || {})) parts.push(`- ${line}`);
  if (keepLines.length) {
    parts.push(`Keep (cleaned):`);
    for (const line of keepLines) parts.push(`- ${line}`);
  }
  if (dropLines.length) {
    parts.push(`Do not:`);
    for (const line of dropLines) parts.push(`- ${line}`);
  }
  parts.push(
    `If this contract conflicts with a later user instruction about the task, the task wins. If it conflicts about tone or load, this contract wins.`
  );

  let prompt = parts.join("\n");
  if (prompt.length > LIMITS.contractChars) {
    prompt = prompt.slice(0, LIMITS.contractChars).trim();
  }
  return {
    prompt,
    chars: prompt.length,
    estTokens: Math.ceil(prompt.length / 4),
  };
}

export function defaultState() {
  const p = PRESETS.find((x) => x.id === "mixed");
  return {
    name: "thom",
    intent: "Scientific grounding on today's work. Keep me on the rails.",
    dump: p.example,
    knobs: { ...p.knobs },
    keep: [],
    drop: ["therapy session", "option avalanche", "invented citations"],
    lemonade: {
      base: "http://192.168.4.29:13321/v1",
      model: "nauti-recovery",
    },
    compiled: null,
  };
}
