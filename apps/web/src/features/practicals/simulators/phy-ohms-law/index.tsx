import {
  OHMS_AMMETER_FSD,
  OHMS_BOARD,
  OHMS_VOLTMETER_FSD,
  ohmsMeters,
  ohmsWireKey,
  phyOhmsVariant,
  type OhmsAnswerId,
  type OhmsRow,
  type OhmsTask,
  type OhmsTerminal,
  type PhyOhmsState,
} from '@aischool/shared';
import { Cable, Gauge, Lightbulb, Trash2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints, useLabUpdate } from '../phy-common';
import type { SimulatorProps } from '../types';

const NAMES: Record<OhmsTerminal, string> = {
  'cell+': 'battery +',
  'cell-': 'battery −',
  'key-a': 'key (left)',
  'key-b': 'key (right)',
  'rh-a': 'rheostat end',
  'rh-s': 'rheostat slider',
  'am+': 'ammeter +',
  'am-': 'ammeter −',
  'vm+': 'voltmeter +',
  'vm-': 'voltmeter −',
  'res-a': 'resistor (left)',
  'res-b': 'resistor (right)',
  'w-0': 'wire, 0 cm end',
  'w-j': 'jockey',
  'w-100': 'wire, 100 cm end',
};
const WIRE_COLOURS = ['#d64545', '#2b2b2b', '#2f6fd6', '#2e9e5b', '#e08a1e', '#8a4fb0'];

function terminalAt(t: OhmsTerminal, s: Pick<PhyOhmsState, 'rheostat' | 'jockey'>): { x: number; y: number } {
  switch (t) {
    case 'cell-': return { x: 30, y: 45 };
    case 'cell+': return { x: 130, y: 45 };
    case 'key-a': return { x: 162, y: 45 };
    case 'key-b': return { x: 228, y: 45 };
    case 'rh-a': return { x: 254, y: 45 };
    case 'rh-s': return { x: 266 + 72 * s.rheostat, y: 20 };
    case 'am+': return { x: 289, y: 168 };
    case 'am-': return { x: 321, y: 168 };
    case 'vm+': return { x: 64, y: 168 };
    case 'vm-': return { x: 96, y: 168 };
    case 'res-a': return { x: 140, y: 244 };
    case 'res-b': return { x: 240, y: 244 };
    case 'w-0': return { x: 32, y: 262 };
    case 'w-100': return { x: 328, y: 262 };
    case 'w-j': return { x: 40 + 2.8 * s.jockey, y: 236 };
  }
}

function hint(s: PhyOhmsState, on: boolean, I: number): string {
  if (!s.task) return 'Choose the experiment first.';
  if (s.wires.length < 6) return `Wire the circuit: tap one terminal, then another, to join them. Battery, key, rheostat, ammeter and the ${s.task === 'WIRE' ? 'wire (0 end to the jockey)' : 'resistor'} in series; the voltmeter across the ${s.task === 'WIRE' ? 'length of wire' : 'resistor'}.`;
  if (!on) return s.readings.length ? 'Close the key, adjust and take the next reading.' : 'Close the key to switch on.';
  if (I < 0.005) return 'No current: check that the circuit is a complete loop and the ammeter is in series (not across something).';
  return s.readings.length < 5 ? `Read both meters, take the reading, then open the key. Change the ${s.task === 'WIRE' ? 'length L' : 'rheostat'} for the next one.` : 'Fill in the table, plot your graph and work out the answers.';
}

/** Lessons that open this lab on the resistance-wire task (every other lesson starts on Ohm's law). */
const WIRE_LESSONS = ['pr-phy-resistivity-of-wire'];

