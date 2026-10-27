import { GLASS_BLOCK_LEFT, GLASS_BLOCK_RIGHT, GLASS_SHEET, glassConstruction, glassIncidentPoint, type GlassPoint, type GlassTrace, type PhyGlassVariant } from '@aischool/shared';
import { FONT } from '../../phy-common/lab3d/tex';
import { maxS } from '../actions';

/** Pixels per cm on the drawing paper's canvas. */
export const PX = 40;
export const PAPER_W = (GLASS_SHEET.right - GLASS_SHEET.left) * PX;
export const PAPER_H = (GLASS_SHEET.top - GLASS_SHEET.bottom) * PX;
const X = (x: number) => (x - GLASS_SHEET.left) * PX;
const Y = (y: number) => (GLASS_SHEET.top - y) * PX;

/** How far each drawing animation has got (0…1, 1 = finished): the lines grow as the pencil moves. */
export interface DrawProgress {
  normal: number;
  ray: number;
  join: number;
}

/**
 * The pencil drawing on the sheet for one trace: the block's outline ABCD,
 * O, the dashed normal, the incident ray at i, the pin holes, and after the
 * block is removed P₄P₃ produced to E and the refracted ray OE.
 */
export function drawPaper(g: CanvasRenderingContext2D, v: PhyGlassVariant, t: GlassTrace | null, prog: DrawProgress) {
  g.fillStyle = '#fbfbf7';
  g.fillRect(0, 0, PAPER_W, PAPER_H);
  g.strokeStyle = 'rgba(150,180,210,0.35)';
  g.lineWidth = 1;
  for (let x = GLASS_SHEET.left; x <= GLASS_SHEET.right; x++) {
    g.beginPath();
    g.moveTo(X(x), 0);
    g.lineTo(X(x), PAPER_H);
    g.stroke();
  }
  for (let y = GLASS_SHEET.bottom; y <= GLASS_SHEET.top; y++) {
    g.beginPath();
    g.moveTo(0, Y(y));
    g.lineTo(PAPER_W, Y(y));
    g.stroke();
  }
  if (!t) return;
  const pencil = '#2a2f36';
  const line = (a: GlassPoint, b: GlassPoint, colour = pencil, w = 2.2, dash: number[] = [], f = 1) => {
    g.strokeStyle = colour;
    g.lineWidth = w;
    g.setLineDash(dash);
    g.beginPath();
    g.moveTo(X(a.x), Y(a.y));
    g.lineTo(X(a.x + (b.x - a.x) * f), Y(a.y + (b.y - a.y) * f));
    g.stroke();
    g.setLineDash([]);
  };
  const th = v.thickness;
  // outline
  g.strokeStyle = pencil;
  g.lineWidth = 2.4;
  g.strokeRect(X(GLASS_BLOCK_LEFT), Y(0), (GLASS_BLOCK_RIGHT - GLASS_BLOCK_LEFT) * PX, th * PX);
  g.fillStyle = pencil;
  g.font = `600 24px ${FONT}`;
  g.fillText('A', X(GLASS_BLOCK_LEFT) - 26, Y(0) - 6);
  g.fillText('B', X(GLASS_BLOCK_RIGHT) + 8, Y(0) - 6);
  g.fillText('C', X(GLASS_BLOCK_RIGHT) + 8, Y(-th) + 22);
  g.fillText('D', X(GLASS_BLOCK_LEFT) - 26, Y(-th) + 22);
  // normal
  if (t.normal || prog.normal < 1) {
    const f = t.normal ? prog.normal : 0;
    if (f > 0) line({ x: 0, y: 6 }, { x: 0, y: -(th + 3) }, '#4b5563', 2, [10, 8], f);
    if (t.normal && f >= 1) g.fillText('N', X(0) + 6, Y(6) + 6);
  }
  // incident ray and the angle i
  const end = glassIncidentPoint(t.i, maxS(t.i));
  line({ x: 0, y: 0 }, end, pencil, 2.4, [], prog.ray);
  g.beginPath();
  g.arc(X(0), Y(0), 4, 0, Math.PI * 2);
  g.fill();
  g.fillText('O', X(0) + 8, Y(0) - 8);
  if (prog.ray >= 1) {
    g.font = `600 20px ${FONT}`;
    g.fillText(`i = ${t.i}°`, X(end.x * 0.35) + 10, Y(end.y * 0.35));
  }
  // pin holes
  g.font = `600 22px ${FONT}`;
  const pins: [string, GlassPoint | null][] = [
    ['P₁', t.p1 !== null ? glassIncidentPoint(t.i, t.p1) : null],
    ['P₂', t.p2 !== null ? glassIncidentPoint(t.i, t.p2) : null],
    ['P₃', t.p3],
    ['P₄', t.p4],
  ];
  for (const [label, p] of pins) {
    if (!p) continue;
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(X(p.x), Y(p.y), 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1d3f94';
    g.fillText(label, X(p.x) + 10, Y(p.y) + 6);
  }
  // the construction, once the block is removed
  if (t.joined) {
    const built = glassConstruction(v, t.p3, t.p4);
    const far = t.p3 && t.p4 ? (Math.abs(t.p3.y) > Math.abs(t.p4.y) ? t.p3 : t.p4) : null;
    if (built && far) {
      const f = prog.join;
      line(far, built.exit, pencil, 2.4, [], f);
      if (f >= 1) {
        line({ x: 0, y: 0 }, built.exit, '#b91c1c', 3, [], 1);
        g.fillStyle = pencil;
        g.font = `600 24px ${FONT}`;
        g.fillText('E', X(built.exit.x) + 8, Y(built.exit.y) + 22);
        g.fillStyle = '#b91c1c';
        g.font = `600 20px ${FONT}`;
        g.fillText('r', X(built.exit.x * 0.3) + 8, Y(built.exit.y * 0.3));
      }
    }
  }
}
