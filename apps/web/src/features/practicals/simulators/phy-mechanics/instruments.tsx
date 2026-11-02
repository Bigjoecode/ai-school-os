import { FORCES_PAPER, FORCES_PULLEY, forceConstruction, forceDotAt, forceEquilibrium, forceLine, type ForceSet, type PhyMechanicsState, type PhyMechanicsVariant } from '@aischool/shared';
import { cn } from '@/lib/utils';

/**
 * The mechanics lab's instruments as close-up drawings, shared by the 2D lab
 * and the 3D lab's reading panel: the stop-clock's display, the protractor at
 * the raised plank, the metre rule beside the cylinder's bands, and the force
 * board's sheet of paper (the threads and dots while it is on the board; the
 * lines, OA, OB and the parallelogram once it is off, with a rule along the
 * diagonal and a protractor at O for measuring).
 */

const card = 'rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900';
const INK = '#1b1d1f';

export function StopClock({ seconds, running, label }: { seconds: number; running?: boolean; label?: string }) {
  return (
    <figure className="inline-block space-y-1" aria-label={`Stop-clock reading ${seconds.toFixed(2)} seconds`}>
      <div className="rounded-2xl border-4 border-slate-700 bg-slate-800 p-2 shadow-inner">
        <div className="rounded-md bg-[#c9d7b8] px-3 py-1 font-mono text-[28px] font-bold leading-none tracking-wider text-[#16200f] tabular-nums">
          <span className="mr-2 align-top text-[9px] font-semibold">{running ? '● RUN' : 'STOP'}</span>
          {seconds.toFixed(2).padStart(5, '0')}
        </div>
      </div>
      {label && <figcaption className="text-[11px] text-muted-foreground">{label}</figcaption>}
    </figure>
  );
}

/** The protractor held at the raised end of the plank: the plank's edge against the degree scale (read to 1°). */
export function AngleScale({ angle, label }: { angle: number; label?: string }) {
  const W = 300;
  const H = 170;
  const cx = 30;
  const cy = 150;
  const R = 130;
  const a = (angle * Math.PI) / 180;
  const ticks = Array.from({ length: 91 }, (_, i) => i);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className={cn(card, 'w-full max-w-[320px] select-none')} role="img" aria-label={`Protractor at the plank: the plank's edge is at about ${Math.round(angle)} degrees`}>
        <path d={`M${cx} ${cy} L${cx + R} ${cy} A${R} ${R} 0 0 0 ${cx} ${cy - R} Z`} fill="#eaf3fb" fillOpacity={0.8} stroke="#8aa4bd" />
        {ticks.map((d) => {
          const t = (d * Math.PI) / 180;
          const len = d % 10 === 0 ? 14 : d % 5 === 0 ? 10 : 6;
          return (
            <g key={d}>
              <line x1={cx + (R - len) * Math.cos(t)} y1={cy - (R - len) * Math.sin(t)} x2={cx + R * Math.cos(t)} y2={cy - R * Math.sin(t)} stroke={INK} strokeWidth={d % 10 === 0 ? 1.1 : 0.6} />
              {d % 10 === 0 && (
                <text x={cx + (R - 24) * Math.cos(t)} y={cy - (R - 24) * Math.sin(t) + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}>
                  {d}
                </text>
              )}
            </g>
          );
        })}
        <line x1={cx} y1={cy} x2={W - 6} y2={cy} stroke="#6d4c41" strokeWidth={5} />
        <line x1={cx} y1={cy} x2={cx + (R + 18) * Math.cos(a)} y2={cy - (R + 18) * Math.sin(a)} stroke="#a1887f" strokeWidth={6} strokeLinecap="round" />
        <text x={W - 8} y={cy + 14} textAnchor="end" fontSize="9" fill="#4b5563">
          bench
        </text>
      </svg>
      <figcaption className="max-w-[320px] text-[11px] text-muted-foreground">{label ?? 'Read where the plank’s top edge crosses the scale, to the nearest degree.'}</figcaption>
    </figure>
  );
}

