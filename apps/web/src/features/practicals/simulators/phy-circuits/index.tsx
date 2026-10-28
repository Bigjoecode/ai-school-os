import {
  CIRCUITS_AMMETER_FSD,
  CIRCUITS_AMMETER_MINOR,
  CIRCUITS_VOLTMETER_FSD,
  CIRCUITS_VOLTMETER_MINOR,
  GALVO_DIVS,
  RBOX_PLUGS,
  SERIES_ARRANGEMENTS,
  SERIES_LABEL,
  rboxPlugs,
  type BridgeRow,
  type CircuitsAnswerId,
  type CircuitsMeters,
  type CircuitsTask,
  type CircuitsTerminal,
  type EmfRow,
  type PhyCircuitsState,
  type PhyCircuitsVariant,
  type SeriesRow,
} from '@aischool/shared';
import { Cable, Gauge, Hand, Lightbulb, Repeat, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import { Dial, WIRE_COLOURS } from '../phy-ohms-law';
import { circuitsHint, useCircuits, type Circuits } from './actions';
import type { SimulatorProps } from '../types';

export const NAMES: Record<CircuitsTerminal, string> = {
  'cell+': 'cell +',
  'cell-': 'cell −',
  'key-a': 'key (left)',
  'key-b': 'key (right)',
  'rh-a': 'rheostat end',
  'rh-s': 'rheostat slider',
  'am+': 'ammeter +',
  'am-': 'ammeter −',
  'vm+': 'voltmeter +',
  'vm-': 'voltmeter −',
  'mb-a': 'bridge end A (0 cm)',
  'mb-d': 'centre strip D',
  'mb-c': 'bridge end C (100 cm)',
  'mb-j': 'jockey',
  'g-a': 'galvanometer (left)',
  'g-b': 'galvanometer (right)',
  'r1-a': 'R₁ (left)',
  'r1-b': 'R₁ (right)',
  'r2-a': 'R₂ (left)',
  'r2-b': 'R₂ (right)',
};
export { WIRE_COLOURS };

function terminalAt(t: CircuitsTerminal, s: Pick<PhyCircuitsState, 'rheostat' | 'jockey'>): { x: number; y: number } {
  switch (t) {
    case 'cell-': return { x: 40, y: 45 };
    case 'cell+': return { x: 120, y: 45 };
    case 'key-a': return { x: 162, y: 45 };
    case 'key-b': return { x: 228, y: 45 };
    case 'rh-a': return { x: 254, y: 45 };
    case 'rh-s': return { x: 266 + 72 * s.rheostat, y: 20 };
    case 'am+': return { x: 289, y: 168 };
    case 'am-': return { x: 321, y: 168 };
    case 'vm+': return { x: 64, y: 168 };
    case 'vm-': return { x: 96, y: 168 };
    case 'g-a': return { x: 290, y: 150 };
    case 'g-b': return { x: 322, y: 150 };
    case 'mb-a': return { x: 22, y: 222 };
    case 'mb-d': return { x: 180, y: 206 };
    case 'mb-c': return { x: 338, y: 222 };
    case 'mb-j': return { x: 40 + 2.8 * s.jockey, y: 250 };
    case 'r1-a': return { x: 130, y: 222 };
    case 'r1-b': return { x: 230, y: 222 };
    case 'r2-a': return { x: 130, y: 272 };
    case 'r2-b': return { x: 230, y: 272 };
  }
}

export default function PhyCircuitsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-circuits'>) {
  const o = useCircuits({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task, board, meters, connect, removeWire } = o;
  const [picked, setPicked] = useState<CircuitsTerminal | null>(null);
  const tapTerminal = (t: CircuitsTerminal) => {
    if (readOnly) return;
    if (!picked) return setPicked(t);
    if (picked === t) return setPicked(null);
    setPicked(null);
    connect(picked, t);
  };

  return (
    <div className="space-y-4">
      <TaskCard icon={<Zap className="size-4 text-muted-foreground" aria-hidden />}>
        <CircuitsTaskText task={task} v={v} />
      </TaskCard>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
                <Cable className="size-4 text-muted-foreground" aria-hidden /> Circuit board
              </h3>
              <Badge variant={state.key ? 'success' : 'outline'}>{state.key ? 'Key closed' : 'Key open'}</Badge>
            </div>
            {!readOnly && mode === 'LAB' && (
              <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {circuitsHint(state, meters)}
              </p>
            )}
            <BoardSvg state={state} task={task} board={board} picked={picked} onTerminal={tapTerminal} onWire={readOnly ? undefined : removeWire} meters={meters} touching={o.touching} />
            {picked && <p className="mt-2 text-[12.5px] text-info">Joining from {NAMES[picked]}: tap the terminal to connect it to (tap it again to cancel).</p>}
            {!readOnly && (
              <div className="mt-4 space-y-3">
                <Step title="Controls">
                  <Controls o={o} s={state} />
                </Step>
                <Step title={`Wires (${state.wires.length})`}>
                  {state.wires.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">No wires yet. Tap a terminal, then another, to join them.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {state.wires.map((w, i) => {
                        const [a, b] = w.split('|') as [CircuitsTerminal, CircuitsTerminal];
                        return (
                          <button key={w} type="button" onClick={() => removeWire(w)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] hover:bg-muted" aria-label={`Remove the wire from ${NAMES[a]} to ${NAMES[b]}`}>
                            <span className="size-2 rounded-full" style={{ background: WIRE_COLOURS[i % WIRE_COLOURS.length] }} aria-hidden />
                            {NAMES[a]} – {NAMES[b]} <Trash2 className="size-3" aria-hidden />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Step>
              </div>
            )}
          </Card>
          <Card className="p-4 sm:p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <Gauge className="size-4 text-muted-foreground" aria-hidden /> {task === 'BRIDGE' ? 'Galvanometer (close-up)' : 'Meters (close-up)'}
            </h3>
            {task === 'BRIDGE' ? (
              <>
                <GalvoDial value={o.touching ? meters.galvo : 0} pinned={o.touching && meters.galvoPinned} />
                <p className="mt-2 text-[11.5px] text-muted-foreground">The galvanometer only reads while the jockey touches the wire. Tap on either side of the balance point: the pointer kicks opposite ways, and not at all at balance.</p>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Dial label="A" unit="ammeter, A" value={meters.I} fsd={CIRCUITS_AMMETER_FSD} minor={CIRCUITS_AMMETER_MINOR} major={0.1} over={meters.overI} back={meters.backI} />
                  <Dial label="V" unit="voltmeter, V" value={meters.V} fsd={CIRCUITS_VOLTMETER_FSD} minor={CIRCUITS_VOLTMETER_MINOR} major={0.5} over={meters.overV} back={meters.backV} />
                </div>
                <p className="mt-2 text-[11.5px] text-muted-foreground">Read the pointer from directly in front, to the nearest half division; record to 2 decimal places.</p>
              </>
            )}
          </Card>
        </div>
        <Notebook task={task} state={state} readOnly={readOnly} update={o.update} removeReading={o.removeReading} />
      </div>
    </div>
  );
}

/** The 2D controls: key, reading, and the task's own adjusters. */
function Controls({ o, s }: { o: Circuits; s: PhyCircuitsState }) {
  const task = o.task;
  const plugs = rboxPlugs(s.rbox);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={s.key ? 'secondary' : 'brand'} onClick={o.toggleKey}>
          {s.key ? 'Open the key' : 'Close the key'}
        </Button>
        <Button size="sm" onClick={o.takeReading} disabled={!s.key || s.readings.length >= 16}>
          <Gauge /> {task === 'BRIDGE' ? 'Record this balance point' : 'Take this reading'}
        </Button>
      </div>
      {task === 'EMF' && (
        <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="w-28 text-muted-foreground">Rheostat slider</span>
          <input type="range" min={0} max={200} step={1} value={Math.round(s.rheostat * 200)} onChange={(e) => o.setRheostat(Number(e.target.value) / 200)} className="w-44 accent-[var(--brand)]" aria-label="Rheostat slider position" />
          <span className="tabular text-muted-foreground">{(s.rheostat * 10).toFixed(2)} Ω</span>
        </label>
      )}
      {task === 'BRIDGE' && (
        <>
          <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="w-28 text-muted-foreground">Jockey at</span>
            <input type="range" min={0} max={1000} step={1} value={Math.round(s.jockey * 10)} onChange={(e) => o.setJockey(Number(e.target.value) / 10)} className="w-44 accent-[var(--brand)]" aria-label="Jockey position along the wire (cm)" />
            <span className="tabular font-medium">{s.jockey.toFixed(1)} cm</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {[-1, -0.1, 0.1, 1].map((d) => (
              <Button key={d} size="sm" variant="outline" onClick={() => o.setJockey(s.jockey + d)} aria-label={`Move the jockey ${d > 0 ? 'right' : 'left'} ${Math.abs(d)} cm`}>
                {d > 0 ? `${d} cm ▶` : `◀ ${-d} cm`}
              </Button>
            ))}
            <Button size="sm" variant="brand" onClick={o.tap} disabled={s.pressed}>
              <Hand /> Tap the jockey
            </Button>
            <Button size="sm" variant={s.pressed ? 'secondary' : 'outline'} onClick={() => o.press(!s.pressed)} aria-pressed={s.pressed}>
              {s.pressed ? 'Lift the jockey' : 'Hold it down'}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="w-28 text-muted-foreground">Resistance box</span>
            {RBOX_PLUGS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => o.setRbox(s.rbox + (plugs[i] ? -p : p))}
                aria-pressed={plugs[i]}
                className={cn('rounded-md border px-2 py-1 text-[12px] tabular', plugs[i] ? 'border-amber-600 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' : 'border-border hover:bg-muted')}
                aria-label={`${p} Ω plug ${plugs[i] ? 'out (in the circuit)' : 'in (shorted)'}`}
              >
                {p} Ω {plugs[i] ? 'out' : 'in'}
              </button>
            ))}
            <span className="font-medium tabular">R = {s.rbox} Ω</span>
          </div>
          <Button size="sm" variant="outline" onClick={o.toggleSwap}>
            <Repeat /> {s.swap ? 'Put X back in the left gap' : 'Interchange X and R'}
          </Button>
        </>
      )}
    </div>
  );
}

