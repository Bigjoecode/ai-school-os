import {
  AMY_BATHS,
  AMY_BATH_LABEL,
  AMY_BATH_SHORT,
  AMY_MAX_CLOCK,
  AMY_MAX_TUBES,
  FOOD_LETTERS,
  FOOD_MAX_TESTS,
  FOOD_TASKS,
  FOOD_TASK_TITLE,
  FOOD_TESTS,
  FOOD_TEST_INFO,
  foodObserve,
  foodTestText,
  type AmyBath,
  type BioFoodState,
  type FoodSample,
} from '@aischool/shared';
import { ChevronDown, Flame, FlaskConical, Lightbulb, Timer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { HEAT_MAX, nextHint, useFoodTests, type FoodTests } from './actions';
import { AmyNotebook, FoodConclusion, FoodNotebook, Written } from './notebook';
import { TaskText } from './task-text';
import { SpotTileSvg, TubeSvg } from './visuals';

export default function BioFoodTestsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-food-tests'>) {
  const f = useFoodTests({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = f;
  const [brief, setBrief] = useState(true);
  const [active, setActive] = useState<number>(state.tests.length - 1);
  const pick = (i: number) => i >= 0 && setActive(i);
  const amylase = task === 'AMYLASE';

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> {FOOD_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !state.tests.length && !state.tubes.length && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Experiment">
                {FOOD_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => f.chooseTask(t)} aria-pressed={task === t}>
                    {FOOD_TASK_TITLE[t]}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          {!readOnly && mode === 'LAB' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(v, state)}
            </p>
          )}
          {amylase ? <AmylaseBench f={f} state={state} readOnly={readOnly} onTest={pick} /> : <FoodBench f={f} state={state} readOnly={readOnly} onTest={pick} />}
          {active >= 0 && active < state.tests.length ? <ActiveTube f={f} i={active} state={state} readOnly={readOnly} onDiscard={() => setActive(-1)} /> : null}
          {state.tests.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Test tubes</p>
              <div className="flex flex-wrap gap-1.5">
                {state.tests.map((t, i) => (
                  <button key={i} type="button" onClick={() => setActive(i)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', i === active ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')} aria-pressed={i === active} title={foodTestText(state, t)}>
                    {i + 1}. {t.sample} {FOOD_TEST_INFO[t.test].short}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
        <div className="space-y-4">
          {amylase ? (
            <AmyNotebook state={state} readOnly={readOnly} update={f.update} active={active} setActive={setActive} />
          ) : (
            <>
              <FoodNotebook state={state} readOnly={readOnly} update={f.update} active={active} setActive={setActive} />
              <FoodConclusion state={state} readOnly={readOnly} update={f.update} />
            </>
          )}
          <Written state={state} readOnly={readOnly} update={f.update} />
        </div>
      </div>
    </div>
  );
}

function FoodBench({ f, state, readOnly, onTest }: { f: FoodTests; state: BioFoodState; readOnly: boolean; onTest: (i: number) => void }) {
  const [sample, setSample] = useState<FoodSample>('P');
  if (readOnly) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-[12.5px] font-semibold">1. Sample</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sample to test">
          {FOOD_LETTERS.map((x) => (
            <Button key={x} size="sm" variant={sample === x ? 'brand' : 'outline'} onClick={() => setSample(x)} aria-pressed={sample === x}>
              {x}
            </Button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-[12.5px] font-semibold">2. Test (2 cm³ of {sample} in a clean tube)</p>
        <div className="flex flex-wrap gap-1.5">
          {FOOD_TESTS.map((t) => (
            <Button key={t} size="sm" variant="outline" onClick={() => onTest(f.doTest(sample, t))} disabled={state.tests.length >= FOOD_MAX_TESTS} className="h-auto min-h-8 whitespace-normal py-1 text-left">
              {FOOD_TEST_INFO[t].label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AmylaseBench({ f, state, readOnly, onTest }: { f: FoodTests; state: BioFoodState; readOnly: boolean; onTest: (i: number) => void }) {
  const [bath, setBath] = useState<AmyBath>('BODY');
  const [boiled, setBoiled] = useState(false);
  const mixed = state.clock !== null;
  const spotsNow = mixed ? state.spots.filter((x) => x.t === state.clock).length : 0;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[12.5px] font-semibold">Spotting tile</p>
          {!readOnly && (
            <Button size="sm" variant={state.tile ? 'secondary' : 'brand'} disabled={state.tile} onClick={f.setTile}>
              {state.tile ? 'Iodine in the wells' : 'Put iodine in the wells'}
            </Button>
          )}
        </div>
        <SpotTileSvg v={f.v} state={state} />
      </div>
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-[12.5px] font-semibold">Tubes (5 cm³ starch + 1 cm³ saliva in each bath)</p>
        {state.tubes.length === 0 && <p className="mb-2 text-[12px] text-muted-foreground">No tubes yet.</p>}
        <ul className="mb-2 space-y-1 text-[12.5px]">
          {state.tubes.map((t, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span>
                {i + 1}. {AMY_BATH_LABEL[t.bath]}
                {t.boiled ? ' — boiled saliva (control)' : ''}
              </span>
              {!readOnly && !mixed && (
                <Button size="sm" variant="ghost" onClick={() => f.removeTube(i)} aria-label={`Remove tube ${i + 1}`}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && !mixed && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Bath">
              {AMY_BATHS.map((b) => (
                <Button key={b} size="sm" variant={bath === b ? 'brand' : 'outline'} role="radio" aria-checked={bath === b} onClick={() => setBath(b)}>
                  {AMY_BATH_SHORT[b]}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={boiled} onChange={(e) => setBoiled(e.target.checked)} /> Use boiled saliva (control)
            </label>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" disabled={state.tubes.length >= AMY_MAX_TUBES} onClick={() => f.addTube(bath, boiled)}>
                Add the tube
              </Button>
              <Button size="sm" variant={state.equilibrated ? 'secondary' : 'outline'} disabled={!state.tubes.length || state.equilibrated} onClick={f.equilibrate}>
                {state.equilibrated ? 'At the bath temperatures' : 'Leave them 5 min in the baths'}
              </Button>
              <Button size="sm" variant="brand" disabled={!state.tubes.length} onClick={f.mix}>
                Mix and start the stopwatch
              </Button>
            </div>
          </div>
        )}
      </div>
      {mixed && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold">
            <Timer className="size-4 text-muted-foreground" aria-hidden /> Stopwatch: <span className="font-mono text-[15px]">{state.clock} s</span>
            <Badge variant="outline">{spotsNow}/{state.tubes.length} drops at this time</Badge>
          </p>
          {!readOnly && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="brand" disabled={!state.tile || spotsNow >= state.tubes.length} onClick={() => f.spot('all')}>
                Test a drop of each mixture
              </Button>
              <Button size="sm" variant="outline" disabled={(state.clock ?? 0) >= AMY_MAX_CLOCK} onClick={() => f.wait(30)}>
                Wait 30 s
              </Button>
              <Button size="sm" variant="outline" disabled={(state.clock ?? 0) >= AMY_MAX_CLOCK} onClick={() => f.wait(60)}>
                Wait 1 min
              </Button>
            </div>
          )}
          {!readOnly && (
            <div className="mt-3">
              <p className="mb-1 text-[12px] font-medium text-muted-foreground">Benedict’s test on a mixture (2 cm³, heated in the water bath)</p>
              <div className="flex flex-wrap gap-1.5">
                {state.tubes.map((_, i) => (
                  <Button key={i} size="sm" variant="outline" onClick={() => onTest(f.doTest(String(i + 1) as FoodSample, 'BENEDICT'))}>
                    Tube {i + 1}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveTube({ f, i, state, readOnly, onDiscard }: { f: FoodTests; i: number; state: BioFoodState; readOnly: boolean; onDiscard: () => void }) {
  const t = state.tests[i]!;
  const out = foodObserve(f.v, state, t);
  const info = FOOD_TEST_INFO[t.test];
  const heatReady = info.heats && (t.test !== 'NONREDUCING' || t.steps.includes('BENEDICT'));
  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <p className="mb-2 text-[12.5px] font-semibold">
        Test {i + 1}: <span className="font-normal">{foodTestText(state, t)}</span>
      </p>
      <div className="flex items-start gap-3">
        <TubeSvg vis={out.visual} inBath={t.heat > 0 && !t.direct} label={`Test tube: ${out.parts.map((p) => p.text).join('; ')}`} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">What you see</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px]" aria-live="polite">
            {out.parts.map((p, k) => (
              <li key={k}>{p.text.charAt(0).toUpperCase() + p.text.slice(1)}</li>
            ))}
          </ul>
          {info.heats && <p className="mt-1 text-[11.5px] text-muted-foreground">In the bath: {t.heat} s{t.direct ? ' (heated directly!)' : ''}</p>}
        </div>
      </div>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {info.steps.map((st) => (
            <Button key={st.id} size="sm" variant="outline" disabled={t.steps.includes(st.id)} onClick={() => f.addStep(i, st.id)} className="h-auto min-h-8 whitespace-normal py-1 text-left">
              {st.label}
            </Button>
          ))}
          {heatReady && (
            <>
              <Button size="sm" variant="brand" disabled={t.heat >= HEAT_MAX} onClick={() => f.heat(i, 60)}>
                <Flame /> Water bath +1 min
              </Button>
              <Button size="sm" variant="outline" disabled={t.heat >= HEAT_MAX} onClick={() => f.heat(i, 30)}>
                +30 s
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" disabled={t.heat >= HEAT_MAX} onClick={() => f.heat(i, 30, true)}>
                Heat directly over the flame
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              f.discard(i);
              onDiscard();
            }}
          >
            <Trash2 /> Discard this test
          </Button>
        </div>
      )}
    </div>
  );
}
