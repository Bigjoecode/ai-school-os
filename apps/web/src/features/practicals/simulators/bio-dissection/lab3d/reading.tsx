import { PLATES, PLATE_LABEL, SLICES, eosinSectionSeen } from '@aischool/shared';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { lastEosinShown, lastRatShown, plateDaysNow } from '../readings';
import { BreadSvg, MouldSlide, PlantSvg, PlateSvg, RatSvg, RulerZoom, SectionSvg } from '../visuals';
import { useDissectBench } from './bench';
import { eosinActs, microActs, ratActs, type DissectCtx } from './lab-actions';

/**
 * The close-up views: the plant with the ruler magnified at the red line and
 * the sections as seen; the opened rat with the last measurement; the four
 * plates large enough to count (quarter lines), the bread slices and the
 * teacher's slide — the same drawings as the 2D lab, from the same maths.
 */

const SHELL = 'pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain p-2 pt-[6.5rem] text-white sm:p-4 sm:pt-28';
const CARD = 'w-full max-w-2xl rounded-2xl bg-card p-3 text-card-foreground shadow-2xl';

export function ReadingPanel({ ctx, readOnly, onBack }: { ctx: DissectCtx; readOnly: boolean; onBack: () => void }) {
  const task = ctx.s.task ?? 'EOSIN';
  return (
    <div className={cn(SHELL, 'bg-black/55')} role="dialog" aria-label={task === 'EOSIN' ? 'Looking at the plant' : task === 'RAT' ? 'Looking at the dissection' : 'Looking at the plates'}>
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
        <section className={CARD}>
          {task === 'RAT' ? <RatReading ctx={ctx} readOnly={readOnly} /> : task === 'MICROBE' ? <MicroReading ctx={ctx} readOnly={readOnly} /> : <EosinReading ctx={ctx} readOnly={readOnly} />}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onBack}>
              <ArrowLeft /> Back to the bench
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function EosinReading({ ctx, readOnly }: { ctx: DissectCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.eosin;
  const look = useDissectBench((b) => b.look);
  const last = lastEosinShown(p.v, s);
  const sec = look && w.sections[look.n] ? { ...look, x: w.sections[look.n]! } : null;
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">{sec ? `Section ${sec.n + 1}: ${sec.x.kind === 'TS' ? 'transverse' : 'longitudinal'}, ${sec.x.at} cm above the dye` : `The plant at ${w.clock} min`}</p>
      <div className="grid grid-cols-2 items-start gap-2">
        {sec ? <SectionSvg kind={sec.x.kind} seen={eosinSectionSeen(p.v.eosin, w, sec.n)} thin={sec.x.thin} tool={sec.tool} bundles={p.v.eosin.bundles} label={`Section ${sec.n + 1}`} /> : <PlantSvg v={p.v} w={w} label={`The balsam plant at ${w.clock} min`} />}
        <div>
          {last ? <RulerZoom reading={last.cm} label={`The ruler at the red line at ${last.at} min`} /> : <p className="text-[12.5px] text-muted-foreground">No reading yet.</p>}
          {last && <p className="mt-1 text-center text-[12.5px]">Reading at {last.at} min: {last.cm.toFixed(1)} cm</p>}
          {w.leafLook !== null && <p className="mt-1 text-center text-[12px] text-muted-foreground">Leaf veins looked at {w.leafLook} min.</p>}
        </div>
      </div>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={!w.dye || w.sections.length > 0} onClick={() => eosinActs.wait(ctx, 20)}>
            Wait 20 min
          </Button>
          <Button size="sm" variant="brand" disabled={!w.dye || w.sections.length > 0 || w.clock < 1 || w.reads.includes(w.clock)} onClick={() => eosinActs.read(ctx)}>
            Read the red line
          </Button>
          {sec && (
            <Button size="sm" variant="outline" onClick={() => useDissectBench.setState({ look: null })}>
              Back to the plant
            </Button>
          )}
          {w.sections.map((_, n) => (
            <Button key={n} size="sm" variant="outline" onClick={() => eosinActs.look(ctx, n, sec?.tool ?? 'MICRO')}>
              Section {n + 1}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}

function RatReading({ ctx, readOnly }: { ctx: DissectCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.rat;
  const last = lastRatShown(p.v, s);
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">The dissection as displayed</p>
      <RatSvg w={w} label="The rat on the dissecting board" />
      {last && <p className="mt-1 text-center text-[12.5px]">Last measurement: {last.what === 'BODY' ? 'body (snout to anus)' : last.what === 'SI' ? 'small intestine' : 'large intestine'} = {last.cm.toFixed(1)} cm</p>}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={!w.pinned} onClick={() => ratActs.measure(ctx, 'BODY')}>
            Measure the body
          </Button>
          <Button size="sm" variant="outline" disabled={!w.unravelled} onClick={() => ratActs.measure(ctx, 'SI')}>
            Measure the small intestine
          </Button>
          <Button size="sm" variant="outline" disabled={!w.unravelled} onClick={() => ratActs.measure(ctx, 'LI')}>
            Measure the large intestine
          </Button>
        </div>
      )}
    </>
  );
}

function MicroReading({ ctx, readOnly }: { ctx: DissectCtx; readOnly: boolean }) {
  const { p, s } = ctx;
  const w = s.micro;
  const k = useDissectBench((b) => b.plate);
  const days = plateDaysNow(s);
  return (
    <>
      <p className="mb-2 text-[13px] font-semibold">
        Day {w.day}
        {days !== null ? ` — plates incubated ${days} day${days === 1 ? '' : 's'} (count through the lid)` : ''}
      </p>
      <div className="grid grid-cols-4 gap-1">
        {PLATES.map((r, j) => (
          <button key={r} type="button" onClick={() => useDissectBench.setState({ plate: j })} className={cn('rounded-lg border p-0.5 text-[11px]', j === k ? 'border-brand' : 'border-transparent')} aria-pressed={j === k}>
            <PlateSvg v={p.v} w={w} k={j} days={days} seed={p.v.seed} label={`${PLATE_LABEL[r]} plate`} />
            Plate {j + 1}
          </button>
        ))}
      </div>
      <PlateSvg v={p.v} w={w} k={k} days={days} seed={p.v.seed} label={`Plate ${k + 1} close up`} big />
      {w.lensAt !== null && (
        <div className="mt-2 grid grid-cols-3 gap-1">
          {SLICES.map((n, j) => (
            <BreadSvg key={n} v={p.v} w={w} k={j} d={w.lensAt!} label={`Slice ${n} under the hand lens`} />
          ))}
        </div>
      )}
      {w.slide && <MouldSlide label="The teacher's slide of Rhizopus" />}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={w.incAt === null && w.breadAt === null} onClick={() => microActs.wait(ctx)}>
            Leave 1 day
          </Button>
          <Button size="sm" variant="brand" disabled={w.incAt === null || w.day <= w.incAt} onClick={() => microActs.count(ctx)}>
            Count the colonies
          </Button>
          <Button size="sm" variant="outline" disabled={w.breadAt === null || w.day <= w.breadAt} onClick={() => microActs.lens(ctx)}>
            Bread under the lens
          </Button>
        </div>
      )}
    </>
  );
}
