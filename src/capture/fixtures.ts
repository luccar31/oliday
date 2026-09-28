import fs from 'node:fs';
import path from 'node:path';
import { sanitizePayload } from '../crawl/sanitize.js';
import type { RawPayloadInput } from '../types.js';

export interface CaptureManifest {
  platform: string;
  capturedAt: string;
  status: string;
  searchUrl: string;
  pages: { label: string; url: string; status: number | null }[];
  kinds: Record<string, number>;
  warnings: string[];
}

export interface WriteCaptureOptions {
  platform: string;
  payloads: RawPayloadInput[];
  manifest: CaptureManifest;
  /** Carpeta de capturas crudas (git-ignored). */
  capturesDir?: string;
  /** Carpeta de fixtures commiteables (sanitizados). */
  fixturesDir?: string;
  now?: Date;
}

const safeName = (kind: string) => kind.replace(/[^A-Za-z0-9._-]+/g, '_');

/**
 * Guarda una captura:
 * - crudo completo en `data/captures/<platform>/<timestamp>/` (local, no se versiona);
 * - copia **sanitizada** en `tests/fixtures/<platform>/` para desarrollar los parsers.
 */
export function writeCapture(opts: WriteCaptureOptions): {
  rawDir: string;
  fixtureDir: string;
  files: string[];
} {
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
  const rawDir = path.resolve(opts.capturesDir ?? 'data/captures', opts.platform, stamp);
  const fixtureDir = path.resolve(opts.fixturesDir ?? 'tests/fixtures', opts.platform);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(fixtureDir, { recursive: true });

  const seen = new Map<string, number>();
  const files: string[] = [];
  opts.payloads.forEach((p, i) => {
    const base = safeName(p.kind);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const name = n === 1 ? `${base}.json` : `${base}.${n}.json`;
    fs.writeFileSync(
      path.join(rawDir, `${String(i).padStart(2, '0')}-${name}`),
      JSON.stringify({ kind: p.kind, url: p.url ?? null, body: p.body }, null, 2),
    );
    const fixturePath = path.join(fixtureDir, name);
    fs.writeFileSync(
      fixturePath,
      JSON.stringify(sanitizePayload({ kind: p.kind, url: p.url ?? null, body: p.body }), null, 2) + '\n',
    );
    files.push(fixturePath);
  });

  const manifest = JSON.stringify(opts.manifest, null, 2) + '\n';
  fs.writeFileSync(path.join(rawDir, 'manifest.json'), manifest);
  fs.writeFileSync(path.join(fixtureDir, 'manifest.json'), manifest);
  return { rawDir, fixtureDir, files };
}
