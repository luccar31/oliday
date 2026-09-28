import { createRequire } from 'node:module';

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getMatchingLineNumber(url: string, ua?: string): number;
}
// robots-parser es CJS con tipos que no resuelven bien bajo NodeNext.
const robotsParser = createRequire(import.meta.url)('robots-parser') as (url: string, txt: string) => Robot;

export type FetchLike = (url: string) => Promise<{ status: number; text(): Promise<string> }>;

export interface RobotsDecision {
  allowed: boolean;
  reason: string;
}

/** User-agent con el que se evalúan las reglas (cae en el grupo `*` salvo regla específica). */
export const ROBOTS_USER_AGENT = 'viaje-alojamientos';

/**
 * Verifica robots.txt antes de pedir una URL (regla 9). Criterio estándar:
 * - 2xx: se aplican las reglas.
 * - 4xx (sin robots.txt): todo permitido.
 * - 5xx o error de red: se asume bloqueado (conservador).
 * Cachea un resultado por origen durante la vida de la instancia.
 */
export class RobotsChecker {
  private readonly cache = new Map<string, Promise<Robot | 'allow-all' | 'deny-all'>>();

  constructor(
    private readonly respect: boolean,
    private readonly fetchImpl: FetchLike = (url) => fetch(url, { redirect: 'follow' }),
  ) {}

  async check(url: string): Promise<RobotsDecision> {
    if (!this.respect) return { allowed: true, reason: 'RESPECT_ROBOTS=false' };
    const origin = new URL(url).origin;
    let entry = this.cache.get(origin);
    if (!entry) {
      entry = this.load(origin);
      this.cache.set(origin, entry);
    }
    const rules = await entry;
    if (rules === 'allow-all') return { allowed: true, reason: 'sin robots.txt (4xx)' };
    if (rules === 'deny-all')
      return { allowed: false, reason: 'robots.txt inaccesible (5xx o error de red)' };
    const allowed = rules.isAllowed(url, ROBOTS_USER_AGENT) ?? true;
    const line = rules.getMatchingLineNumber(url, ROBOTS_USER_AGENT);
    return {
      allowed,
      reason: allowed ? 'permitido por robots.txt' : `bloqueado por robots.txt (línea ${line})`,
    };
  }

  private async load(origin: string) {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const res = await this.fetchImpl(robotsUrl);
      if (res.status >= 200 && res.status < 300) return robotsParser(robotsUrl, await res.text());
      if (res.status >= 400 && res.status < 500) return 'allow-all' as const;
      return 'deny-all' as const;
    } catch {
      return 'deny-all' as const;
    }
  }
}
