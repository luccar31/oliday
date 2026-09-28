export interface BlockCheckInput {
  status?: number | null;
  /** Texto visible o HTML de la página. */
  body?: string | null;
  /** URL final (tras redirecciones). */
  url?: string | null;
}

export interface BlockCheckResult {
  blocked: boolean;
  reason: string | null;
}

const BLOCK_PATTERNS: [RegExp, string][] = [
  [/captcha/i, 'captcha'],
  [/are you a robot/i, 'are you a robot'],
  [/verify (that )?you are (a )?human/i, 'verificación humana'],
  [/unusual traffic/i, 'tráfico inusual'],
  [/access (is )?denied/i, 'access denied'],
  [/px-captcha|perimeterx|datadome/i, 'anti-bot (PerimeterX/DataDome)'],
  [/request unsuccessful\. incapsula/i, 'anti-bot (Incapsula)'],
  [/pardon our interruption/i, 'anti-bot (interrupción)'],
];

const BLOCK_URL_PATTERNS = [/captcha/i, /\/sorry\//i, /challenge/i];

/**
 * Detecta captcha / bloqueo (Fase 2, regla 7). Nunca intenta resolverlo: el llamador
 * retira la sesión y reintenta más tarde.
 */
export function detectBlock({ status, body, url }: BlockCheckInput): BlockCheckResult {
  if (status === 403 || status === 429) return { blocked: true, reason: `HTTP ${status}` };
  if (url && BLOCK_URL_PATTERNS.some((re) => re.test(url))) {
    return { blocked: true, reason: `redirección a ${new URL(url).pathname}` };
  }
  if (body !== undefined && body !== null) {
    if (body.trim().length === 0) return { blocked: true, reason: 'página vacía inesperada' };
    for (const [re, reason] of BLOCK_PATTERNS) if (re.test(body)) return { blocked: true, reason };
  }
  return { blocked: false, reason: null };
}

export class BlockedError extends Error {
  constructor(readonly reason: string) {
    super(`bloqueo detectado: ${reason}`);
    this.name = 'BlockedError';
  }
}
