import { pinsCurveMinimum, type PhyPinsState } from '@aischool/shared';

/** The lowest point of the D–i curve through the table's points (null with fewer than three). */
export function curveLow(s: PhyPinsState) {
  const pts = s.table.map((r) => ({ x: Number(r.i), y: Number(r.a) })).filter((p) => r1ok(p.x) && r1ok(p.y) && p.y > 0);
  return pinsCurveMinimum(pts);
}
const r1ok = (x: number) => Number.isFinite(x);
