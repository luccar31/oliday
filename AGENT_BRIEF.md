# AGENT BRIEF — Scraper local de alojamientos (amenities + precios + disponibilidad)

> Este documento es la instrucción de trabajo para el agente. Todas las decisiones ya están tomadas: **no presentes alternativas ni pidas elegir**; ejecutá lo que dice acá. Si algo no está cubierto, elegí la opción más simple que cumpla las reglas de la sección 3 y anotala en `docs/DECISIONS.md`.
>
> **Investigación de origen:** informe "Scraping de alojamientos para un viaje en familia: herramientas gratuitas existentes y guía para construir la tuya (septiembre 2026)", generado en el proyecto "Viaje en familia". Los hechos relevantes están resumidos en la sección 12 para que este brief se entienda solo. Las URLs de las fuentes están en la sección 13.

---

## 1. Objetivo

Construir una herramienta **100% local** (nada en la nube, nada de AWS) que, dado un destino, fechas y composición del grupo, obtenga de varias plataformas:

1. **Alojamientos** (hoteles, apartamentos, casas, cabañas, hostels).
2. **Todos los amenities/beneficios** de cada alojamiento, normalizados a un catálogo común.
3. **Precios** (por noche y total, con moneda, impuestos/tasas si se conocen, política de cancelación, desayuno incluido).
4. **Fechas disponibles** (calendario día a día cuando la plataforma lo permita, y disponibilidad para el rango pedido).
5. **Histórico de precios** (snapshots que nunca se sobreescriben).
6. **Exportación** (CSV/JSON) y una **vista comparativa** entre plataformas.

Caso de uso: planificar un **viaje en familia**. El destino es un **parámetro** (no está fijado). Los precios dependen de las edades de los niños, por eso las edades son parámetros obligatorios.

## 2. Alcance

**Dentro del alcance (en este orden de fases):**

| Fase | Contenido |
|---|---|
| 0 | Andamiaje del proyecto, Postgres local, esquema Prisma, config, CLI, logging |
| 1 | Adaptadores por API: SerpApi Google Hotels, Tripadvisor Content API, Xotelo |
| 2 | Scraper propio de Booking.com |
| 3 | Scraper propio de Airbnb (incluye calendario de disponibilidad) |
| 4 | Normalización, deduplicación entre plataformas, vista comparativa "mejor opción familiar" |
| 5 | Scheduling local, snapshots diarios, alertas locales, canary de extracción |
| 6 | Plataformas extra (solo si los criterios de la sección 10 se cumplen) y fallback Apify (opcional, apagado por defecto) |

**Fuera del alcance (decidido, no implementar):**
- Cualquier despliegue en la nube (AWS, GCP, Vercel, Neon, Supabase, S3, SQS, EventBridge, Fargate, Lambda).
- LiteAPI/Nuitée y APIs de mayoristas (sirven para *vender* reservas, no para comparar).
- Amadeus Self-Service (cerrado el 17/07/2026) y Hotellook/Travelpayouts (API deshabilitada). No los uses ni los menciones como opción.
- Booking.com Demand API (exige ser Managed Affiliate Partner).
- Login, cuentas falsas, resolución de captchas, evasión de paywalls.
- Redistribuir fotos o reseñas de las plataformas (tienen copyright): se guardan solo referencias (URL), no se descargan imágenes.
- Reservar, o cualquier acción que escriba en las plataformas.

## 3. Reglas no negociables

