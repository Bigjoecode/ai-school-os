/** The titration station: where each piece of apparatus stands on the student's bench (station-local, metres). */

export const SPOT = {
  standBase: [0.3, 0, -0.2] as const,
  rod: [0.3, 0, -0.33] as const,
  buretteAxis: [0.3, 0, -0.16] as const,
  /** Height of the burette's jet tip above the bench when clamped. */
  jetHeight: 0.15,
  flaskHome: [-0.02, 0, 0.1] as const,
  pipette: [-0.18, 0, 0.3] as const,
  filler: [-0.48, 0, 0.3] as const,
  funnelHome: [0.6, 0, 0.12] as const,
  beaker: [0.58, 0, -0.18] as const,
  washBottle: [0.86, 0, -0.1] as const,
  bottleA: [-0.32, 0, -0.3] as const,
  bottleB: [-0.15, 0, -0.3] as const,
  indicators: [-0.62, 0, -0.06] as const,
  buretteLying: [-0.35, 0, -0.08] as const,
  card: [-0.86, 0, -0.22] as const,
  book: [0.84, 0, 0.27] as const,
  extras: [-0.95, 0, 0.25] as const,
};

