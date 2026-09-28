import { describe, expect, it, vi } from 'vitest';
import { RobotsChecker, type FetchLike } from '../../src/crawl/robots.js';

const robotsTxt = `
User-agent: *
Disallow: /searchresults
Allow: /hotel/
`;

const fetchWith = (status: number, body = ''): FetchLike =>
  vi.fn(async () => ({ status, text: async () => body }));

describe('RobotsChecker', () => {
  it('bloquea lo que robots.txt prohíbe y permite lo demás', async () => {
    const r = new RobotsChecker(true, fetchWith(200, robotsTxt));
    expect((await r.check('https://x.test/searchresults.html?ss=a')).allowed).toBe(false);
    expect((await r.check('https://x.test/hotel/ar/foo.html')).allowed).toBe(true);
  });

  it('cachea robots.txt por origen', async () => {
    const f = fetchWith(200, robotsTxt);
    const r = new RobotsChecker(true, f);
    await r.check('https://x.test/a');
    await r.check('https://x.test/b');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('4xx = todo permitido; 5xx o error de red = bloqueado', async () => {
    expect((await new RobotsChecker(true, fetchWith(404)).check('https://x.test/a')).allowed).toBe(true);
    expect((await new RobotsChecker(true, fetchWith(503)).check('https://x.test/a')).allowed).toBe(false);
    const failing: FetchLike = async () => {
      throw new Error('ECONNRESET');
    };
    expect((await new RobotsChecker(true, failing).check('https://x.test/a')).allowed).toBe(false);
  });

  it('con RESPECT_ROBOTS=false no consulta robots.txt', async () => {
    const f = fetchWith(200, robotsTxt);
    const res = await new RobotsChecker(false, f).check('https://x.test/searchresults.html');
    expect(res.allowed).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});
