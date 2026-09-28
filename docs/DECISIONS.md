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

## Cambio de alcance: solo scraping

- **2026-09-28 — Lucas decidió no usar APIs de datos** (no tiene claves y el objetivo es scrapear). Consecuencias:
  - La **Fase 1 (SerpApi Google Hotels, Tripadvisor Content API, Xotelo) queda descartada**, igual que el fallback Apify
    de la Fase 6. No hay contadores de cupo ni columna de atribución de Tripadvisor.
  - `SERPAPI_KEY`, `TRIPADVISOR_API_KEY` y `APIFY_TOKEN` salen de `.env.example` (el esquema de `.env` todavía los
    acepta como opcionales, sin uso).
  - `platforms` por defecto en `trip.config.example.json`: `["booking", "airbnb"]`.
  - Se pierde la cobertura "multi-OTA" que daba Google Hotels vía SerpApi. Si hace falta, la alternativa sin APIs es
    un scraper directo de Google Hotels (mismo patrón que Booking/Airbnb); queda como posible Fase 6.
- **2026-09-28 — Nueva "Fase 1b": infraestructura de crawling + modo `capture`.** El entorno donde trabaja el agente no
  llega a booking.com / airbnb.com (proxy de red), y de todas formas la regla 11 exige desarrollar contra fixtures.
  Flujo: Lucas corre `pnpm cli capture -p booking` (y `-p airbnb`) **en su máquina** (IP residencial), que hace
  1 búsqueda + 1 detalle, guarda el crudo en `data/captures/` (local) y una copia **sanitizada** en
  `tests/fixtures/<plataforma>/`; esos fixtures se commitean y los parsers de las Fases 2 y 3 se escriben contra ellos.
- **2026-09-28 — Sanitización de fixtures** (`src/crawl/sanitize.ts`): se reemplazan por `[REDACTED]` claves con pinta
  de secreto (csrf, token, api_key, cookie, session…) y datos personales (nombres de anfitriones/autores, avatares,
  texto de reseñas, emails). Nunca se guardan headers de request/response. `RawPayload` en Postgres guarda el crudo
  completo porque la base es local.
- **2026-09-28 — robots.txt:** 2xx → se aplican las reglas; 4xx → todo permitido; 5xx o error de red → bloqueado
  (conservador). Se evalúa con el user-agent `viaje-alojamientos` (cae en el grupo `*`) y también antes de abrir el
  detalle.
- **2026-09-28 — Detección de bloqueo sobre el texto visible** (`innerText`), no sobre el HTML, para no confundir
  scripts como `recaptcha.js` con un captcha real. Ante bloqueo: `session.retire()`, pausa de 4-8 s y reintento
  (máx. 4, los de Crawlee); agotados → `BLOCKED`.
- **2026-09-28 — Patchright 1.63 + Crawlee 3.18:** Patchright se pasa por `launchContext.launcher` (cast de tipos,
  misma API que Playwright). `useFingerprints: false` porque Patchright recomienda no alterar UA/headers.
  Se agregó `BROWSER_EXECUTABLE_PATH` (opcional) para usar otro Chromium/Chrome.
- **2026-09-28 — Airbnb no recibe edades exactas**: la URL lleva `children` (≥ 2 años) e `infants` (< 2 años),
  calculados desde `childAges`. Booking sí recibe un `age=` por niño.
