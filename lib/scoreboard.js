// Scoreboard: per exact model and counter-steer, record helped/neutral/hurt and pick the best steer.

const OUTCOMES = ["helped", "neutral", "hurt"];

export function emptyBoard() {
  return { models: {} };
}

export function record(board, model, steerId, outcome) {
  if (!OUTCOMES.includes(outcome)) {
    throw new TypeError(`Unknown outcome: ${outcome}`);
  }
  const models = (board.models ||= {});
  const steers = (models[model] ||= {});
  const counts = (steers[steerId] ||= { helped: 0, neutral: 0, hurt: 0 });
  counts[outcome] += 1;
  return board;
}

export function wilsonLower(successes, total, z = 1.96) {
  if (!total) return 0;
  const p = successes / total;
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return (centre - spread) / (1 + z2 / total);
}

export function pickSteer(board, model, steerIds, { minSamples = 5 } = {}) {
  if (!steerIds || steerIds.length === 0) return null;
  const steers = board.models?.[model] || {};
  const stats = steerIds.map((id) => {
    const c = steers[id] || {};
    const helped = c.helped || 0;
    const total = helped + (c.neutral || 0) + (c.hurt || 0);
    return { id, total, score: wilsonLower(helped, total) };
  });

  const untested = stats.filter((s) => s.total < minSamples);
  if (untested.length > 0) {
    // Explore: fewest samples first, ties keep list order.
    return untested.reduce((a, b) => (b.total < a.total ? b : a)).id;
  }
  // Exploit: highest lower bound, ties keep list order.
  return stats.reduce((a, b) => (b.score > a.score ? b : a)).id;
}
