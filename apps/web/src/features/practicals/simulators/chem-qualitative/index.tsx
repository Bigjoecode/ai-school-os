import {
  QUAL_ANIONS,
  QUAL_CATIONS,
  QUAL_GASES,
  QUAL_GAS_LABEL,
  QUAL_GAS_TEST_LABEL,
  QUAL_GAS_TESTS,
  QUAL_ION_LABEL,
  QUAL_MAX_TESTS,
  QUAL_REAGENTS,
  QUAL_REAGENT_INFO,
  QUAL_SAMPLE_LABEL,
  chemQualitativeVariant,
  emptyQualRecord,
  isSolidSample,
  qualObserve,
  qualReagentFits,
  qualSampleName,
  qualSamples,
  qualTestText,
  type ChemQualitativeState,
  type ChemQualitativeVariant,
  type QualGas,
  type QualGasTest,
  type QualIon,
  type QualReagent,
  type QualRecord,
  type QualSample,
  type QualStep,
  type QualVisual,
} from '@aischool/shared';
import { ChevronDown, FlaskConical, Lightbulb, TestTube, Trash2, Wind } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';

type Update = (fn: (s: ChemQualitativeState) => ChemQualitativeState, log?: string) => void;
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** What to do next (practice mode only). */
function nextHint(v: ChemQualitativeVariant, s: ChemQualitativeState): string {
  const samples = qualSamples(v, s.tests);
  const did = (r: QualReagent, on?: QualSample) => s.tests.some((t) => t.reagent === r && (!on || t.sample === on));
  if (!s.tests.length) return v.kind === 'MIXTURE' ? 'Start by adding distilled water to C, shaking and filtering: note the filtrate and the residue.' : 'Start by adding distilled water to C and shaking: does it dissolve? What colour is the solution?';
  if (v.kind === 'SALT' && !samples.includes('SOLUTION')) return 'C does not dissolve in water: dissolve some in dilute HNO₃ and watch for effervescence (test the gas).';
  if (v.kind === 'MIXTURE' && !samples.includes('RESIDUE_SOLN')) return 'Dissolve the residue in dilute HNO₃ so that its cation can be tested.';
  const sol: QualSample[] = v.kind === 'SALT' ? ['SOLUTION'] : ['FILTRATE', 'RESIDUE_SOLN'];
  for (const x of sol) {
    if (!s.tests.some((t) => t.sample === x && t.reagent === 'NAOH' && t.steps.includes('EXCESS'))) return `Add NaOH(aq) to the ${lcFirst(QUAL_SAMPLE_LABEL[x])} in drops, then in excess.`;
    if (!s.tests.some((t) => t.sample === x && t.reagent === 'NH3' && t.steps.includes('EXCESS'))) return `Add NH₃(aq) to the ${lcFirst(QUAL_SAMPLE_LABEL[x])} in drops, then in excess.`;
  }
  if (!did('HEAT')) return 'Heat a little of the solid in a dry test tube and test any gas given off.';
  if (s.tests.some((t) => qualObserve(v, t).gases.length && !t.gasTests.length)) return 'A gas was given off: test it (lime water, damp litmus, splints, dichromate paper…).';
  if (!did('AGNO3') && !did('BACL2') && !did('BROWN_RING')) return 'Now test for the anion: AgNO₃ (Cl⁻), BaCl₂ then HCl (SO₄²⁻, SO₃²⁻, CO₃²⁻), the brown-ring test (NO₃⁻).';
  return 'Record each observation and inference, then name the ions and write an ionic equation.';
}

