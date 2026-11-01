import { PINS_SHEET, mirrorConstruction, pinsIncident, pinsMeet, pinsPrism, prismConstruction, prismInDir, type PhyPinsVariant, type PinsPoint, type PinsTrace } from '@aischool/shared';
import { maxS } from './actions';

/**
 * The pencil drawing on the sheet (canvas), shared by the 2D board and the 3D
 * paper texture. Mirror: the line MM' along the silvered surface, O, the normal,
 * the incident ray, the pin holes and, once the mirror is removed, P₄P₃ joined
 * to MM' and the angle r. Prism: the outline, the normal at O, the incident ray,
 * the pins and, once the prism is removed, the emergent ray, the ray inside,
 * and both rays produced to meet (the angle of deviation D).
 */

export const PAPER_PX = 30;
export const paperSize = (task: 'MIRROR' | 'PRISM') => {
  const S = PINS_SHEET[task];
  return { w: (S.right - S.left) * PAPER_PX, h: (S.top - S.bottom) * PAPER_PX };
};
export interface DrawProgress {
  normal: number;
  ray: number;
  join: number;
}
export const DRAWN: DrawProgress = { normal: 1, ray: 1, join: 1 };

const PENCIL = '#2a2f36';
const RED = '#b91c1c';

export function drawPaper(g: CanvasRenderingContext2D, v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', t: PinsTrace | null, prog: DrawProgress = DRAWN, opts: { objectOn?: boolean; eye?: PinsPoint | null } = {}) {
  const S = PINS_SHEET[task];
  const W = (S.right - S.left) * PAPER_PX;
  const H = (S.top - S.bottom) * PAPER_PX;
  const X = (x: number) => (x - S.left) * PAPER_PX;
  const Y = (y: number) => (S.top - y) * PAPER_PX;
  g.fillStyle = '#fbfbf7';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(150,180,210,0.35)';
  g.lineWidth = 1;
  for (let x = S.left; x <= S.right; x++) (g.beginPath(), g.moveTo(X(x), 0), g.lineTo(X(x), H), g.stroke());
  for (let y = S.bottom; y <= S.top; y++) (g.beginPath(), g.moveTo(0, Y(y)), g.lineTo(W, Y(y)), g.stroke());
  const line = (a: PinsPoint, b: PinsPoint, colour = PENCIL, w = 2.2, dash: number[] = [], f = 1) => {
    g.strokeStyle = colour;
    g.lineWidth = w;
    g.setLineDash(dash);
    g.beginPath();
    g.moveTo(X(a.x), Y(a.y));
    g.lineTo(X(a.x + (b.x - a.x) * f), Y(a.y + (b.y - a.y) * f));
    g.stroke();
    g.setLineDash([]);
  };
  const label = (text: string, p: PinsPoint, dx = 8, dy = -8, colour = PENCIL, size = 20) => {
    g.fillStyle = colour;
    g.font = `600 ${size}px system-ui, sans-serif`;
    g.fillText(text, X(p.x) + dx, Y(p.y) + dy);
  };
  const dot = (p: PinsPoint, r = 4, colour = PENCIL) => {
    g.fillStyle = colour;
    g.beginPath();
    g.arc(X(p.x), Y(p.y), r, 0, Math.PI * 2);
    g.fill();
  };
  const sh = pinsPrism(v);
  const O = task === 'MIRROR' ? { x: 0, y: 0 } : sh.O;
  // The mirror line, or the prism's outline (drawn at the start of every sheet).
  if (task === 'MIRROR') {
    line({ x: S.left + 1.5, y: 0 }, { x: S.right - 1.5, y: 0 }, PENCIL, 2.4);
    label('M', { x: S.left + 1.5, y: 0 }, -22, 6);
    label("M'", { x: S.right - 1.5, y: 0 }, 6, 6);
    if (t && opts.objectOn !== false && !t.joined) {
      g.fillStyle = 'rgba(120,130,140,0.55)';
      g.fillRect(X(-7), Y(0), 14 * PAPER_PX, 0.6 * PAPER_PX);
    }
  } else if (t) {
    g.strokeStyle = PENCIL;
    g.lineWidth = 2.4;
    g.beginPath();
    g.moveTo(X(sh.B.x), Y(sh.B.y));
    g.lineTo(X(sh.T.x), Y(sh.T.y));
    g.lineTo(X(sh.C.x), Y(sh.C.y));
    g.closePath();
    g.stroke();
    if (opts.objectOn !== false && !t.joined) {
      g.fillStyle = 'rgba(160,215,230,0.35)';
      g.fill();
    }
    label('A', sh.T, -6, -10);
  }
  if (!t) return;
  // The normal at O.
  const n = task === 'MIRROR' ? { x: 0, y: 1 } : sh.n1;
  if (t.normal && prog.normal > 0) {
    line({ x: O.x + n.x * 6, y: O.y + n.y * 6 }, { x: O.x - n.x * 3, y: O.y - n.y * 3 }, '#4b5563', 2, [10, 8], prog.normal);
    if (prog.normal >= 1) label('N', { x: O.x + n.x * 6, y: O.y + n.y * 6 }, 4, 0);
  }
  // The incident ray and the angle of incidence.
  const end = pinsIncident(v, task, t.i, maxS(v, task, t.i));
  line(O, end, PENCIL, 2.4, [], prog.ray);
  dot(O);
  label('O', O, task === 'MIRROR' ? 6 : -24, task === 'MIRROR' ? -8 : 20);
  if (prog.ray >= 1) {
    const mid = pinsIncident(v, task, t.i, 4);
    label(`i = ${t.i}°`, mid, 8, 18, PENCIL, 18);
  }
  // Pin holes.
  const pins: [string, PinsPoint | null][] = [
    ['P₁', t.p1 !== null ? pinsIncident(v, task, t.i, t.p1) : null],
    ['P₂', t.p2 !== null ? pinsIncident(v, task, t.i, t.p2) : null],
    ['P₃', t.p3],
    ['P₄', t.p4],
  ];
  for (const [l, p] of pins) {
    if (!p) continue;
    dot(p, 4, '#111');
    label(l, p, 9, 6, '#1d3f94');
  }
  // The construction, once the mirror/prism is removed.
  if (t.joined && t.p3 && t.p4) {
    const f = prog.join;
    if (task === 'MIRROR') {
      const c = mirrorConstruction(t);
      if (c) {
        const far = Math.hypot(t.p3.x, t.p3.y) > Math.hypot(t.p4.x, t.p4.y) ? t.p3 : t.p4;
        line(far, c.at, PENCIL, 2.4, [], f);
        if (f >= 1) {
          if (Math.abs(c.at.x) > 0.05) line({ x: c.at.x, y: 0 }, { x: c.at.x, y: 5 }, '#4b5563', 1.6, [6, 6]);
          line(c.at, { x: c.at.x + Math.sin((c.r * Math.PI) / 180) * 5, y: Math.cos((c.r * Math.PI) / 180) * 5 }, RED, 3);
          label('r', { x: c.at.x + 1.2, y: 3.2 }, 0, 0, RED);
        }
      }
    } else {
      const c = prismConstruction(sh, t);
      if (c) {
        const far = Math.hypot(t.p3.x - sh.M2.x, t.p3.y - sh.M2.y) > Math.hypot(t.p4.x - sh.M2.x, t.p4.y - sh.M2.y) ? t.p3 : t.p4;
        line(far, c.at, PENCIL, 2.4, [], f);
        if (f >= 1) {
          line(O, c.at, RED, 3);
          // Produce both rays to meet: the angle between them is D.
          const dIn = prismInDir(sh, t.i);
          const m = pinsMeet(O, dIn, c.at, c.dir);
          if (m) {
            line(O, m.at, '#6b7280', 1.6, [6, 6]);
            line(c.at, m.at, '#6b7280', 1.6, [6, 6]);
            const ahead = { x: m.at.x + dIn.x * 4, y: m.at.y + dIn.y * 4 };
            line(m.at, ahead, '#6b7280', 1.6, [6, 6]);
            label('D', { x: m.at.x + (dIn.x + c.dir.x) * 1.6, y: m.at.y + (dIn.y + c.dir.y) * 1.6 }, 4, 4, RED);
          }
        }
      }
    }
  }
  // The eye (2D only).
  if (opts.eye && !t.joined) {
    const e = { x: Math.max(S.left + 0.6, Math.min(S.right - 0.6, opts.eye.x)), y: Math.max(S.bottom + 0.6, Math.min(S.top - 0.6, opts.eye.y)) };
    g.strokeStyle = '#0f172a';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(X(e.x), Y(e.y), 14, 8, 0, 0, Math.PI * 2);
    g.stroke();
    dot(e, 4, '#0f172a');
  }
}
