import { z } from 'zod';

/**
 * Simple line diagrams for lesson steps (labelled parts, cycles, flow charts,
 * food chains, number lines, bar charts). The AI never writes drawing code:
 * it returns plain shapes and labels on a 400 × 300 canvas, the app draws
 * them, so nothing in a diagram can run as script.
 */

export const DIAGRAM_W = 400;
export const DIAGRAM_H = 300;
export const DIAGRAM_COLOURS = ['none', 'white', 'blue', 'green', 'red', 'orange', 'yellow', 'brown', 'grey', 'purple', 'black'] as const;
export type DiagramColour = (typeof DIAGRAM_COLOURS)[number];

const X = z.number().min(0).max(DIAGRAM_W);
const Y = z.number().min(0).max(DIAGRAM_H);
const SIZE = z.number().min(1).max(DIAGRAM_W);
const fill = z.enum(DIAGRAM_COLOURS);

export const diagramElementSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('rect'), x: X, y: Y, w: SIZE, h: SIZE, fill }),
  z.object({ t: z.literal('circle'), cx: X, cy: Y, r: SIZE, fill }),
  z.object({ t: z.literal('ellipse'), cx: X, cy: Y, rx: SIZE, ry: SIZE, fill }),
  z.object({ t: z.literal('line'), x1: X, y1: Y, x2: X, y2: Y, arrow: z.enum(['none', 'end', 'both']), dashed: z.boolean() }),
  z.object({ t: z.literal('poly'), points: z.array(z.object({ x: X, y: Y })).min(2).max(40), closed: z.boolean(), fill }),
  z.object({ t: z.literal('text'), x: X, y: Y, text: z.string().min(1).max(60), size: z.enum(['s', 'm', 'l']), anchor: z.enum(['start', 'middle', 'end']), bold: z.boolean() }),
]);
export type DiagramElement = z.infer<typeof diagramElementSchema>;

export const diagramSchema = z.object({ elements: z.array(diagramElementSchema).min(2).max(80) });
export type Diagram = z.infer<typeof diagramSchema>;

const num = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : null);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Turns the AI's shapes into a valid diagram: numbers kept on the canvas, labels shortened, anything malformed dropped. Null if too little is left. */
export function cleanDiagram(raw: unknown): Diagram | null {
  const list = (raw as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(list)) return null;
  const out: DiagramElement[] = [];
  for (const e of list.slice(0, 80) as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') continue;
    const f = pick(e.fill, DIAGRAM_COLOURS, 'none');
    const x = (k: string) => num(e[k], 0, DIAGRAM_W);
    const y = (k: string) => num(e[k], 0, DIAGRAM_H);
    const s = (k: string) => num(e[k], 1, DIAGRAM_W);
    let el: unknown = null;
    if (e.t === 'rect') el = { t: 'rect', x: x('x'), y: y('y'), w: s('w'), h: s('h'), fill: f };
    else if (e.t === 'circle') el = { t: 'circle', cx: x('cx'), cy: y('cy'), r: s('r'), fill: f };
    else if (e.t === 'ellipse') el = { t: 'ellipse', cx: x('cx'), cy: y('cy'), rx: s('rx'), ry: s('ry'), fill: f };
    else if (e.t === 'line') el = { t: 'line', x1: x('x1'), y1: y('y1'), x2: x('x2'), y2: y('y2'), arrow: pick(e.arrow, ['none', 'end', 'both'] as const, 'none'), dashed: e.dashed === true };
    else if (e.t === 'poly' && Array.isArray(e.points))
      el = { t: 'poly', points: (e.points as { x?: unknown; y?: unknown }[]).slice(0, 40).map((p) => ({ x: num(p?.x, 0, DIAGRAM_W), y: num(p?.y, 0, DIAGRAM_H) })), closed: e.closed === true, fill: f };
    else if (e.t === 'text' && typeof e.text === 'string' && e.text.trim())
      el = { t: 'text', x: x('x'), y: y('y'), text: e.text.trim().slice(0, 60), size: pick(e.size, ['s', 'm', 'l'] as const, 'm'), anchor: pick(e.anchor, ['start', 'middle', 'end'] as const, 'middle'), bold: e.bold === true };
    const ok = diagramElementSchema.safeParse(el);
    if (ok.success) out.push(ok.data);
  }
  return out.length >= 2 ? { elements: out } : null;
}
