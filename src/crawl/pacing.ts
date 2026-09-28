/** Pausa aleatoria entre páginas (regla 8): 4 a 8 segundos por defecto. */
export const PACING_MIN_MS = 4000;
export const PACING_MAX_MS = 8000;

export function randomDelayMs(
  min = PACING_MIN_MS,
  max = PACING_MAX_MS,
  rng: () => number = Math.random,
): number {
  if (max < min) throw new Error('max < min');
  return Math.round(min + rng() * (max - min));
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function politePause(
  opts: { min?: number; max?: number; rng?: () => number; sleepFn?: (ms: number) => Promise<void> } = {},
): Promise<number> {
  const ms = randomDelayMs(opts.min, opts.max, opts.rng);
  await (opts.sleepFn ?? sleep)(ms);
  return ms;
}
