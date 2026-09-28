# Notas por plataforma

Hallazgos verificados en tráfico real (operaciones GraphQL, hashes, headers, límites). Lo que viene de guías de 2026
y todavía **no** fue verificado está marcado como _(sin verificar)_. Los nombres de operaciones y hashes son internos y
pueden cambiar sin aviso.

## SerpApi — Google Hotels (Fase 1)

- `engine=google_hotels`; parámetros `q`, `check_in_date`, `check_out_date`, `adults`, `children`, `children_ages`,
  `currency`, `gl`, `hl`, `api_key`. Paginación con `next_page_token`. Detalle por `property_token`.
- Plan gratuito: 250 búsquedas exitosas/mes; respuestas cacheadas (1 h) no cuentan. Tope local: 240.

## Tripadvisor Content API (Fase 1)

- Solo enriquecimiento, sin precios. 5.000 llamadas/mes; tope local 4.800. Requiere atribución.

## Xotelo (Fase 1)

- `/list` y `/rates`. Sin amenities. Continuidad incierta → health check al inicio de cada corrida.

## Booking.com (Fase 2)

- _(sin verificar)_ `POST /dml/graphql` — operaciones `FullSearch`, `AvailabilityCalendar`; header
  `x-booking-csrf-token`; estado Apollo en `script[data-capla-store-data='apollo']`.

## Airbnb (Fase 3)

- _(sin verificar)_ `/api/v3/` — `StaysSearch`, `StaysPdpSections`, `PdpAvailabilityCalendar`,
  `StaysPdpReviewsQuery`; persisted queries (sha256) que rotan. Tope ~240-270 resultados por búsqueda.
