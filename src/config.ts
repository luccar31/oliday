import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { loadAmenityCatalog } from './catalog.js';
import {
  PLATFORM_KEYS,
  PLATFORM_KEY_LIST,
  PROPERTY_TYPES,
  type Platform,
  type PlatformKey,
  type SearchParams,
} from './types.js';

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------

/** Variables vacías en .env (`SERPAPI_KEY=`) se tratan como ausentes. */
const optionalSecret = z.preprocess((v) => (v === '' ? undefined : v), z.string().min(1).optional());

const booleanFlag = (def: boolean) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? String(def) : v),
    z.enum(['true', 'false'], { error: 'debe ser "true" o "false"' }).transform((v) => v === 'true'),
  );

export const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL debe ser una URL postgresql://')
    .default('postgresql://viaje:viaje@localhost:5432/viaje?schema=public'),
  SERPAPI_KEY: optionalSecret,
  TRIPADVISOR_API_KEY: optionalSecret,
  APIFY_TOKEN: optionalSecret,
  PROXY_URL: optionalSecret,
  RESPECT_ROBOTS: booleanFlag(true),
  LOG_LEVEL: z
    .preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    )
    .default('info'),
  TELEGRAM_BOT_TOKEN: optionalSecret,
  TELEGRAM_CHAT_ID: optionalSecret,
});
export type Env = z.infer<typeof EnvSchema>;

let dotenvLoaded = false;

/** Carga `.env` (una vez) y valida las variables. Nunca loguea valores. */
export function loadEnv(source?: NodeJS.ProcessEnv): Env {
  if (!source && !dotenvLoaded) {
    dotenv.config({ quiet: true });
    dotenvLoaded = true;
  }
  const parsed = EnvSchema.safeParse(source ?? process.env);
  if (!parsed.success) throw new ConfigError('.env inválido', parsed.error);
  return parsed.data;
}

// ---------------------------------------------------------------------------
// trip.config.json
// ---------------------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'formato YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'fecha inexistente');

export const DateOptionSchema = z
  .object({ checkIn: isoDate, checkOut: isoDate })
  .refine((d) => d.checkOut > d.checkIn, {
    message: 'checkOut debe ser posterior a checkIn',
    path: ['checkOut'],
  });
export type DateOption = z.infer<typeof DateOptionSchema>;

const amenityCodes = () => new Set(loadAmenityCatalog().map((a) => a.code));

export const TripConfigSchema = z
  .object({
    destination: z
      .string()
      .trim()
      .min(1)
      .refine((s) => s !== 'REEMPLAZAR', 'completá el destino en trip.config.json'),
    dateOptions: z.array(DateOptionSchema).min(1),
    adults: z.number().int().min(1).max(30),
    /** Obligatorio (puede ser []). Con niños, siempre se envían las edades a cada plataforma. */
    childAges: z.array(z.number().int().min(0).max(17)),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'código ISO 4217 en mayúsculas (p. ej. USD)')
      .default('USD'),
    locale: z.object({
      hl: z.string().regex(/^[a-z]{2}(-[A-Za-z0-9]{2,3})?$/),
      gl: z.string().regex(/^[a-z]{2}$/),
    }),
    mustHaveAmenities: z.array(z.string()).default([]),
    niceToHaveAmenities: z.array(z.string()).default([]),
    propertyTypes: z.array(z.enum(PROPERTY_TYPES)).min(1),
    maxTotalPrice: z.number().positive().nullable().default(null),
    platforms: z.array(z.enum(PLATFORM_KEY_LIST)).min(1),
    // Opcionales con default (documentados en docs/DECISIONS.md).
    maxResultsPerSearch: z.number().int().min(1).default(60),
    detailTopN: z.number().int().min(0).default(20),
    enableApifyFallback: z.boolean().default(false),
    snapshotTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'formato HH:MM')
      .default('07:00'),
    timezone: z.string().min(1).default('America/Argentina/Buenos_Aires'),
  })
  .superRefine((cfg, ctx) => {
    const codes = amenityCodes();
    for (const field of ['mustHaveAmenities', 'niceToHaveAmenities'] as const) {
      cfg[field].forEach((code, i) => {
        if (!codes.has(code)) {
          ctx.addIssue({
            code: 'custom',
            path: [field, i],
            message: `amenity desconocido "${code}" (ver prisma/seed/amenities.json)`,
          });
        }
      });
    }
  });
export type TripConfig = z.infer<typeof TripConfigSchema>;

export const DEFAULT_TRIP_CONFIG_PATH = 'trip.config.json';

export function parseTripConfig(raw: unknown): TripConfig {
  const parsed = TripConfigSchema.safeParse(raw);
  if (!parsed.success) throw new ConfigError('trip.config.json inválido', parsed.error);
  return parsed.data;
}

export function loadTripConfig(file = DEFAULT_TRIP_CONFIG_PATH): TripConfig {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new ConfigError(
      `No existe ${file}. Copiá trip.config.example.json a trip.config.json y completalo.`,
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (err) {
    throw new ConfigError(`${file} no es JSON válido: ${(err as Error).message}`);
  }
  return parseTripConfig(raw);
}

export function toPlatform(key: PlatformKey): Platform {
  return PLATFORM_KEYS[key];
}

/** Un SearchParams por cada combinación de fechas (cada una es un job independiente). */
export function buildSearchParams(cfg: TripConfig): SearchParams[] {
  return cfg.dateOptions.map((d) => ({
    destination: cfg.destination,
    checkIn: d.checkIn,
    checkOut: d.checkOut,
    adults: cfg.adults,
    childAges: [...cfg.childAges],
    currency: cfg.currency,
    locale: { ...cfg.locale },
  }));
}

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly zodError?: z.ZodError,
  ) {
    super(zodError ? `${message}:\n${z.prettifyError(zodError)}` : message);
    this.name = 'ConfigError';
  }
}
