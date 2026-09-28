import { describe, expect, it } from 'vitest';
import { expandAliases, loadAliasFile, loadAmenityCatalog, normalizeAmenityLabel } from '../src/catalog.js';

const REQUIRED = [
  'wifi',
  'pool',
  'pool_kids',
  'kitchen',
  'kitchenette',
  'washing_machine',
  'dryer',
  'air_conditioning',
  'heating',
  'parking',
  'parking_free',
  'breakfast_included',
  'crib',
  'high_chair',
  'family_rooms',
  'playground',
  'kids_club',
  'elevator',
  'accessible',
  'pets_allowed',
  'tv',
  'balcony',
  'garden',
  'bbq',
  'beach_access',
  'gym',
  'spa',
  'restaurant',
  'bar',
  'room_service',
  'airport_shuttle',
  'smoke_free',
  '24h_reception',
  'fireplace',
  'workspace',
  'hot_tub',
  'sea_view',
  'mountain_view',
  'free_cancellation',
];
const FAMILY = [
  'pool_kids',
  'crib',
  'high_chair',
  'family_rooms',
  'playground',
  'kids_club',
  'kitchen',
  'washing_machine',
  'parking',
  'breakfast_included',
  'pool',
];

describe('catálogo de amenities', () => {
  const catalog = loadAmenityCatalog();

  it('incluye todos los códigos mínimos, sin duplicados', () => {
    const codes = catalog.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of REQUIRED) expect(codes).toContain(c);
  });

  it('marca isFamily exactamente en los códigos familiares', () => {
    const family = catalog
      .filter((a) => a.isFamily)
      .map((a) => a.code)
      .sort();
    expect(family).toEqual([...FAMILY].sort());
  });

  it('los alias referencian códigos existentes y cubren todo el catálogo', () => {
    const rows = expandAliases(loadAliasFile(), catalog);
    const covered = new Set(rows.map((r) => r.code));
    for (const a of catalog) expect(covered, `sin alias: ${a.code}`).toContain(a.code);
  });

  it('los alias específicos de plataforma ganan sobre "*"', () => {
    const rows = expandAliases(
      { aliases: { parking: { '*': ['Parking'] }, parking_free: { BOOKING: ['parking'] } } },
      catalog,
    );
    expect(rows.find((r) => r.platform === 'BOOKING' && r.rawLabel === 'parking')?.code).toBe('parking_free');
    expect(rows.find((r) => r.platform === 'AIRBNB' && r.rawLabel === 'parking')?.code).toBe('parking');
  });

  it('falla con un código desconocido o un label ambiguo', () => {
    expect(() => expandAliases({ aliases: { jetpack: { '*': ['Jetpack'] } } }, catalog)).toThrow(/jetpack/);
    expect(() =>
      expandAliases({ aliases: { pool: { '*': ['Pileta'] }, pool_kids: { '*': ['pileta'] } } }, catalog),
    ).toThrow(/Pileta|pileta/);
  });
});

describe('normalizeAmenityLabel', () => {
  it('unifica mayúsculas, espacios, apóstrofos y guiones', () => {
    expect(normalizeAmenityLabel('  Kids’   Club ')).toBe("kids' club");
    expect(normalizeAmenityLabel('Beach access – Beachfront')).toBe('beach access - beachfront');
  });
});
