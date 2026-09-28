import type { SearchParams } from '../../types.js';

export const AIRBNB_ORIGIN = 'https://www.airbnb.com';

/** Edad por debajo de la cual Airbnb cuenta al niño como "infant" (no como "children"). */
export const AIRBNB_INFANT_MAX_AGE = 1;

/**
 * URL de búsqueda de Airbnb con fechas y huéspedes (sin fechas no hay precio).
 * Airbnb no recibe edades exactas: separa niños (2-12+) de bebés (< 2).
 */
export function buildAirbnbSearchUrl(p: SearchParams): string {
  const infants = p.childAges.filter((a) => a <= AIRBNB_INFANT_MAX_AGE).length;
  const children = p.childAges.length - infants;
  const q = new URLSearchParams({
    query: p.destination,
    checkin: p.checkIn,
    checkout: p.checkOut,
    adults: String(p.adults),
    children: String(children),
    infants: String(infants),
    currency: p.currency,
    locale: p.locale.hl,
  });
  return `${AIRBNB_ORIGIN}/s/${encodeURIComponent(p.destination)}/homes?${q.toString()}`;
}

/** GraphQL interno: `/api/v3/<Operacion>/<hash>?operationName=...`. */
export function isAirbnbGraphql(url: URL): boolean {
  return url.hostname.endsWith('airbnb.com') && url.pathname.startsWith('/api/v3/');
}

/** Operación GraphQL desde la URL (`/api/v3/StaysSearch/<sha256>`). */
export function airbnbOperationFromUrl(url: URL): string {
  return url.searchParams.get('operationName') ?? url.pathname.split('/')[3] ?? 'unknown';
}

/** Hash de persisted query presente en la URL (`/api/v3/<op>/<sha256>`), si lo hay. */
export function airbnbHashFromUrl(url: URL): string | null {
  const seg = url.pathname.split('/')[4];
  return seg && /^[a-f0-9]{64}$/.test(seg) ? seg : null;
}

/** Estado diferido embebido en el HTML (título, fotos, amenities). */
export const AIRBNB_EMBEDDED_STATE = { deferred: 'script#data-deferred-state-0' };

export const AIRBNB_DETAIL_LINK = 'a[href*="/rooms/"]';
