const SECRET_KEY =
  /(secret|token|password|api[_-]?key|authorization|credential|deploy[_-]?key|auth[_-]?header|private[_-]?key|access[_-]?token|refresh[_-]?token)/i;

const SECRET_VALUE =
  /^(?:key_|crsr_|sk-|ghp_|github_pat_|xox[baprs]-|Bearer\s+)\S+/i;

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && SECRET_VALUE.test(value.trim())) return "[已隱藏]";
    return value;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      out[key] = "[已隱藏]";
      continue;
    }
    out[key] = redact(child);
  }
  return out;
}
