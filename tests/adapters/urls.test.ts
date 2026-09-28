import { describe, expect, it } from 'vitest';
import { buildBookingSearchUrl } from '../../src/adapters/booking/search.js';
import {
  airbnbHashFromUrl,
  airbnbOperationFromUrl,
  buildAirbnbSearchUrl,
} from '../../src/adapters/airbnb/search.js';
import type { SearchParams } from '../../src/types.js';

const params: SearchParams = {
  destination: 'San Carlos de Bariloche',
  checkIn: '2027-01-10',
  checkOut: '2027-01-17',
  adults: 2,
  childAges: [1, 4, 9],
  currency: 'USD',
  locale: { hl: 'es', gl: 'ar' },
};

describe('buildBookingSearchUrl', () => {
  it('incluye fechas, huéspedes, un age= por niño, moneda e idioma', () => {
    const url = new URL(buildBookingSearchUrl(params));
    expect(url.pathname).toBe('/searchresults.html');
    expect(url.searchParams.get('ss')).toBe('San Carlos de Bariloche');
    expect(url.searchParams.get('checkin')).toBe('2027-01-10');
    expect(url.searchParams.get('checkout')).toBe('2027-01-17');
    expect(url.searchParams.get('group_adults')).toBe('2');
    expect(url.searchParams.get('group_children')).toBe('3');
    expect(url.searchParams.getAll('age')).toEqual(['1', '4', '9']);
    expect(url.searchParams.get('no_rooms')).toBe('1');
    expect(url.searchParams.get('selected_currency')).toBe('USD');
  });

  it('sin niños no manda age=', () => {
    const url = new URL(buildBookingSearchUrl({ ...params, childAges: [] }));
    expect(url.searchParams.get('group_children')).toBe('0');
    expect(url.searchParams.getAll('age')).toEqual([]);
  });
});

describe('buildAirbnbSearchUrl', () => {
  it('siempre lleva fechas y separa bebés (< 2) de niños', () => {
    const url = new URL(buildAirbnbSearchUrl(params));
    expect(url.pathname).toBe('/s/San%20Carlos%20de%20Bariloche/homes');
    expect(url.searchParams.get('checkin')).toBe('2027-01-10');
    expect(url.searchParams.get('checkout')).toBe('2027-01-17');
    expect(url.searchParams.get('adults')).toBe('2');
    expect(url.searchParams.get('children')).toBe('2');
    expect(url.searchParams.get('infants')).toBe('1');
    expect(url.searchParams.get('currency')).toBe('USD');
  });

  it('extrae operación y hash de persisted query de la URL', () => {
    const hash = 'a'.repeat(64);
    const u = new URL(
      `https://www.airbnb.com/api/v3/StaysSearch/${hash}?operationName=StaysSearch&locale=es`,
    );
    expect(airbnbOperationFromUrl(u)).toBe('StaysSearch');
    expect(airbnbHashFromUrl(u)).toBe(hash);
    expect(airbnbHashFromUrl(new URL('https://www.airbnb.com/api/v3/StaysSearch'))).toBeNull();
  });
});
