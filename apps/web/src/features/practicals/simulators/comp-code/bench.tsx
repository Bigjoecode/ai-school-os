import { MAINT_ACTIONS, WIRE_NAME, crimpRun, maintRun, type CrimpEnd, type MaintAction } from '@aischool/shared';
import { ArrowLeftRight, Check, Scissors, Zap } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Comp } from './actions';

/** The two workshop practicals' benches, the same in 2D and in the 3D lab's overlay. */

const COLOUR: Record<string, [string, string | null]> = { wo: ['#f8fafc', '#ea7c1b'], o: ['#ea7c1b', null], wg: ['#f8fafc', '#16a34a'], b: ['#2563eb', null], wb: ['#f8fafc', '#2563eb'], g: ['#16a34a', null], wbr: ['#f8fafc', '#8b5a2b'], br: ['#8b5a2b', null] };
export const WIRE_SCRAMBLE = ['wo', 'o', 'wb', 'b', 'wg', 'g', 'wbr', 'br'];

function Wire({ id, picked, onPick, pin, disabled }: { id: string; picked?: boolean; onPick?: () => void; pin: number; disabled?: boolean }) {
  const [a, b] = COLOUR[id]!;
  return (
    <button type="button" onClick={onPick} disabled={disabled} data-wire={id} aria-pressed={picked} aria-label={`Position ${pin}: ${WIRE_NAME[id]}`} className={cn('flex h-24 w-[1.9rem] flex-col items-center gap-0.5 rounded-md border p-0.5', picked ? 'border-brand ring-2 ring-brand' : 'border-border')}>
      <span className="text-[10px] tabular">{pin}</span>
      <span className="w-3 flex-1 rounded-sm border border-black/25" style={{ background: b ? `repeating-linear-gradient(0deg, ${a} 0 6px, ${b} 6px 12px)` : a }} />
    </button>
  );
}

