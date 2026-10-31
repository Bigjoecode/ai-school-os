/** The redox station: where each piece of apparatus stands on the student's bench (station-local, metres). */

export const SPOT = {
  standBase: [0.3, 0, -0.2] as const,
  rod: [0.3, 0, -0.33] as const,
  buretteAxis: [0.3, 0, -0.16] as const,
  /** Height of the burette's jet tip above the bench when clamped. */
  jetHeight: 0.15,
  flaskHome: [-0.02, 0, 0.1] as const,
  pipette: [-0.18, 0, 0.3] as const,
  filler: [-0.48, 0, 0.3] as const,
  funnelHome: [0.46, 0, 0.0] as const,
  beaker: [0.58, 0, -0.18] as const,
  washBottle: [0.86, 0, -0.1] as const,
  bottleA: [-0.32, 0, -0.3] as const,
  bottleB: [-0.15, 0, -0.3] as const,
  /** The three dilute acids, in a row behind the indicators. */
  acids: [-0.66, 0, -0.3] as const,
  indicators: [-0.62, 0, -0.08] as const,
  cylinder: [0.14, 0, 0.3] as const,
  /** OX: tripod and gauze with the burner under it. */
  tripod: [0.62, 0, 0.1] as const,
  buretteLying: [-0.35, 0, 0.06] as const,
  card: [-0.86, 0, 0.12] as const,
  book: [0.84, 0, 0.32] as const,
  extras: [-0.98, 0, 0.32] as const,
};
/** Height of the gauze above the bench (the flask stands on it). */
export const TRIPOD_TOP = 0.16;
