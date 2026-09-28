# Decisiones y desvíos respecto de AGENT_BRIEF.md

Formato: fecha — decisión — motivo.

## Fase 0

- **2026-09-28 — El proyecto vive en la raíz del repo `oliday`**, no en una subcarpeta `viaje-alojamientos/`.
  Motivo: el repo está dedicado a esta herramienta; `package.json` se llama `viaje-alojamientos`.
- **2026-09-28 — Prisma 7.10.0** (no el tag `latest` de npm, que hoy apunta a `8.0.0-rc.17`, una release candidate).
  Consecuencias propias de Prisma 7, que desvían del texto de la §7:
  - La URL de conexión va en `prisma.config.ts` (`datasource.url`), no en `schema.prisma`: Prisma 7 ya no admite
    `url = env(...)` en el bloque `datasource`.
  - Generador `prisma-client` con salida en `src/generated/prisma/` (git-ignored; se regenera en `postinstall`).
  - El cliente usa el driver adapter `@prisma/adapter-pg` (obligatorio en Prisma 7).
  - El seed no corre automáticamente con `migrate dev`: se ejecuta con `pnpm cli db:seed`
    (también configurado en `prisma.config.ts` → `migrations.seed` para `prisma db seed`).
- **2026-09-28 — `pg_trgm` se crea también en la migración inicial** (además de `prisma/init.sql`).
  Motivo: `prisma migrate dev` usa una shadow database que no pasa por `init.sql`, y así la extensión existe
  aunque Postgres no se haya creado con docker-compose. `pg_trgm` es una extensión _trusted_ (PG ≥ 13), por lo que
  el dueño de la base puede crearla sin superusuario.
- **2026-09-28 — TypeScript 6.0.x** (no 7.0). Motivo: `typescript-eslint` 8 soporta `typescript <6.1`.
- **2026-09-28 — Zod 4**, `commander` 14, `pino` 10, `vitest` 5, ESLint 10 (flat config).
- **2026-09-28 — Formato de `amenity-aliases.json`:** `{ aliases: { <código>: { "*": [...], "<PLATFORM>": [...] } } }`.
  `"*"` se expande a todas las plataformas; un alias específico de plataforma gana sobre `"*"`.
  Los labels se guardan en `AmenityAlias.rawLabel` **normalizados** (minúsculas, espacios colapsados, apóstrofos y
  guiones tipográficos unificados; ver `normalizeAmenityLabel` en `src/catalog.ts`) y la búsqueda de alias en la
  Fase 4 usa la misma normalización. `Listing.rawAmenities` conserva siempre el texto original.
  El seed es idempotente y nunca borra alias existentes.
- **2026-09-28 — Campos opcionales extra en `trip.config.json`** (con default, validados con Zod):
  `maxResultsPerSearch` (60), `detailTopN` (20), `enableApifyFallback` (false), `snapshotTime` ("07:00", hora del
  snapshot diario de la Fase 5) y `timezone` ("America/Argentina/Buenos_Aires", para los schedules de pg-boss).
  `destination: "REEMPLAZAR"` se rechaza explícitamente. Los códigos de `mustHaveAmenities`/`niceToHaveAmenities` se
  validan contra el catálogo.
- **2026-09-28 — Exit codes de la CLI:** `2` = comando aún no implementado, `3` = error de configuración, `1` = error
  no controlado. `search --dry-run` valida la config (con overrides de CLI) e imprime los parámetros sin consultar
  ninguna fuente.
- **2026-09-28 — Verificación de la Fase 0 en el entorno del agente:** el contenedor de desarrollo no tiene daemon de
  Docker, así que `docker compose up -d` no pudo ejecutarse acá. Se verificó el resto (`pnpm install`,
  `prisma migrate dev`, `pnpm cli db:seed`, `pnpm test`, `lint`, `typecheck`) contra un PostgreSQL 16 nativo con las
  mismas credenciales (`viaje`/`viaje`, base `viaje`). En la máquina de Lucas el camino es `docker compose up -d`.
