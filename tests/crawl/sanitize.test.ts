import { describe, expect, it } from 'vitest';
import { REDACTED, sanitizePayload } from '../../src/crawl/sanitize.js';

describe('sanitizePayload', () => {
  it('redacta secretos y datos personales, conserva datos del alojamiento', () => {
    const out = sanitizePayload({
      csrfToken: 'abc',
      listing: {
        name: 'Cabaña del Lago',
        host: { firstName: 'Ana', hostName: 'Ana P.', avatarUrl: 'https://x/y.jpg', isSuperhost: true },
        reviews: [{ comments: 'Excelente', rating: 5, reviewerName: 'Juan' }],
        contact: 'escribir a ana@example.com',
        price: { amount: 120, currency: 'USD' },
      },
    });
    expect(out).toEqual({
      csrfToken: REDACTED,
      listing: {
        name: 'Cabaña del Lago',
        host: { firstName: REDACTED, hostName: REDACTED, avatarUrl: REDACTED, isSuperhost: true },
        reviews: [{ comments: REDACTED, rating: 5, reviewerName: REDACTED }],
        contact: `escribir a ${REDACTED}`,
        price: { amount: 120, currency: 'USD' },
      },
    });
  });
});
