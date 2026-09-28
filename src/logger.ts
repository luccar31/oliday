import fs from 'node:fs';
import path from 'node:path';
import pino, { type Logger } from 'pino';
import pretty from 'pino-pretty';

const LOG_DIR = path.resolve('logs');

/** Claves que nunca deben aparecer en logs (regla 13). */
const REDACT_PATHS = [
  'api_key',
  'apiKey',
  'token',
  'password',
  '*.api_key',
  '*.apiKey',
  '*.token',
  '*.password',
  'SERPAPI_KEY',
  'TRIPADVISOR_API_KEY',
  'APIFY_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'PROXY_URL',
  '*.SERPAPI_KEY',
  '*.TRIPADVISOR_API_KEY',
  '*.APIFY_TOKEN',
  '*.TELEGRAM_BOT_TOKEN',
  '*.PROXY_URL',
];

let instance: Logger | undefined;

function createLogger(): Logger {
  const level = process.env['LOG_LEVEL'] ?? 'info';
  const streams: pino.StreamEntry[] = [
    { level: level as pino.Level, stream: pretty({ colorize: true, sync: true, destination: 2 }) },
  ];

  if (process.env['VIAJE_LOG_TO_FILE'] !== 'false' && level !== 'silent') {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    streams.push({
      level: level as pino.Level,
      stream: pino.destination({ dest: path.join(LOG_DIR, `viaje-${day}.log`), sync: true, mkdir: true }),
    });
  }

  return pino(
    { level, redact: { paths: REDACT_PATHS, censor: '[REDACTED]' }, base: undefined },
    pino.multistream(streams),
  );
}

/** Logger compartido (pino a consola + ./logs/). Se crea perezosamente. */
export function getLogger(): Logger {
  instance ??= createLogger();
  return instance;
}

/** Logger hijo con contexto fijo (p. ej. `{ platform: 'BOOKING' }`). */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}
