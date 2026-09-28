# RUNBOOK

Operación local de la herramienta. Las secciones de fases no implementadas se completan al cerrar cada fase.

## Levantar todo

```bash
docker compose up -d          # Postgres 16 (contenedor viaje-db, puerto 5432)
pnpm install
pnpm prisma migrate dev       # aplica migraciones pendientes
pnpm cli db:seed              # catálogo de amenities + alias (idempotente)
```

Comprobar la base: `docker exec -it viaje-db psql -U viaje -d viaje -c '\dt'`.

Si el puerto 5432 está ocupado por otro Postgres local, detenerlo o cambiar el mapeo de puertos en
`docker-compose.yml` y el puerto en `DATABASE_URL`.

## Validar la configuración del viaje

```bash
pnpm cli search --dry-run
pnpm cli search --dry-run --check-in 2027-01-10 --check-out 2027-01-17 --child-ages 4,9
```

Imprime las plataformas y los parámetros de cada búsqueda (una por combinación de fechas). Errores de configuración
salen con exit code `3` y el detalle de Zod.

## Capturar fixtures reales (una vez por plataforma)

Se corre **en tu máquina** (IP de casa, sin VPN). Hace 1 búsqueda con el destino y la primera combinación de fechas de
`trip.config.json`, y abre el detalle del primer resultado. Tarda menos de un minuto.

```bash
pnpm exec patchright install chromium   # solo la primera vez
pnpm cli capture -p booking
pnpm cli capture -p airbnb
# opcional: --headful para ver la ventana del navegador, --no-detail para solo la búsqueda
```

Salida:

- `data/captures/<plataforma>/<fecha>/`: respuestas crudas completas (no se versiona).
- `tests/fixtures/<plataforma>/`: copia sanitizada + `manifest.json` (estado, páginas, tipos de payload capturados).

Revisá que `manifest.json` diga `"status": "OK"` y que `kinds` tenga varios `*.graphql.*`. Después:

```bash
git add tests/fixtures && git commit -m "fixtures: captura real de booking y airbnb" && git push
```

Si termina en `BLOCKED_BY_ROBOTS`, robots.txt del sitio no permite esa URL: el comando se detiene ahí. Cambiar
`RESPECT_ROBOTS` es decisión tuya (ver `.env`). Si termina en `BLOCKED`, esperá unas horas y reintentá; no insistas en
seguida.

## Correr una búsqueda

_(Fase 2)_

## Agendar snapshots

_(Fase 5)_

## Qué hacer ante `BLOCKED` / `BLOCKED_BY_ROBOTS`

_(Fases 2-3)_

## Completar alias de amenities

1. Revisar `data/unmapped-amenities.json` (plataforma + label + conteo; se genera desde la Fase 4).
2. Agregar el label en `prisma/seed/amenity-aliases.json` bajo el código correcto, en `"*"` si el texto es
   inequívoco en todas las plataformas o bajo la plataforma (`"BOOKING"`, `"AIRBNB"`, …) si es específico.
3. Si hace falta un código nuevo, agregarlo en `prisma/seed/amenities.json`.
4. `pnpm test` (verifica que no haya labels ambiguos ni códigos inexistentes) y `pnpm cli db:seed`.

## Podar `RawPayload`

_(Fase 5: `maintenance:prune`)_

## Logs

`./logs/viaje-YYYY-MM-DD.log` (JSON, pino) y consola. Los secretos se redactan. Nivel con `LOG_LEVEL`.
