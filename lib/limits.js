export const LIMITS = {
  dumpChars: 8000,
  dumpWarn: 6500,
  intentChars: 160,
  nameChars: 40,
  keepBullets: 6,
  keepBulletChars: 140,
  contractChars: 1400,
  messagesChars: 16000,
};

export function band(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n < 34) return 0;
  if (n > 66) return 2;
  return 1;
}

export function clip(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max).trim();
}

export function rejectIfOver(field, text, max) {
  const raw = String(text || "");
  if (raw.length > max) {
    const err = new Error(
      `${field} is ${raw.length} characters. Cap is ${max}. Cut it down or use Distill — do not paste a memoir.`
    );
    err.status = 413;
    err.code = "too_much";
    throw err;
  }
  return raw.trim();
}