/** The metre rule standing beside the cylinder, its zero level with the liquid's surface: the two rubber bands against it (read to 0.1 cm). */
export function BandRule({ top, bot, around }: { top: number; bot: number; around: 'top' | 'bot' }) {
  const W = 300;
  const H = 90;
  const k = 24; // px per cm
  const at = around === 'top' ? top : bot;
  const X = (cm: number) => W / 2 + (cm - at) * k;
  const ticks: number[] = [];
  for (let mm = Math.floor((at - 6) * 10); mm <= Math.ceil((at + 6) * 10); mm++) if (mm >= 0) ticks.push(mm);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px] rounded-lg border border-border bg-[#f3d98f]" role="img" aria-label={`Metre rule at the ${around === 'top' ? 'upper' : 'lower'} band (centimetres below the surface)`}>
        {ticks.map((mm) => {
          const x = X(mm / 10);
          const len = mm % 10 === 0 ? 22 : mm % 5 === 0 ? 15 : 9;
          return (
            <g key={mm}>
              <line x1={x} x2={x} y1={0} y2={len} stroke={INK} strokeWidth={mm % 10 === 0 ? 1.3 : 0.7} />
              {mm % 10 === 0 && (
                <text x={x} y={36} textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>
                  {mm / 10}
                </text>
              )}
            </g>
          );
        })}
        {[top, bot].map((b) => (
          <rect key={b} x={X(b) - 3} y={44} width={6} height={46} rx={2} fill="#c62828" opacity={Math.abs(b - at) < 7 ? 1 : 0} />
        ))}
      </svg>
      <figcaption className="max-w-[320px] text-[11px] text-muted-foreground">The rule’s zero is level with the surface. Read each band’s centre line.</figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ the force board's paper

type P2 = { x: number; y: number };
const PX = 9; // px per cm on the drawing
const PAD = 14;
const PW = FORCES_PAPER.w * 2 * PX + 2 * PAD;
const PH = FORCES_PAPER.h * PX + 2 * PAD;
const sx = (x: number) => PAD + (x + FORCES_PAPER.w) * PX;
const sy = (y: number) => PAD + (FORCES_PAPER.h - y) * PX;

/**
 * One sheet of the force board. On the board: the threads from the knot to
 * the pulleys and down to W (`live`), and the pencil dots. Off the board: the
 * lines through the dots, and once built OA, OB, the parallelogram and the
 * diagonal OC; `measure` lays a rule along OC and a protractor at O.
 */
export function PaperSvg({ v, s, i, live, measure, className }: { v: PhyMechanicsVariant; s: PhyMechanicsState; i: number | null; live: boolean; measure?: boolean; className?: string }) {
  const set: ForceSet | null = i === null ? null : (s.sets[i] ?? null);
  const loads = set && !live ? set : s.masses;
  const eq = forceEquilibrium(v, live ? s.masses : loads, live ? s.tapped : (set?.dots[0]?.tapped ?? true), live ? s.sets.length - (set && !set.off ? 1 : 0) : (i ?? 0));
  const row = i === null ? undefined : s.rows.find((r) => r.key === i);
  const con = set?.built ? forceConstruction(v, set, i!, Number(row?.c.OA) || null, Number(row?.c.OB) || null) : null;
  const dots = set ? set.dots.map((d, k) => forceDotAt(v, set, i!, d, k)) : [];
  const lines = set?.off ? (['P', 'Q', 'W'] as const).map((th) => ({ th, l: forceLine(v, set, i!, th) })) : [];
  const L = (p: P2, u: P2, a: number, b: number) => ({ x1: sx(p.x + u.x * a), y1: sy(p.y + u.y * a), x2: sx(p.x + u.x * b), y2: sy(p.y + u.y * b) });
  const pulleys = [-FORCES_PULLEY.x, FORCES_PULLEY.x].map((x) => ({ x, y: FORCES_PULLEY.y }));
  // measuring: zoom in on the parallelogram (lengths still in true cm on the drawing)
  let vb = `0 0 ${PW} ${PH}`;
  if (measure && con) {
    const xs = [con.O.x, con.A.x, con.B.x, con.C.x];
    const ys = [con.O.y, con.A.y, con.B.y, con.C.y];
    const x0 = sx(Math.min(...xs) - 3);
    const x1 = sx(Math.max(...xs) + 3);
    const y0 = sy(Math.max(...ys) + 3);
    const y1 = sy(Math.min(...ys) - 3);
    const w = Math.max(x1 - x0, (y1 - y0) * 1.3);
    vb = `${(x0 + x1) / 2 - w / 2} ${y0} ${w} ${y1 - y0}`;
  }
  return (
    <svg viewBox={vb} className={cn('w-full select-none rounded-xl border border-border bg-[#fbfaf4]', className)} role="img" aria-label={live ? 'The drawing paper on the board, with the threads and the knot' : 'Your drawing on the sheet: the lines of action and the parallelogram'}>
      <rect x={PAD} y={PAD} width={PW - 2 * PAD} height={PH - 2 * PAD} fill="#ffffff" stroke="#c9c6b8" />
      {live && eq.ok && (
        <g>
          {pulleys.map((_, k) => (
            <line key={k} x1={sx(eq.knot.x)} y1={sy(eq.knot.y)} x2={sx(eq.knot.x + (k ? eq.dir.Q.x : eq.dir.P.x) * 60)} y2={sy(eq.knot.y + (k ? eq.dir.Q.y : eq.dir.P.y) * 60)} stroke="#8d8d8d" strokeWidth={1.4} />
          ))}
          <line x1={sx(eq.knot.x)} y1={sy(eq.knot.y)} x2={sx(eq.knot.x)} y2={sy(-5)} stroke="#8d8d8d" strokeWidth={1.4} />
          <circle cx={sx(eq.knot.x)} cy={sy(eq.knot.y)} r={4} fill="none" stroke="#5d4037" strokeWidth={2} />
          <text x={sx(eq.knot.x + eq.dir.P.x * 16) - 6} y={sy(eq.knot.y + eq.dir.P.y * 16) - 6} fontSize="11" fontWeight="700" fill="#555">P</text>
          <text x={sx(eq.knot.x + eq.dir.Q.x * 16) + 6} y={sy(eq.knot.y + eq.dir.Q.y * 16) - 6} fontSize="11" fontWeight="700" fill="#555">Q</text>
          <text x={sx(eq.knot.x) + 6} y={sy(eq.knot.y - 9)} fontSize="11" fontWeight="700" fill="#555">W</text>
        </g>
      )}
      {live && !eq.ok && (
        <text x={PW / 2} y={PH / 2} textAnchor="middle" fontSize="12" fill="#b45309">
          {eq.why}
        </text>
      )}
      <clipPath id="mech-paper-clip">
        <rect x={PAD} y={PAD} width={PW - 2 * PAD} height={PH - 2 * PAD} />
      </clipPath>
      <g clipPath="url(#mech-paper-clip)">{lines.map(({ th, l }) => l && <line key={th} {...L(l.p, l.u, -8, 30)} stroke="#33363a" strokeWidth={0.9} />)}</g>
      {con && (
        <g>
          <line x1={sx(con.O.x)} y1={sy(con.O.y)} x2={sx(con.A.x)} y2={sy(con.A.y)} stroke="#1d4ed8" strokeWidth={2} />
          <line x1={sx(con.O.x)} y1={sy(con.O.y)} x2={sx(con.B.x)} y2={sy(con.B.y)} stroke="#1d4ed8" strokeWidth={2} />
          <line x1={sx(con.A.x)} y1={sy(con.A.y)} x2={sx(con.C.x)} y2={sy(con.C.y)} stroke="#1d4ed8" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={sx(con.B.x)} y1={sy(con.B.y)} x2={sx(con.C.x)} y2={sy(con.C.y)} stroke="#1d4ed8" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={sx(con.O.x)} y1={sy(con.O.y)} x2={sx(con.C.x)} y2={sy(con.C.y)} stroke="#b91c1c" strokeWidth={2} />
          {(
            [
              ['O', con.O],
              ['A', con.A],
              ['B', con.B],
              ['C', con.C],
            ] as const
          ).map(([n, p]) => (
            <text key={n} x={sx(p.x) + 5} y={sy(p.y) - 4} fontSize="11" fontWeight="700" fill="#1d4ed8">
              {n}
            </text>
          ))}
          {measure && <MeasureOverlay O={con.O} C={con.C} up={con.wUp} />}
        </g>
      )}
      {dots.map((p, k) => (
        <circle key={k} cx={sx(p.x)} cy={sy(p.y)} r={1.9} fill="#111" />
      ))}
      <text x={PAD + 4} y={PH - PAD - 4} fontSize="9" fill="#777">
        {set ? `Sheet ${i! + 1}` : 'Clean sheet'} · 1 square = 1 cm
      </text>
    </svg>
  );
}

/** A rule laid along OC from O (cm, mm ticks) and a protractor centred on O with its zero along the line of W produced upwards. */
function MeasureOverlay({ O, C, up }: { O: P2; C: P2; up: P2 }) {
  const len = Math.hypot(C.x - O.x, C.y - O.y);
  const u = { x: (C.x - O.x) / len, y: (C.y - O.y) / len };
  const n = { x: -u.y, y: u.x };
  const ticks = Array.from({ length: Math.ceil((len + 1.5) * 10) + 1 }, (_, i) => i);
  const R = 5.5;
  const base = Math.atan2(up.y, up.x);
  const deg = Array.from({ length: 31 }, (_, i) => i - 15);
  return (
    <g>
      <polygon
        points={[
          [O.x - u.x * 0.5 + n.x * 0.15, O.y - u.y * 0.5 + n.y * 0.15],
          [O.x + u.x * (len + 1.5) + n.x * 0.15, O.y + u.y * (len + 1.5) + n.y * 0.15],
          [O.x + u.x * (len + 1.5) + n.x * 1.6, O.y + u.y * (len + 1.5) + n.y * 1.6],
          [O.x - u.x * 0.5 + n.x * 1.6, O.y - u.y * 0.5 + n.y * 1.6],
        ]
          .map(([x, y]) => `${sx(x!)},${sy(y!)}`)
          .join(' ')}
        fill="#f3d98f"
        fillOpacity={0.85}
        stroke="#9a7b2f"
      />
      {ticks.map((mm) => {
        const d = mm / 10;
        const l = mm % 10 === 0 ? 0.7 : mm % 5 === 0 ? 0.5 : 0.3;
        return (
          <g key={mm}>
            <line x1={sx(O.x + u.x * d + n.x * 0.15)} y1={sy(O.y + u.y * d + n.y * 0.15)} x2={sx(O.x + u.x * d + n.x * (0.15 + l))} y2={sy(O.y + u.y * d + n.y * (0.15 + l))} stroke={INK} strokeWidth={mm % 10 === 0 ? 0.9 : 0.45} />
            {mm % 10 === 0 && (
              <text x={sx(O.x + u.x * d + n.x * 1.25)} y={sy(O.y + u.y * d + n.y * 1.25) + 3} textAnchor="middle" fontSize="7" fill={INK}>
                {mm / 10}
              </text>
            )}
          </g>
        );
      })}
      <path d={`M${sx(O.x + R * Math.cos(base - 0.27))} ${sy(O.y + R * Math.sin(base - 0.27))} A${R * PX} ${R * PX} 0 0 0 ${sx(O.x + R * Math.cos(base + 0.27))} ${sy(O.y + R * Math.sin(base + 0.27))}`} fill="none" stroke="#3b82f6" strokeWidth={0.8} />
      {deg.map((d) => {
        const t = base + (d * Math.PI) / 180;
        const l = d % 5 === 0 ? 0.7 : 0.4;
        return (
          <g key={d}>
            <line x1={sx(O.x + (R - l) * Math.cos(t))} y1={sy(O.y + (R - l) * Math.sin(t))} x2={sx(O.x + R * Math.cos(t))} y2={sy(O.y + R * Math.sin(t))} stroke="#1e3a8a" strokeWidth={d % 5 === 0 ? 0.8 : 0.4} />
            {d % 5 === 0 && (
              <text x={sx(O.x + (R + 0.9) * Math.cos(t))} y={sy(O.y + (R + 0.9) * Math.sin(t)) + 3} textAnchor="middle" fontSize="6.5" fill="#1e3a8a">
                {Math.abs(d)}
              </text>
            )}
          </g>
        );
      })}
      <line x1={sx(O.x)} y1={sy(O.y)} x2={sx(O.x + up.x * (R + 0.4))} y2={sy(O.y + up.y * (R + 0.4))} stroke="#1e3a8a" strokeWidth={0.6} strokeDasharray="2 2" />
    </g>
  );
}

/** The plank's scale close up at the stopping block (cm from the start line; read to 1 mm). */
export function PlankRule({ at }: { at: number }) {
  const W = 300;
  const k = 24;
  const X = (cm: number) => W / 2 + (cm - at) * k;
  const ticks: number[] = [];
  for (let mm = Math.floor((at - 6) * 10); mm <= Math.ceil((at + 6) * 10); mm++) if (mm >= 0) ticks.push(mm);
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} 80`} className="w-full max-w-[320px] rounded-lg border border-border bg-[#e9c88f]" role="img" aria-label={`The plank's scale at the stopping block, near ${Math.round(at)} cm from the start line`}>
        {ticks.map((mm) => {
          const x = X(mm / 10);
          const len = mm % 10 === 0 ? 22 : mm % 5 === 0 ? 15 : 9;
          return (
            <g key={mm}>
              <line x1={x} x2={x} y1={0} y2={len} stroke={INK} strokeWidth={mm % 10 === 0 ? 1.3 : 0.7} />
              {mm % 10 === 0 && (
                <text x={x} y={36} textAnchor="middle" fontSize="12" fontWeight="700" fill={INK}>
                  {mm / 10}
                </text>
              )}
            </g>
          );
        })}
        <rect x={X(at)} y={42} width={30} height={38} fill="#455a64" />
      </svg>
      <figcaption className="max-w-[320px] text-[11px] text-muted-foreground">The stopping block’s face against the scale (cm from the start line).</figcaption>
    </figure>
  );
}
