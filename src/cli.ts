import { pathToFileURL } from 'node:url';
import { Command, InvalidArgumentError, Option } from 'commander';
import {
  ConfigError,
  DEFAULT_TRIP_CONFIG_PATH,
  buildSearchParams,
  loadEnv,
  loadTripConfig,
  parseTripConfig,
  toPlatform,
  type TripConfig,
} from './config.js';
import { disconnectDb } from './db.js';
import { getLogger } from './logger.js';
import { seedAmenities } from './seed.js';
import { PLATFORM_KEY_LIST, type PlatformKey } from './types.js';

/** Exit code para comandos cuya fase todavía no está implementada. */
export const EXIT_NOT_IMPLEMENTED = 2;
export const EXIT_CONFIG_ERROR = 3;

export class NotImplementedError extends Error {
  constructor(command: string, phase: string) {
    super(`"${command}" no implementado todavía (${phase}).`);
    this.name = 'NotImplementedError';
  }
}

function parsePlatforms(value: string): PlatformKey[] {
  const keys = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const k of keys) {
    if (!(PLATFORM_KEY_LIST as string[]).includes(k)) {
      throw new InvalidArgumentError(
        `plataforma desconocida "${k}". Válidas: ${PLATFORM_KEY_LIST.join(', ')}`,
      );
    }
  }
  return keys as PlatformKey[];
}

function parseChildAges(value: string): number[] {
  if (value.trim() === '') return [];
  return value.split(',').map((s) => {
    const n = Number(s.trim());
    if (!Number.isInteger(n)) throw new InvalidArgumentError(`edad inválida "${s}"`);
    return n;
  });
}

function parseIntArg(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new InvalidArgumentError(`entero inválido "${value}"`);
  return n;
}

interface SearchOptions {
  config: string;
  platforms?: PlatformKey[];
  destination?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  childAges?: number[];
  currency?: string;
  dryRun?: boolean;
}

/** Combina trip.config.json con los overrides de la CLI y revalida todo con Zod. */
export function resolveTripConfig(opts: SearchOptions): TripConfig {
  const base = loadTripConfig(opts.config);
  if ((opts.checkIn === undefined) !== (opts.checkOut === undefined)) {
    throw new ConfigError('--check-in y --check-out deben usarse juntos');
  }
  return parseTripConfig({
    ...base,
    ...(opts.destination !== undefined && { destination: opts.destination }),
    ...(opts.checkIn !== undefined && { dateOptions: [{ checkIn: opts.checkIn, checkOut: opts.checkOut }] }),
    ...(opts.adults !== undefined && { adults: opts.adults }),
    ...(opts.childAges !== undefined && { childAges: opts.childAges }),
    ...(opts.currency !== undefined && { currency: opts.currency }),
    ...(opts.platforms !== undefined && { platforms: opts.platforms }),
  });
}

export function createProgram(): Command {
  const program = new Command()
    .name('viaje')
    .description(
      'Scraper local de alojamientos: amenities, precios y disponibilidad para un viaje en familia',
    )
    .showHelpAfterError();

  program
    .command('db:seed')
    .description('Carga el catálogo de amenities y los alias por plataforma (idempotente)')
    .action(async () => {
      loadEnv();
      const res = await seedAmenities();
      console.log(`Seed OK: ${res.amenities} amenities, ${res.aliases} alias.`);
    });

  program
    .command('search')
    .description(
      'Busca alojamientos en las plataformas configuradas y guarda listings, precios y payloads crudos',
    )
    .option('-c, --config <path>', 'archivo de configuración del viaje', DEFAULT_TRIP_CONFIG_PATH)
    .option(
      '-p, --platforms <list>',
      `plataformas separadas por coma (${PLATFORM_KEY_LIST.join(', ')})`,
      parsePlatforms,
    )
    .option('-d, --destination <text>', 'destino (sobrescribe la config)')
    .option('--check-in <YYYY-MM-DD>', 'fecha de entrada (sobrescribe dateOptions; requiere --check-out)')
    .option('--check-out <YYYY-MM-DD>', 'fecha de salida (requiere --check-in)')
    .option('--adults <n>', 'cantidad de adultos', parseIntArg)
    .option(
      '--child-ages <list>',
      'edades de los niños separadas por coma, p. ej. "4,9" ("" = sin niños)',
      parseChildAges,
    )
    .option('--currency <ISO>', 'moneda fija de la corrida, p. ej. USD')
    .option('--dry-run', 'valida la configuración e imprime los parámetros sin consultar ninguna fuente')
    .action((opts: SearchOptions) => {
      loadEnv();
      const cfg = resolveTripConfig(opts);
      const params = buildSearchParams(cfg);
      const platforms = cfg.platforms.map(toPlatform);
      if (opts.dryRun) {
        console.log(JSON.stringify({ platforms, params }, null, 2));
        return;
      }
      throw new NotImplementedError('search', 'Fase 1: adaptadores por API');
    });

  program
    .command('export')
    .description('Exporta los datos capturados a ./exports/')
    .addOption(
      new Option('-f, --format <format>', 'formato de salida').choices(['csv', 'json']).default('csv'),
    )
    .option('-o, --out <dir>', 'directorio de salida', 'exports')
    .action(() => {
      throw new NotImplementedError('export', 'Fase 1');
    });

  program
    .command('compare')
    .description('Imprime la vista comparativa "mejor opción familiar" y exporta exports/compare-<fecha>.csv')
    .option('-c, --config <path>', 'archivo de configuración del viaje', DEFAULT_TRIP_CONFIG_PATH)
    .option('-o, --out <dir>', 'directorio de salida', 'exports')
    .action(() => {
      throw new NotImplementedError('compare', 'Fase 4');
    });

  program
    .command('canary')
    .description('Corrida corta por plataforma que verifica la tasa de extracción (> 0,8)')
    .option('-p, --platforms <list>', 'plataformas separadas por coma', parsePlatforms)
    .action(() => {
      throw new NotImplementedError('canary', 'Fase 5');
    });

  return program;
}

/** Ejecuta la CLI y devuelve el exit code (no llama a process.exit). */
export async function run(argv: string[]): Promise<number> {
  const program = createProgram();
  try {
    await program.parseAsync(argv);
    return 0;
  } catch (err) {
    if (err instanceof NotImplementedError) {
      console.error(err.message);
      return EXIT_NOT_IMPLEMENTED;
    }
    if (err instanceof ConfigError) {
      console.error(err.message);
      return EXIT_CONFIG_ERROR;
    }
    getLogger().error({ err }, 'error no controlado');
    return 1;
  } finally {
    await disconnectDb();
  }
}

const isEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  process.exitCode = await run(process.argv);
}