function PinLeds({ pins }: { pins: number[] | null }) {
  return (
    <div className="space-y-1" data-cc="tester">
      {(['Main unit', 'Remote unit'] as const).map((u, row) => (
        <div key={u} className="flex items-center gap-1.5">
          <span className="w-20 text-[11.5px] text-muted-foreground">{u}</span>
          {Array.from({ length: 8 }, (_, i) => {
            const shown = row === 0 ? i + 1 : (pins?.[i] ?? 0);
            return (
              <span key={i} className={cn('grid size-6 place-items-center rounded-full border text-[10.5px] font-semibold tabular', !pins ? 'border-border text-muted-foreground' : shown === 0 ? 'border-danger text-danger' : shown === i + 1 ? 'border-success bg-success text-white' : 'border-warning bg-warning text-white')}>
                {pins ? shown || '×' : i + 1}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function EndBench({ c, k, end, readOnly }: { c: Comp; k: 'A' | 'B'; end: CrimpEnd; readOnly: boolean }) {
  const [strip, setStrip] = useState(25);
  const [trim, setTrim] = useState(16);
  const [order, setOrder] = useState<string[]>(end.order ?? WIRE_SCRAMBLE);
  const [picked, setPicked] = useState<number | null>(null);
  const tap = (i: number) => {
    if (picked === null) return setPicked(i);
    if (picked !== i) {
      const next = [...order];
      [next[picked], next[i]] = [next[i]!, next[picked]!];
      setOrder(next);
    }
    setPicked(null);
  };
  const step = (label: string, done: boolean, act: Parameters<Comp['act']>[0], x: string, n = 0, extra?: React.ReactNode) => {
    const why = readOnly ? undefined : c.blocked(act, x);
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
        {extra}
        <Button size="sm" variant={done ? 'secondary' : 'outline'} data-cc={`${act}-${k}`} disabled={readOnly || (!!why && !done)} title={why} onClick={() => c.act(act, x, n)}>
          {done && <Check />} {label}
        </Button>
      </div>
    );
  };
  return (
    <div className="space-y-1.5">
      {step('Strip the jacket', end.stripped !== null, 'STRIP', k, strip, (
        <label className="flex items-center gap-1.5 text-[12.5px]">
          Strip
          <Input data-cc={`strip-${k}`} type="number" min={5} max={60} value={strip} disabled={readOnly || end.crimped} onChange={(e) => setStrip(Math.max(0, Math.min(60, Number(e.target.value) || 0)))} className="h-8 w-16" />
          mm
        </label>
      ))}
      {step('Untwist the pairs', end.untwisted, 'UNTWIST', k)}
      <div className="rounded-lg border border-border p-2">
        <p className="mb-1 text-[12.5px]">
          Wire order, looking at the plug with its clip down. <span className="text-muted-foreground">Tap two wires to swap them.</span>
        </p>
        <div className="flex gap-0.5" role="group" aria-label={`Wire order at end ${k}`}>
          {order.map((w, i) => (
            <Wire key={`${w}-${i}`} id={w} pin={i + 1} picked={picked === i} onPick={() => tap(i)} disabled={readOnly || end.crimped} />
          ))}
        </div>
        <Button size="sm" variant={end.order ? 'secondary' : 'outline'} className="mt-1.5" data-cc={`ORDER-${k}`} disabled={readOnly || !!c.blocked('ORDER', k)} title={c.blocked('ORDER', k)} onClick={() => c.act('ORDER', `${k}:${order.join(',')}`)}>
          <ArrowLeftRight /> Hold this order
        </Button>
      </div>
      {step('Trim straight', end.trim !== null, 'TRIM', k, trim, (
        <label className="flex items-center gap-1.5 text-[12.5px]">
          Leave
          <Input data-cc={`trim-${k}`} type="number" min={5} max={30} value={trim} disabled={readOnly || end.crimped} onChange={(e) => setTrim(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} className="h-8 w-16" />
          mm
        </label>
      ))}
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-border p-2">
        {(['DOWN', 'UP'] as const).map((d) => (
          <Button key={d} size="sm" variant={end.clip === d ? 'secondary' : 'outline'} data-cc={`INSERT-${k}-${d}`} disabled={readOnly || !!c.blocked('INSERT', k)} title={c.blocked('INSERT', k)} onClick={() => c.act('INSERT', `${k}:${d}`)}>
            Push into the plug, clip {d.toLowerCase()}
          </Button>
        ))}
      </div>
      {step('Crimp firmly', end.crimped, 'CRIMP', k)}
      <Button size="sm" variant="ghost" disabled={readOnly || !!c.blocked('RECUT', k)} onClick={() => (c.act('RECUT', k), setOrder(WIRE_SCRAMBLE))}>
        <Scissors /> Cut this end off and start it again
      </Button>
    </div>
  );
}

export function CrimpBench({ c, readOnly }: { c: Comp; readOnly: boolean }) {
  const r = crimpRun(c.ref.current.events);
  const [len, setLen] = useState('');
  const [tab, setTab] = useState<'A' | 'B'>('A');
  const cutWhy = c.blocked('CUT');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5">
        <label className="flex items-center gap-1.5 text-[13px]">
          Cable length
          <Input data-cc="cut-length" value={r.cut !== null ? String(r.cut) : len} onChange={(e) => setLen(e.target.value)} disabled={readOnly || r.cut !== null} inputMode="decimal" className="h-8 w-20" aria-label="Cable length in metres" />m
        </label>
        <Button size="sm" variant={r.cut !== null ? 'secondary' : 'outline'} data-cc="CUT" disabled={readOnly || !!cutWhy || !(Number(len) > 0)} title={cutWhy} onClick={() => c.act('CUT', '', Math.min(1000, Math.round(Number(len) * 10)))}>
          <Scissors /> Measure and cut
        </Button>
        <Button size="sm" variant={r.boots ? 'secondary' : 'outline'} data-cc="BOOTS" disabled={readOnly || !!c.blocked('BOOTS')} title={c.blocked('BOOTS')} onClick={() => c.act('BOOTS')}>
          Slide on the boots
        </Button>
      </div>
      <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Cable end">
        {(['A', 'B'] as const).map((k) => (
          <Button key={k} size="sm" variant={tab === k ? 'secondary' : 'ghost'} className="h-7" data-cc={`end-${k}`} onClick={() => setTab(k)} aria-pressed={tab === k}>
            End {k}
            {r.ends[k].crimped && <Check />}
          </Button>
        ))}
      </div>
      <EndBench key={tab} c={c} k={tab} end={r.ends[tab]} readOnly={readOnly} />
      <div className="space-y-2 rounded-xl border border-border p-2.5">
        <p className="text-[13px] font-semibold">Cable tester</p>
        <PinLeds pins={r.tested ? r.pins : null} />
        <Button size="sm" variant="outline" data-cc="TEST" disabled={readOnly || !!c.blocked('TEST')} title={c.blocked('TEST')} onClick={() => c.act('TEST')}>
          <Zap /> Test the cable
        </Button>
        {r.tested > 0 && r.pins && <p className="text-[12.5px] text-muted-foreground">The tester only shows that the pins match from end to end. It cannot tell you the colours are in the standard order.</p>}
      </div>
    </div>
  );
}

const OBJ_LABEL: Record<MaintAction['obj'], string> = { screen: 'On the computer', sysunit: 'System unit', monitor: 'Monitor', keyboard: 'Keyboard and mouse', dvd: 'DVD drive', ups: 'UPS' };

export function maintStatus(c: Pick<Comp, 'ref' | 'v'>): string[] {
  const r = maintRun(c.ref.current.events);
  const m = c.v.maint;
  const out = [`Computer ${r.on ? 'on' : 'off'}; wall socket ${r.plugged ? 'on' : 'off'}.`];
  if (r.done.has('UPSTEST')) out.push(`UPS self-test: ${m.pass ? 'PASS' : 'FAIL (battery light on)'}; battery ${m.reading.toFixed(1)} V; label says it was last changed ${m.age} year${m.age === 1 ? '' : 's'} ago.`);
  if (r.done.has('CLEANUP')) out.push(`Disk Cleanup freed ${m.freed} MB.`);
  if (r.done.has('UPDATES')) out.push('Windows and the antivirus are up to date.');
  if (r.done.has('BACKUP')) out.push(r.badBackup ? 'Backup: copied to a folder on drive C.' : 'Backup: copied to the external drive.');
  return out;
}

export function MaintBench({ c, readOnly }: { c: Comp; readOnly: boolean }) {
  const r = maintRun(c.ref.current.events);
  const groups = new Map<MaintAction['obj'], MaintAction[]>();
  for (const a of MAINT_ACTIONS) groups.set(a.obj, [...(groups.get(a.obj) ?? []), a]);
  const key = (a: MaintAction) => (a.x && a.a !== 'BACKUP' ? `${a.a}:${a.x}` : a.a);
  return (
    <div className="space-y-3">
      <ul className="space-y-0.5 rounded-xl border border-border bg-muted/40 p-3 text-[13px]" aria-live="polite" data-cc="maint-status">
        {maintStatus(c).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {[...groups.entries()].map(([obj, list]) => (
        <div key={obj} className="rounded-xl border border-border p-3">
          <p className="mb-2 text-[12.5px] font-semibold">{OBJ_LABEL[obj]}</p>
          <div className="flex flex-wrap gap-1.5">
            {list.map((a) => {
              const why = c.blocked(a.a, a.x);
              return (
                <Button key={key(a) + a.x} size="sm" variant={r.done.has(key(a)) ? 'secondary' : 'outline'} data-cc={`${a.a}-${a.x}`} disabled={readOnly || !!why} title={why} onClick={() => c.act(a.a, a.x)} className="h-auto min-h-8 whitespace-normal py-1 text-left">
                  {a.label}
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
