import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CapBench, FacBench, QuadBench, SoilBench } from '..';
import type { EcoCtx } from './lab-actions';

/**
 * The close-up view: the plot map and each quadrat, the tray, the
 * instruments and their scales, the jars, cylinders and balance — the same
 * drawings and controls as the 2D lab, from the same maths.
 */

const SHELL = 'pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain bg-black/55 p-2 pt-[6.5rem] text-white sm:p-4 sm:pt-28';

export function ReadingPanel({ ctx, readOnly, onBack }: { ctx: EcoCtx; readOnly: boolean; onBack: () => void }) {
  const task = ctx.s.task ?? 'QUADRAT';
  const p = { o: ctx.o, state: ctx.s, readOnly };
  return (
    <div className={SHELL} role="dialog" aria-label="Close-up">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
        <section className="w-full rounded-2xl bg-card p-3 text-card-foreground shadow-2xl">{task === 'QUADRAT' ? <QuadBench {...p} /> : task === 'CAPTURE' ? <CapBench {...p} /> : task === 'FACTORS' ? <FacBench {...p} /> : <SoilBench {...p} />}</section>
        <p className="text-center text-[12.5px] text-white/80">Write each reading in your notebook as you take it.</p>
        <Button size="sm" variant="outline" className="text-foreground" onClick={onBack}>
          <ArrowLeft /> Back to the field
        </Button>
      </div>
    </div>
  );
}
