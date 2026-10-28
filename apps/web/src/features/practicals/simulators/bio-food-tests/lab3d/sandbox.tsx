import { FOODS, FOOD_LETTERS, NUTRIENT_LABEL, contentNutrients, emptyBioFoodState, type BioFoodState, type FoodTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useFoodTests } from '../actions';
import { amyVariant, foodsVariant, useFoodBench } from './bench';
import { neededFor } from './scene-state';

/**
 * The unmarked sandbox: the student chooses the foods on the bench (or how
 * active the saliva is) and tests freely on a bench already set up (coat,
 * goggles, apparatus, the water bath boiling). The results are the shared
 * chemistry for those foods. Nothing is graded, saved or sent.
 */

const SANDBOX_SEED = 424_242;
const SALIVA = [
  { id: 'fast', label: 'Very active saliva (end point about 50 s at 37 °C)', t37: 50 },
  { id: 'normal', label: 'Typical saliva (about 90 s)', t37: 90 },
  { id: 'slow', label: 'Weak, very dilute saliva (about 150 s)', t37: 150 },
];
const setUpBench = (task: FoodTask): BioFoodState => ({ ...emptyBioFoodState(), task, log: [{ t: 0, a: 'safety:coat' }, { t: 0, a: 'safety:goggles' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` })), { t: 0, a: 'burner-on' }] });

export function useFoodSandbox(task: FoodTask, startedAt: string) {
  const [foods, setFoods] = useState<string[]>(['milk', 'sucrose', 'beans']);
  const [saliva, setSaliva] = useState('normal');
  const [state, setState] = useState<BioFoodState>(() => setUpBench(task));
  const [round, setRound] = useState(0);
  const variant = useMemo(() => (task === 'AMYLASE' ? amyVariant(SALIVA.find((x) => x.id === saliva)!.t37, SANDBOX_SEED + round) : foodsVariant(foods, SANDBOX_SEED + round)), [task, foods, saliva, round]);
  const f = useFoodTests({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  // The attempt's task decides the sandbox's bench (it may arrive after the first render).
  useEffect(() => {
    f.ref.current = setUpBench(task);
    setState(f.ref.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);
  const start = (o: { foods?: string[]; saliva?: string }) => {
    if (o.foods) setFoods(o.foods);
    if (o.saliva) setSaliva(o.saliva);
    setRound((r) => r + 1);
    useFoodBench.setState({ active: -1, anim: null });
    f.ref.current = setUpBench(task);
    setState(f.ref.current);
  };
  return { task, foods, saliva, start, state, f, v: variant };
}
export type FoodSandbox = ReturnType<typeof useFoodSandbox>;

export function FoodSandboxForm({ sandbox, onStart }: { sandbox: FoodSandbox; onStart: (o: { foods?: string[]; saliva?: string }) => void }) {
  const [foods, setFoods] = useState(sandbox.foods);
  const [saliva, setSaliva] = useState(sandbox.saliva);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">{sandbox.task === 'AMYLASE' ? 'Choose how active the saliva is and experiment freely: any baths, any timing.' : 'Choose any foods for P, Q and R and test them as often as you like. Nothing here is marked or saved.'}</p>
      {sandbox.task === 'AMYLASE' ? (
        <label className="block">
          <span className="font-medium">Saliva</span>
          <select value={saliva} onChange={(e) => setSaliva(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Saliva">
            {SALIVA.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        FOOD_LETTERS.map((l, k) => (
          <label key={l} className="block">
            <span className="font-medium">Sample {l}</span>
            <select value={foods[k]} onChange={(e) => setFoods(foods.map((x, j) => (j === k ? e.target.value : x)))} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label={`Food for sample ${l}`}>
              {FOODS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        ))
      )}
      <Button variant="brand" onClick={() => onStart(sandbox.task === 'AMYLASE' ? { saliva } : { foods })}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

/** What is on the sandbox bench (shown: the sandbox is unmarked). */
export function FoodSandboxBadge({ sandbox }: { sandbox: FoodSandbox }) {
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox bench">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      {sandbox.task === 'AMYLASE' ? (
        <p className="mt-0.5">Saliva end point at 37 °C: about {sandbox.v.amy.t37} s · {sandbox.state.spots.length} drops</p>
      ) : (
        <ul className="mt-0.5 space-y-0.5">
          {sandbox.v.samples.map((sm) => (
            <li key={sm.letter}>
              {sm.letter}: {sm.food.name} — {contentNutrients(sm.content).map((x) => NUTRIENT_LABEL[x].toLowerCase()).join(', ') || 'nothing'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
