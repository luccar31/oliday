# viaje-alojamientos

Herramienta **100 % local** para planificar un viaje en familia: dado un destino, fechas y composición del grupo
(adultos + edades de los niños), obtiene alojamientos de varias plataformas con sus **amenities** normalizados,
**precios** (noche y total), **disponibilidad** e **histórico de precios**, y los exporta a CSV/JSON con una vista
comparativa.

Todo corre en tu máquina: PostgreSQL en Docker, Node.js y Chromium locales. **Solo scraping, sin APIs de terceros ni
claves** (decisión del 2026-09-28, ver `docs/DECISIONS.md`). Uso personal.

> Instrucciones de trabajo completas: [`AGENT_BRIEF.md`](AGENT_BRIEF.md). Operación diaria:
> [`docs/RUNBOOK.md`](docs/RUNBOOK.md). Desvíos y decisiones: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Estado

| Fase | Contenido                                          | Estado    |
| ---- | -------------------------------------------------- | --------- |
| 0    | Andamiaje, Postgres, esquema, config, CLI, logging | ✅        |
| 1    | SerpApi Google Hotels, Tripadvisor, Xotelo         | pendiente |
| 2    | Scraper Booking.com                                | pendiente |
| 3    | Scraper Airbnb                                     | pendiente |
| 4    | Normalización, dedupe, comparación                 | pendiente |
| 5    | Scheduling, snapshots, alertas, canary             | pendiente |

## Requisitos

- Node.js 22 LTS (`.nvmrc`) y [pnpm](https://pnpm.io/) 10 (`corepack enable` lo activa).
- Docker con Docker Compose (para PostgreSQL 16).

## Instalación local (paso a paso)

```bash
# 1. Clonar e instalar dependencias (genera también el cliente Prisma)
git clone <este-repo> viaje-alojamientos && cd viaje-alojamientos
corepack enable
pnpm install

# 2. Variables de entorno (no hace falta ninguna clave)
cp .env.example .env

# 2b. Navegador para el scraper (Chromium parcheado de Patchright)
pnpm exec patchright install chromium

# 3. Levantar PostgreSQL 16 local (crea la extensión pg_trgm)
docker compose up -d

# 4. Crear las tablas y cargar el catálogo de amenities
pnpm prisma migrate dev
pnpm cli db:seed

# 5. Configurar el viaje
cp trip.config.example.json trip.config.json
#    editar destino, fechas, adultos y edades de los niños

# 6. Verificar
pnpm test
pnpm cli search --dry-run      # valida la config e imprime los parámetros de búsqueda
pnpm cli search --help
```

## Configuración

### `.env`

| Variable                                 | Uso                                                             |
| ---------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                           | Postgres local (por defecto el de `docker-compose.yml`)         |
| `SERPAPI_KEY`                            | SerpApi Google Hotels (Fase 1)                                  |
| `TRIPADVISOR_API_KEY`                    | Tripadvisor Content API (Fase 1)                                |
| `APIFY_TOKEN`                            | Fallback Apify opcional (Fase 6, apagado por defecto)           |
| `PROXY_URL`                              | Vacío = sin proxy. Solo si hay bloqueos sostenidos              |
| `RESPECT_ROBOTS`                         | `true` por defecto. Cambiarlo es decisión exclusiva del usuario |
| `LOG_LEVEL`                              | `info` por defecto                                              |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Alertas por Telegram (opcional)                                 |

`.env` nunca se commitea.

### `trip.config.json`

Ver `trip.config.example.json`. Campos principales: `destination`, `dateOptions` (una o más combinaciones
`checkIn`/`checkOut`, cada una es una búsqueda independiente), `adults`, `childAges` (**obligatorio**, `[]` si no hay
niños), `currency`, `locale`, `mustHaveAmenities`, `niceToHaveAmenities`, `propertyTypes`, `maxTotalPrice`,
`platforms`. Los códigos de amenities válidos están en `prisma/seed/amenities.json`.

Opcionales: `maxResultsPerSearch` (60), `detailTopN` (20), `enableApifyFallback` (false), `snapshotTime` ("07:00"),
`timezone` ("America/Argentina/Buenos_Aires").

## Comandos

```bash
pnpm cli db:seed                 # catálogo de amenities + alias (idempotente)
pnpm cli search [opciones]       # búsqueda (ver --help)
pnpm cli capture -p booking      # captura mínima (1 búsqueda + 1 detalle) → tests/fixtures/booking/
pnpm cli export --format csv     # exportar a ./exports/
pnpm cli compare                 # vista comparativa + exports/compare-<fecha>.csv
pnpm cli canary                  # verificación de salud de extracción

pnpm test | pnpm lint | pnpm typecheck | pnpm format
```

Exit codes: `2` comando aún no implementado, `3` error de configuración, `4` la fuente terminó en `BLOCKED`,
`BLOCKED_BY_ROBOTS` o `FAILED`.

## Estructura

```
prisma/        esquema, migraciones, seed del catálogo de amenities
src/           cli, config, db, logger, adapters/, crawl/, normalize/, storage/, query/, export/, health/
tests/         tests unitarios y de contrato (fixtures en tests/fixtures/, sin red)
docs/          DECISIONS.md, RUNBOOK.md, PLATFORM-NOTES.md
data/ logs/ exports/   (git-ignored) alertas, logs y exportaciones
```
