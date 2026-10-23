import { z } from 'zod';

/**
 * Shared pieces of the physics virtual labs (phy-pendulum, phy-ohms-law,
 * phy-glass-block): the best straight line the student draws on their graph
 * (two points in the graph's own data units) and a least-squares fit used to
 * judge it.
 */

/** The student's straight line on their graph, through two points in data units (x along the horizontal axis). */
export interface PhyGraphLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const coord = z.number().min(-1e6).max(1e6);
export const phyGraphLineSchema = z.object({ x1: coord, y1: coord, x2: coord, y2: coord }) satisfies z.ZodType<PhyGraphLine>;

/** A written answer: value and unit as typed. */
export interface PhyAnswer {
  value: string;
  unit: string;
}
export const phyAnswerSchema = z.object({ value: z.string().max(40), unit: z.string().max(40) }) satisfies z.ZodType<PhyAnswer>;

/** Least-squares straight line through the points (null with fewer than two distinct x values). */
export function phyFit(points: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return null;
  const mx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
  const my = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  const sxx = pts.reduce((t, p) => t + (p.x - mx) ** 2, 0);
  if (sxx < 1e-12) return null;
  const slope = pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

/** Slope of the student's drawn line (null when vertical or missing). */
export function phyLineSlope(line: PhyGraphLine | null): number | null {
  if (!line) return null;
  const dx = line.x2 - line.x1;
  return Math.abs(dx) < 1e-12 ? null : (line.y2 - line.y1) / dx;
}

const DEG = Math.PI / 180;
/** sin of an angle in degrees. */
export const phySin = (a: number) => Math.sin(a * DEG);
export const phyToDeg = (radians: number) => radians / DEG;
export const phyToRad = (degrees: number) => degrees * DEG;
