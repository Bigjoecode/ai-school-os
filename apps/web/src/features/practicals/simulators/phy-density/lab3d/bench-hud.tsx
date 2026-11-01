import { CAL_OBJECT_NAME, densityBeamTilt, densityRidersSum, floatReading, floatUpright, sbReading, type CalObj, type PhyDensityState } from '@aischool/shared';
import { Camera, Eye, Minus, Plus, Scale } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { objName, type Density, type Eye as EyePos } from '../actions';
import { calShown, ThermoSvg } from '../index';
import { DepthLoupe, EyeControl, MicrometerSvg, SpringScaleSvg, VernierSvg } from '../instruments';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The density bench's HUD: the dock (set up, work, balance), the close-up reading panel and the drag feedback. */

const B = ({ children, onClick, blocked, brand, label, className }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; className?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', 'h-8 px-2 text-[12px]', className)} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);

/** The instrument close-up for the state: vernier or micrometer, the spring balance, the tube's scale, the thermometer. */
export function InstrumentView({ o, s }: { o: Density; s: PhyDensityState }) {
  const task = s.task ?? 'CAL';
  if (task === 'ARCH') return <SpringScaleSvg reading={s.hung ? sbReading(o.v, { where: s.where, depth: s.depth, bubbles: s.bubbles && s.where !== 'air', zeroed: s.zeroed }) : s.zeroed ? 0 : o.v.sbZero} eye={o.eye} />;
  if (task === 'FLOAT' && s.floating && !s.sunk && floatUpright(s.load)) return <DepthLoupe h={floatReading(o.v, s.load, s.touching)} meniscus={o.v.meniscus} eye={o.eye} touching={s.touching} />;
  if (task === 'BOTTLE') return s.tempRead ? <ThermoSvg t={o.v.tempC} /> : null;
  const shown = calShown(o.v, s);
  if (shown === null) return null;
  return s.tool === 'V' ? <VernierSvg reading={shown} eye={o.eye} closed={s.closed} label={s.held ? objName(s.held, s.inside) : undefined} /> : <MicrometerSvg reading={shown} eye={o.eye} closed={s.closed} label={s.held ? objName(s.held) : undefined} />;
}

function BalanceTab({ o, s, ops }: { o: Density; s: PhyDensityState; ops: Ops }) {
  const t = densityBeamTilt(o.panMass(), o.riders);
  const item = s.task === 'ARCH' ? 'beaker' : s.task === 'FLOAT' ? 'tube' : 'bottle';
  const r = (w: 'h' | 't' | 'f', d: number, text: string) => (
    <B onClick={() => ops.rider(w, d)} label={`${w === 'h' ? '100 g rider' : w === 't' ? '10 g rider' : 'Front rider'} ${d > 0 ? 'on' : 'back'} ${w === 'f' ? `${Math.abs(d)} g` : 'one notch'}`}>
      {text}
    </B>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-white/75">Pan:</span>
        <B brand={o.pan === item} onClick={() => ops.pan(o.pan ? null : item)} label={o.pan ? 'Take it off the pan' : 'Put it on the pan'}>
          {item === 'beaker' ? 'Catch beaker' : item === 'tube' ? 'Empty tube' : 'Bottle'}
        </B>
        <span className={cn('text-[11.5px]', Math.abs(t) < 0.08 ? 'text-emerald-300' : 'text-amber-300')} aria-live="polite">
          pointer {Math.abs(t) < 0.08 ? 'on zero' : t > 0 ? 'high (add)' : 'low (take off)'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {r('h', -1, '−100')}
        {r('h', 1, '+100')}
        {r('t', -1, '−10')}
        {r('t', 1, '+10')}
        {r('f', -1, '−1')}
        {r('f', -0.1, '−0.1')}
        {r('f', 0.1, '+0.1')}
        {r('f', 1, '+1')}
        <span className="min-w-[64px] text-center text-[12px] font-semibold tabular" aria-label="Riders total">
          {densityRidersSum(o.riders).toFixed(1)} g
        </span>
        <B brand onClick={ops.weigh} blocked={o.pan ? undefined : 'Nothing on the pan.'}>
          <Scale /> Record ({s.weighs.length})
        </B>
      </div>
    </div>
  );
}

function WorkTab({ o, s, ops, compact }: { o: Density; s: PhyDensityState; ops: Ops; compact: boolean }) {
  const task = s.task ?? 'CAL';
  const calipers = useBench((b) => b.calipers);
  const setBench = useBench((b) => b.set);
  const w = ops.why.work;
  const take = (label: string, run: () => void, n: number) => (
    <B brand onClick={run} blocked={w}>
      <Camera /> {compact ? 'Take' : label} ({n})
    </B>
  );
  const readBtn = (
    <B onClick={ops.read} blocked={w} label="Read the scale close up">
      <Eye /> {compact ? '' : 'Read'}
    </B>
  );
  const measured = s.cal.some((r) => r.obj === 'tube' && !r.inside);
  if (task === 'CAL' || (task === 'FLOAT' && !s.floating && (calipers || !measured))) {
    const objs: { obj: CalObj | null; inside?: boolean; label: string }[] = task === 'FLOAT' ? [{ obj: null, label: 'Zero' }, { obj: 'tube', label: 'Tube (out)' }, { obj: 'tube', inside: true, label: 'Tube (in)' }] : [{ obj: null, label: 'Zero' }, ...(['cyl', 'ball', 'marble', 'wire'] as CalObj[]).map((x) => ({ obj: x, label: CAL_OBJECT_NAME[x].replace(/^(wooden|glass|copper) /, '') }))];
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <B brand={s.tool === 'V'} onClick={() => ops.tool('V')} blocked={w}>
            Vernier
          </B>
          {task === 'CAL' && (
            <B brand={s.tool === 'M'} onClick={() => ops.tool('M')} blocked={w}>
              Micrometer
            </B>
          )}
          <select className="h-8 rounded-md border border-white/20 bg-white/10 px-1.5 text-[12px] text-white" value={`${s.held ?? 'none'}${s.inside ? ':in' : ''}`} onChange={(e) => { const [ob, inn] = e.target.value.split(':'); ops.hold(ob === 'none' ? null : (ob as CalObj), inn === 'in'); }} aria-label="Between the jaws" disabled={!s.tool}>
            {objs.map((x) => (
              <option key={x.label} value={`${x.obj ?? 'none'}${x.inside ? ':in' : ''}`} className="text-slate-900">
                {x.label}
              </option>
            ))}
          </select>
          {s.tool === 'M' ? (
            <>
              <B brand={!s.closed} onClick={() => ops.close('ratchet')} blocked={w}>
                Ratchet
              </B>
              <B onClick={() => ops.close('thimble')} blocked={w}>
                Thimble tight
              </B>
            </>
          ) : (
            <B brand={!s.closed} onClick={() => ops.close('gentle')} blocked={w ?? (s.tool ? undefined : 'Pick up the vernier.')}>
              Close
            </B>
          )}
          <B onClick={ops.open} blocked={s.closed ? undefined : 'It is open.'}>
            Open
          </B>
          <B onClick={ops.turn} blocked={s.held ? undefined : 'Nothing in the jaws.'}>
            Turn ({s.pos + 1})
          </B>
          {readBtn}
          {take('Take reading', ops.takeCal, s.cal.length)}
          {task === 'FLOAT' && measured && (
            <B onClick={() => setBench({ calipers: false })}>
              Tube & shot
            </B>
          )}
        </div>
      </div>
    );
  }
  if (task === 'ARCH')
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <B onClick={ops.zero} blocked={w}>
            Zero
          </B>
          {s.hung ? (
            <B onClick={ops.unhang} blocked={w}>
              Unhook
            </B>
          ) : (
            <B brand onClick={ops.hang} blocked={w}>
              Hang stone
            </B>
          )}
          <B onClick={ops.fillCan} blocked={w}>
            Fill can
          </B>
          <B brand={s.catchUnder} onClick={() => ops.catchUnder(!s.catchUnder)} blocked={w}>
            Beaker {s.catchUnder ? 'away' : 'under spout'}
          </B>
          <B onClick={ops.emptyCatch} blocked={s.caught ? w : 'It is empty.'}>
            Empty beaker
          </B>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <B onClick={() => ops.lower('water', 'full')} blocked={w}>
            Into can
          </B>
          <B onClick={() => ops.lower('water', 'part')} blocked={w}>
            Half in
          </B>
          <B onClick={() => ops.lower('salt', 'full')} blocked={w}>
            Into salt
          </B>
          <B onClick={() => ops.lower(s.where === 'salt' ? 'salt' : 'water', 'touch')} blocked={w}>
            Rest on bottom
          </B>
          <B onClick={ops.raise} blocked={s.where === 'air' ? 'It is out.' : w}>
            Raise
          </B>
          <B onClick={ops.shake} blocked={s.bubbles && s.where !== 'air' ? w : 'No bubbles.'}>
            Shake
          </B>
          <B onClick={ops.dryStone} blocked={s.wet ? w : 'It is dry.'}>
            Dry
          </B>
          {s.spill && <B onClick={ops.wipeSpill}>Wipe spill</B>}
          {readBtn}
          {take('Take reading', ops.takeSb, s.sb.length)}
        </div>
      </div>
    );
  if (task === 'FLOAT')
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <B onClick={ops.removeShot} blocked={s.load ? w : 'It is empty.'} label="Take out 10 g">
          <Minus /> 10 g
        </B>
        <span className="text-[12px] font-semibold tabular">{s.load * 10} g</span>
        <B onClick={ops.addShot} blocked={w} label="Add 10 g">
          <Plus /> 10 g
        </B>
        {s.floating ? (
          <B onClick={ops.liftTube} blocked={w}>
            Lift out
          </B>
        ) : (
          <B brand onClick={ops.floatTube} blocked={w}>
            Float it
          </B>
        )}
        <B onClick={ops.centre} blocked={s.touching ? w : 'It floats freely.'}>
          Free it
        </B>
        {!s.floating && (
          <B onClick={() => (ops.tool('V'), setBench({ calipers: true }))} blocked={w}>
            Vernier
          </B>
        )}
        {readBtn}
        {take('Take depth', ops.takeDepth, s.depths.length)}
      </div>
    );
  const b = s.bottle;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <B onClick={() => ops.fill('water')} blocked={w}>
          Water
        </B>
        {s.sample === 'grains' ? (
          <B onClick={ops.addSand} blocked={w}>
            Sand ({b.sand})
          </B>
        ) : (
          <B onClick={() => ops.fill('liquid')} blocked={w}>
            {o.v.liquid === 'palm oil' ? 'Palm oil' : 'Kerosene'}
          </B>
        )}
        <B onClick={ops.topUp} blocked={w}>
          Top up
        </B>
        <B onClick={ops.tap} blocked={b.bubble ? w : 'No bubble.'}>
          Tap
        </B>
        {s.stoppered ? (
          <B onClick={ops.unstopper} blocked={w}>
            Unstopper
          </B>
        ) : (
          <B brand onClick={ops.stopper} blocked={w}>
            Stopper
          </B>
        )}
        <B onClick={ops.wipe} blocked={b.outsideWet ? w : 'Dry outside.'}>
          Wipe
        </B>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <B onClick={ops.empty} blocked={w}>
          Empty
        </B>
        <B onClick={ops.dry} blocked={w}>
          Dry inside
        </B>
        {s.sample === 'liquid' && (
          <B onClick={ops.rinse} blocked={w}>
            Rinse
          </B>
        )}
        <B brand={!s.tempRead} onClick={ops.readTemp} blocked={w}>
          Thermometer
        </B>
      </div>
    </div>
  );
}

