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

## Correr una búsqueda

_(Fase 1)_

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

## Consultar el consumo de cupos (SerpApi / Tripadvisor)

_(Fase 1)_

## Logs

`./logs/viaje-YYYY-MM-DD.log` (JSON, pino) y consola. Los secretos se redactan. Nivel con `LOG_LEVEL`.
