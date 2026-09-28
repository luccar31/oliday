import type { Page } from 'playwright';
import { createBrowserCrawler } from '../crawl/browser.js';
import { BlockedError, detectBlock } from '../crawl/block-detect.js';
import { attachJsonCapture, type JsonCapture, type PageLike } from '../crawl/capture.js';
import { politePause } from '../crawl/pacing.js';
import { RobotsChecker, type FetchLike } from '../crawl/robots.js';
import { childLogger } from '../logger.js';
import type { AdapterStatus, RawPayloadInput, SearchParams } from '../types.js';
import type { CaptureManifest } from './fixtures.js';
import type { CaptureSpec } from './platforms.js';

export interface CaptureOptions {
  spec: CaptureSpec;
  params: SearchParams;
  respectRobots: boolean;
  proxyUrl?: string;
  headless?: boolean;
  executablePath?: string;
  /** Abrir también el detalle del primer resultado (default true). */
  includeDetail?: boolean;
  /** Para tests: fetch de robots.txt inyectable. */
  robotsFetch?: FetchLike;
}

export interface CaptureResult {
  status: AdapterStatus;
  payloads: RawPayloadInput[];
  manifest: CaptureManifest;
}

/**
 * Captura mínima para fixtures (regla 11: 1 búsqueda por plataforma, scraper determinista):
 * abre la búsqueda, guarda las respuestas GraphQL y el estado embebido, y opcionalmente
 * abre el detalle del primer resultado. Nunca resuelve captchas: ante un bloqueo retira la
 * sesión y reintenta (máx. 4); agotados los reintentos, termina en BLOCKED.
 */
export async function runCapture(opts: CaptureOptions): Promise<CaptureResult> {
  const { spec, params } = opts;
  const log = childLogger({ platform: spec.platform, mode: 'capture' });
  const searchUrl = spec.searchUrl(params);
  const warnings: string[] = [];
  const payloads: RawPayloadInput[] = [];
  const pages: CaptureManifest['pages'] = [];
  const robots = new RobotsChecker(opts.respectRobots, opts.robotsFetch);
  let status: AdapterStatus = 'OK';

  const manifest = (): CaptureManifest => {
    const kinds: Record<string, number> = {};
    for (const p of payloads) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
    return {
      platform: spec.platform,
      capturedAt: new Date().toISOString(),
      status,
      searchUrl,
      pages,
      kinds,
      warnings,
    };
  };

  const robotsSearch = await robots.check(searchUrl);
  if (!robotsSearch.allowed) {
    status = 'BLOCKED_BY_ROBOTS';
    warnings.push(`${searchUrl}: ${robotsSearch.reason}`);
    log.warn({ url: searchUrl, reason: robotsSearch.reason }, 'BLOCKED_BY_ROBOTS');
    return { status, payloads, manifest: manifest() };
  }

  const captures = new Map<string, JsonCapture>();

  const crawler = createBrowserCrawler({
    maxConcurrency: spec.maxConcurrency,
    locale: `${params.locale.hl}-${params.locale.gl.toUpperCase()},${params.locale.hl};q=0.9`,
    ...(opts.proxyUrl && { proxyUrl: opts.proxyUrl }),
    headless: opts.headless ?? true,
    ...(opts.executablePath && { executablePath: opts.executablePath }),
    preNavigationHooks: [
      async ({ page, request }) => {
        await captures.get(request.id ?? request.url)?.stop();
        captures.set(
          request.id ?? request.url,
          attachJsonCapture(page as unknown as PageLike, { match: spec.matchResponse, kindOf: spec.kindOf }),
        );
      },
    ],
    requestHandler: async ({ page, request, response, session, crawler: c }) => {
      const label = request.label ?? 'SEARCH';
      await page.waitForLoadState('networkidle', { timeout: 25_000 }).catch(() => undefined);

      const bodyText = await page.innerText('body').catch(() => '');
      const block = detectBlock({ status: response?.status() ?? null, body: bodyText, url: page.url() });
      if (block.blocked) {
        session?.retire();
        log.warn(
          { label, reason: block.reason, retry: request.retryCount },
          'bloqueo detectado; se retira la sesión',
        );
        throw new BlockedError(block.reason ?? 'desconocido');
      }

      const capture = captures.get(request.id ?? request.url);
      await capture?.stop();
      payloads.push(...(capture?.payloads ?? []));
      warnings.push(...(capture?.errors ?? []));
      payloads.push(...(await readEmbeddedState(page, spec)));
      pages.push({ label, url: page.url(), status: response?.status() ?? null });
      log.info({ label, captured: capture?.payloads.length ?? 0 }, 'página capturada');

      if (label === 'SEARCH' && opts.includeDetail !== false) {
        const href = await page
          .locator(spec.detailLink)
          .first()
          .getAttribute('href', { timeout: 5_000 })
          .catch(() => null);
        if (!href) {
          warnings.push(`no se encontró link de detalle (${spec.detailLink})`);
          return;
        }
        const detailUrl = new URL(href, page.url()).toString();
        const decision = await robots.check(detailUrl);
        if (!decision.allowed) {
          warnings.push(`detalle omitido: ${decision.reason}`);
          return;
        }
        await politePause();
        await c.addRequests([{ url: detailUrl, label: 'DETAIL', uniqueKey: `detail:${detailUrl}` }]);
      }
    },
    failedRequestHandler: async ({ request }, error) => {
      const label = request.label ?? 'SEARCH';
      if (error instanceof BlockedError || /bloqueo detectado/.test(error.message)) {
        if (label === 'SEARCH') status = 'BLOCKED';
        else if (status === 'OK') status = 'PARTIAL';
        warnings.push(`${label}: BLOCKED tras ${request.retryCount} reintentos (${error.message})`);
      } else {
        status = label === 'SEARCH' ? 'FAILED' : status === 'OK' ? 'PARTIAL' : status;
        warnings.push(`${label}: ${error.message}`);
      }
      log.error({ label, err: error.message }, 'request fallida');
    },
  });

  await crawler.run([{ url: searchUrl, label: 'SEARCH', uniqueKey: `search:${searchUrl}` }]);
  for (const c of captures.values()) await c.stop();
  return { status, payloads, manifest: manifest() };
}

async function readEmbeddedState(page: Page, spec: CaptureSpec): Promise<RawPayloadInput[]> {
  const out: RawPayloadInput[] = [];
  for (const [name, selector] of Object.entries(spec.embeddedState)) {
    const texts = await page.$$eval(selector, (els) => els.map((e) => e.textContent ?? '')).catch(() => []);
    texts.forEach((text) => {
      try {
        out.push({
          kind: `${spec.platform}.embedded.${name}`,
          url: page.url(),
          body: JSON.parse(text) as unknown,
        });
      } catch {
        /* script no JSON: se ignora */
      }
    });
  }
  return out;
}