function BoardSvg({ state, task, board, picked, onTerminal, onWire, meters, touching }: { state: PhyCircuitsState; task: CircuitsTask; board: CircuitsTerminal[]; picked: CircuitsTerminal | null; onTerminal: (t: CircuitsTerminal) => void; onWire?: (w: string) => void; meters: CircuitsMeters; touching: boolean }) {
  const at = (t: CircuitsTerminal) => terminalAt(t, state);
  const needle = (val: number, fsd: number, cx: number, cy: number) => {
    const a = ((-50 + 100 * Math.max(-0.03, Math.min(1.04, val / fsd))) * Math.PI) / 180;
    return { x: cx + 17 * Math.sin(a), y: cy + 6 - 17 * Math.cos(a) };
  };
  const g = touching ? meters.galvo : 0;
  const ga = (Math.max(-1.06, Math.min(1.06, g / GALVO_DIVS)) * 50 * Math.PI) / 180;
  return (
    <svg viewBox="0 0 360 300" className="w-full touch-manipulation select-none rounded-xl border border-border bg-muted/30" role="group" aria-label="Circuit board: tap two terminals to join them with a wire">
      {/* the dry cell */}
      <g>
        <rect x="50" y="34" width="60" height="22" rx="10" className="fill-card stroke-muted-foreground/60" />
        <line x1="74" x2="74" y1="38" y2="52" className="stroke-foreground" strokeWidth="2" />
        <line x1="82" x2="82" y1="41" y2="49" className="stroke-foreground" strokeWidth="4" />
        <text x="80" y="72" textAnchor="middle" fontSize="8" className="fill-muted-foreground">dry cell 1.5 V</text>
        <text x="113" y="38" fontSize="9" className="fill-danger">+</text>
        <text x="40" y="38" fontSize="9" className="fill-foreground">−</text>
      </g>
      <g>
        <rect x="170" y="34" width="50" height="22" rx="3" className="fill-amber-200/60 stroke-amber-700/50 dark:fill-amber-900/40" />
        {state.key ? <rect x="188" y="26" width="14" height="22" rx="2" className="fill-slate-600" /> : <rect x="200" y="12" width="14" height="18" rx="2" className="fill-slate-600" transform="rotate(25 207 21)" />}
        <text x="195" y="72" textAnchor="middle" fontSize="8" className="fill-muted-foreground">key {state.key ? '(closed)' : '(open)'}</text>
      </g>
      {task === 'EMF' && (
        <g>
          <rect x="262" y="36" width="80" height="18" rx="9" className="fill-card stroke-muted-foreground/60" />
          {Array.from({ length: 16 }, (_, i) => (
            <line key={i} x1={266 + i * 4.8} x2={266 + i * 4.8} y1="38" y2="52" className="stroke-amber-700/70" strokeWidth="1" />
          ))}
          <line x1="262" x2="342" y1="28" y2="28" className="stroke-muted-foreground/60" strokeWidth="2" />
          <rect x={262 + 72 * state.rheostat} y="24" width="8" height="16" rx="1.5" className="fill-slate-600" />
          <text x="302" y="72" textAnchor="middle" fontSize="8" className="fill-muted-foreground">rheostat 0–10 Ω</text>
        </g>
      )}
      {task !== 'BRIDGE' &&
        (
          [
            { cx: 305, cy: 135, n: needle(meters.I, CIRCUITS_AMMETER_FSD, 305, 135), label: 'A' },
            { cx: 80, cy: 135, n: needle(meters.V, CIRCUITS_VOLTMETER_FSD, 80, 135), label: 'V' },
          ] as const
        ).map((m) => (
          <g key={m.label}>
            <circle cx={m.cx} cy={m.cy} r="24" className="fill-card stroke-muted-foreground/70" strokeWidth="1.2" />
            <text x={m.cx} y={m.cy + 15} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-foreground">
              {m.label}
            </text>
            <line x1={m.cx} y1={m.cy + 6} x2={m.n.x} y2={m.n.y} className="stroke-danger" strokeWidth="1.2" />
            <text x={m.cx - 22} y={m.cy + 36} fontSize="9" className="fill-danger">+</text>
            <text x={m.cx + 18} y={m.cy + 36} fontSize="9" className="fill-foreground">−</text>
          </g>
        ))}
      {task === 'SERIES' &&
        ([
          { y: 222, label: 'R₁', bands: ['#d64545', '#d64545', '#c9a227'] },
          { y: 272, label: 'R₂', bands: ['#e08a1e', '#2b2b2b', '#c9a227'] },
        ] as const).map((r) => (
          <g key={r.label}>
            <rect x="145" y={r.y - 8} width="70" height="16" rx="3" className="fill-card stroke-muted-foreground/70" />
            {r.bands.map((c, i) => (
              <rect key={i} x={158 + i * 14} y={r.y - 8} width="5" height="16" fill={c} />
            ))}
            <text x="180" y={r.y + 20} textAnchor="middle" fontSize="8" className="fill-muted-foreground">
              {r.label}
            </text>
          </g>
        ))}
      {task === 'BRIDGE' && (
        <g>
          {/* galvanometer */}
          <circle cx="306" cy="118" r="24" className="fill-card stroke-muted-foreground/70" strokeWidth="1.2" />
          <text x="306" y="133" textAnchor="middle" fontSize="10" fontWeight="700" className="fill-foreground">G</text>
          <line x1="306" y1="124" x2={306 + 17 * Math.sin(ga)} y2={124 - 17 * Math.cos(ga)} className="stroke-danger" strokeWidth="1.2" />
          {/* the strips, gaps and wire */}
          <rect x="14" y="214" width="20" height="40" className="fill-amber-500/60" />
          <rect x="326" y="214" width="20" height="40" className="fill-amber-500/60" />
          <rect x="120" y="198" width="120" height="14" className="fill-amber-500/60" />
          <path d="M34 214 L34 200 L120 200" fill="none" className="stroke-amber-600" strokeWidth="3" />
          <path d="M326 214 L326 200 L240 200" fill="none" className="stroke-amber-600" strokeWidth="3" />
          {[
            { x: 62, label: state.swap ? `R = ${state.rbox} Ω` : 'X' },
            { x: 258, label: state.swap ? 'X' : `R = ${state.rbox} Ω` },
          ].map((gp) => (
            <g key={gp.x}>
              <rect x={gp.x} y="188" width="40" height="22" rx="3" className={gp.label === 'X' ? 'fill-sky-200 stroke-sky-700/50 dark:fill-sky-900/50' : 'fill-slate-700'} />
              <text x={gp.x + 20} y="203" textAnchor="middle" fontSize="8" className={gp.label === 'X' ? 'fill-foreground' : 'fill-white'}>
                {gp.label}
              </text>
            </g>
          ))}
          <rect x="30" y="266" width="300" height="18" className="fill-amber-100/80 stroke-amber-700/50 dark:fill-amber-900/30" strokeWidth="0.6" />
          {Array.from({ length: 11 }, (_, i) => (
            <g key={i}>
              <line x1={40 + 28 * i} x2={40 + 28 * i} y1="266" y2="274" className="stroke-foreground/70" strokeWidth="0.7" />
              <text x={40 + 28 * i} y="282" textAnchor="middle" fontSize="6" className="fill-foreground/70">
                {i * 10}
              </text>
            </g>
          ))}
          <line x1="34" x2="326" y1="262" y2="262" className="stroke-slate-500" strokeWidth="1.4" />
          <path d={`M${40 + 2.8 * state.jockey} ${touching ? 262 : 256} l-4 -12 l8 0 Z`} className="fill-slate-600" />
          <text x="180" y="296" textAnchor="middle" fontSize="8" className="fill-muted-foreground">metre bridge wire (jockey at {state.jockey.toFixed(1)} cm{touching ? ', touching' : ''})</text>
        </g>
      )}
      {state.wires.map((w, i) => {
        const [a, b] = w.split('|') as [CircuitsTerminal, CircuitsTerminal];
        if (!board.includes(a) || !board.includes(b)) return null;
        const p = at(a);
        const q = at(b);
        const d = `M${p.x} ${p.y} Q${(p.x + q.x) / 2} ${Math.max(p.y, q.y) + 22} ${q.x} ${q.y}`;
        return (
          <g key={w}>
            <path d={d} fill="none" stroke={WIRE_COLOURS[i % WIRE_COLOURS.length]} strokeWidth="2" strokeLinecap="round" opacity="0.9" />
            {onWire && <path d={d} fill="none" stroke="transparent" strokeWidth="12" className="cursor-pointer" onClick={() => onWire(w)} />}
          </g>
        );
      })}
      {board.map((t) => {
        const p = at(t);
        return (
          <g key={t}>
            <circle
              cx={p.x}
              cy={p.y}
              r="12"
              fill="transparent"
              className="cursor-pointer focus:outline-none"
              tabIndex={0}
              role="button"
              aria-label={`${NAMES[t]} terminal${picked === t ? ' (selected)' : ''}`}
              aria-pressed={picked === t}
              onClick={() => onTerminal(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onTerminal(t);
                }
              }}
            />
            <circle cx={p.x} cy={p.y} r="4.5" className={cn('pointer-events-none stroke-foreground/70', picked === t ? 'fill-brand' : 'fill-amber-400')} strokeWidth="1" />
          </g>
        );
      })}
    </svg>
  );
}

