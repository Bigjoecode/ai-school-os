import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BreathBench, PulseBench, ReactBench, SkinBench } from '../benches';
import { useHumanBench } from './bench';
import type { HumanCtx } from './lab-actions';

/**
 * The close-up views — the wrist with the stopwatch, the lime water tubes,
 * mirror and thermometer, the metre rule where it was caught, the skin map
 * with the dividers and the tally — the same drawings and controls as the 2D
 * lab's bench, from the same maths.
 */

const SHELL = 'pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain p-2 pt-[6.5rem] text-white sm:p-4 sm:pt-28';
const CARD = 'w-full max-w-xl rounded-2xl bg-card p-3 text-card-foreground shadow-2xl';

export function ReadingPanel({ ctx, readOnly, onBack }: { ctx: HumanCtx; readOnly: boolean; onBack: () => void }) {
  const task = ctx.s.task ?? 'PULSE';
  const area = useHumanBench((b) => b.area);
  const sep = useHumanBench((b) => b.sep);
  const pick = {
    area,
    setArea: (a: typeof area) => useHumanBench.setState({ area: a }),
    sep,
    setSep: (x: number | ((x: number) => number)) => useHumanBench.setState({ sep: typeof x === 'function' ? x(useHumanBench.getState().sep) : x }),
  };
  return (
    <div className={cn(SHELL, 'bg-black/55')} role="dialog" aria-label={task === 'PULSE' ? 'Taking the pulse' : task === 'BREATH' ? 'The lime water, mirror and thermometer' : task === 'REACTION' ? 'Reading the metre rule' : 'Touching the skin'}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
        <section className={CARD}>
          {task === 'PULSE' ? <PulseBench h={ctx.h} state={ctx.s} readOnly={readOnly} /> : task === 'BREATH' ? <BreathBench h={ctx.h} state={ctx.s} readOnly={readOnly} /> : task === 'REACTION' ? <ReactBench h={ctx.h} state={ctx.s} readOnly={readOnly} /> : <SkinBench h={ctx.h} state={ctx.s} readOnly={readOnly} pick={pick} />}
          <div className="mt-1">
            <Button size="sm" variant="outline" onClick={onBack}>
              <ArrowLeft /> Back to the bench
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