1. **Todo corre local.** Servicios permitidos: Postgres local (Docker), Node local, Chromium local. Servicios externos permitidos únicamente como APIs de datos: SerpApi, Tripadvisor Content API, Xotelo, y opcionalmente Apify.
2. **API primero, scraping último.** Orden de preferencia por fuente: (1) API oficial o SERP API, (2) JSON/GraphQL interno capturado desde un navegador real, (3) parsing del DOM solo como respaldo.
3. **Guardar siempre el JSON crudo** de cada respuesta (columna `jsonb` en la tabla `RawPayload`), para poder re-parsear sin volver a scrapear.
4. **Validar con Zod** cada payload externo. Un campo faltante genera un warning estructurado, no un crash silencioso ni un dato inventado.
5. **Nunca sobreescribir precios:** cada observación es una fila nueva en `PriceSnapshot`.
6. **Moneda y locale fijos** por corrida (`currency`, `hl`, `gl`, `selected_currency`): el precio no puede depender del país del proxy. Guardar siempre la moneda original y convertir solo en la capa de consulta.
7. **Sin login, sin cuentas, sin bypass de captchas.** Si aparece un captcha o un bloqueo: retirar la sesión (`session.retire()`), rotar, reintentar más tarde; después de los reintentos máximos, marcar el job como `BLOCKED` y seguir con el siguiente.
8. **Ritmo bajo:** concurrencia máxima 2 en los adaptadores de navegador, pausa aleatoria de 4 a 8 segundos entre páginas, máximo 4 reintentos por request.
9. **robots.txt:** `RESPECT_ROBOTS=true` por defecto. Si robots.txt bloquea la URL de búsqueda, el adaptador devuelve el estado `BLOCKED_BY_ROBOTS`, lo loguea y el pipeline sigue con las otras fuentes. Cambiar esa variable a `false` es una decisión exclusiva de Lucas, nunca del agente.
10. **Uso personal.** No agregar funciones pensadas para redistribuir datos ni para operación comercial.
11. **El agente no navega estos sitios como agente de IA.** Los Customer Terms de Booking (15/09/2025) prohíben asistentes automatizados de IA que manejen un navegador. Por eso: el código que escribís es un scraper determinista; podés ejecutarlo vía CLI con volumen mínimo (1 búsqueda por plataforma) para validar, pero **no uses herramientas de control de navegador con un LLM** contra Booking, Airbnb ni Google. El desarrollo se apoya en **fixtures** (respuestas guardadas) en `tests/fixtures/`.
12. **No inventar datos.** Si un campo no existe en la fuente, se guarda `null`. Nunca rellenar con estimaciones.
13. **Secretos** solo en `.env` (fuera de git). Nunca en código, logs ni fixtures.

## 4. Stack (decidido)

| Componente | Decisión |
|---|---|
| Lenguaje / runtime | TypeScript estricto, Node.js 22 LTS, gestor `pnpm` |
| Scraping | **Crawlee** (`PlaywrightCrawler`) con **Patchright** (fork de Playwright, Chromium) como launcher |
| Validación | Zod |
| Base de datos | PostgreSQL 16 local en Docker, extensión `pg_trgm` |
| ORM | Prisma (última versión estable) |
| Cola / jobs | `pg-boss` sobre el mismo Postgres (sin Redis, sin servicios extra) |
| Scheduling | `pg-boss` schedules (no `node-cron`) |
| CLI | `commander` |
| Logging | `pino` a consola y a `./logs/` |
| Tests | Vitest |
| Formato / lint | Prettier + ESLint |
| Alertas | Notificación a consola y archivo `./data/alerts.log`; Telegram solo si `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` existen en `.env` |
| Exportación | CSV y JSON a `./exports/` |
| Vista comparativa | Comando CLI que imprime tabla + exporta CSV. **No** construir un frontend web salvo que se pida en el futuro |

No uses `puppeteer-extra-plugin-stealth` (sin releases desde 2023). Si Patchright no es compatible con la versión de Crawlee instalada, pasá el launcher por `launchContext.launcher` y documentá el ajuste en `docs/DECISIONS.md`.

## 5. Estructura del repositorio

```
viaje-alojamientos/
├─ AGENT_BRIEF.md                  # este archivo
├─ README.md
├─ docker-compose.yml              # Postgres 16 local
├─ .env.example
├─ .gitignore                      # incluye .env, data/, logs/, exports/
├─ package.json
├─ tsconfig.json
├─ prisma/
│  ├─ schema.prisma
│  └─ seed/
│     ├─ amenities.json            # catálogo normalizado
│     └─ amenity-aliases.json      # alias por plataforma
├─ trip.config.example.json
├─ src/
│  ├─ cli.ts                       # entrypoint commander
│  ├─ config.ts                    # carga .env + trip.config.json, validado con Zod
│  ├─ db.ts                        # cliente Prisma
│  ├─ logger.ts
│  ├─ queue.ts                     # pg-boss: jobs y schedules
│  ├─ types.ts                     # tipos compartidos
│  ├─ adapters/
│  │  ├─ base.ts                   # interfaz PlatformAdapter
│  │  ├─ serpapi-google-hotels.ts
│  │  ├─ tripadvisor-content.ts
│  │  ├─ xotelo.ts
│  │  ├─ booking/
│  │  │  ├─ index.ts
│  │  │  ├─ search.ts
│  │  │  ├─ detail.ts
│  │  │  ├─ calendar.ts
│  │  │  └─ schemas.ts
│  │  └─ airbnb/
│  │     ├─ index.ts
│  │     ├─ search.ts
│  │     ├─ detail.ts
│  │     ├─ calendar.ts
│  │     ├─ persisted-queries.ts   # captura y refresco de hashes
│  │     └─ schemas.ts
│  ├─ crawl/
│  │  ├─ browser.ts                # fábrica Crawlee + Patchright + SessionPool
│  │  ├─ pacing.ts                 # pausas aleatorias 4-8 s
│  │  └─ block-detect.ts           # detección de captcha/bloqueo
│  ├─ normalize/
│  │  ├─ amenities.ts              # mapeo raw -> catálogo vía AmenityAlias
│  │  ├─ dedupe.ts                 # geo + pg_trgm
│  │  ├─ price.ts                  # nightly/total, impuestos, moneda
│  │  └─ rating.ts                 # escala 0-10
│  ├─ storage/
│  │  ├─ raw.ts                    # guarda RawPayload
│  │  └─ snapshots.ts
│  ├─ query/
│  │  ├─ compare.ts                # vista comparativa
│  │  └─ family-score.ts
│  ├─ export/
│  │  ├─ csv.ts
│  │  └─ json.ts
│  └─ health/
│     └─ canary.ts
├─ tests/
│  ├─ fixtures/                    # respuestas guardadas por plataforma
│  ├─ adapters/
│  ├─ normalize/
│  └─ contract/                    # tests de contrato contra fixtures
├─ data/                           # (git-ignored) alerts.log, dumps opcionales
├─ exports/                        # (git-ignored)
├─ logs/                           # (git-ignored)
└─ docs/
   ├─ DECISIONS.md                 # decisiones y desvíos, con fecha
   ├─ RUNBOOK.md                   # cómo correr, qué hacer si algo falla
   └─ PLATFORM-NOTES.md            # hallazgos por plataforma (operaciones GraphQL, hashes, límites)
```

