import { DIAGRAM_H, DIAGRAM_W, type Diagram, type DiagramColour } from '@aischool/shared';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/** Light textbook tints; outlines and labels stay dark. The drawing sits on white in both themes, like a page. */
const FILL: Record<DiagramColour, string> = {
  none: 'none',
  white: '#ffffff',
  blue: '#cfe3ff',
  green: '#cdeccf',
  red: '#fbd0cc',
  orange: '#ffdcb5',
  yellow: '#fff1a8',
  brown: '#e3cdb5',
  grey: '#e3e3e3',
  purple: '#e2d4f5',
  black: '#222222',
};
const INK = '#1f2937';
const FONT = { s: 11, m: 14, l: 18 } as const;

/**
 * Draws a lesson diagram from its plain shapes. Every value is a number, a
 * fixed choice or text React escapes, so a diagram can't carry markup or script.
 */
export function DiagramView({ diagram, label, big, className }: { diagram: Diagram; label: string; big?: boolean; className?: string }) {
  const arrow = `arrow-${useId().replace(/:/g, '')}`;
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border bg-white p-2', big ? 'mx-auto max-w-3xl' : 'max-w-xl', className)}>
      <svg viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`} role="img" aria-label={label} className="block h-auto w-full" fontFamily="system-ui, sans-serif">
        <defs>
          <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={INK} />
          </marker>
        </defs>
        {diagram.elements.map((e, i) => {
          switch (e.t) {
            case 'rect':
              return <rect key={i} x={e.x} y={e.y} width={e.w} height={e.h} rx={4} fill={FILL[e.fill]} stroke={INK} strokeWidth={1.5} />;
            case 'circle':
              return <circle key={i} cx={e.cx} cy={e.cy} r={e.r} fill={FILL[e.fill]} stroke={INK} strokeWidth={1.5} />;
            case 'ellipse':
              return <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill={FILL[e.fill]} stroke={INK} strokeWidth={1.5} />;
            case 'line':
              return (
                <line
                  key={i}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke={INK}
                  strokeWidth={1.5}
                  strokeDasharray={e.dashed ? '5 4' : undefined}
                  markerEnd={e.arrow !== 'none' ? `url(#${arrow})` : undefined}
                  markerStart={e.arrow === 'both' ? `url(#${arrow})` : undefined}
                />
              );
            case 'poly': {
              const pts = e.points.map((p) => `${p.x},${p.y}`).join(' ');
              return e.closed ? (
                <polygon key={i} points={pts} fill={FILL[e.fill]} stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
              ) : (
                <polyline key={i} points={pts} fill="none" stroke={INK} strokeWidth={1.5} strokeLinejoin="round" />
              );
            }
            case 'text':
              return (
                <text key={i} x={e.x} y={e.y} fontSize={FONT[e.size]} fontWeight={e.bold ? 600 : 400} textAnchor={e.anchor} fill={INK}>
                  {e.text}
                </text>
              );
            default:
              return null;
          }
        })}
      </svg>
    </div>
  );
}