/** The centre-zero galvanometer face (±30 divisions). */
export function GalvoDial({ value, pinned }: { value: number; pinned: boolean }) {
  const cx = 130;
  const cy = 150;
  const R = 112;
  const ang = (d: number) => ((d / GALVO_DIVS) * 50 * Math.PI) / 180;
  const pt = (d: number, r: number) => ({ x: cx + r * Math.sin(ang(d)), y: cy - r * Math.cos(ang(d)) });
  const shown = Math.max(-GALVO_DIVS * 1.06, Math.min(GALVO_DIVS * 1.06, value));
  const tip = pt(shown, R - 4);
  return (
    <div>
      <svg viewBox="0 0 260 170" className="w-full rounded-xl border border-border bg-card" role="img" aria-label={`Galvanometer face: ${Math.abs(value) < 0.3 ? 'no deflection' : `${Math.abs(value).toFixed(0)} divisions to the ${value > 0 ? 'right' : 'left'}`}${pinned ? ' (hard against the stop)' : ''}`}>
        {Array.from({ length: GALVO_DIVS * 2 + 1 }, (_, i) => {
          const d = i - GALVO_DIVS;
          const major = d % 10 === 0;
          const half = !major && d % 5 === 0;
          const a = pt(d, R);
          const b = pt(d, R - (major ? 14 : half ? 10 : 6));
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-foreground/80" strokeWidth={major ? 1.2 : 0.7} />
              {major && (
                <text x={pt(d, R - 24).x} y={pt(d, R - 24).y + 3} textAnchor="middle" fontSize="9" className="fill-foreground">
                  {Math.abs(d)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} className="stroke-danger" strokeWidth="1.3" />
        <circle cx={cx} cy={cy} r="5" className="fill-foreground/80" />
        <text x={cx} y={cy - 40} textAnchor="middle" fontSize="16" fontWeight="700" className="fill-foreground/80">
          G
        </text>
      </svg>
      {pinned && <p className="mt-1 text-[11.5px] text-danger">The pointer is hard against the stop: you are far from the balance point.</p>}
    </div>
  );
}

type Update = (fn: (s: PhyCircuitsState) => PhyCircuitsState, log?: string) => void;

export function Notebook({ task, state, readOnly, update, removeReading }: { task: CircuitsTask; state: PhyCircuitsState; readOnly: boolean; update: Update; removeReading: (i: number) => void }) {
  const setAnswer = (id: CircuitsAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const setWritten = (key: 'conclusion' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, key === 'conclusion' ? 1000 : 2000) } }));
  const ans = (id: CircuitsAnswerId, label: string, hint = 'unit') => <AnswerRow key={id} id={`c-${id}`} label={label} answer={state.answers[id]} onChange={(k, x) => setAnswer(id, k, x)} readOnly={readOnly} unitHint={hint} />;
  const n = state.readings.length;
  const del = (i: number) =>
    !readOnly && (
      <Button size="icon-sm" variant="ghost" onClick={() => removeReading(i)} aria-label={`Delete reading ${i + 1}`}>
        ×
      </Button>
    );
  const empty = (cols: number) =>
    n === 0 && (
      <tr>
        <td colSpan={cols} className="py-3 text-muted-foreground">
          A row appears each time you {task === 'BRIDGE' ? 'record a balance point' : 'take a reading'}.
        </td>
      </tr>
    );
  let table: React.ReactNode;
  let graph: React.ReactNode = null;
  let answers: React.ReactNode;
  if (task === 'BRIDGE') {
    const set = (i: number, key: keyof BridgeRow, value: string) => update((s) => ({ ...s, bridge: s.bridge.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
    const head: [keyof BridgeRow, string][] = [
      ['R', 'R / Ω'],
      ['l', 'l / cm'],
      ['m', '(100 − l) / cm'],
      ['q', '(100 − l)/l'],
      ['X', 'X / Ω'],
    ];
    table = (
      <table className="w-full min-w-[420px] text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-muted-foreground">
            <th className="py-1 pr-1 font-medium">#</th>
            <th className="px-1 py-1 font-medium">X in</th>
            {head.map(([k, h]) => (
              <th key={k} className="px-1 py-1 font-medium">
                {h}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {empty(8)}
          {state.readings.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">{i + 1}</td>
              <td className="px-1 text-[11.5px]">{r.swap ? 'right gap' : 'left gap'}</td>
              {head.map(([k, h]) => (
                <td key={k} className="px-1 py-1.5">
                  <Cell value={state.bridge[i]?.[k] ?? ''} onChange={(x) => set(i, k, x)} readOnly={readOnly} label={`Row ${i + 1} ${h}`} placeholder={k === 'q' && r.swap ? '—' : undefined} />
                </td>
              ))}
              <td>{del(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
    const pts = numericPoints(state.bridge.filter((_, i) => !state.readings[i]?.swap).map((r) => [r.q, r.R]));
    graph = (
      <>
        <p className="mb-2 text-[12.5px] font-semibold">Graph of R against (100 − l)/l (X in the left gap)</p>
        <PhyGraph points={pts} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="(100 − l)/l" yLabel="R / Ω" />
      </>
    );
    answers = (
      <>
        <p className="text-[12px] text-muted-foreground">X = R l/(100 − l) with X in the left gap; X = R(100 − l)/l with X and R interchanged.</p>
        {ans('mean', '(i) Mean value of X from your table')}
        {ans('slope', '(ii) Slope of your graph of R against (100 − l)/l (= X)')}
      </>
    );
  } else if (task === 'EMF') {
    const set = (i: number, key: keyof EmfRow, value: string) => update((s) => ({ ...s, emf: s.emf.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
    table = (
      <table className="w-full min-w-[260px] text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-muted-foreground">
            <th className="py-1 pr-1 font-medium">#</th>
            <th className="px-1 py-1 font-medium">I / A</th>
            <th className="px-1 py-1 font-medium">V / V</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {empty(4)}
          {state.readings.map((_, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">{i + 1}</td>
              {(['I', 'V'] as const).map((k) => (
                <td key={k} className="px-1 py-1.5">
                  <Cell value={state.emf[i]?.[k] ?? ''} onChange={(x) => set(i, k, x)} readOnly={readOnly} label={`Reading ${i + 1} ${k === 'I' ? 'I / A' : 'V / V'}`} />
                </td>
              ))}
              <td>{del(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
    const pts = numericPoints(state.emf.map((r) => [r.I, r.V]));
    graph = (
      <>
        <p className="mb-2 text-[12.5px] font-semibold">Graph of V against I</p>
        <PhyGraph points={pts} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="I / A" yLabel="V / V" extent={{ x: 1, y: 1.6 }} />
        <p className="mt-1 text-[11.5px] text-muted-foreground">Extend your line to the V-axis (I = 0): the intercept is E.</p>
      </>
    );
    answers = (
      <>
        {ans('slope', '(i) Slope of your graph of V against I')}
        {ans('emf', '(ii) E.m.f. E (the intercept on the V-axis)')}
        {ans('r', '(iii) Internal resistance r = −slope')}
      </>
    );
  } else {
    const set = (i: number, key: keyof SeriesRow, value: string) => update((s) => ({ ...s, series: s.series.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
    table = (
      <table className="w-full min-w-[380px] text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] text-muted-foreground">
            <th className="py-1 pr-1 font-medium">#</th>
            <th className="px-1 py-1 font-medium">Arrangement</th>
            <th className="px-1 py-1 font-medium">V / V</th>
            <th className="px-1 py-1 font-medium">I / A</th>
            <th className="px-1 py-1 font-medium">R = V/I / Ω</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {empty(6)}
          {state.readings.map((_, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">{i + 1}</td>
              <td className="px-1 py-1.5">
                <select value={state.series[i]?.arr ?? ''} onChange={(e) => set(i, 'arr', e.target.value)} disabled={readOnly} className="h-9 w-[124px] rounded-lg border border-input bg-card px-1 text-[12.5px]" aria-label={`Reading ${i + 1} arrangement`}>
                  <option value="">choose…</option>
                  {SERIES_ARRANGEMENTS.map((a) => (
                    <option key={a} value={a}>
                      {SERIES_LABEL[a]}
                    </option>
                  ))}
                </select>
              </td>
              {(['V', 'I', 'R'] as const).map((k) => (
                <td key={k} className="px-1 py-1.5">
                  <Cell value={state.series[i]?.[k] ?? ''} onChange={(x) => set(i, k, x)} readOnly={readOnly} label={`Reading ${i + 1} ${k}`} />
                </td>
              ))}
              <td>{del(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
    answers = (
      <>
        {ans('r1', '(i) R₁ (measured, V/I)')}
        {ans('r2', '(ii) R₂ (measured, V/I)')}
        {ans('rs', '(iii) Series resistance (measured)')}
        {ans('rsCalc', '(iv) R₁ + R₂ (calculated)')}
        {ans('rp', '(v) Parallel resistance (measured)')}
        {ans('rpCalc', '(vi) R₁R₂/(R₁ + R₂) (calculated)')}
      </>
    );
  }
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {task === 'EMF' && <div className="mb-3">{ans('e0', 'Voltmeter reading with the key open (≈ E)')}</div>}
      <div className="overflow-x-auto">{table}</div>
      {graph && <div className="mt-5">{graph}</div>}
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Results</p>
        {answers}
      </div>
      <div className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="circ-conclusion">
            {task === 'BRIDGE' ? 'Your result for X' : task === 'EMF' ? 'What does your graph show?' : 'Compare and conclude'}
          </label>
          <Textarea id="circ-conclusion" value={state.written.conclusion} onChange={(e) => setWritten('conclusion', e.target.value)} disabled={readOnly} rows={2} />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="circ-precautions">
            Two precautions you took
          </label>
          <Textarea id="circ-precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}

/** The task card's text (shared with the 3D lab's task card). */
export function CircuitsTaskText({ task }: { task: CircuitsTask; v?: PhyCircuitsVariant }) {
  if (task === 'BRIDGE')
    return (
      <>
        <p>You are provided with a metre bridge, a resistance box R, an unknown resistor X, a centre-zero galvanometer, a jockey, a dry cell, a key and connecting wires.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Place X in the left gap and the resistance box in the right gap. Connect the cell and key across the ends A and C of the wire, and the galvanometer between the centre strip D and the jockey.</li>
          <li>With R = a suitable value, close the key and tap the jockey along the wire to find the balance point (no deflection). Measure the balance length l from A. Open the key.</li>
          <li>Repeat for at least four values of R chosen so that l lies between 30 cm and 70 cm. Then interchange X and R and find the balance point again.</li>
          <li>Tabulate R, l, 100 − l, (100 − l)/l and X = R l/(100 − l). Find the mean X. Plot R against (100 − l)/l; the slope is X.</li>
          <li>State your result and two precautions.</li>
        </ol>
      </>
    );
  if (task === 'EMF')
    return (
      <>
        <p>You are provided with a dry cell, a rheostat (0–10 Ω), an ammeter (0–1 A), a high-resistance voltmeter (0–3 V), a key and connecting wires.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Connect the cell, key, ammeter and rheostat in series, with the voltmeter directly across the cell terminals.</li>
          <li>With the key open, read and record the voltmeter.</li>
          <li>Close the key and adjust the rheostat so that I is about 0.20 A; record V. Open the key. Repeat for I ≈ 0.40, 0.60 and 0.80 A.</li>
          <li>Plot V against I. Find the slope and the intercept on the V-axis, and hence E and r (V = E − Ir).</li>
          <li>State what your graph shows and two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with two resistors R₁ and R₂, a dry cell, an ammeter (0–1 A), a voltmeter (0–3 V), a key and connecting wires.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Connect R₁ in series with the cell, key and ammeter, with the voltmeter across R₁. Close the key, record V and I, open the key. Repeat for R₂.</li>
        <li>Connect R₁ and R₂ in series, with the voltmeter across both. Record V and I.</li>
        <li>Connect R₁ and R₂ in parallel, with the voltmeter across them. Record V and I.</li>
        <li>Calculate R = V/I for each arrangement, and compare with R₁ + R₂ and R₁R₂/(R₁ + R₂).</li>
        <li>State your conclusion and two precautions.</li>
      </ol>
    </>
  );
}
