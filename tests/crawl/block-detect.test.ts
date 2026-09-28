import { describe, expect, it } from 'vitest';
import { detectBlock } from '../../src/crawl/block-detect.js';

describe('detectBlock', () => {
  it.each([
    [{ status: 403, body: 'ok' }, 'HTTP 403'],
    [{ status: 429, body: 'ok' }, 'HTTP 429'],
    [{ status: 200, body: 'Please complete the CAPTCHA' }, 'captcha'],
    [{ status: 200, body: 'Are you a robot?' }, 'are you a robot'],
    [{ status: 200, body: '   ' }, 'página vacía inesperada'],
    [{ status: 200, body: 'x', url: 'https://www.google.com/sorry/index' }, 'redirección a /sorry/index'],
  ])('%o → bloqueado (%s)', (input, reason) => {
    expect(detectBlock(input)).toEqual({ blocked: true, reason });
  });

  it('una página normal no está bloqueada', () => {
    expect(detectBlock({ status: 200, body: 'Hoteles en Bariloche: 312 alojamientos encontrados' })).toEqual({
      blocked: false,
      reason: null,
    });
  });
});