export default function ChemQualitativeLab({ seed, mode, state, onChange, readOnly, startedAt }: SimulatorProps<'chem-qualitative'>) {
  const v = useMemo(() => chemQualitativeVariant(seed), [seed]);
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(state);
  ref.current = state;
  const [brief, setBrief] = useState(true);
  const [sample, setSample] = useState<QualSample>('SOLID');
  const [active, setActive] = useState<number>(state.tests.length - 1);
  const samples = qualSamples(v, state.tests);
  const cur = samples.includes(sample) ? sample : 'SOLID';
  const activeTest = active >= 0 && active < state.tests.length ? state.tests[active]! : null;

  const update: Update = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  const doTest = (reagent: QualReagent) => {
    if (ref.current.tests.length >= QUAL_MAX_TESTS) return;
    const i = ref.current.tests.length;
    update((s) => ({ ...s, tests: [...s.tests, { sample: cur, reagent, steps: [], gasTests: [] }], table: [...s.table, emptyQualRecord()] }), `test:${reagent}@${cur}`);
    setActive(i);
  };
  const addStep = (i: number, step: QualStep) => update((s) => ({ ...s, tests: s.tests.map((t, k) => (k === i && !t.steps.includes(step) ? { ...t, steps: [...t.steps, step] } : t)) }), `step:${step}#${i + 1}`);
  const addGasTest = (i: number, g: QualGasTest) => update((s) => ({ ...s, tests: s.tests.map((t, k) => (k === i && !t.gasTests.includes(g) ? { ...t, gasTests: [...t.gasTests, g] } : t)) }), `gas:${g}#${i + 1}`);
  const discard = (i: number) => {
    update((s) => ({ ...s, tests: s.tests.filter((_, k) => k !== i), table: s.table.filter((_, k) => k !== i) }), `discard#${i + 1}`);
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

const CHIP = 'rounded-full border px-2 py-0.5 text-[12px] transition-colors disabled:opacity-60';
function IonChip({ ion, rec, onCycle, disabled }: { ion: QualIon; rec: QualRecord; onCycle: () => void; disabled: boolean }) {
  const p = rec.present.includes(ion);
  const a = rec.absent.includes(ion);
  return (
    <button type="button" disabled={disabled} onClick={onCycle} className={cn(CHIP, p ? 'border-success bg-success/15 text-foreground' : a ? 'border-danger bg-danger/10 text-foreground line-through' : 'border-border text-muted-foreground hover:bg-muted')} aria-label={`${QUAL_ION_LABEL[ion]}: ${p ? 'present' : a ? 'absent' : 'not stated'}`}>
      {QUAL_ION_LABEL[ion]}
      {p ? ' ✓' : a ? ' ✗' : ''}
    </button>
  );
}

function Notebook({ v, state, readOnly, update, active, setActive }: { v: ChemQualitativeVariant; state: ChemQualitativeState; readOnly: boolean; update: Update; active: number; setActive: (i: number) => void }) {
  const setRec = (i: number, patch: Partial<QualRecord>) => update((s) => ({ ...s, table: s.table.map((r, k) => (k === i ? { ...r, ...patch } : r)) }));
  const cycle = (i: number, ion: QualIon) => {
    const r = state.table[i] ?? emptyQualRecord();
    if (r.present.includes(ion)) setRec(i, { present: r.present.filter((x) => x !== ion), absent: [...r.absent, ion] });
    else if (r.absent.includes(ion)) setRec(i, { absent: r.absent.filter((x) => x !== ion) });
    else setRec(i, { present: [...r.present, ion] });
  };
  const toggleGas = (i: number, g: QualGas) => {
    const r = state.table[i] ?? emptyQualRecord();
    setRec(i, { gases: r.gases.includes(g) ? r.gases.filter((x) => x !== g) : [...r.gases, g] });
  };
  const summary = (r: QualRecord) =>
    [r.gases.length ? `${r.gases.map((g) => QUAL_GAS_LABEL[g]).join(', ')} given off` : '', r.present.length ? `${r.present.map((x) => QUAL_ION_LABEL[x]).join(' or ')} present` : '', r.absent.length ? `${r.absent.map((x) => QUAL_ION_LABEL[x]).join(', ')} absent` : '', r.note.trim()].filter(Boolean).join('; ') || '—';
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-1 font-display text-[15px] font-semibold tracking-tight">Test · Observation · Inference</h3>
      <p className="mb-3 text-[12px] text-muted-foreground">Tap an ion once for “present (or possibly present)”, twice for “absent”, again to clear.</p>
      {state.tests.length === 0 && <p className="py-3 text-[13px] text-muted-foreground">Rows appear as you carry out tests.</p>}
      <div className="space-y-3">
        {state.tests.map((t, i) => {
          const r = state.table[i] ?? emptyQualRecord();
          const open = i === active;
          return (
            <div key={i} className={cn('rounded-xl border p-3', open ? 'border-brand/60' : 'border-border')}>
              <button type="button" className="w-full text-left text-[12.5px]" onClick={() => setActive(i)} aria-expanded={open}>
                <span className="font-semibold">Test {i + 1}.</span> {qualTestText(v, t)}
              </button>
              <label className="mt-2 block text-[11.5px] font-medium text-muted-foreground" htmlFor={`obs-${i}`}>
                Observation
              </label>
              <Textarea id={`obs-${i}`} rows={2} value={r.observation} disabled={readOnly} onChange={(e) => setRec(i, { observation: e.target.value.slice(0, 600) })} onFocus={() => setActive(i)} placeholder="What you saw: colours, precipitate, solubility in excess, gas, smell…" />
              {open ? (
                <div className="mt-2 space-y-2">
                  <p className="text-[11.5px] font-medium text-muted-foreground">Inference</p>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Cations">
                    {QUAL_CATIONS.map((x) => (
                      <IonChip key={x} ion={x} rec={r} disabled={readOnly} onCycle={() => cycle(i, x)} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Anions">
                    {QUAL_ANIONS.map((x) => (
                      <IonChip key={x} ion={x} rec={r} disabled={readOnly} onCycle={() => cycle(i, x)} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Gases given off">
                    {QUAL_GASES.map((g) => (
                      <button key={g} type="button" disabled={readOnly} onClick={() => toggleGas(i, g)} aria-pressed={r.gases.includes(g)} className={cn(CHIP, r.gases.includes(g) ? 'border-info bg-info/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                        {QUAL_GAS_LABEL[g]}
                        {r.gases.includes(g) ? ' gas' : ''}
                      </button>
                    ))}
                  </div>
                  <Input value={r.note} disabled={readOnly} onChange={(e) => setRec(i, { note: e.target.value.slice(0, 300) })} placeholder="Other inference (e.g. water of crystallisation; stable to heat)" aria-label={`Other inference for test ${i + 1}`} />
                </div>
              ) : (
                <p className="mt-2 text-[12.5px]">
                  <span className="text-muted-foreground">Inference: </span>
                  {summary(r)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Conclusion({ v, state, readOnly, update }: { v: ChemQualitativeVariant; state: ChemQualitativeState; readOnly: boolean; update: Update }) {
  const slots = v.kind === 'SALT' ? ([['A', 'C']] as const) : ([['A', 'Soluble salt (filtrate)'], ['B', 'Insoluble salt (residue)']] as const);
  const set = (k: 'A' | 'B', key: 'cation' | 'anion', val: string) => update((s) => ({ ...s, answer: { ...s.answer, [k]: { ...s.answer[k], [key]: s.answer[k][key] === val ? null : val } } }), `answer:${k}.${key}=${val}`);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Conclusion</h3>
      <div className="space-y-4">
        {slots.map(([k, name]) => (
          <div key={k}>
            <p className="mb-1.5 text-[12.5px] font-semibold">{name}</p>
            {(['cation', 'anion'] as const).map((key) => (
              <div key={key} className="mb-1.5 flex flex-wrap items-center gap-1" role="radiogroup" aria-label={`${name}: ${key}`}>
                <span className="w-14 text-[12px] capitalize text-muted-foreground">{key}</span>
                {(key === 'cation' ? QUAL_CATIONS : QUAL_ANIONS).map((x) => {
                  const on = state.answer[k][key] === x;
                  return (
                    <button key={x} type="button" role="radio" aria-checked={on} disabled={readOnly} onClick={() => set(k, key, x)} className={cn(CHIP, on ? 'border-brand bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:bg-muted')}>
                      {QUAL_ION_LABEL[x]}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="qual-eq">
            Ionic equations (a confirmatory test for the cation and for the anion{v.kind === 'MIXTURE' ? ' of the soluble salt' : ''})
          </label>
          <Textarea id="qual-eq" rows={3} value={state.answer.equation} disabled={readOnly} onChange={(e) => update((s) => ({ ...s, answer: { ...s.answer, equation: e.target.value.slice(0, 1000) } }))} placeholder="e.g. Zn²⁺(aq) + 2OH⁻(aq) → Zn(OH)₂(s)" />
        </div>
      </div>
    </Card>
  );
}
