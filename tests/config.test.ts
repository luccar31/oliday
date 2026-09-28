import { describe, expect, it } from 'vitest';
import { ConfigError, EnvSchema, buildSearchParams, parseTripConfig, toPlatform } from '../src/config.js';

const valid = {
  destination: 'Bariloche, Argentina',
  dateOptions: [
    { checkIn: '2027-01-10', checkOut: '2027-01-17' },
    { checkIn: '2027-02-01', checkOut: '2027-02-08' },
  ],
  adults: 2,
  childAges: [4, 9],
  currency: 'USD',
  locale: { hl: 'es', gl: 'ar' },
  mustHaveAmenities: ['kitchen'],
  niceToHaveAmenities: ['pool', 'crib'],
  propertyTypes: ['HOTEL', 'APARTMENT'],
  maxTotalPrice: null,
  platforms: ['google_hotels', 'booking'],
};

describe('parseTripConfig', () => {
  it('acepta una config válida y completa defaults', () => {
    const cfg = parseTripConfig(valid);
    expect(cfg.maxResultsPerSearch).toBe(60);
    expect(cfg.detailTopN).toBe(20);
    expect(cfg.enableApifyFallback).toBe(false);
    expect(cfg.snapshotTime).toBe('07:00');
  });

  it('rechaza checkOut anterior o igual a checkIn', () => {
    expect(() =>
      parseTripConfig({ ...valid, dateOptions: [{ checkIn: '2027-01-10', checkOut: '2027-01-10' }] }),
    ).toThrow(/checkOut debe ser posterior/);
  });

  it('rechaza fechas mal formadas o inexistentes', () => {
    expect(() =>
      parseTripConfig({ ...valid, dateOptions: [{ checkIn: '10/01/2027', checkOut: '2027-01-17' }] }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      parseTripConfig({ ...valid, dateOptions: [{ checkIn: '2027-02-30', checkOut: '2027-03-02' }] }),
    ).toThrow(/fecha inexistente/);
  });

  it('exige childAges (puede ser [])', () => {
    const { childAges: _omit, ...rest } = valid;
    expect(() => parseTripConfig(rest)).toThrow(ConfigError);
    expect(parseTripConfig({ ...valid, childAges: [] }).childAges).toEqual([]);
    expect(() => parseTripConfig({ ...valid, childAges: [18] })).toThrow(ConfigError);
  });

  it('rechaza el destino placeholder y amenities fuera del catálogo', () => {
    expect(() => parseTripConfig({ ...valid, destination: 'REEMPLAZAR' })).toThrow(/destino/);
    expect(() => parseTripConfig({ ...valid, niceToHaveAmenities: ['jetpack'] })).toThrow(/jetpack/);
  });

  it('rechaza plataformas y monedas inválidas', () => {
    expect(() => parseTripConfig({ ...valid, platforms: ['hotellook'] })).toThrow(ConfigError);
    expect(() => parseTripConfig({ ...valid, currency: 'usd' })).toThrow(/ISO 4217/);
  });
});

describe('buildSearchParams', () => {
  it('genera un SearchParams por cada combinación de fechas, con edades', () => {
    const params = buildSearchParams(parseTripConfig(valid));
    expect(params).toHaveLength(2);
    expect(params[0]).toEqual({
      destination: 'Bariloche, Argentina',
      checkIn: '2027-01-10',
      checkOut: '2027-01-17',
      adults: 2,
      childAges: [4, 9],
      currency: 'USD',
      locale: { hl: 'es', gl: 'ar' },
    });
  });

  it('mapea claves de plataforma al enum', () => {
    expect(toPlatform('google_hotels')).toBe('GOOGLE_HOTELS');
  });
});

describe('EnvSchema', () => {
  it('RESPECT_ROBOTS es true por defecto y los secretos vacíos quedan undefined', () => {
    const env = EnvSchema.parse({ SERPAPI_KEY: '', RESPECT_ROBOTS: '' });
    expect(env.RESPECT_ROBOTS).toBe(true);
    expect(env.SERPAPI_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toMatch(/^postgresql:\/\//);
  });

  it('acepta RESPECT_ROBOTS=false explícito y rechaza valores ambiguos', () => {
    expect(EnvSchema.parse({ RESPECT_ROBOTS: 'false' }).RESPECT_ROBOTS).toBe(false);
    expect(() => EnvSchema.parse({ RESPECT_ROBOTS: 'no' })).toThrow();
  });
});
