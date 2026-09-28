import { describe, expect, it, vi } from 'vitest';
import { politePause, randomDelayMs } from '../../src/crawl/pacing.js';

describe('pacing', () => {
  it('la pausa está entre 4 y 8 segundos', () => {
    expect(randomDelayMs(undefined, undefined, () => 0)).toBe(4000);
    expect(randomDelayMs(undefined, undefined, () => 0.999999)).toBe(8000);
    for (let i = 0; i < 100; i++) {
      const ms = randomDelayMs();
      expect(ms).toBeGreaterThanOrEqual(4000);
      expect(ms).toBeLessThanOrEqual(8000);
    }
  });

  it('politePause usa el sleep inyectado', async () => {
    const sleepFn = vi.fn(async () => {});
    const ms = await politePause({ rng: () => 0.5, sleepFn });
    expect(ms).toBe(6000);
    expect(sleepFn).toHaveBeenCalledWith(6000);
  });
});
