import { DIODE_MA, DIODE_V, EM_AMMETER, FIELD_STARTS, IND_DIVS, compassAt, diodeReading, emCurrent, emLift, indDeflection, indShown, sheetCfg, type PhyMagnetismState } from '@aischool/shared';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, Minus, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { CORE_NAME, diodeNow, fieldCfgNow, openSheet, type Magnetism } from '../actions';
import { CompassFace, FieldCanvas, MeterDial, NailClips } from '../instruments';
import { runProgress, swing, useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The magnetism bench's HUD: the dock (what to do next), the eye-level reading panel and the drag feedback. */

const B = ({ children, onClick, blocked, brand, label, on }: { children: ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; on?: boolean }) => (
  <Button size="sm" variant={(brand && !blocked) || on ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && !on && dockButton, blocked && 'opacity-55')} aria-disabled={!!blocked} aria-pressed={on} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const I = ({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) => (
  <Button size="icon-sm" variant="outline" className={dockButton} onClick={onClick} aria-label={label}>
    {children}
  </Button>
);
const T = ({ children }: { children: ReactNode }) => <span className="text-[12px] text-white/80">{children}</span>;

export function MagDock({ s, scene, ops, compact }: { s: PhyMagnetismState; scene: SceneState; ops: Ops; compact: boolean }) {
  useBench((b) => b.tick);
  const [start, setStart] = useState(4);
  const task = s.task ?? 'FIELD';
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set up the apparatus">
        {scene.nextPlace && (
          <B brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </B>
        )}
      </div>
    );
  const read = (
    <B onClick={ops.read} blocked={ops.why.bench} label="Read the instrument">
      <Eye /> {compact ? 'Read' : 'Read the instrument'}
    </B>
  );
  const wrap = (label: string, children: ReactNode) => (
    <div className={cn(dockClass, 'max-w-[min(760px,calc(100vw-1rem))]')} aria-label={label}>
      {children}
    </div>
  );
  if (task === 'FIELD') {
    const o = openSheet(s);
    return wrap(
      'The field sheet',
      <>
        {!s.meridian && (
          <B brand onClick={ops.meridian}>
            Mark the meridian
          </B>
        )}
        {!s.steelAway && (
          <B brand={s.meridian} onClick={ops.steel}>
            Keys and phone away
          </B>
        )}
        <B onClick={() => ops.facing(s.facing === 'north' ? 'south' : 'north')} label={`N pole pointing ${s.facing}: turn the magnet round`}>
          N → {s.facing}
        </B>
        <B onClick={() => ops.arr(s.arr === 'one' ? 'like' : s.arr === 'like' ? 'unlike' : 'one')} label="Magnets: change the arrangement">
          {s.arr === 'one' ? '1 magnet' : s.arr === 'like' ? 'Like poles' : 'Unlike poles'}
        </B>
        <B onClick={ops.compassSize} label={`The ${s.compass} compass: change`}>
          {s.compass === 'small' ? 'Small' : 'Large'}
        </B>
        <B onClick={() => ops.tap(!s.tapEach)} on={s.tapEach} label={s.tapEach ? 'Tapping before each dot: change' : 'Not tapping: change to tap before each dot'}>
          {s.tapEach ? 'Tap ✓' : 'No tap'}
        </B>
        <div className="flex items-center gap-1" role="group" aria-label="Start point">
          <I onClick={() => setStart((k) => (k + FIELD_STARTS.length - 1) % FIELD_STARTS.length)} label="Previous start point">
            <ChevronLeft />
          </I>
          <B onClick={() => ops.start(start)} label={`Start a line at point ${start + 1}`}>
            Start line {start + 1}
          </B>
          <I onClick={() => setStart((k) => (k + 1) % FIELD_STARTS.length)} label="Next start point">
            <ChevronRight />
          </I>
        </div>
        <B brand onClick={ops.dot} blocked={ops.why.bench} label="Mark the next dot">
          Next dot
        </B>
        <B onClick={ops.toEnd} blocked={ops.why.bench} label="Dot to dot to the end of the line">
          To the end
        </B>
        <B onClick={ops.arrows} label="Draw arrows N to S">
          Arrows
        </B>
        <div className="flex items-center gap-1" role="group" aria-label="Move the compass">
          <T>
            ({s.cx.toFixed(1)}, {s.cy.toFixed(1)})
          </T>
          <I onClick={() => ops.cmove(-0.2, 0)} label="Compass 0.2 cm west">
            <ChevronLeft />
          </I>
          <I onClick={() => ops.cmove(0.2, 0)} label="Compass 0.2 cm east">
            <ChevronRight />
          </I>
          <I onClick={() => ops.cmove(0, 0.2)} label="Compass 0.2 cm north">
            <ChevronUp />
          </I>
          <I onClick={() => ops.cmove(0, -0.2)} label="Compass 0.2 cm south">
            <ChevronDown />
          </I>
        </div>
        <B onClick={ops.neutral} label="Mark a neutral point here">
          Mark neutral ({o?.sheet.neutrals.length ?? 0})
        </B>
        {read}
      </>,
    );
  }
  if (task === 'ELECTROMAGNET')
    return wrap(
      'The electromagnet',
      <>
        <B onClick={() => ops.wind(s.turns === 30 ? 60 : 30)} label={`${s.turns} turns: rewind`}>
          {s.turns} turns
        </B>
        <B onClick={() => ops.core(s.core === 'iron' ? 'none' : 'iron')} label={`Core: ${CORE_NAME[s.core]}`}>
          {s.core === 'iron' ? 'Iron core' : s.core === 'none' ? 'No core' : 'Steel core'}
        </B>
        <div className="flex items-center gap-1" role="group" aria-label="Rheostat">
          <T>Rheostat {Math.round(s.rheo * 100)}%</T>
          <I onClick={() => ops.rheo(-0.02)} label="Rheostat: less resistance">
            <Minus />
          </I>
          <I onClick={() => ops.rheo(0.02)} label="Rheostat: more resistance">
            <Plus />
          </I>
          <I onClick={() => ops.rheo(-0.002)} label="Rheostat: a little less resistance">
            <ChevronLeft />
          </I>
          <I onClick={() => ops.rheo(0.002)} label="Rheostat: a little more resistance">
            <ChevronRight />
          </I>
        </div>
        <B brand={!s.key} onClick={ops.key} label={s.key ? 'Open the key' : 'Close the key'}>
          {s.key ? 'Open key' : 'Close key'}
        </B>
        <B brand={s.key} onClick={ops.lift} blocked={ops.why.run ?? (!s.key ? 'Close the key first.' : undefined)} label="Dip into the clips and lift">
          Lift ({s.lifts.length})
        </B>
        {read}
      </>,
    );
  if (task === 'INDUCTION')
    return wrap(
      'The coil and the magnet',
      <>
        <B onClick={() => ops.coil(s.coil === 200 ? 600 : 200)} label={`${s.coil}-turn coil: change`}>
          {s.coil} turns
        </B>
        <B onClick={ops.pole} label={`${s.pole} pole first: change`}>
          {s.pole} pole
        </B>
        <B onClick={ops.magnets} label={s.magnets === 2 ? 'Two magnets: change' : 'One magnet: change'}>
          {s.magnets === 2 ? '2 magnets' : '1 magnet'}
        </B>
        <B onClick={ops.speed} label={`Moving ${s.speed}: change`}>
          {s.speed === 'fast' ? 'Quickly' : 'Slowly'}
        </B>
        <B onClick={ops.axis} on={s.axis} label={s.axis ? 'Along the axis: change' : 'From the side: change'}>
          {s.axis ? 'On axis' : 'From side'}
        </B>
        <B onClick={ops.galvo} on={s.galvoFar} label={s.galvoFar ? 'Galvanometer away: change' : 'Galvanometer beside the coil: move it away'}>
          {s.galvoFar ? 'G away' : 'G near'}
        </B>
        <B brand={!s.magIn} onClick={() => ops.move('in')} blocked={ops.why.run ?? (s.magIn ? 'It is in the coil.' : undefined)} label="Push the magnet in">
          Push in
        </B>
        <B onClick={() => ops.move('still')} blocked={ops.why.run ?? (!s.magIn ? 'Push it in first.' : undefined)} label="Hold the magnet still inside">
          Hold still
        </B>
        <B brand={s.magIn} onClick={() => ops.move('out')} blocked={ops.why.run ?? (!s.magIn ? 'Push it in first.' : undefined)} label="Pull the magnet out">
          Pull out
        </B>
        {read}
      </>,
    );
  return wrap(
    'The diode circuit',
    <>
      <B onClick={ops.bias} label={`${s.bias === 'fwd' ? 'Forward' : 'Reverse'} bias: turn the diode round`}>
        {s.bias === 'fwd' ? 'Forward' : 'Reverse'}
      </B>
      <B onClick={ops.resistor} on={s.resistor} label={s.resistor ? 'Resistor in: take it out' : 'No resistor: put it in'}>
        {s.resistor ? 'R in' : 'No R!'}
      </B>
      <B onClick={ops.vm} on={s.vm === 'diode'} label={s.vm === 'diode' ? 'Voltmeter across the diode: change' : 'Voltmeter across diode and resistor: change'}>
        {s.vm === 'diode' ? 'V across D' : 'V across D+R'}
      </B>
      <B onClick={ops.range} label={`The 0–${s.range} V range: change`}>
        0–{s.range} V
      </B>
      <div className="flex items-center gap-1" role="group" aria-label="Potentiometer">
        <T>Pot {(s.pot * 100).toFixed(1)}%</T>
        <I onClick={() => ops.pot(-0.02)} label="Potentiometer down">
          <Minus />
        </I>
        <I onClick={() => ops.pot(0.02)} label="Potentiometer up">
          <Plus />
        </I>
        <I onClick={() => ops.pot(-0.002)} label="Potentiometer a little down">
          <ChevronLeft />
        </I>
        <I onClick={() => ops.pot(0.002)} label="Potentiometer a little up">
          <ChevronRight />
        </I>
      </div>
      <B brand={!s.key} onClick={ops.key} label={s.key ? 'Open the key' : 'Close the key'}>
        {s.key ? 'Open key' : 'Close key'}
      </B>
      <B brand={s.key} onClick={ops.reading} blocked={!s.key ? 'Close the key first.' : undefined} label="Record this reading">
        Record ({s.reads.length})
      </B>
      {s.burnt && (
        <B brand onClick={ops.replace}>
          Replace diode
        </B>
      )}
      {read}
    </>,
  );
}

/** The eye-level reading panel: the task's instrument close up, read as it really shows. */
export function MagReadingPanel({ o, s, onBack }: { o: Magnetism; s: PhyMagnetismState; onBack: () => void }) {
  useBench((b) => b.tick);
  const ruler = useBench((b) => b.ruler);
  const run = useBench((b) => b.run);
  const v = o.v;
  const task = s.task ?? 'FIELD';
  let body: ReactNode = null;
  let title = 'Read the instrument';
  let tip = '';
  if (task === 'FIELD') {
    title = 'The sheet and the compass';
    const sh = openSheet(s);
    const cfg = sh ? sheetCfg(sh.sheet) : fieldCfgNow(s);
    const c = compassAt(v, cfg, { x: s.cx, y: s.cy });
    body = (
      <div className="space-y-2">
        <FieldCanvas v={v} s={s} i={sh ? sh.i : null} compass ruler={ruler !== null && sh ? (sh.sheet.neutrals[ruler] ?? null) : null} onPick={(x, y) => o.setCompassAt(x, y)} className="mx-auto !h-[38vh] !w-auto max-w-full" />
        <div className="flex flex-wrap items-start gap-3">
          <CompassFace heading={c.heading} loose={c.loose} label={`At (${s.cx.toFixed(1)}, ${s.cy.toFixed(1)}) cm.`} />
          {sh && sh.sheet.neutrals.length > 0 && (
            <div className="space-y-1 text-[12px]">
              <p className="font-medium">Lay the rule from the centre to:</p>
              <div className="flex flex-wrap gap-1">
                {sh.sheet.neutrals.map((_, j) => (
                  <Button key={j} size="sm" variant={ruler === j ? 'brand' : 'outline'} onClick={() => useBench.setState({ ruler: ruler === j ? null : j })}>
                    Mark {j + 1}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
    tip = 'Click the paper to move the compass. Where the needle rests in any direction is a neutral point. Lay the rule from the centre of the magnet to a mark and read it to 0.1 cm.';
  } else if (task === 'ELECTROMAGNET') {
    title = 'The ammeter and the clips';
    const k = s.lifts.length - 1;
    const res = k >= 0 ? emLift(v, k, s.lifts[k]!) : null;
    const lastIdx = (p: (a: string) => boolean) => s.log.reduce((m, e, i) => (p(e.a) ? i : m), -1);
    const holding = s.key && !!res && lastIdx((a) => a.startsWith('lift')) > lastIdx((a) => a === 'key:on');
    const busy = runProgress(run).busy;
    const I = s.key ? emCurrent(v, { turns: s.turns, rheo: s.rheo, heat: s.heat }) : 0;
    body = (
      <div className="flex flex-wrap items-start gap-3">
        <MeterDial label="A" unit="Ammeter" value={I} fsd={EM_AMMETER.fsd} minor={EM_AMMETER.minor} major={EM_AMMETER.major} caption={s.key ? 'Read to 0.05 A.' : 'Key open.'} />
        <NailClips clips={busy ? 0 : holding ? res!.clips : !s.key && res ? res.left : 0} lifting={!busy && (holding || (!s.key && !!res && res.left > 0))} turns={s.turns} core={s.core} />
      </div>
    );
    tip = 'Count every clip hanging from the nail; read the ammeter at the moment you lift.';
  } else if (task === 'INDUCTION') {
    title = 'The galvanometer';
    const offset = !s.galvoFar && s.magIn ? indDeflection(v, 0, { kind: 'still', coil: s.coil, pole: s.pole, magnets: s.magnets, speed: s.speed, axis: s.axis, galvoFar: false }) : 0;
    const { p, busy } = runProgress(run);
    const m = run && busy && run.kind === 'move' ? s.moves[run.k] : null;
    const needle = m ? swing(indShown(indDeflection(v, run!.k, m)), offset, p, m.kind === 'still') : offset;
    const lastMove = s.moves.length ? s.moves[s.moves.length - 1]! : null;
    const peak = lastMove ? indShown(indDeflection(v, s.moves.length - 1, lastMove)) : 0;
    body = (
      <div className="flex flex-wrap items-start gap-3">
        <MeterDial label="G" unit="Galvanometer" value={needle} fsd={IND_DIVS} minor={1} major={10} centre caption={busy ? 'Watch the swing…' : 'The needle is back at rest.'} />
        {lastMove && !busy && (
          <div className="max-w-[220px] space-y-1 text-[12.5px]">
            <p className="font-medium">The last swing you saw</p>
            <MeterDial label="G" unit="Galvanometer (peak)" value={peak} fsd={IND_DIVS} minor={1} major={10} centre caption="Its furthest point: which way, how many divisions?" />
          </div>
        )}
      </div>
    );
    tip = 'Note the direction (left or right of the centre zero) and the size of the largest swing, to 0.5 division.';
  } else {
    title = 'The voltmeter and the milliammeter';
    const r = s.key ? diodeReading(v, { ...diodeNow(s), range: s.range, open: s.burnt }) : null;
    body = (
      <div className="grid gap-3 sm:grid-cols-2">
        <MeterDial label="V" unit="Voltmeter" value={r ? r.Vtrue : 0} fsd={DIODE_V[s.range].fsd} minor={DIODE_V[s.range].minor} major={DIODE_V[s.range].major} caption={`0–${s.range} V range.`} />
        <MeterDial label="mA" unit="Milliammeter" value={r ? Math.abs(r.mAtrue) : 0} fsd={DIODE_MA.fsd} minor={DIODE_MA.minor} major={DIODE_MA.major} caption="Read to 0.5 mA." />
      </div>
    );
    tip = s.key ? 'Read the voltmeter to half a division and the milliammeter to 0.5 mA, then open the key.' : 'Close the key to read the meters.';
  }
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-h-[78%] max-w-xl overflow-y-auto rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label={title}>
      <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
        <Eye className="size-4 text-muted-foreground" aria-hidden /> {title}
      </p>
      {tip && <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{tip}</p>}
      <div className="mt-2">{body}</div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to bench
        </Button>
      </div>
    </section>
  );
}

export function MagDragFeedback({ drag }: { drag: DragState }) {
  const text: Record<string, string> = { compass: 'Sliding the compass over the paper — let go to leave it there', magnet: 'Drag the magnet towards the coil to push it in (the dock’s buttons do it too)' };
  if (!text[drag.kind]) return null;
  return <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{text[drag.kind]}</span>;
}
