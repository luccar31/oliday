/**
 * Sanitiza payloads antes de guardarlos como fixtures commiteables (AGENT_BRIEF §11.1):
 * elimina secretos (tokens, cookies, claves) y datos personales de anfitriones y
 * autores de reseñas. Los payloads en Postgres (RawPayload) se guardan sin sanitizar,
 * porque la base es local y no se versiona.
 */

export const REDACTED = '[REDACTED]';

const SECRET_KEY = /(csrf|token|api_?key|apikey|cookie|password|secret|authorization|session_?id)/i;
const PERSONAL_KEY =
  /^(first_?name|last_?name|full_?name|host_?name|reviewer_?name|author_?name|user_?name|smart_?name|email|phone(_?number)?|avatar.*|profile_?pic.*|profile_?picture.*|picture_?url|about|comments|review_?text|positive_?text|negative_?text|localized_?review|text_?translated)$/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function sanitizePayload(value: unknown): unknown {
  return walk(value);
}

function walk(value: unknown, key?: string): unknown {
  if (key !== undefined && (SECRET_KEY.test(key) || PERSONAL_KEY.test(key))) {
    return value === null || value === undefined ? value : REDACTED;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, k);
    return out;
  }
  if (typeof value === 'string') return value.replace(EMAIL, REDACTED);
  return value;
}
