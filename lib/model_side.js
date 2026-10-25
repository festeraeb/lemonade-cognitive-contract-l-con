// Model side of the contract: per-model profiles and counter-steers (see docs/TWO_SIDED_CONTRACT.md).

// Compile a case-insensitive glob into an anchored RegExp: '*' matches any run of
// characters (including an empty run); every other regex metacharacter is literal.
export function globToRegExp(pattern) {
  const source = String(pattern ?? "")
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s\\S]*");
  return new RegExp(`^${source}$`, "i");
}

// Pick the profile for a model name. An exact (case-insensitive) entry in a
// profile's match list wins; otherwise the longest matching glob pattern wins,
// with ties keeping the earlier profile. Returns null when nothing matches.
export function selectProfile(modelName, profiles) {
  if (typeof modelName !== "string" || modelName.length === 0) return null;
  if (!Array.isArray(profiles)) return null;
  const lower = modelName.toLowerCase();

  for (const profile of profiles) {
    if (!profile || !Array.isArray(profile.match)) continue;
    if (profile.match.some((m) => typeof m === "string" && m.toLowerCase() === lower)) {
      return profile;
    }
  }

  let best = null;
  let bestLength = -1;
  for (const profile of profiles) {
    if (!profile || !Array.isArray(profile.match)) continue;
    for (const pattern of profile.match) {
      if (typeof pattern !== "string") continue;
      if (pattern.length > bestLength && globToRegExp(pattern).test(modelName)) {
        best = profile;
        bestLength = pattern.length;
      }
    }
  }
  return best;
}

// Check profiles before they are saved. Returns null when valid, otherwise a short message.
export function validateProfiles(profiles) {
  const isText = (v) => typeof v === "string" && v.length > 0;
  if (!Array.isArray(profiles)) return "modelProfiles must be an array";
  for (const [i, profile] of profiles.entries()) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return `profile ${i} must be an object`;
    if (!isText(profile.id)) return `profile ${i} needs a non-empty string id`;
    if (!Array.isArray(profile.match) || profile.match.length === 0 || !profile.match.every(isText)) {
      return `profile ${profile.id}: match must be a non-empty list of non-empty strings`;
    }
    if (!Array.isArray(profile.steers)) return `profile ${profile.id}: steers must be an array`;
    const seen = new Set();
    for (const steer of profile.steers) {
      if (!steer || typeof steer !== "object" || !isText(steer.id) || !isText(steer.text)) {
        return `profile ${profile.id}: each steer needs a non-empty string id and text`;
      }
      if (seen.has(steer.id)) return `profile ${profile.id}: duplicate steer id ${steer.id}`;
      seen.add(steer.id);
    }
  }
  return null;
}

export const EXAMPLE_PROFILES = [
  {
    id: "flatterer-example",
    match: ["*gemini*"],
    steers: [
      {
        id: "objection-first",
        text: "Before agreeing, give the strongest objection to the plan in one sentence.",
      },
    ],
  },
  {
    id: "skeptic-example",
    match: ["*gpt*"],
    steers: [
      {
        id: "evidence-first",
        text: "Lead with the evidence or measurement, then the conclusion.",
      },
    ],
  },
];