## 6. Configuración

### 6.1 `.env.example`

```
DATABASE_URL=postgresql://viaje:viaje@localhost:5432/viaje?schema=public
SERPAPI_KEY=
TRIPADVISOR_API_KEY=
APIFY_TOKEN=
PROXY_URL=
RESPECT_ROBOTS=true
LOG_LEVEL=info
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

`PROXY_URL` vacío = sin proxy (IP residencial de casa). Solo se completa si aparecen bloqueos sostenidos.

### 6.2 `trip.config.example.json`

```json
{
  "destination": "REEMPLAZAR",
  "dateOptions": [
    { "checkIn": "2027-01-10", "checkOut": "2027-01-17" }
  ],
  "adults": 2,
  "childAges": [],
  "currency": "USD",
  "locale": { "hl": "es", "gl": "ar" },
  "mustHaveAmenities": [],
  "niceToHaveAmenities": ["pool", "kitchen", "parking", "crib", "washing_machine", "air_conditioning", "breakfast_included"],
  "propertyTypes": ["HOTEL", "APARTMENT", "HOUSE", "CABIN"],
  "maxTotalPrice": null,
  "platforms": ["google_hotels", "tripadvisor", "xotelo", "booking", "airbnb"]
}
```

- `dateOptions` acepta varias combinaciones (cada una es un job independiente).
- `childAges` es obligatorio y puede ser `[]` si no hay niños; con niños, siempre se envían las edades a cada plataforma (cambian el precio).
- Validar todo con Zod en `config.ts`; fechas en formato `YYYY-MM-DD`, `checkOut` posterior a `checkIn`.

### 6.3 `docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16
    container_name: viaje-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: viaje
      POSTGRES_PASSWORD: viaje
      POSTGRES_DB: viaje
    ports:
      - "5432:5432"
    volumes:
      - viaje_pgdata:/var/lib/postgresql/data
      - ./prisma/init.sql:/docker-entrypoint-initdb.d/init.sql
volumes:
  viaje_pgdata:
