import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CrossBench, DiscBench, FoodBench, HeightBench } from '../benches';
import type { GenCtx } from './lab-actions';

/**
 * The close-up views — the height board and record of the classmate at it,
 * the classmate's tongue and health card, the beakers and the tally of pairs,
 * the field-note cards and data card — the same drawings and controls as the
 * 2D lab's bench, from the same maths.
 */

const SHELL = 'pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain p-2 pt-[6.5rem] text-white sm:p-4 sm:pt-28';
const CARD = 'w-full max-w-xl rounded-2xl bg-card p-3 text-card-foreground shadow-2xl';

export function ReadingPanel({ ctx, readOnly, onBack }: { ctx: GenCtx; readOnly: boolean; onBack: () => void }) {
  const task = ctx.s.task ?? 'HEIGHT';
  return (
    <div className={cn(SHELL, 'bg-black/55')} role="dialog" aria-label={task === 'HEIGHT' ? 'Measuring the class' : task === 'DISCRETE' ? 'The class survey' : task === 'CROSS' ? 'The beakers and the tally' : 'The field notes'}>
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3">
        <section className={CARD}>
          {task === 'HEIGHT' ? <HeightBench g={ctx.g} state={ctx.s} readOnly={readOnly} /> : task === 'DISCRETE' ? <DiscBench g={ctx.g} state={ctx.s} readOnly={readOnly} /> : task === 'CROSS' ? <CrossBench g={ctx.g} state={ctx.s} readOnly={readOnly} /> : <FoodBench g={ctx.g} state={ctx.s} readOnly={readOnly} />}
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