/** A one-line description of the bench for students who cannot see the 3D view well. */
export function benchStatus(s: PhyDensityState): string {
  switch (s.task) {
    case 'ARCH':
      return s.hung ? `stone ${s.where === 'air' ? 'in air' : `${s.depth === 'touch' ? 'resting' : s.depth} in ${s.where}`}${s.bubbles && s.where !== 'air' ? ' · bubbles' : ''}` : 'nothing hanging';
    case 'FLOAT':
      return `${s.load * 10} g · ${s.floating ? (s.sunk ? 'sunk!' : s.touching ? 'touching the side' : 'floating freely') : 'on the bench'}`;
    case 'BOTTLE':
      return `bottle: ${s.bottle.fill === 'none' ? (s.bottle.sand ? 'sand' : 'empty') : s.bottle.fill}${s.stoppered ? ', stoppered' : ''}${s.bottle.outsideWet ? ', wet outside' : ''}${s.bottle.bubble ? ', bubble' : ''}`;
    default:
      return s.tool ? `${s.tool === 'V' ? 'vernier' : 'micrometer'} · ${objName(s.held, s.inside)} · ${s.closed ? (s.forced ? 'forced' : 'closed') : 'open'}` : 'no instrument';
  }
}

export function DensityDock({ o, s, scene, ops, compact }: { o: Density; s: PhyDensityState; scene: SceneState; ops: Ops; compact: boolean }) {
  const tab = useBench((b) => b.tab);
  const set = useBench((b) => b.set);
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set up">
        {scene.nextPlace && (
          <B brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </B>
        )}
      </div>
    );
  const hasBalance = s.task !== 'CAL';
  return (
    <div className={cn(dockClass, 'max-w-[min(640px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="The bench">
      <div className="flex flex-wrap items-center gap-1.5">
        {hasBalance && (
          <div className="flex overflow-hidden rounded-lg border border-white/20" role="tablist" aria-label="Dock">
            {(['work', 'balance'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => set({ tab: k })} className={cn('px-2.5 py-1 text-[12px] font-medium', tab === k ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20')}>
                {k === 'work' ? 'Bench' : 'Balance'}
              </button>
            ))}
          </div>
        )}
        <span className="text-[11.5px] text-white/85" aria-live="polite">
          {benchStatus(s)}
        </span>
      </div>
      {hasBalance && tab === 'balance' ? <BalanceTab o={o} s={s} ops={ops} /> : <WorkTab o={o} s={s} ops={ops} compact={compact} />}
    </div>
  );
}

/** The eye level from the kit's reading eye: |eye| under 3 mm is square on. */
export const eyeFromView = (eye: number): EyePos => (Math.abs(eye) < 0.003 ? 0 : eye > 0 ? 1 : -1);

/** The close-up reading panel (the eye-level view), with the instrument drawn large and the eye's position. */
export function DensityReadingPanel({ o, s, ops, onBack }: { o: Density; s: PhyDensityState; ops: Ops; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const set = useLabView((v) => v.set);
  useEffect(() => o.setEye(eyeFromView(eye)), [eye]); // eslint-disable-line react-hooks/exhaustive-deps
  const task = s.task ?? 'CAL';
  const vertical = task !== 'CAL' && !(task === 'FLOAT' && !s.floating);
  const take = task === 'ARCH' ? ops.takeSb : task === 'FLOAT' && s.floating ? ops.takeDepth : task === 'BOTTLE' ? null : ops.takeCal;
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-h-[70%] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the scale">
      <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
        <Eye className="size-4 text-muted-foreground" aria-hidden /> {task === 'ARCH' ? 'Read the spring balance' : task === 'FLOAT' && s.floating ? 'Read h at the water surface' : task === 'BOTTLE' ? 'Read the thermometer' : `Read the ${s.tool === 'M' ? 'micrometer' : 'vernier'}`}
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-center gap-3">
        <InstrumentView o={o} s={s} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {task !== 'BOTTLE' && <EyeControl eye={o.eye} onEye={(e) => set({ eye: e * 0.012 })} vertical={vertical} compact />}
        {take && (
          <Button size="sm" variant="brand" onClick={take}>
            <Camera /> Take this reading
          </Button>
        )}
        <Button size="sm" variant="outline" className="ml-auto" onClick={onBack}>
          Back to bench
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{benchStatus(s)}</p>
    </section>
  );
}

export function DensityDragFeedback({ drag, o }: { drag: DragState; o: Density }) {
  if (drag.kind !== 'rider' && drag.kind !== 'stone') return null;
  return (
    <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">
      {drag.kind === 'rider' ? `Riders ${densityRidersSum(o.riders).toFixed(1)} g — drag along the beam` : 'Drag down to lower the stone, up to raise it'}
    </span>
  );
}