```

`prisma/init.sql` contiene: `CREATE EXTENSION IF NOT EXISTS pg_trgm;`

## 7. Esquema de datos (Prisma)

Copiá este esquema en `prisma/schema.prisma` (con `generator client` y `datasource db { provider = "postgresql" url = env("DATABASE_URL") }`). Cambios respecto al informe: no hay S3; el JSON crudo vive en `RawPayload` (`jsonb`), y se agregan `Job` lógico vía pg-boss (no requiere tabla propia).

> El esquema completo está en [`prisma/schema.prisma`](prisma/schema.prisma) (copiado tal cual; los ajustes que exige Prisma 7 están en `docs/DECISIONS.md`).

Reglas de normalización:
1. Moneda original siempre guardada; conversión solo en consultas.
2. Distinguir precio con y sin impuestos/tasas (`taxesIncluded`, `fees`). Airbnb suma limpieza y servicio; Google Hotels puede exponer valores antes de impuestos.
3. Rating normalizado a 0-10 en `rating10`.
4. Deduplicación entre plataformas: mismo alojamiento si distancia ≤ 100 m **y** similitud de nombre (`pg_trgm`, función `similarity`) ≥ 0,55. Los `Listing` sin coordenadas no se deduplican automáticamente.
5. Amenities: `rawAmenities` se conserva tal cual; el mapeo al catálogo se hace por `AmenityAlias`. Los labels sin alias se registran en un archivo `data/unmapped-amenities.json` (plataforma + label + conteo) para completarlos luego. **Nunca** descartar un amenity sin mapear: queda en `rawAmenities`.

Seed inicial del catálogo (`prisma/seed/amenities.json`), como mínimo estos códigos con etiqueta en español y categoría: `wifi`, `pool`, `pool_kids`, `kitchen`, `kitchenette`, `washing_machine`, `dryer`, `air_conditioning`, `heating`, `parking`, `parking_free`, `breakfast_included`, `crib`, `high_chair`, `family_rooms`, `playground`, `kids_club`, `elevator`, `accessible`, `pets_allowed`, `tv`, `balcony`, `garden`, `bbq`, `beach_access`, `gym`, `spa`, `restaurant`, `bar`, `room_service`, `airport_shuttle`, `smoke_free`, `24h_reception`, `fireplace`, `workspace`, `hot_tub`, `sea_view`, `mountain_view`, `free_cancellation`. Marcá `isFamily=true` en: `pool_kids`, `crib`, `high_chair`, `family_rooms`, `playground`, `kids_club`, `kitchen`, `washing_machine`, `parking`, `breakfast_included`, `pool`. Los alias por plataforma se cargan en `amenity-aliases.json` (español e inglés) y se amplían a medida que aparecen labels reales.

## 8. Contrato de los adaptadores

```ts
export interface SearchParams {
  destination: string;
  checkIn: string;   // YYYY-MM-DD
  checkOut: string;
  adults: number;
  childAges: number[];
  currency: string;
  locale: { hl: string; gl: string };
}

export interface AdapterResult {
  status: 'OK' | 'PARTIAL' | 'BLOCKED' | 'BLOCKED_BY_ROBOTS' | 'FAILED';
  listings: NormalizedListing[];       // ya validados con Zod
  snapshots: NormalizedSnapshot[];
  calendar?: NormalizedAvailabilityDay[];
  rawPayloads: { kind: string; url?: string; body: unknown }[];
  warnings: string[];
}

export interface PlatformAdapter {
  platform: Platform;
  search(params: SearchParams): Promise<AdapterResult>;
  detail?(listingExternalId: string, params: SearchParams): Promise<AdapterResult>;
  calendar?(listingExternalId: string, months: number): Promise<AdapterResult>;
}
```

Cada adaptador: (a) guarda el crudo, (b) valida con Zod, (c) normaliza, (d) devuelve el resultado; la persistencia la hace el orquestador, no el adaptador.

## 9. Fases de trabajo con criterios de aceptación

Trabajá en orden. **No avances a la fase siguiente hasta cumplir los criterios de la actual.** Un commit por fase como mínimo, con mensaje descriptivo. Al cerrar cada fase, actualizá `docs/RUNBOOK.md` y `docs/DECISIONS.md`.

### Fase 0 — Andamiaje
Tareas:
1. Inicializar el repo, `pnpm`, TypeScript estricto, ESLint, Prettier, Vitest.
2. `docker-compose.yml` + `prisma/init.sql`; levantar Postgres; `prisma migrate dev`.
3. `config.ts` con Zod (`.env` + `trip.config.json`), `logger.ts`, `db.ts`.
4. Seed de amenities y alias iniciales.
5. CLI con los comandos `db:seed`, `search`, `export`, `compare`, `canary` (los que aún no tengan lógica devuelven "no implementado" con exit code distinto de 0).
6. `README.md` con instalación local paso a paso.

Aceptación: `docker compose up -d`, `pnpm install`, `pnpm prisma migrate dev`, `pnpm cli db:seed` funcionan en limpio; `pnpm test` pasa; `pnpm cli search --help` lista opciones.

### Fase 1 — Adaptadores por API
**1.1 SerpApi Google Hotels** (`engine=google_hotels`):
- Parámetros: `q` (destino), `check_in_date`, `check_out_date`, `adults`, `children`, `children_ages` (coma-separadas), `currency`, `gl`, `hl`, `api_key`.
- Extraer por propiedad: `name`, `type`, `property_token`, `gps_coordinates`, `rate_per_night`, `total_rate`, `prices` por proveedor, `amenities`, `excluded_amenities`, `overall_rating`, `reviews`, `check_in_time`, `nearby_places`.
- Paginación con `next_page_token` hasta agotar resultados o llegar al tope configurado (`maxResultsPerSearch`, default 60).
- Detalle por `property_token` **solo** para los N mejores candidatos (`detailTopN`, default 20) por costo de cupo.
- **Presupuesto de cupo:** el plan gratuito da 250 búsquedas exitosas/mes y las respuestas cacheadas (1 h) no cuentan. Implementar un contador local en Postgres (`SearchRun` con plataforma `GOOGLE_HOTELS`) y **abortar con error claro** si el mes en curso alcanza 240 búsquedas. Loguear el consumo restante en cada corrida.
- Cada proveedor en `prices` genera un `PriceSnapshot` con `provider` completo.

**1.2 Tripadvisor Content API:**
- Solo enriquecimiento (rating, reseñas resumidas, ubicación, amenities parciales). **No trae precios.**
- Límite: 5.000 llamadas/mes. Contador local; abortar al llegar a 4.800.
- Cumplir la atribución requerida en las exportaciones (columna `attribution`).

**1.3 Xotelo:**
- Endpoints `/list` (por ubicación) y `/rates` (tarifas por noche por OTA).
- Envolver el adaptador en una **verificación de salud** al inicio de cada corrida: si el servicio no responde, devolver `FAILED` con warning y continuar con el resto. El proyecto es chico y su continuidad no está garantizada.

Aceptación Fase 1:
- Tests con fixtures reales (guardá al menos una respuesta real de cada API en `tests/fixtures/`).
- `pnpm cli search --platforms google_hotels` persiste `Listing`, `PriceSnapshot` y `RawPayload`.
- El contador de cupo funciona y el aborto por cupo está testeado.
- Exportación CSV/JSON de lo capturado.

### Fase 2 — Scraper de Booking.com
Estrategia (en este orden):
1. Construir la URL de búsqueda: `https://www.booking.com/searchresults.html?ss=<destino>&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&group_adults=<n>&group_children=<n>&age=<edad>&age=<edad>&no_rooms=1&selected_currency=<MONEDA>` (un `age=` por niño).
2. Abrir con `PlaywrightCrawler` (Patchright), `SessionPool` activo, concurrencia ≤ 2.
3. Interceptar con `page.on('response')` las respuestas `POST /dml/graphql` y guardar el JSON crudo (`kind: booking.graphql.<operationName>`).
4. Leer también el estado Apollo embebido: `script[data-capla-store-data='apollo']` (`kind: booking.apollo`).
5. Paginación: `offset` en bloques de 25 sobre la operación de búsqueda (`FullSearch`), con headers `x-booking-csrf-token`, `origin`, `referer` tomados de la sesión del navegador. Solo reproducir por HTTP si el navegador ya obtuvo un token válido; si no, paginar navegando.
6. Detalle de cada propiedad candidata: facilities completas agrupadas, políticas y tipos de habitación.
7. Calendario: operación `AvailabilityCalendar` (precio y disponibilidad por día). El horizonte depende de la propiedad (hasta ~16 meses según lo que publique el anfitrión).
8. Solo como último recurso, parsear DOM con selectores `data-testid`.

