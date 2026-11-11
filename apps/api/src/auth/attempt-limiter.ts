/**
 * Counts failures per key (an account) across every IP address, so a guesser
 * spread over many addresses still runs out of tries. Kept in memory: the API
 * runs as one Passenger process, and a restart only ever gives a few more tries.
 */
export class AttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Milliseconds until this key may try again, or 0 when it is not blocked. */
  blockedFor(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    if (!h) return 0;
    if (h.resetAt <= now) {
      this.hits.delete(key);
      return 0;
    }
    return h.count >= this.max ? h.resetAt - now : 0;
  }

  fail(key: string, now = Date.now()): void {
    if (this.hits.size > 50_000) this.sweep(now);
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    else h.count += 1;
  }

  clear(key: string): void {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [k, h] of this.hits) if (h.resetAt <= now) this.hits.delete(k);
  }
}
