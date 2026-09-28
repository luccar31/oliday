import { describe, expect, it } from 'vitest';
import { CAPTURE_SPECS } from '../../src/capture/platforms.js';
import { runCapture } from '../../src/capture/run.js';

describe('runCapture', () => {
  it('termina en BLOCKED_BY_ROBOTS sin abrir el navegador si robots.txt bloquea la búsqueda', async () => {
    const res = await runCapture({
      spec: CAPTURE_SPECS.booking,
      respectRobots: true,
      robotsFetch: async () => ({ status: 200, text: async () => 'User-agent: *\nDisallow: /searchresults' }),
      params: {
        destination: 'Bariloche',
        checkIn: '2027-01-10',
        checkOut: '2027-01-17',
        adults: 2,
        childAges: [5],
        currency: 'USD',
        locale: { hl: 'es', gl: 'ar' },
      },
    });
    expect(res.status).toBe('BLOCKED_BY_ROBOTS');
    expect(res.payloads).toEqual([]);
    expect(res.manifest.warnings[0]).toMatch(/robots\.txt/);
  });
});
