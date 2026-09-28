import { chromium as patchrightChromium } from 'patchright';
import type { chromium as playwrightChromium } from 'playwright';
import {
  Configuration,
  PlaywrightCrawler,
  ProxyConfiguration,
  type PlaywrightCrawlerOptions,
  type PlaywrightRequestHandler,
} from 'crawlee';

/** Límites de la regla 8. */
export const MAX_BROWSER_CONCURRENCY = 2;
export const MAX_REQUEST_RETRIES = 4;

export interface BrowserCrawlerOptions {
  requestHandler: PlaywrightRequestHandler;
  failedRequestHandler?: PlaywrightCrawlerOptions['failedRequestHandler'];
  /** Hooks extra antes de navegar (p. ej. enganchar la captura de respuestas). */
  preNavigationHooks?: NonNullable<PlaywrightCrawlerOptions['preNavigationHooks']>;
  /** 1 para Airbnb, ≤ 2 en general. */
  maxConcurrency?: number;
  proxyUrl?: string;
  locale: string;
  headless?: boolean;
  /** Chromium/Chrome alternativo (por defecto, el que instala `patchright install chromium`). */
  executablePath?: string;
  navigationTimeoutSecs?: number;
}

/**
 * Fábrica de PlaywrightCrawler con Patchright como launcher (AGENT_BRIEF §4):
 * SessionPool activo, cookies por sesión, sin inyección de fingerprints (Patchright ya parchea
 * el navegador y recomienda no tocar UA/headers), concurrencia ≤ 2, ≤ 4 reintentos.
 * El almacenamiento de Crawlee es en memoria: lo que importa se persiste en Postgres.
 */
export function createBrowserCrawler(opts: BrowserCrawlerOptions): PlaywrightCrawler {
  const maxConcurrency = Math.min(opts.maxConcurrency ?? MAX_BROWSER_CONCURRENCY, MAX_BROWSER_CONCURRENCY);
  const config = new Configuration({ persistStorage: false, purgeOnStart: true });

  return new PlaywrightCrawler(
    {
      launchContext: {
        // Patchright expone la misma API que Playwright; el tipo nominal difiere.
        launcher: patchrightChromium as unknown as typeof playwrightChromium,
        launchOptions: {
          headless: opts.headless ?? true,
          ...(opts.executablePath && { executablePath: opts.executablePath }),
        },
      },
      browserPoolOptions: { useFingerprints: false },
      preNavigationHooks: [
        async ({ page }) => {
          await page.context().setExtraHTTPHeaders({ 'Accept-Language': opts.locale });
        },
        ...(opts.preNavigationHooks ?? []),
      ],
      useSessionPool: true,
      persistCookiesPerSession: true,
      sessionPoolOptions: { maxPoolSize: 4, sessionOptions: { maxUsageCount: 20 } },
      maxConcurrency,
      maxRequestRetries: MAX_REQUEST_RETRIES,
      navigationTimeoutSecs: opts.navigationTimeoutSecs ?? 60,
      requestHandlerTimeoutSecs: 180,
      ...(opts.proxyUrl && { proxyConfiguration: new ProxyConfiguration({ proxyUrls: [opts.proxyUrl] }) }),
      requestHandler: opts.requestHandler,
      ...(opts.failedRequestHandler && { failedRequestHandler: opts.failedRequestHandler }),
    },
    config,
  );
}
