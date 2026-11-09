import { compCodeVariant, emptyCompCodeState, type CompCodeState, type CompTask } from '@aischool/shared';
import { Laptop } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useComp } from '../actions';
import { maintStatus } from '../bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: a computer already on, with fresh numbers, for trying
 * things on purpose: an endless loop, a missing bracket, a tag left open, a
 * plug the wrong way up. Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 424_242;
const IDEAS: Record<CompTask, string> = {
  BASIC_IO: 'Leave out the brackets or write 1/2BH and see what BASIC says.',
  BASIC_LOOP: 'Try STEP -1, a negative step that can never end, or run out of DATA.',
  BASIC_ARRAY: 'Run past the end of the array, or leave out DIM.',
  BASIC_FUNC: 'Try SIN(90) without radians, RND, LOG and TAB.',
  BASIC_WHILE: 'Leave out the line that changes M and watch the machine stop you.',
  FLOW: 'Leave a decision without its NO arrow, or make a loop with no way out.',
  HTML: 'Forget a closing tag, nest things the wrong way, or try a script: the preview refuses it.',
  CRIMP: 'Flip one plug, swap two wires at one end, or trim too short, and read the tester.',
  MAINT: 'Clean it while it is on, or back up to the same disk, and see what the guide says.',
};
const setUpBench = (task: CompTask): CompCodeState => ({ ...emptyCompCodeState(), task, log: [{ t: 0, a: 'power:on' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))] });

export function useCompSandbox(task: CompTask, startedAt: string) {
  const [state, setState] = useState<CompCodeState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => compCodeVariant(SANDBOX_SEED + round, task), [task, round]);
  const o = useComp({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  useEffect(() => {
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = () => {
    setRound((r) => r + 1);
    o.ref.current = setUpBench(task);
    setState(o.ref.current);
  };
  return { task, start, state, o, v: variant };
}
export type CompSandbox = ReturnType<typeof useCompSandbox>;

export function CompSandboxForm({ sandbox, onStart }: { sandbox: CompSandbox; onStart: () => void }) {
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">A workstation already switched on, with fresh numbers. {IDEAS[sandbox.task]} Nothing here is marked or saved.</p>
      <Button variant="brand" onClick={onStart}>
        <Laptop /> Start the sandbox
      </Button>
    </div>
  );
}

export function CompSandboxBadge({ sandbox }: { sandbox: CompSandbox }) {
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p>{sandbox.task === 'MAINT' ? maintStatus(sandbox.o)[0] : IDEAS[sandbox.task]}</p>
    </section>
  );
}
