import { ORG_TASKS, ORG_TASK_TITLE, ORG_TEST_INFO, ORG_MAX_TESTS, orgObserve, orgSampleName, orgTestText, orgTestsFor, type ChemOrganicState, type OrgSample, type SoapAct } from '@aischool/shared';
import { ChevronDown, Flame, FlaskConical, Lightbulb, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { HEAT_MAX, heatsNow, nextHint, useOrganic, type Organic } from './actions';
import { OrgRecordAll } from './notebook';
import { TaskText } from './task-text';
import { OrgTubeSvg, SoapBeakerSvg } from './visuals';

export default function ChemOrganicLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'chem-organic'>) {
  const o = useOrganic({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = o;
  const [brief, setBrief] = useState(true);
  const [active, setActive] = useState<number>(state.tests.length - 1);
  const pick = (i: number) => i >= 0 && setActive(i);
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> {ORG_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !state.tests.length && !state.soap.length && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Experiment">
                {ORG_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={task === t}>
                    {ORG_TASK_TITLE[t]}
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
          {task === 'SOAP' ? (
            <SoapBench o={o} readOnly={readOnly} />
          ) : (
            <>
              <TubeBench o={o} state={state} readOnly={readOnly} onTest={pick} />
              {active >= 0 && active < state.tests.length ? <ActiveTube o={o} i={active} state={state} readOnly={readOnly} onDiscard={() => setActive(-1)} /> : null}
              {state.tests.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Test tubes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {state.tests.map((t, i) => (
                      <button key={i} type="button" onClick={() => setActive(i)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', i === active ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')} aria-pressed={i === active} title={orgTestText(t)}>
                        {i + 1}. {t.sample === 'H2O' ? 'Water' : t.sample} {ORG_TEST_INFO[t.test].short}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
        <OrgRecordAll v={v} state={state} readOnly={readOnly} update={o.update} active={active} setActive={setActive} />
      </div>
    </div>
  );
}

function TubeBench({ o, state, readOnly, onTest }: { o: Organic; state: ChemOrganicState; readOnly: boolean; onTest: (i: number) => void }) {
  const letters = o.v.samples.map((s) => s.letter);
  const [sample, setSample] = useState<OrgSample>(letters[0] ?? 'A');
  if (readOnly) return null;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-[12.5px] font-semibold">1. Sample</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sample to test">
          {letters.map((x) => (
            <Button key={x} size="sm" variant={sample === x ? 'brand' : 'outline'} onClick={() => setSample(x)} aria-pressed={sample === x}>
              {orgSampleName(x)}
            </Button>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-border p-3">
        <p className="mb-2 text-[12.5px] font-semibold">2. Test (about 2 cm³ of {orgSampleName(sample)} in a clean tube)</p>
        <div className="flex flex-wrap gap-1.5">
          {orgTestsFor(o.task).map((t) => (
            <Button key={t} size="sm" variant="outline" onClick={() => onTest(o.doTest(sample, t))} disabled={state.tests.length >= ORG_MAX_TESTS} className="h-auto min-h-8 whitespace-normal py-1 text-left">
              {ORG_TEST_INFO[t].label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActiveTube({ o, i, state, readOnly, onDiscard }: { o: Organic; i: number; state: ChemOrganicState; readOnly: boolean; onDiscard: () => void }) {
  const t = state.tests[i]!;
  const out = orgObserve(o.v, t);
  const info = ORG_TEST_INFO[t.test];
  const boiling = t.test === 'HYDROLYSIS' && t.steps.includes('ACID') && !t.steps.includes('NEUTRALISE');
  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <p className="mb-2 text-[12.5px] font-semibold">
        Test {i + 1}: <span className="font-normal">{orgTestText(t)}</span>
      </p>
      <div className="flex items-start gap-3">
        <OrgTubeSvg vis={out.visual} inBath={(t.heat > 0 || t.boil > 0) && !t.direct} label={`Test tube: ${out.parts.map((p) => p.text).join('; ')}`} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">What you see</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px]" aria-live="polite">
            {out.parts.map((p, k) => (
              <li key={k}>{p.text.charAt(0).toUpperCase() + p.text.slice(1)}</li>
            ))}
          </ul>
          {(info.heats || t.test === 'IODINE') && <p className="mt-1 text-[11.5px] text-muted-foreground">In the bath: {t.heat} s{t.test === 'HYDROLYSIS' ? ` · boiled with acid ${t.boil} s` : ''}{t.direct ? ' (heated directly!)' : ''}</p>}
        </div>
      </div>
      {!readOnly && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {info.steps.map((st) => (
            <Button key={st.id} size="sm" variant="outline" disabled={st.id !== 'CUSO4' && t.steps.includes(st.id)} onClick={() => o.addStep(i, st.id)} className="h-auto min-h-8 whitespace-normal py-1 text-left">
              {st.label}
              {st.id === 'CUSO4' && t.drops ? ` (${t.drops})` : ''}
            </Button>
          ))}
          {t.test === 'HYDROLYSIS' && t.steps.includes('ACID') && !t.steps.includes('NEUTRALISE') && (
            <Button size="sm" variant="outline" onClick={() => o.portion(i)}>
              Test a portion with iodine
            </Button>
          )}
          {heatsNow(t) && (
            <>
              <Button size="sm" variant="brand" disabled={t.heat >= HEAT_MAX} onClick={() => o.heat(i, 60)}>
                <Flame /> {boiling ? 'Boil with the acid +1 min' : 'Water bath +1 min'}
              </Button>
              <Button size="sm" variant="outline" disabled={t.heat >= HEAT_MAX} onClick={() => o.heat(i, 30)}>
                +30 s
              </Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => o.heat(i, 30, true)}>
                Heat directly over the flame
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              o.discard(i);
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

export const SOAP_BUTTONS: { a: SoapAct; n?: number; label: string }[] = [
  { a: 'OIL', label: 'Measure 10 cm³ of palm oil into the beaker' },
  { a: 'WEIGH_OIL', label: 'Weigh the oil' },
  { a: 'NAOH', label: 'Add 20 cm³ of 20% NaOH' },
  { a: 'BOIL', n: 60, label: 'Boil 1 min, stirring' },
  { a: 'BOIL', n: 300, label: 'Boil 5 min, stirring' },
  { a: 'BOIL_NOSTIR', n: 60, label: 'Boil 1 min without stirring' },
  { a: 'WATER', n: 5, label: 'Add 5 cm³ of distilled water' },
  { a: 'BRINE', label: 'Add 20 cm³ of saturated brine, stir' },
  { a: 'COOL', label: 'Leave to cool' },
  { a: 'FILTER', label: 'Filter off the soap' },
  { a: 'WASH', label: 'Wash with a little cold water' },
  { a: 'DRY', label: 'Press dry between filter papers' },
  { a: 'WEIGH_SOAP', label: 'Weigh the soap' },
  { a: 'LATHER_SOFT', label: 'Shake a piece with distilled water' },
  { a: 'LATHER_HARD', label: 'Shake a piece with hard water' },
];

function SoapBench({ o, readOnly }: { o: Organic; readOnly: boolean }) {
  const r = o.run();
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <SoapBeakerSvg r={r} />
        <ul className="space-y-0.5 text-[12.5px]">
          <li>Boiled: {Math.round(r.boiled / 60)} min{r.spat ? ` (${r.spat} min unstirred — it spat)` : ''}</li>
          <li>Water in the mixture: about {r.water.toFixed(0)} cm³</li>
          <li>{r.charred ? 'It boiled dry and charred!' : r.extent > 0.6 ? 'Thick and creamy' : r.boiled ? 'An oily layer still floats on top' : '—'}</li>
          <li>Balance: oil {r.oilWeighed ? `${o.v.soap.oilMass.toFixed(2)} g` : '—'} · soap {r.soapMass !== null ? `${r.soapMass.toFixed(2)} g` : '—'}</li>
          {r.soft && <li>Distilled water: lots of lather</li>}
          {r.hard && <li>Hard water: white scum, little lather</li>}
        </ul>
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5">
          {SOAP_BUTTONS.map((b) => (
            <Button key={`${b.a}${b.n ?? ''}`} size="sm" variant={b.a === 'BOIL' ? 'brand' : 'outline'} onClick={() => o.soap(b.a, b.n ?? 0)} className="h-auto min-h-8 whitespace-normal py-1 text-left">
              {b.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