Los nombres de operaciones GraphQL vienen de guías de 2026 y **pueden haber cambiado**: la primera tarea de la fase es verificar en el tráfico real cuáles son los nombres y la forma de los payloads, y documentarlo en `docs/PLATFORM-NOTES.md`. Guardá esas respuestas como fixtures y desarrollá el parser contra ellas.

Anti-bot:
- Detección de bloqueo en `block-detect.ts` (texto tipo "captcha", "are you a robot", HTTP 403/429, página vacía inesperada) → `session.retire()` y reintento con rotación.
- Pausa aleatoria de 4 a 8 s entre páginas.
- Locale y moneda fijos.
- Sin proxy por defecto; si `PROXY_URL` está definido, usarlo vía `ProxyConfiguration`.

Aceptación Fase 2:
- Una búsqueda real (destino de `trip.config.json`, con edades de niños) persiste ≥ 20 `Listing` con amenities completos y `PriceSnapshot` con total y noche.
- Un detalle por propiedad guarda todas las facilities en `rawAmenities`.
- El calendario se guarda en `AvailabilityDay` para al menos 3 propiedades.
- Tests de contrato contra fixtures pasan; un cambio en el payload hace fallar el test con un mensaje claro (campo faltante).
- Corrida con bloqueo simulado termina en `BLOCKED` sin colgarse.

### Fase 3 — Scraper de Airbnb
Estrategia:
1. URL de búsqueda con fechas y huéspedes (`check_in`, `check_out`, `adults`, `children`). **Sin fechas en la URL no hay precio.**
2. El HTML de búsqueda o de un listing trae título, fotos y amenities en un estado diferido, pero **el precio llega por GraphQL** (`/api/v3/`). Operaciones documentadas en guías de 2026: `StaysSearch` (búsqueda), `StaysPdpSections` (detalle), `PdpAvailabilityCalendar` (12 meses de disponibilidad), `StaysPdpReviewsQuery` (reseñas; solo resumen, no guardar texto completo de reseñas).
3. Airbnb usa *persisted queries* (hash sha256 en `extensions.persistedQuery`) que rotan. Implementar `persisted-queries.ts`: capturar el hash real desde el tráfico del navegador, cachearlo en Postgres con fecha, y refrescarlo cuando una consulta devuelva error de hash desconocido. Nunca hardcodear hashes.
4. Tope de resultados por búsqueda (~240-270): para cubrir un destino entero, **dividir el mapa en celdas (bounding boxes)** y recorrer cada celda; deduplicar por `externalId`.
5. Concurrencia 1, navegador real (Patchright), **proxy residencial requerido si hay bloqueos** (las IPs de datacenter se bloquean rápido; ver sección 12). Sin bloqueos, no usar proxy.
6. Selectores DOM solo como respaldo y siempre por `data-testid` (las clases CSS están hasheadas).