export default function PhyOhmsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-ohms-law'>) {
  const v = useMemo(() => phyOhmsVariant(seed), [seed]);
  const { update } = useLabUpdate(state, onChange, readOnly, startedAt);
  const [picked, setPicked] = useState<OhmsTerminal | null>(null);
  // Pre-select the experiment from the lesson that opened the lab (the student can still change it before the first reading).
  useEffect(() => {
    if (!readOnly && !state.task && !state.readings.length) update((s) => (s.task ? s : { ...s, task: practicalId && WIRE_LESSONS.includes(practicalId) ? 'WIRE' : 'OHM' }), 'task:auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, practicalId]);
  const task: OhmsTask = state.task ?? 'OHM';
  const board = OHMS_BOARD[task];
  const meters = ohmsMeters(v, { task, wires: state.wires, key: state.key, rheostat: state.rheostat, jockey: state.jockey, heat: state.heat }, state.readings.length);

  const chooseTask = (t: OhmsTask) => update((s) => ({ ...s, task: t, wires: [], key: false, heat: 0, line: null }), `task:${t}`);
  const tapTerminal = (t: OhmsTerminal) => {
    if (readOnly) return;
    if (!picked) return setPicked(t);
    if (picked === t) return setPicked(null);
    const key = ohmsWireKey(picked, t);
    setPicked(null);
    update((s) => (s.wires.includes(key) || s.wires.length >= 24 ? s : { ...s, wires: [...s.wires, key] }), `wire:${key}`);
  };
  const removeWire = (w: string) => update((s) => ({ ...s, wires: s.wires.filter((x) => x !== w) }), `unwire:${w}`);
  const toggleKey = () => update((s) => ({ ...s, key: !s.key, heat: 0 }), state.key ? 'open-key' : 'close-key');
  const takeReading = () =>
    update(
      (s) => ({ ...s, readings: [...s.readings, { wires: s.wires, rheostat: s.rheostat, jockey: s.jockey, heat: s.heat }].slice(0, 14), table: [...s.table, { L: '', I: '', V: '', R: '' }].slice(0, 14), heat: s.heat + 1 }),
      `reading:${state.rheostat.toFixed(2)}:${state.jockey}`,
    );
  const removeReading = (i: number) => update((s) => ({ ...s, readings: s.readings.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `remove-reading:${i}`);

  return (
    <div className="space-y-4">
      <TaskCard icon={<Zap className="size-4 text-muted-foreground" aria-hidden />}>
        {state.task === 'WIRE' ? (
          <>
            <p>
              You are provided with a {v.wire.material} wire of diameter d = {v.wire.diameterMm.toFixed(2)} mm stretched along a metre rule, a battery (2 × 1.5 V), a key, a rheostat, an ammeter (0–1 A), a voltmeter (0–3 V) and a jockey.
            </p>
            <ol className="list-[lower-roman] space-y-0.5 pl-6">
              <li>Connect the circuit with a length L of the wire (from the 0 cm end to the jockey) in series with the ammeter, and the voltmeter across that length.</li>
              <li>For L = 20, 40, 60, 80 and 100 cm, close the key, read I and V, then open the key. Work out R = V/I.</li>
              <li>Plot R against L and find the slope. Work out the cross-sectional area A = πd²/4 in m², and hence ρ = slope × A.</li>
              <li>State what your graph shows and two precautions you took.</li>
            </ol>
          </>
        ) : (
          <>
            <p>You are provided with a battery (2 × 1.5 V), a key, a rheostat, an ammeter (0–1 A), a voltmeter (0–3 V) and a standard resistor R.</p>
            <ol className="list-[lower-roman] space-y-0.5 pl-6">
              <li>Connect the battery, key, rheostat, ammeter and R in series, with the voltmeter across R.</li>
              <li>Close the key and adjust the rheostat; record the current I and p.d. V. Open the key. Obtain at least five pairs of readings.</li>
              <li>Tabulate I, V and V/I. Plot V against I and find the slope. Hence find R.</li>
              <li>State what your graph shows and two precautions you took.</li>
            </ol>
          </>
        )}
        {!readOnly && state.readings.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['OHM', 'WIRE'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => chooseTask(t)} aria-pressed={state.task === t}>
                {t === 'OHM' ? "Verify Ohm's law (resistor)" : 'Resistivity of a wire'}
              </Button>
            ))}
          </div>
        )}
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
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {hint(state, state.key, meters.I)}
              </p>
            )}
            {state.task ? (
              <BoardSvg state={state} task={task} board={board} picked={picked} onTerminal={tapTerminal} onWire={readOnly ? undefined : removeWire} meters={meters} />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] text-muted-foreground">Choose the experiment above to set out the board.</p>
            )}
            {picked && <p className="mt-2 text-[12.5px] text-info">Joining from {NAMES[picked]}: tap the terminal to connect it to (tap it again to cancel).</p>}
            {state.task && !readOnly && (
              <div className="mt-4 space-y-3">
                <Step title="Controls">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant={state.key ? 'secondary' : 'brand'} onClick={toggleKey}>
                      {state.key ? 'Open the key' : 'Close the key'}
                    </Button>
                    <Button size="sm" onClick={takeReading} disabled={!state.key || state.readings.length >= 14}>
                      <Gauge /> Take this reading
                    </Button>
                  </div>
                  <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="w-28 text-muted-foreground">Rheostat slider</span>
                    <input type="range" min={0} max={100} step={1} value={Math.round(state.rheostat * 100)} onChange={(e) => update((s) => ({ ...s, rheostat: Number(e.target.value) / 100 }))} className="w-44 accent-[var(--brand)]" aria-label="Rheostat slider position" />
                  </label>
                  {task === 'WIRE' && (
                    <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
                      <span className="w-28 text-muted-foreground">Jockey at L =</span>
                      <input type="range" min={5} max={100} step={0.5} value={state.jockey} onChange={(e) => update((s) => ({ ...s, jockey: Number(e.target.value) }))} className="w-44 accent-[var(--brand)]" aria-label="Jockey position along the wire (cm)" />
                      <span className="tabular font-medium">{state.jockey.toFixed(1)} cm</span>
                    </label>
                  )}
                </Step>
                <Step title={`Wires (${state.wires.length})`}>
                  {state.wires.length === 0 ? (
                    <p className="text-[12.5px] text-muted-foreground">No wires yet. Tap a terminal, then another, to join them.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {state.wires.map((w, i) => {
                        const [a, b] = w.split('|') as [OhmsTerminal, OhmsTerminal];
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
          {state.task && (
            <Card className="p-4 sm:p-5">
              <h3 className="mb-3 flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
                <Gauge className="size-4 text-muted-foreground" aria-hidden /> Meters (close-up)
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Dial label="A" unit="ammeter, A" value={meters.I} fsd={OHMS_AMMETER_FSD} minor={0.02} major={0.1} over={meters.overI} back={meters.backI} />
                <Dial label="V" unit="voltmeter, V" value={meters.V} fsd={OHMS_VOLTMETER_FSD} minor={0.1} major={0.5} over={meters.overV} back={meters.backV} />
              </div>
              <p className="mt-2 text-[11.5px] text-muted-foreground">Read the pointer from directly in front, to the nearest half division; record to 2 decimal places.</p>
            </Card>
          )}
        </div>
        <Notebook task={task} state={state} readOnly={readOnly} update={update} removeReading={removeReading} />
      </div>
    </div>
  );
}

function BoardSvg({ state, task, board, picked, onTerminal, onWire, meters }: { state: PhyOhmsState; task: OhmsTask; board: OhmsTerminal[]; picked: OhmsTerminal | null; onTerminal: (t: OhmsTerminal) => void; onWire?: (w: string) => void; meters: { I: number; V: number } }) {
  const at = (t: OhmsTerminal) => terminalAt(t, state);
  const needle = (val: number, fsd: number, cx: number, cy: number) => {
    const a = ((-50 + 100 * Math.max(-0.03, Math.min(1.04, val / fsd))) * Math.PI) / 180;
    return { x: cx + 17 * Math.sin(a), y: cy + 6 - 17 * Math.cos(a) };
  };
  const nA = needle(meters.I, OHMS_AMMETER_FSD, 305, 135);
  const nV = needle(meters.V, OHMS_VOLTMETER_FSD, 80, 135);
  return (
    <svg viewBox="0 0 360 300" className="w-full touch-manipulation select-none rounded-xl border border-border bg-muted/30" role="group" aria-label="Circuit board: tap two terminals to join them with a wire">
      {/* battery */}
      <g>
        <rect x="40" y="30" width="80" height="30" rx="4" className="fill-card stroke-muted-foreground/60" />
        <line x1="70" x2="70" y1="36" y2="54" className="stroke-foreground" strokeWidth="2" />
        <line x1="76" x2="76" y1="40" y2="50" className="stroke-foreground" strokeWidth="4" />
        <line x1="88" x2="88" y1="36" y2="54" className="stroke-foreground" strokeWidth="2" />
        <line x1="94" x2="94" y1="40" y2="50" className="stroke-foreground" strokeWidth="4" />
        <text x="80" y="72" textAnchor="middle" fontSize="8" className="fill-muted-foreground">battery 3.0 V</text>
        <text x="122" y="38" fontSize="9" className="fill-danger">+</text>
        <text x="33" y="38" fontSize="9" className="fill-foreground">−</text>
      </g>
      {/* key */}
      <g>
        <rect x="170" y="34" width="50" height="22" rx="3" className="fill-amber-200/60 stroke-amber-700/50 dark:fill-amber-900/40" />
        {state.key ? <rect x="188" y="26" width="14" height="22" rx="2" className="fill-slate-600" /> : <rect x="200" y="12" width="14" height="18" rx="2" className="fill-slate-600" transform="rotate(25 207 21)" />}
        <text x="195" y="72" textAnchor="middle" fontSize="8" className="fill-muted-foreground">key {state.key ? '(closed)' : '(open)'}</text>
      </g>
      {/* rheostat */}
      <g>
        <rect x="262" y="36" width="80" height="18" rx="9" className="fill-card stroke-muted-foreground/60" />
        {Array.from({ length: 16 }, (_, i) => (
          <line key={i} x1={266 + i * 4.8} x2={266 + i * 4.8} y1="38" y2="52" className="stroke-amber-700/70" strokeWidth="1" />
        ))}
        <line x1="262" x2="342" y1="28" y2="28" className="stroke-muted-foreground/60" strokeWidth="2" />
        <rect x={262 + 72 * state.rheostat} y="24" width="8" height="16" rx="1.5" className="fill-slate-600" />
        <text x="302" y="72" textAnchor="middle" fontSize="8" className="fill-muted-foreground">rheostat</text>
      </g>
      {/* ammeter and voltmeter */}
      {(
        [
          { cx: 305, cy: 135, n: nA, label: 'A' },
          { cx: 80, cy: 135, n: nV, label: 'V' },
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
      {/* the test element */}
      {task === 'OHM' ? (
        <g>
          <rect x="150" y="236" width="80" height="16" rx="3" className="fill-card stroke-muted-foreground/70" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={162 + i * 16} y="236" width="5" height="16" fill={['#7a4b2a', '#2b2b2b', '#d64545', '#c9a227'][i]} />
          ))}
          <text x="190" y="268" textAnchor="middle" fontSize="8" className="fill-muted-foreground">resistor R</text>
        </g>
      ) : (
        <g>
          <rect x="30" y="266" width="300" height="18" className="fill-amber-100/80 stroke-amber-700/50 dark:fill-amber-900/30" strokeWidth="0.6" />
          {Array.from({ length: 11 }, (_, i) => (
            <g key={i}>
              <line x1={40 + 28 * i} x2={40 + 28 * i} y1="266" y2="274" className="stroke-foreground/70" strokeWidth="0.7" />
              <text x={40 + 28 * i} y="282" textAnchor="middle" fontSize="6" className="fill-foreground/70">
                {i * 10}
              </text>
            </g>
          ))}
          <line x1="40" x2="320" y1="262" y2="262" className="stroke-slate-500" strokeWidth="1.4" />
          <path d={`M${40 + 2.8 * state.jockey} 262 l-4 -12 l8 0 Z`} className="fill-slate-600" />
          <text x="180" y="296" textAnchor="middle" fontSize="8" className="fill-muted-foreground">resistance wire on a metre rule (jockey at {state.jockey.toFixed(1)} cm)</text>
        </g>
      )}
      {/* wires */}
      {state.wires.map((w, i) => {
        const [a, b] = w.split('|') as [OhmsTerminal, OhmsTerminal];
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
      {/* terminals */}
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

/** A large analogue meter face. */
function Dial({ label, unit, value, fsd, minor, major, over, back }: { label: string; unit: string; value: number; fsd: number; minor: number; major: number; over: boolean; back: boolean }) {
  const cx = 130;
  const cy = 150;
  const R = 112;
  const ang = (x: number) => ((-50 + 100 * (x / fsd)) * Math.PI) / 180;
  const pt = (x: number, r: number) => ({ x: cx + r * Math.sin(ang(x)), y: cy - r * Math.cos(ang(x)) });
  const ticks = Math.round(fsd / minor);
  const shown = over ? fsd * 1.04 : back ? -0.03 * fsd : value;
  const tip = pt(shown, R - 4);
  return (
    <div>
      <svg viewBox="0 0 260 170" className="w-full rounded-xl border border-border bg-card" role="img" aria-label={`${unit} face${over ? ': the pointer is hard against the end stop' : back ? ': the pointer kicks backwards below zero' : ''}`}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const x = i * minor;
          const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
          const half = !isMajor && Math.abs(x / (major / 2) - Math.round(x / (major / 2))) < 1e-6;
          const a = pt(x, R);
          const b = pt(x, R - (isMajor ? 14 : half ? 10 : 6));
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-foreground/80" strokeWidth={isMajor ? 1.2 : 0.7} />
              {isMajor && (
                <text x={pt(x, R - 24).x} y={pt(x, R - 24).y + 3} textAnchor="middle" fontSize="9" className="fill-foreground">
                  {Number(x.toFixed(2))}
                </text>
              )}
            </g>
          );
        })}
        <path d={`M${pt(0, R).x} ${pt(0, R).y} A${R} ${R} 0 0 1 ${pt(fsd, R).x} ${pt(fsd, R).y}`} fill="none" className="stroke-foreground/60" strokeWidth="0.8" />
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} className="stroke-danger" strokeWidth="1.3" />
        <circle cx={cx} cy={cy} r="5" className="fill-foreground/80" />
        <text x={cx} y={cy - 40} textAnchor="middle" fontSize="16" fontWeight="700" className="fill-foreground/80">
          {label}
        </text>
      </svg>
      {(over || back) && <p className="mt-1 text-[11.5px] text-danger">{over ? 'The pointer is hard against the end stop: too much current/p.d. for this meter.' : 'The pointer kicks backwards: the meter is connected the wrong way round.'}</p>}
    </div>
  );
}

function Notebook({ task, state, readOnly, update, removeReading }: { task: OhmsTask; state: PhyOhmsState; readOnly: boolean; update: (fn: (s: PhyOhmsState) => PhyOhmsState, log?: string) => void; removeReading: (i: number) => void }) {
  const wire = task === 'WIRE';
  const setCell = (i: number, key: keyof OhmsRow, value: string) => update((s) => ({ ...s, table: s.table.map((row, k) => (k === i ? { ...row, [key]: value } : row)) }));
  const setAnswer = (id: OhmsAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const setWritten = (key: 'conclusion' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, key === 'conclusion' ? 1000 : 2000) } }));
  const cols: (keyof OhmsRow)[] = wire ? ['L', 'I', 'V', 'R'] : ['I', 'V', 'R'];
  const head: Record<keyof OhmsRow, string> = { L: 'L / cm', I: 'I / A', V: 'V / V', R: wire ? 'R = V/I / Ω' : 'V/I / Ω' };
  const points = numericPoints(state.table.map((r) => (wire ? [r.L, r.R] : [r.I, r.V])));
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="py-1 pr-1 font-medium">#</th>
              {cols.map((c) => (
                <th key={c} className="px-1 py-1 font-medium">
                  {head[c]}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {state.readings.length === 0 && (
              <tr>
                <td colSpan={cols.length + 2} className="py-3 text-muted-foreground">
                  A row appears each time you take a reading.
                </td>
              </tr>
            )}
            {state.readings.map((_, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5 pr-1 text-[11.5px] text-muted-foreground">{i + 1}</td>
                {cols.map((c) => (
                  <td key={c} className="px-1 py-1.5">
                    <Cell value={state.table[i]?.[c] ?? ''} onChange={(x) => setCell(i, c, x)} readOnly={readOnly} label={`Reading ${i + 1} ${head[c]}`} />
                  </td>
                ))}
                <td>
                  {!readOnly && (
                    <Button size="icon-sm" variant="ghost" onClick={() => removeReading(i)} aria-label={`Delete reading ${i + 1}`}>
                      ×
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">{wire ? 'Graph of R against L' : 'Graph of V against I'}</p>
        <PhyGraph points={points} line={state.line} onLine={(line) => update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel={wire ? 'L / cm' : 'I / A'} yLabel={wire ? 'R / Ω' : 'V / V'} />
      </div>
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {wire ? (
          <>
            <AnswerRow id="area" label="(i) Cross-sectional area A = πd²/4 (in m²)" answer={state.answers.area} onChange={(k, x) => setAnswer('area', k, x)} readOnly={readOnly} unitHint="e.g. m²" />
            <AnswerRow id="slope" label="(ii) Slope of your graph of R against L" answer={state.answers.slope} onChange={(k, x) => setAnswer('slope', k, x)} readOnly={readOnly} unitHint="e.g. Ω m⁻¹" />
            <AnswerRow id="result" label="(iii) Resistivity ρ = slope × A" answer={state.answers.result} onChange={(k, x) => setAnswer('result', k, x)} readOnly={readOnly} unitHint="unit" />
          </>
        ) : (
          <>
            <AnswerRow id="slope" label="(i) Slope of your graph of V against I" answer={state.answers.slope} onChange={(k, x) => setAnswer('slope', k, x)} readOnly={readOnly} unitHint="unit" />
            <AnswerRow id="result" label="(ii) Resistance R of the resistor" answer={state.answers.result} onChange={(k, x) => setAnswer('result', k, x)} readOnly={readOnly} unitHint="unit" />
          </>
        )}
        <p className="text-[11.5px] text-muted-foreground">Write powers of ten as e.g. 1.26 x 10^-7 or 1.26e-7.</p>
      </div>
      <div className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="ohm-conclusion">
            What does your graph show?
          </label>
          <Textarea id="ohm-conclusion" value={state.written.conclusion} onChange={(e) => setWritten('conclusion', e.target.value)} disabled={readOnly} rows={2} />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="ohm-precautions">
            Two precautions you took
          </label>
          <Textarea id="ohm-precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}
