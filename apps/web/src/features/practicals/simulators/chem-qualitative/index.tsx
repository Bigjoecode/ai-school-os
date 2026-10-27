import {
  QUAL_GAS_TEST_LABEL,
  QUAL_MAX_TESTS,
  QUAL_SAMPLE_LABEL,
  type ChemQualitativeVariant,
  QUAL_GAS_TESTS,
  QUAL_REAGENTS,
  QUAL_REAGENT_INFO,
  isSolidSample,
  qualObserve,
  qualReagentFits,
  qualSampleName,
  qualSamples,
  qualTestText,
  type ChemQualitativeState,
  type QualGasTest,
  type QualReagent,
  type QualSample,
  type QualStep,
  type QualVisual,
} from '@aischool/shared';
import { ChevronDown, FlaskConical, Lightbulb, TestTube, Trash2, Wind } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { nextHint, useQualitative } from './actions';
import { Conclusion, Notebook } from './notebook';

export default function ChemQualitativeLab({ seed, mode, state, onChange, readOnly, startedAt }: SimulatorProps<'chem-qualitative'>) {
  const q = useQualitative({ seed, state, onChange, readOnly, startedAt });
  const { v, update, addStep, addGasTest } = q;
  const [brief, setBrief] = useState(true);
  const [sample, setSample] = useState<QualSample>('SOLID');
  const [active, setActive] = useState<number>(state.tests.length - 1);
  const samples = qualSamples(v, state.tests);
  const cur = samples.includes(sample) ? sample : 'SOLID';
  const activeTest = active >= 0 && active < state.tests.length ? state.tests[active]! : null;

  const doTest = (reagent: QualReagent) => {
    const i = q.doTest(cur, reagent);
    if (i >= 0) setActive(i);
  };
  const discard = (i: number) => {
    q.discard(i);
    setActive((a) => (a >= i ? a - 1 : a));
  };

  const shelf = QUAL_REAGENTS.filter((r) => qualReagentFits(r, cur));

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> The task
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed">
            <p>{v.given}</p>
            <p>
              Choose suitable tests from the reagent shelf and carry them out on C{v.kind === 'MIXTURE' ? ', the filtrate and the residue' : ' and its solution'}. Test every gas given off. Record each test in the table: what you observed and what you infer from it. Then
              {v.kind === 'MIXTURE' ? ' name the cation and anion of the soluble salt (filtrate) and of the insoluble salt (residue)' : ' name the cation and the anion in C'}, and write an ionic equation for a confirmatory test of each ion.
            </p>
            <p className="text-muted-foreground">Cations: NH₄⁺, Ca²⁺, Pb²⁺, Cu²⁺, Fe²⁺, Fe³⁺, Zn²⁺, Al³⁺ (and Na⁺, K⁺ by flame). Anions: Cl⁻, SO₄²⁻, SO₃²⁻, CO₃²⁻, NO₃⁻, S²⁻. Waft gases towards your nose; never smell directly.</p>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <TestTube className="size-4 text-muted-foreground" aria-hidden /> Bench
            </h3>
            <Badge variant="outline">
              {state.tests.length} test{state.tests.length === 1 ? '' : 's'}
            </Badge>
          </div>
          {!readOnly && mode === 'LAB' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(v, state)}
            </p>
          )}

          {!readOnly && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-[12.5px] font-semibold">1. Sample</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sample to test">
                  {samples.map((x) => (
                    <Button key={x} size="sm" variant={cur === x ? 'brand' : 'outline'} onClick={() => setSample(x)} aria-pressed={cur === x}>
                      {x === 'SOLUTION' ? qualSampleName(v, x) : QUAL_SAMPLE_LABEL[x]}
                    </Button>
                  ))}
                </div>
                {samples.length === 1 && <p className="mt-2 text-[11.5px] text-muted-foreground">The solution{v.kind === 'MIXTURE' ? ', filtrate and residue appear' : ' appears'} once you prepare {v.kind === 'MIXTURE' ? 'them' : 'it'} from the solid.</p>}
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="mb-2 text-[12.5px] font-semibold">2. Reagent shelf ({isSolidSample(cur) ? 'solid tests' : 'solution tests'})</p>
                <div className="flex flex-wrap gap-1.5">
                  {shelf.map((r) => (
                    <Button key={r} size="sm" variant="outline" onClick={() => doTest(r)} disabled={state.tests.length >= QUAL_MAX_TESTS} className="h-auto min-h-8 whitespace-normal py-1 text-left">
                      {QUAL_REAGENT_INFO[r].label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTest ? (
            <ActiveTube v={v} i={active} state={state} readOnly={readOnly} addStep={addStep} addGasTest={addGasTest} discard={discard} />
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">Choose a sample and a reagent to start a test.</p>
          )}

          {state.tests.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Test tubes</p>
              <div className="flex flex-wrap gap-1.5">
                {state.tests.map((t, i) => (
                  <button key={i} type="button" onClick={() => setActive(i)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', i === active ? 'border-brand bg-brand/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')} aria-pressed={i === active} title={qualTestText(v, t)}>
                    {i + 1}. {QUAL_REAGENT_INFO[t.reagent].label.split(' (')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Notebook v={v} state={state} readOnly={readOnly} update={update} active={active} setActive={setActive} />
          <Conclusion v={v} state={state} readOnly={readOnly} update={update} />
        </div>
      </div>
    </div>
  );
}

function ActiveTube({ v, i, state, readOnly, addStep, addGasTest, discard }: { v: ChemQualitativeVariant; i: number; state: ChemQualitativeState; readOnly: boolean; addStep: (i: number, s: QualStep) => void; addGasTest: (i: number, g: QualGasTest) => void; discard: (i: number) => void }) {
  const t = state.tests[i]!;
  const out = qualObserve(v, t);
  const info = QUAL_REAGENT_INFO[t.reagent];
  const steps = info.steps.filter(() => !(t.reagent === 'DIL_HCL' && isSolidSample(t.sample)));
  const gasOn = info.gas || out.gases.length > 0;
  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <p className="mb-2 text-[12.5px] font-semibold">
        Test {i + 1}: <span className="font-normal">{qualTestText(v, t)}</span>
      </p>
      <div className="flex items-start gap-3">
        <TubeSvg vis={out.visual} heating={t.reagent === 'HEAT'} flameTest={t.reagent === 'FLAME'} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">What you see</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px]" aria-live="polite">
            {out.parts.map((p, k) => (
              <li key={k}>{p.text.charAt(0).toUpperCase() + p.text.slice(1)}</li>
            ))}
          </ul>
          {out.visual.probes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {out.visual.probes.map((p, k) => (
                <span key={k} className="inline-flex items-center gap-1.5 rounded-md border border-border px-1.5 py-0.5 text-[11px]">
                  <span className="size-3 rounded-sm border border-border" style={{ background: p.colour }} aria-hidden /> {QUAL_GAS_TEST_LABEL[p.test] ?? p.test}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="mt-3 space-y-2">
          {steps.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {steps.map((s) => (
                <Button key={s.id} size="sm" variant="outline" disabled={t.steps.includes(s.id)} onClick={() => addStep(i, s.id)}>
                  {s.label}
                </Button>
              ))}
            </div>
          )}
          {gasOn && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                <Wind className="size-3.5" aria-hidden /> Test the gas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUAL_GAS_TESTS.map((g) => (
                  <Button key={g} size="sm" variant={t.gasTests.includes(g) ? 'secondary' : 'outline'} disabled={t.gasTests.includes(g)} onClick={() => addGasTest(i, g)} className="h-7 px-2 text-[12px]">
                    {QUAL_GAS_TEST_LABEL[g]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Button size="sm" variant="ghost" onClick={() => discard(i)}>
            <Trash2 /> Discard this test
          </Button>
        </div>
      )}
    </div>
  );
}

/** A test tube (or a Bunsen flame for the flame test) drawn from the outcome's visual. */
function TubeSvg({ vis, heating, flameTest }: { vis: QualVisual; heating: boolean; flameTest: boolean }) {
  if (flameTest)
    return (
      <svg viewBox="0 0 80 150" className="h-[150px] w-[80px] shrink-0" role="img" aria-label="Flame test">
        <rect x="32" y="110" width="16" height="36" rx="2" className="fill-muted-foreground/40" />
        <path d="M40 30 C 58 60 56 92 40 110 C 24 92 22 60 40 30 Z" fill={vis.flame ?? '#6fa8ff'} opacity="0.85" />
        <path d="M40 70 C 48 84 47 98 40 108 C 33 98 32 84 40 70 Z" fill="#9cc3ff" opacity="0.7" />
        <line x1="76" y1="20" x2="44" y2="62" className="stroke-muted-foreground" strokeWidth="1.5" />
      </svg>
    );
  const liquidTop = 70;
  const fill = vis.liquid;
  return (
    <svg viewBox="0 0 80 150" className="h-[150px] w-[80px] shrink-0" role="img" aria-label={`Test tube${fill ? ' with liquid' : ''}${vis.ppt ? ', precipitate' : ''}${vis.bubbles ? ', bubbling' : ''}${vis.fumes ? ', fumes' : ''}`}>
      {vis.fumes && (
        <g opacity="0.75">
          <ellipse cx="40" cy="12" rx="16" ry="8" fill={vis.fumes} />
          <ellipse cx="50" cy="4" rx="10" ry="5" fill={vis.fumes} />
        </g>
      )}
      <defs>
        <clipPath id="qual-tube">
          <path d="M26 18 L54 18 L54 118 A14 14 0 0 1 26 118 Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#qual-tube)">
        {fill && <rect x="26" y={liquidTop} width="28" height="70" fill={fill} style={{ transition: 'fill 300ms ease' }} />}
        {vis.ppt && <rect x="26" y={fill ? 108 : 118} width="28" height="30" fill={vis.ppt} opacity="0.95" />}
        {!fill && vis.solid && <rect x="26" y="112" width="28" height="30" fill={vis.solid} />}
        {vis.ring && <rect x="26" y={liquidTop + 12} width="28" height="5" fill={vis.ring} />}
        {vis.deposit && [0, 1, 2, 3, 4].map((k) => <circle key={k} cx={30 + k * 5} cy={100 + (k % 2) * 6} r="1.8" fill={vis.deposit!} />)}
        {vis.bubbles && fill && [0, 1, 2, 3, 4, 5].map((k) => <circle key={k} cx={31 + ((k * 7) % 20)} cy={78 + ((k * 11) % 34)} r={1.5 + (k % 2)} fill="none" stroke="#7a8794" strokeWidth="0.8" />)}
        {vis.sublimate && <rect x="26" y="34" width="28" height="6" fill="#f6f6f2" stroke="#c9c9c0" strokeWidth="0.5" />}
        {vis.droplets && [0, 1, 2].map((k) => <circle key={k} cx={30 + k * 9} cy={30 + (k % 2) * 4} r="1.6" fill="#bcd6ef" />)}
      </g>
      <path d="M26 18 L54 18 L54 118 A14 14 0 0 1 26 118 Z" fill="none" className="stroke-muted-foreground/70" strokeWidth="1.4" />
      {heating && (
        <g>
          <path d="M40 150 C 50 142 50 136 40 128 C 30 136 30 142 40 150 Z" fill="#f59e0b" opacity="0.9" />
          {vis.solidCold && vis.solidCold !== vis.solid && (
            <g>
              <rect x="60" y="112" width="12" height="12" rx="2" fill={vis.solidCold} stroke="#999" strokeWidth="0.5" />
              <text x="66" y="134" textAnchor="middle" fontSize="7" className="fill-muted-foreground">
                cold
              </text>
            </g>
          )}
        </g>
      )}
    </svg>
  );
}