Aceptación Fase 3:
- Búsqueda con fechas persiste ≥ 20 listings con precio total y noche, incluyendo limpieza/servicio en `fees`.
- Calendario de 12 meses guardado en `AvailabilityDay` para ≥ 3 listings.
- Refresco de hashes probado con un test que simula un hash caducado.
- División por celdas probada con un mapa de prueba.

### Fase 4 — Normalización, deduplicación y comparación
Tareas:
1. `normalize/amenities.ts`: mapeo por alias; completar `PropertyAmenity`; generar `data/unmapped-amenities.json`.
2. `normalize/dedupe.ts`: agrupar `Listing` de distintas plataformas en un `Property` (regla de la sección 7.4).
3. `normalize/price.ts`: unificar noche/total, impuestos/tasas, moneda.
4. `normalize/rating.ts`: escala 0-10.
5. `query/compare.ts`: vista comparativa por `Property`: una fila por propiedad con el mejor precio total por plataforma, diferencia porcentual entre plataformas, amenities, rating10, cancelación gratis, desayuno.
6. `query/family-score.ts`: **regla decidida** — filtro duro por `mustHaveAmenities` y `maxTotalPrice` si existen; luego orden ascendente por precio total; el desempate es la cantidad de amenities de `niceToHaveAmenities` presentes (mayor primero) y luego `rating10` (mayor primero). Sin ponderaciones opacas.
7. Comandos CLI: `compare` (imprime tabla y exporta CSV), `export --format csv|json`.

Aceptación Fase 4:
- Tests de dedupe con casos: mismo hotel en dos plataformas (se une), dos hoteles distintos cercanos (no se une), sin coordenadas (no se une).
- `pnpm cli compare` imprime la tabla y genera `exports/compare-<fecha>.csv`.
- La exportación incluye columnas: propiedad, plataforma(s), precio noche, precio total, moneda, impuestos incluidos, cancelación gratis, desayuno, rating10, amenities normalizados, URLs por plataforma, fecha de captura, atribución cuando corresponda.

### Fase 5 — Scheduling local, histórico y salud
Tareas:
1. `queue.ts` con `pg-boss`: un job = (plataforma, destino, checkIn, checkOut, adultos, edades, moneda). Reintentos con backoff; estado `BLOCKED` no reintenta de inmediato.
2. Schedules configurables por CLI (`schedule:add`, `schedule:list`, `schedule:remove`); por defecto un snapshot diario a la hora indicada en la config.
3. Worker local (`pnpm cli worker`) que consume la cola.
4. Alertas: bajada de precio total de ≥ 10 % respecto del snapshot anterior de la misma propiedad y mismas fechas → línea en `data/alerts.log` y, si hay credenciales, mensaje de Telegram.
5. `health/canary.ts`: corrida corta por plataforma que verifica que la tasa de extracción (listings con precio / listings totales) supere 0,8; si cae, alerta y marca la plataforma como degradada.
6. Retención: los `RawPayload` con más de 60 días se comprimen o se borran con un comando `maintenance:prune` (documentado; nunca corre automáticamente sin schedule explícito).

Aceptación Fase 5:
- Un schedule diario crea snapshots nuevos sin sobreescribir los anteriores.
- El worker sobrevive al reinicio (los jobs pendientes siguen en Postgres).
- La alerta de bajada de precio se dispara en un test con datos sintéticos.
- El canary detecta una caída simulada de extracción.

### Fase 6 — Extras (condicionales)
Solo si Lucas lo pide después de la Fase 5 **y** se cumple el criterio previo:
- **Expedia/Hotels.com/Vrbo, Agoda, Despegar/Almundo:** antes de escribir código, comparar en una corrida real si Google Hotels (Fase 1) ya muestra sus tarifas para el destino. Si las muestra, no construir el scraper. Si no, hacer ingeniería inversa del tráfico (Network → Fetch/XHR) siguiendo el mismo patrón de las Fases 2 y 3, con fixtures y tests de contrato. Expedia usa GraphQL con persisted queries POST (mismo patrón que Airbnb). No hay referencias públicas mantenidas para Despegar/Almundo.
- **Fallback Apify (apagado por defecto):** adaptador que llame a actores de Apify para Booking/Airbnb cuando el scraper propio esté `BLOCKED` de forma sostenida. Requiere `APIFY_TOKEN`; el crédito gratis es de $5/mes y no se acumula; algunos actores limitan el plan gratuito a 10 resultados de preview. Debe activarse solo con la bandera `enableApifyFallback=true` en la config.

