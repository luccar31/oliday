import { expandAliases, loadAliasFile, loadAmenityCatalog } from './catalog.js';
import { getDb } from './db.js';
import { getLogger } from './logger.js';

/**
 * Carga (idempotente) el catálogo de amenities y sus alias por plataforma.
 * Nunca borra alias existentes: los agregados a mano en la DB se conservan.
 */
export async function seedAmenities(): Promise<{ amenities: number; aliases: number }> {
  const db = getDb();
  const log = getLogger();
  const catalog = loadAmenityCatalog();
  const aliasRows = expandAliases(loadAliasFile(), catalog);

  const idByCode = new Map<string, string>();
  for (const a of catalog) {
    const row = await db.amenity.upsert({
      where: { code: a.code },
      create: a,
      update: { labelEs: a.labelEs, category: a.category, isFamily: a.isFamily },
      select: { id: true },
    });
    idByCode.set(a.code, row.id);
  }

  await db.$transaction(
    aliasRows.map((r) =>
      db.amenityAlias.upsert({
        where: { platform_rawLabel: { platform: r.platform, rawLabel: r.rawLabel } },
        create: { platform: r.platform, rawLabel: r.rawLabel, amenityId: idByCode.get(r.code)! },
        update: { amenityId: idByCode.get(r.code)! },
      }),
    ),
  );

  log.info({ amenities: catalog.length, aliases: aliasRows.length }, 'seed de amenities completado');
  return { amenities: catalog.length, aliases: aliasRows.length };
}
