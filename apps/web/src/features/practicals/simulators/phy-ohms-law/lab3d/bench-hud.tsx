import { type OhmsTerminal, type PhyOhmsState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Cable, Eye, Gauge, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import type { Ohms } from '../actions';
import { NAMES, WIRE_COLOURS } from '../index';
import { useBench, wireDrag } from './bench-store';

/** The circuit bench's HUD: the dock (key, rheostat, jockey, reading), the meter-reading panel, drag feedback. */

export function OhmsDragFeedback({ drag, s }: { drag: DragState; s: PhyOhmsState }) {
  const pill = 'absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg';
  if (drag.kind === 'wire') {
    const from = drag.id.slice(5) as OhmsTerminal;
    return <span className={pill}>Wire from {NAMES[from]} {wireDrag.over ? `→ ${NAMES[wireDrag.over]} (let go to join)` : '— drag it to another terminal'}</span>;
  }
  if (drag.kind === 'rheo') return <span className={pill}>Rheostat slider: {Math.round(s.rheostat * 100)} % of 20 Ω</span>;
  if (drag.kind === 'jockey') return <span className={pill}>Jockey at L = {s.jockey.toFixed(1)} cm</span>;
  return null;
}

export function OhmsDock({ o, s, compact }: { o: Ohms; s: PhyOhmsState; compact: boolean }) {
  const [list, setList] = useState(false);
  const wire = o.task === 'WIRE';
  return (
    <div className={cn(dockClass, 'max-w-[min(560px,calc(100vw-1rem))]')}>
      {list && (
        <div className="flex w-full flex-wrap gap-1">
          {s.wires.length === 0 && <span className="text-[12px] text-white/70">No wires yet: drag from one terminal to another.</span>}
          {s.wires.map((w, i) => {
            const [a, b] = w.split('|') as [OhmsTerminal, OhmsTerminal];
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
      <div className="flex items-center gap-1 rounded-lg border border-white/20 px-1 py-0.5" role="group" aria-label={wire ? 'Jockey position' : 'Rheostat slider'}>
        <button type="button" className="px-1.5 text-[14px] font-semibold" onClick={() => (wire ? o.setJockey(s.jockey - (compact ? 10 : 1)) : o.setRheostat(s.rheostat - 0.05))} aria-label={wire ? 'Move the jockey towards 0' : 'Less resistance'}>
          −
        </button>
        <input
          type="range"
          min={wire ? 5 : 0}
          max={100}
          step={wire ? 0.5 : 1}
          value={wire ? s.jockey : Math.round(s.rheostat * 100)}
          onChange={(e) => (wire ? o.setJockey(Number(e.target.value)) : o.setRheostat(Number(e.target.value) / 100))}
          className={cn('accent-amber-300', compact ? 'w-20' : 'w-28')}
          aria-label={wire ? 'Jockey position along the wire (cm)' : 'Rheostat slider position'}
        />
        <button type="button" className="px-1.5 text-[14px] font-semibold" onClick={() => (wire ? o.setJockey(s.jockey + (compact ? 10 : 1)) : o.setRheostat(s.rheostat + 0.05))} aria-label={wire ? 'Move the jockey towards 100' : 'More resistance'}>
          +
        </button>
        <span className="w-[52px] text-right text-[11.5px] tabular text-white/85">{wire ? `${s.jockey.toFixed(1)} cm` : `rh ${Math.round(s.rheostat * 100)}%`}</span>
      </div>
      <Button
        size="sm"
        variant="brand"
        className={cn(!s.key && 'opacity-55')}
        aria-disabled={!s.key}
        onClick={() => {
          if (!s.key) return notify('Close the key first: the meters only read with the current on.', 'info');
          o.takeReading();
          play('success');
        }}
      >
        <Gauge /> {compact ? 'Reading' : 'Take reading'}
      </Button>
    </div>
  );
}

/** The reading view: which meter, eye position, and the current row's cells. */
export function ReadingPanel({ o, s, onBack }: { o: Ohms; s: PhyOhmsState; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  const meter = useBench((b) => b.meter);
  const row = s.readings.length - 1;
  const wire = o.task === 'WIRE';
  const level = Math.abs(eye) < 0.004 ? 'level' : eye > 0 ? 'above' : 'below';
  const setCell = (key: 'I' | 'V' | 'L' | 'R', value: string) => o.update((x) => ({ ...x, table: x.table.map((r, k) => (k === row ? { ...r, [key]: value.slice(0, 40) } : r)) }));
  const nudge = (d: number) => set({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-md rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the meters">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> Read the {meter === 'A' ? 'ammeter' : 'voltmeter'}
        </p>
        <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Which meter">
          {(['A', 'V'] as const).map((m) => (
            <button key={m} type="button" onClick={() => useBench.setState({ meter: m })} aria-pressed={meter === m} className={cn('px-2.5 py-1 text-[12px] font-semibold', meter === m ? 'bg-foreground text-background' : 'hover:bg-muted')}>
              {m === 'A' ? 'Ammeter' : 'Voltmeter'}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
        Look straight at the pointer ({level === 'level' ? 'your eye is level with it' : `your eye is ${level} it — the pointer seems to move`}). Read to half a division, 2 decimal places.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="flex gap-1">
          <Button size="icon-sm" variant="outline" onClick={() => nudge(0.004)} aria-label="Raise your eye">
            <ArrowUp />
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.004)} aria-label="Lower your eye">
            <ArrowDown />
          </Button>
        </div>
        {row >= 0 ? (
          <>
            {wire && (
              <label className="text-[11.5px] text-muted-foreground">
                L / cm
                <Input value={s.table[row]?.L ?? ''} onChange={(e) => setCell('L', e.target.value)} inputMode="decimal" className="mt-0.5 h-9 w-[70px] tabular" />
              </label>
            )}
            <label className="text-[11.5px] text-muted-foreground">
              #{row + 1} I / A
              <Input value={s.table[row]?.I ?? ''} onChange={(e) => setCell('I', e.target.value)} inputMode="decimal" placeholder="0.00" className="mt-0.5 h-9 w-[70px] tabular" />
            </label>
            <label className="text-[11.5px] text-muted-foreground">
              V / V
              <Input value={s.table[row]?.V ?? ''} onChange={(e) => setCell('V', e.target.value)} inputMode="decimal" placeholder="0.00" className="mt-0.5 h-9 w-[70px] tabular" />
            </label>
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">Take a reading to start a row in your table.</p>
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
