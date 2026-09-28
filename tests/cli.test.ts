import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EXIT_CONFIG_ERROR,
  EXIT_NOT_IMPLEMENTED,
  createProgram,
  resolveTripConfig,
  run,
} from '../src/cli.js';

let dir: string;
let cfgPath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viaje-cli-'));
  cfgPath = path.join(dir, 'trip.config.json');
  const example = JSON.parse(fs.readFileSync('trip.config.example.json', 'utf8'));
  fs.writeFileSync(cfgPath, JSON.stringify({ ...example, destination: 'Mar del Plata', childAges: [5] }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const argv = (...args: string[]) => ['node', 'cli', ...args];

describe('CLI', () => {
  it('registra los comandos de la Fase 0', () => {
    const names = createProgram().commands.map((c) => c.name());
    expect(names).toEqual(
      expect.arrayContaining(['db:seed', 'search', 'capture', 'export', 'compare', 'canary']),
    );
  });

  it.each([['export'], ['compare'], ['canary']])(
    '"%s" devuelve exit code de no implementado',
    async (cmd) => {
      expect(await run(argv(cmd))).toBe(EXIT_NOT_IMPLEMENTED);
    },
  );

  it('search valida la config y devuelve no implementado (Fase 1)', async () => {
    expect(await run(argv('search', '--config', cfgPath))).toBe(EXIT_NOT_IMPLEMENTED);
  });

  it('search --dry-run imprime los parámetros', async () => {
    expect(await run(argv('search', '--config', cfgPath, '--dry-run'))).toBe(0);
    const out = JSON.parse(String(vi.mocked(console.log).mock.calls[0]?.[0]));
    expect(out.params[0].childAges).toEqual([5]);
    expect(out.platforms).toEqual(['BOOKING', 'AIRBNB']);
  });

  it('search con config inexistente devuelve error de configuración', async () => {
    expect(await run(argv('search', '--config', path.join(dir, 'nope.json')))).toBe(EXIT_CONFIG_ERROR);
  });

  it('los overrides de CLI se revalidan con Zod', () => {
    const cfg = resolveTripConfig({
      config: cfgPath,
      checkIn: '2027-03-01',
      checkOut: '2027-03-05',
      childAges: [2, 7],
      platforms: ['google_hotels'],
    });
    expect(cfg.dateOptions).toEqual([{ checkIn: '2027-03-01', checkOut: '2027-03-05' }]);
    expect(cfg.childAges).toEqual([2, 7]);
    expect(() => resolveTripConfig({ config: cfgPath, checkIn: '2027-03-01' })).toThrow(/juntos/);
    expect(() =>
      resolveTripConfig({ config: cfgPath, checkIn: '2027-03-05', checkOut: '2027-03-01' }),
    ).toThrow(/posterior/);
  });
});
