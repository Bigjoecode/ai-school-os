import { SERIES_ARRANGEMENTS, SERIES_LABEL, type CircuitsTerminal, type PhyCircuitsState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Cable, Eye, Gauge, Hand, Power, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import type { Circuits } from '../actions';
import { NAMES, WIRE_COLOURS } from '../index';
import { useBench, wireDrag, type ReadTarget } from './bench-store';
import { scaleSpot } from './content';

/** The circuits bench's HUD: the dock, the reading panel, the drag feedback. */

export function CircuitsDragFeedback({ drag, s }: { drag: DragState; s: PhyCircuitsState }) {
  const pill = 'absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg';
  if (drag.kind === 'wire') {
    const from = drag.id.slice(5) as CircuitsTerminal;
    return <span className={pill}>Wire from {NAMES[from]} {wireDrag.over ? `→ ${NAMES[wireDrag.over]} (let go to join)` : '— drag it to another terminal'}</span>;
  }
  if (drag.kind === 'rheo') return <span className={pill}>Rheostat: {(s.rheostat * 10).toFixed(2)} Ω in use</span>;
  if (drag.kind === 'jockey') return <span className={pill}>Jockey at {s.jockey.toFixed(1)} cm {s.pressed ? '— pressed: it is scraping the wire!' : '(lifted: let go, then tap)'}</span>;
  return null;
}

export function CircuitsDock({ o, s, compact }: { o: Circuits; s: PhyCircuitsState; compact: boolean }) {
  const [list, setList] = useState(false);
  const task = o.task;
  const take = () => {
    if (!s.key) return notify('Close the key first: the circuit only works with the current on.', 'info');
    o.takeReading();
    play('success');
  };
  const step = (label: string, run: () => void, aria: string) => (
    <button type="button" className="px-1.5 text-[13px] font-semibold" onClick={run} aria-label={aria}>
      {label}
    </button>
  );
  return (
    <div className={cn(dockClass, 'max-w-[min(600px,calc(100vw-1rem))]')}>
      {list && (
        <div className="flex w-full flex-wrap gap-1">
          {s.wires.length === 0 && <span className="text-[12px] text-white/70">No wires yet: drag from one terminal to another.</span>}
          {s.wires.map((w, i) => {
            const [a, b] = w.split('|') as [CircuitsTerminal, CircuitsTerminal];
            return (
              <button key={w} type="button" onClick={() => o.removeWire(w)} className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-1 text-[11px] hover:bg-white/20" aria-label={`Remove the wire from ${NAMES[a]} to ${NAMES[b]}`}>
                <span className="size-2 rounded-full" style={{ background: WIRE_COLOURS[i % WIRE_COLOURS.length] }} aria-hidden />
                {NAMES[a]} – {NAMES[b]} <Trash2 className="size-3" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
      <Button size="sm" variant="outline" className={cn(dockButton, list && 'bg-white/25')} onClick={() => setList((x) => !x)} aria-expanded={list}>
        <Cable /> {compact ? s.wires.length : `Wires (${s.wires.length})`}
      </Button>
      <Button size="sm" variant={s.key ? 'outline' : 'brand'} className={cn(s.key && dockButton)} onClick={() => (o.toggleKey(), play('clink'))} aria-pressed={s.key}>
        <Power /> {s.key ? 'Open key' : 'Close key'}
      </Button>
      {task === 'EMF' && (
        <div className="flex items-center gap-1 rounded-lg border border-white/20 px-1 py-0.5" role="group" aria-label="Rheostat">
          {step('−', () => o.setRheostat(s.rheostat - 0.005), 'Less resistance')}
          <input type="range" min={0} max={200} step={1} value={Math.round(s.rheostat * 200)} onChange={(e) => o.setRheostat(Number(e.target.value) / 200)} className={cn('accent-amber-300', compact ? 'w-20' : 'w-28')} aria-label="Rheostat slider position" />
          {step('+', () => o.setRheostat(s.rheostat + 0.005), 'More resistance')}
          <span className="w-[50px] text-right text-[11.5px] tabular text-white/85">{(s.rheostat * 10).toFixed(2)} Ω</span>
        </div>
      )}
      {task === 'BRIDGE' && (
        <>
          <div className="flex items-center gap-0.5 rounded-lg border border-white/20 px-1 py-0.5" role="group" aria-label="Jockey position">
            {step('◀◀', () => o.setJockey(s.jockey - 1), 'Move the jockey 1 cm towards A')}
            {step('◀', () => o.setJockey(s.jockey - 0.1), 'Move the jockey 0.1 cm towards A')}
            <span className="w-[52px] text-center text-[11.5px] tabular text-white/85">{s.jockey.toFixed(1)} cm</span>
            {step('▶', () => o.setJockey(s.jockey + 0.1), 'Move the jockey 0.1 cm towards C')}
            {step('▶▶', () => o.setJockey(s.jockey + 1), 'Move the jockey 1 cm towards C')}
          </div>
          <Button size="sm" variant="outline" className={dockButton} onClick={() => (o.tap(), play('tick'))} disabled={s.pressed}>
            <Hand /> Tap
          </Button>
          <div className="flex items-center gap-0.5 rounded-lg border border-white/20 px-1 py-0.5" role="group" aria-label="Resistance box">
            {step('−', () => o.setRbox(s.rbox - 1), 'One ohm less on the resistance box')}
            <span className="w-[48px] text-center text-[11.5px] tabular text-white/85">R {s.rbox} Ω</span>
            {step('+', () => o.setRbox(s.rbox + 1), 'One ohm more on the resistance box')}
          </div>
          <Button size="sm" variant="outline" className={cn(dockButton, s.swap && 'bg-white/25')} onClick={() => (s.key ? notify('Open the key before changing the gaps.', 'info') : (o.toggleSwap(), play('clink')))} aria-pressed={s.swap} aria-label={s.swap ? 'Put X back in the left gap' : 'Interchange X and R'}>
            <Repeat /> {compact ? '' : s.swap ? 'X right' : 'Swap X, R'}
          </Button>
        </>
      )}
      <Button size="sm" variant="brand" className={cn(!s.key && 'opacity-55')} aria-disabled={!s.key} onClick={take}>
        <Gauge /> {compact ? 'Record' : task === 'BRIDGE' ? 'Record balance' : 'Take reading'}
      </Button>
    </div>
  );
}

const TARGET_NAME: Record<ReadTarget, string> = { A: 'Ammeter', V: 'Voltmeter', G: 'Galvanometer', L: 'Scale at the jockey' };

/** The reading view: what is being read, eye position, and the current row's cells. */
export function ReadingPanel({ o, s, onBack }: { o: Circuits; s: PhyCircuitsState; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  const meter = useBench((b) => b.meter);
  const task = o.task;
  const row = s.readings.length - 1;
  const level = Math.abs(eye) < 0.004 ? 'level' : eye > 0 ? 'above' : 'below';
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  const targets: ReadTarget[] = task === 'BRIDGE' ? ['G'] : ['A', 'V'];
  const cell = (label: string, value: string, onChange: (x: string) => void, placeholder?: string) => (
    <label className="text-[11.5px] text-muted-foreground">
      {label}
      <Input value={value} onChange={(e) => onChange(e.target.value.slice(0, 40))} inputMode="decimal" placeholder={placeholder} className="mt-0.5 h-9 w-[70px] tabular" />
    </label>
  );
  const upd = <K extends 'bridge' | 'emf' | 'series'>(k: K, key: string, value: string) => o.update((x) => ({ ...x, [k]: (x[k] as unknown as Record<string, string>[]).map((r, i) => (i === row ? { ...r, [key]: value } : r)) }));
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> {TARGET_NAME[targets.includes(meter) ? meter : targets[0]!]}
        </p>
        <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="What to read">
          {targets.map((m) => (
            <button key={m} type="button" onClick={() => useBench.setState({ meter: m })} aria-pressed={meter === m} className={cn('px-2.5 py-1 text-[12px] font-semibold', meter === m ? 'bg-foreground text-background' : 'hover:bg-muted')}>
              {m === 'A' ? 'Ammeter' : m === 'V' ? 'Voltmeter' : m === 'G' ? 'Galvanometer' : 'Scale'}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
        {meter === 'L' ? 'Look straight down at the jockey’s knife edge and read the scale to 0.1 cm (from the A end).' : meter === 'G' ? 'Tap the jockey and watch the pointer: no deflection means balance.' : `Look straight at the pointer (${level === 'level' ? 'your eye is level with it' : `your eye is ${level} it — the pointer seems to move`}). Read to half a division, 2 decimal places.`}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        {meter !== 'L' && meter !== 'G' && (
          <div className="flex gap-1">
            <Button size="icon-sm" variant="outline" onClick={() => nudge(0.004)} aria-label="Raise your eye">
              <ArrowUp />
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.004)} aria-label="Lower your eye">
              <ArrowDown />
            </Button>
          </div>
        )}
        {task === 'BRIDGE' && (
          <>
            <Button size="sm" variant="outline" onClick={() => (o.tap(), play('tick'))} disabled={s.pressed}>
              <Hand /> Tap
            </Button>
            <Button size="sm" variant="outline" onClick={() => o.setJockey(s.jockey - 0.1)} aria-label="Move the jockey 0.1 cm towards A">
              ◀ 0.1
            </Button>
            <Button size="sm" variant="outline" onClick={() => o.setJockey(s.jockey + 0.1)} aria-label="Move the jockey 0.1 cm towards C">
              0.1 ▶
            </Button>
            <Button size="sm" variant="outline" onClick={() => useLabView.getState().set({ mode: 'bench', spot: scaleSpot(s.jockey) })}>
              Scale
            </Button>
          </>
        )}
        {row >= 0 ? (
          task === 'BRIDGE' ? (
            cell(`#${row + 1} l / cm`, s.bridge[row]?.l ?? '', (x) => upd('bridge', 'l', x), '0.0')
          ) : task === 'EMF' ? (
            <>
              {cell(`#${row + 1} I / A`, s.emf[row]?.I ?? '', (x) => upd('emf', 'I', x), '0.00')}
              {cell('V / V', s.emf[row]?.V ?? '', (x) => upd('emf', 'V', x), '0.00')}
            </>
          ) : (
            <>
              <label className="text-[11.5px] text-muted-foreground">
                #{row + 1}
                <select value={s.series[row]?.arr ?? ''} onChange={(e) => upd('series', 'arr', e.target.value)} className="mt-0.5 block h-9 w-[110px] rounded-lg border border-input bg-card px-1 text-[12px]" aria-label="Arrangement">
                  <option value="">choose…</option>
                  {SERIES_ARRANGEMENTS.map((a) => (
                    <option key={a} value={a}>
                      {SERIES_LABEL[a]}
                    </option>
                  ))}
                </select>
              </label>
              {cell('V / V', s.series[row]?.V ?? '', (x) => upd('series', 'V', x), '0.00')}
              {cell('I / A', s.series[row]?.I ?? '', (x) => upd('series', 'I', x), '0.00')}
            </>
          )
        ) : (
          <p className="text-[12px] text-muted-foreground">{task === 'BRIDGE' ? 'Record a balance point to start a row.' : 'Take a reading to start a row in your table.'}</p>
        )}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" disabled={!s.key} onClick={() => (o.takeReading(), play('success'))}>
            <Gauge /> New row
          </Button>
          <Button size="sm" variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </section>
  );
}
