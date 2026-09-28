import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { PLATFORMS, type Platform } from './types.js';

const SEED_DIR = path.resolve(import.meta.dirname, '..', 'prisma', 'seed');

export const AmenityEntrySchema = z.object({
  code: z.string().regex(/^[a-z0-9_]+$/, 'code debe ser snake_case'),
  labelEs: z.string().min(1),
  category: z.string().min(1),
  isFamily: z.boolean(),
});
export type AmenityEntry = z.infer<typeof AmenityEntrySchema>;

const PlatformKeySchema = z.union([z.literal('*'), z.enum(PLATFORMS)]);

export const AliasFileSchema = z.object({
  $comment: z.string().optional(),
  aliases: z.record(z.string(), z.partialRecord(PlatformKeySchema, z.array(z.string().min(1)))),
});

export interface AliasRow {
  platform: Platform;
  rawLabel: string;
  code: string;
}

export function loadAmenityCatalog(dir = SEED_DIR): AmenityEntry[] {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'amenities.json'), 'utf8'));
  return z.array(AmenityEntrySchema).parse(raw);
}

export function loadAliasFile(dir = SEED_DIR): z.infer<typeof AliasFileSchema> {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'amenity-aliases.json'), 'utf8'));
  return AliasFileSchema.parse(raw);
}

/**
 * Normaliza un label de amenity para compararlo: minúsculas, espacios colapsados,
 * apóstrofos y guiones tipográficos unificados. Se guarda así en AmenityAlias.rawLabel.
 */
export function normalizeAmenityLabel(label: string): string {
  return label
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Expande el archivo de alias a filas (plataforma, label normalizado, código).
 * "*" se expande a todas las plataformas; un alias específico de plataforma
 * gana sobre uno de "*". Lanza error si un label apunta a dos códigos distintos
 * en la misma plataforma o si referencia un código inexistente.
 */
export function expandAliases(file: z.infer<typeof AliasFileSchema>, catalog: AmenityEntry[]): AliasRow[] {
  const codes = new Set(catalog.map((a) => a.code));
  const specific = new Map<string, AliasRow>();
  const wildcard = new Map<string, AliasRow>();

  for (const [code, byPlatform] of Object.entries(file.aliases)) {
    if (!codes.has(code)) throw new Error(`amenity-aliases.json: código desconocido "${code}"`);
    for (const [platformKey, labels] of Object.entries(byPlatform)) {
      const targets: Platform[] = platformKey === '*' ? [...PLATFORMS] : [platformKey as Platform];
      const bucket = platformKey === '*' ? wildcard : specific;
      for (const label of labels ?? []) {
        const rawLabel = normalizeAmenityLabel(label);
        for (const platform of targets) {
          const key = `${platform}\u0000${rawLabel}`;
          const prev = bucket.get(key);
          if (prev && prev.code !== code) {
            throw new Error(
              `amenity-aliases.json: "${label}" (${platform}) apunta a "${prev.code}" y a "${code}"`,
            );
          }
          bucket.set(key, { platform, rawLabel, code });
        }
      }
    }
  }

  const merged = new Map(wildcard);
  for (const [key, row] of specific) merged.set(key, row);
  return [...merged.values()];
}
