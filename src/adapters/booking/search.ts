import type { SearchParams } from '../../types.js';

export const BOOKING_ORIGIN = 'https://www.booking.com';

/**
 * URL de búsqueda de Booking (AGENT_BRIEF §9 Fase 2.1): un `age=` por niño,
 * moneda e idioma fijos por corrida.
 */
export function buildBookingSearchUrl(p: SearchParams): string {
  const q = new URLSearchParams({
    ss: p.destination,
    checkin: p.checkIn,
    checkout: p.checkOut,
    group_adults: String(p.adults),
    group_children: String(p.childAges.length),
  });
  for (const age of p.childAges) q.append('age', String(age));
  q.set('no_rooms', '1');
  q.set('selected_currency', p.currency);
  q.set('lang', p.locale.hl);
  return `${BOOKING_ORIGIN}/searchresults.html?${q.toString()}`;
}

/** Respuestas GraphQL internas de Booking: `POST /dml/graphql`. */
export function isBookingGraphql(url: URL, method: string): boolean {
  return method === 'POST' && url.hostname.endsWith('booking.com') && url.pathname.startsWith('/dml/graphql');
}

/** Estado Apollo embebido en el HTML. */
export const BOOKING_EMBEDDED_STATE = { apollo: "script[data-capla-store-data='apollo']" };

/** Link al detalle de una propiedad en la lista de resultados (solo para navegar). */
export const BOOKING_DETAIL_LINK = 'a[data-testid="title-link"]';