## 10. Manejo de errores y estados

| Situación | Comportamiento |
|---|---|
| Cupo mensual de SerpApi o Tripadvisor por agotarse | Abortar la fuente con error claro y loguear consumo; el resto del pipeline sigue |
| Zod falla en un campo opcional | Warning + `null`; el listing se guarda |
| Zod falla en un campo obligatorio (id, nombre) | Se descarta ese elemento, se cuenta en `stats.discarded`, la corrida queda `PARTIAL` |
| Captcha / 403 / 429 | Retirar sesión, rotar, reintentar; agotados los reintentos → `BLOCKED` |
| robots.txt bloquea (con `RESPECT_ROBOTS=true`) | `BLOCKED_BY_ROBOTS`, seguir con otras fuentes |
| Hash persistido caducado (Airbnb) | Recapturar hash y reintentar una vez |
| Servicio externo caído (Xotelo) | `FAILED` con warning, el pipeline continúa |

Toda corrida deja un `SearchRun` con `status`, `stats` (listings, snapshots, descartados, warnings, duración) y sus `RawPayload`.

## 11. Testing y calidad

1. **Fixtures:** cada adaptador tiene al menos una respuesta real guardada por tipo de payload. Sanitizar secretos y datos personales de anfitriones antes de commitear.
2. **Tests de contrato:** parsean fixtures y comprueban campos obligatorios; si el fixture cambia y falta un campo, el test falla con el nombre del campo.
3. **Tests unitarios:** normalización de precios, ratings, amenities, dedupe, scoring, contadores de cupo, cálculo de alertas.
4. **Sin llamadas de red en tests.** Los tests nunca golpean plataformas reales ni APIs de pago.
5. **Cobertura mínima** de los módulos `normalize/` y `query/`: 80 %.
6. `pnpm lint` y `pnpm typecheck` limpios antes de cada commit.

## 12. Hechos de la investigación que condicionan el diseño

Resumen de los hallazgos del informe (fecha de referencia: septiembre de 2026). Verificá los límites de planes antes de depender de ellos, porque cambian seguido.

- **Ninguna herramienta gratuita cubre amenities + precio por fecha + disponibilidad en varias plataformas.** SerpApi Google Hotels es lo más cercano (250 búsquedas/mes gratis, respuestas cacheadas 1 h gratis; incluye amenities, precio por noche y total, precios por proveedor, con fechas, adultos y edades de niños).
- **Muertos o cerrados:** Amadeus Self-Service (17/07/2026), Hotellook/Travelpayouts (API deshabilitada, programa cerrado el 20/10/2025), Booking Demand API (solo Managed Affiliate Partners). Airbnb no tiene API pública de búsqueda ni precios. Google Hotels APIs son para partners.
- **Apify:** $5/mes de crédito gratis; un actor de Booking cobra ~$2 por 1.000 hoteles básicos y ~$5 por 1.000 con detalle. Calidad y mantenimiento variables.
- **Xotelo:** gratis, financiado con donaciones; entrega tarifas por OTA vía TripAdvisor pero **sin amenities**; continuidad incierta (un registro WHOIS de terceros mostraba vencimiento del dominio el 11/06/2026 y no se pudo confirmar la renovación).
- **Tripadvisor Content API:** 5.000 llamadas/mes gratis, sin precios (la Hotel Pricing API es solo para partners), exige atribución.
- **Datos buenos viajan en JSON/GraphQL, no en HTML:** Booking usa `POST /dml/graphql` (`FullSearch`, `AvailabilityCalendar`) con `x-booking-csrf-token` y estado Apollo embebido (`script[data-capla-store-data='apollo']`); Airbnb entrega el precio por GraphQL (`StaysPdpSections`, `PdpAvailabilityCalendar`, `StaysPdpReviewsQuery`) solo si la URL trae fechas, con persisted queries cuyo hash rota.
- **Stealth:** `puppeteer-extra-plugin-stealth` está obsoleto (sin releases desde 2023). Patchright (fork de Playwright, solo Chromium) publicó la v1.61.1 el 23/06/2026. Contra Akamai/DataDome de gama alta pesa más la calidad del proxy residencial y el comportamiento que el parche.
- **IPs de datacenter** (AWS, etc.) se bloquean rápido en Airbnb y Booking. Por eso el diseño local con IP residencial de casa es una ventaja.
- **Riesgo legal:** en Ryanair v. Booking.com el veredicto de $5.000 bajo la CFAA fue revocado en enero de 2025 y está en apelación ante el Tercer Circuito. Scrapear datos públicos sin login viola los ToS (riesgo contractual) pero la tendencia en EE. UU. es que no es "hacking" bajo la CFAA; el uso de cuentas o datos falsos sí agrava el riesgo. Booking (15/09/2025) prohíbe agentes de IA no autorizados. En la UE/LatAm aplican además leyes de datos personales (nombres de anfitriones y reseñas). Esto no es asesoramiento legal.
- **Nombres de operaciones GraphQL y hashes son internos** y pueden cambiar sin aviso.

