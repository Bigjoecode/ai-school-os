/** Seeded randomness for virtual-lab variants: the web and the API derive the same hidden values from an attempt's seed. */

/** A fresh variant seed (1 … 2^31−2). The server picks it; both sides derive the lab's hidden values from it. */
export const SEED_MAX = 2_147_483_646;

/** Deterministic random numbers in [0, 1) from a seed and a salt (mulberry32 over an xmur3 hash). The same everywhere. */
export function labRandom(seed: number, salt = ''): () => number {
  let h = 1779033703 ^ salt.length;
  const text = `${seed}|${salt}`;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  let a = (h ^= h >>> 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A seeded value in [min, max], rounded to `dp` decimal places. */
export function labBetween(rand: () => number, min: number, max: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round((min + rand() * (max - min)) * f) / f;
}
export function labPick<T>(rand: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rand() * xs.length) % xs.length]!;
}
export const roundDp = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
