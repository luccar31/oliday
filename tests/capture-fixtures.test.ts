import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeCapture } from '../src/capture/fixtures.js';

describe('writeCapture', () => {
  it('guarda crudo + fixture sanitizado, numerando kinds repetidos', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'viaje-cap-'));
    const res = writeCapture({
      platform: 'booking',
      capturesDir: path.join(dir, 'captures'),
      fixturesDir: path.join(dir, 'fixtures'),
      now: new Date('2026-09-28T10:00:00Z'),
      payloads: [
        {
          kind: 'booking.graphql.FullSearch',
          url: 'https://b.test/dml/graphql',
          body: { csrfToken: 'x', n: 1 },
        },
        { kind: 'booking.graphql.FullSearch', body: { n: 2 } },
      ],
      manifest: {
        platform: 'booking',
        capturedAt: '2026-09-28T10:00:00Z',
        status: 'OK',
        searchUrl: 'https://b.test/s',
        pages: [],
        kinds: { 'booking.graphql.FullSearch': 2 },
        warnings: [],
      },
    });
    expect(res.files.map((f) => path.basename(f))).toEqual([
      'booking.graphql.FullSearch.json',
      'booking.graphql.FullSearch.2.json',
    ]);
    const fixture = JSON.parse(fs.readFileSync(res.files[0]!, 'utf8'));
    expect(fixture.body).toEqual({ csrfToken: '[REDACTED]', n: 1 });
    const raw = fs.readdirSync(res.rawDir).sort();
    expect(raw).toContain('manifest.json');
    const rawFirst = JSON.parse(
      fs.readFileSync(path.join(res.rawDir, '00-booking.graphql.FullSearch.json'), 'utf8'),
    );
    expect(rawFirst.body.csrfToken).toBe('x');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
