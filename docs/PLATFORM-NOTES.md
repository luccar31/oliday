# Notas por plataforma

Hallazgos verificados en tráfico real (operaciones GraphQL, hashes, headers, límites). Lo que viene de guías de 2026
y todavía **no** fue verificado está marcado como _(sin verificar)_. Los nombres de operaciones y hashes son internos y
pueden cambiar sin aviso.

> Las APIs de datos (SerpApi, Tripadvisor, Xotelo) quedaron fuera del alcance el 2026-09-28 (ver DECISIONS).

## Booking.com (Fase 2)

- _(sin verificar)_ `POST /dml/graphql` — operaciones `FullSearch`, `AvailabilityCalendar`; header
  `x-booking-csrf-token`; estado Apollo en `script[data-capla-store-data='apollo']`.
- URL de búsqueda: `/searchresults.html?ss&checkin&checkout&group_adults&group_children&age…&no_rooms=1&selected_currency&lang`.
- Link al detalle en resultados: `a[data-testid="title-link"]` _(sin verificar)_.

## Airbnb (Fase 3)

- _(sin verificar)_ `/api/v3/` — `StaysSearch`, `StaysPdpSections`, `PdpAvailabilityCalendar`,
  `StaysPdpReviewsQuery`; persisted queries (sha256) que rotan. Tope ~240-270 resultados por búsqueda.
- URL de búsqueda: `/s/<destino>/homes?query&checkin&checkout&adults&children&infants&currency&locale`
  _(sin verificar: el brief menciona `check_in`/`check_out`; la web actual usa `checkin`/`checkout`)_.
- Estado diferido: `script#data-deferred-state-0` _(sin verificar)_. Link al detalle: `a[href*="/rooms/"]`.