## 13. Fuentes (del informe)

- Amadeus Self-Service shutdown: https://www.tripgic.com/playbook/amadeus-api-shutdown-migration/ · https://ignav.com/docs/amadeus-self-service-shutdown
- Cierre de Hotellook: https://support.travelpayouts.com/hc/en-us/articles/29534131568530-FAQ-on-the-closure-of-Hotellook
- Booking Demand API (partner-gated): https://vorplabs.com/agent-tools/booking-demand-api
- SerpApi Google Hotels: https://serpapi.com/google-hotels-api · https://serpapi.com/blog/scraping-google-hotels/
- Apify (plan gratis): https://use-apify.com/docs/what-is-apify/apify-free-plan · actor Booking: https://apify.com/parseforge/booking-com-scraper
- Xotelo: https://xotelo.com/
- Tripadvisor Content API: https://developer-tripadvisor.com/content-api/
- Scraping de Booking (GraphQL interno): https://substack.thewebscraping.club/p/scraping-booking-using-apiss · https://scrapfly.io/blog/posts/how-to-scrape-bookingcom
- Scraping de Airbnb: https://scrapfly.io/blog/posts/how-to-scrape-airbnb · https://dev.to/agenthustler/how-to-scrape-airbnb-in-2026-listings-prices-and-property-data-2ebf
- Persisted queries (Crawlee): https://crawlee.dev/blog/graphql-persisted-query
- Crawlee SessionPool: https://crawlee.dev/js/docs/3.16/guides/session-management
- Stealth / Patchright: https://clawbrowser.ai/blog/puppeteer-extra-stealth-is-dead/ · https://dataresearchtools.com/patchright-vs-rebrowser-patches-stealth-playwright-patches-compared-2026/
- Ryanair v. Booking.com: https://www.rcfp.org/briefs-comments/ryanair-v-booking-com/ · https://blog.ericgoldman.org/archives/2024/08/ryanair-v-booking-cfaa-trial-ends-with-strangest-possible-outcome-guest-blog-post.htm
- Inside Airbnb (dataset, solo referencia): https://insideairbnb.com/
- Repos de referencia (Python, solo para entender payloads): `scrapfly/scrapfly-scrapers`, `johnbalvin/pyairbnb`. No hay scrapers TypeScript mantenidos para estas plataformas; `airbnbapijs` y `hotels-scraper-js` están abandonados.

## 14. Definición de terminado (global)

El trabajo se considera completo cuando:
1. Las fases 0 a 5 cumplen sus criterios de aceptación.
2. Desde un clon limpio, siguiendo solo el `README.md`, se levanta todo en local y una búsqueda para el destino de `trip.config.json` produce `exports/compare-<fecha>.csv`.
3. Ninguna referencia a servicios en la nube queda en el código ni en la documentación (salvo las APIs de datos permitidas en la regla 3.1).
4. `docs/DECISIONS.md` lista cada desvío respecto de este brief, con fecha y motivo.
5. `docs/PLATFORM-NOTES.md` documenta las operaciones GraphQL reales encontradas, los límites de resultados y los headers necesarios.
6. `docs/RUNBOOK.md` explica: cómo correr una búsqueda, cómo agendar, qué hacer ante `BLOCKED`, cómo completar alias de amenities, cómo podar `RawPayload`, cómo consultar el consumo de cupos.
7. `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan.

## 15. Orden de arranque para el agente (primeras acciones)

1. Leer este brief completo.
2. Crear el repo con la estructura de la sección 5.
3. Ejecutar la Fase 0 completa y verificar sus criterios.
4. Pedir a Lucas únicamente estos datos, en un solo mensaje, antes de la Fase 1: (a) `SERPAPI_KEY`, (b) `TRIPADVISOR_API_KEY`, (c) el destino, las fechas candidatas, la cantidad de adultos y las edades de los niños para `trip.config.json`. No pidas nada más.
5. Continuar con las fases en orden, sin saltear criterios de aceptación.
