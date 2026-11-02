import { ACID_TUBES, ACID_TUBE_LABEL, ACID_VOLS, HARD_BOILABLE, HARD_LABEL, HARD_SAMPLES, IND_SOLS, IND_SOL_LABEL, PH_INFO, PH_LETTER, PH_SAMPLES, uiColour, hardOpenRun, indOpenRun, type ChemAcidsState, type IndSol, type PhSample } from '@aischool/shared';
import { Beaker, ChevronDown, FlaskConical, Lightbulb } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { notify } from '../../lab3d-kit/store';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { CU, CUCL2, CUO, HCL_LIQ, LIME_CLEAR, LIME_MILKY, MARBLE, MG, SOAP_LIQ, TASK_TITLE, ZN, fmtClock, nextHint, useAcids, type Acids } from './actions';
import { Notebook, TaskBrief } from './notebook';
import { BalanceDisplay, MeniscusLoupe, SpeedPicker, TubeSwatch, UiChart } from './parts';

/**
 * The 2D acids, bases and water lab: the same state, actions and marks as the
 * 3D lab. A schematic bench for the lesson's task, the steps as buttons (every
 * mistake the grader marks can be made here too), the live readings, and the
 * notebook.
 */
export default function ChemAcidsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'chem-acids'>) {
  const x = useAcids({ seed, state, onChange, readOnly, startedAt, practicalId });
  const [brief, setBrief] = useState(true);
  const task = x.task;
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden /> The task · {TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && <TaskBrief v={x.v} className="mt-3" />}
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start [&>*]:min-w-0">
        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
              <Beaker className="size-4 text-muted-foreground" aria-hidden /> Bench
            </h3>
            <span className="flex items-center gap-2">
              {x.active && <SpeedPicker x={x} />}
              <Badge variant="outline">{TASK_TITLE[task]}</Badge>
            </span>
          </div>
          {!readOnly && mode === 'LAB' && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {nextHint(state, x)}
            </p>
          )}
          {task === 'PH' && <PhBench x={x} s={state} readOnly={readOnly} />}
          {task === 'IND' && <IndBench x={x} s={state} readOnly={readOnly} />}
          {task === 'ACID' && <AcidBench x={x} s={state} readOnly={readOnly} />}
          {task === 'HARD' && <HardBench x={x} s={state} readOnly={readOnly} />}
        </Card>
        <Notebook v={x.v} state={state} readOnly={readOnly} update={x.update} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ small pieces

function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
/** A button that runs an op; a blocked op shows why. */
function Op({ run, why, children, brand, pressed }: { run: () => string | undefined; why?: string; children: ReactNode; brand?: boolean; pressed?: boolean }) {
  return (
    <Button
      size="sm"
      variant={pressed ? 'brand' : brand && !why ? 'brand' : 'outline'}
      className={cn(why && 'opacity-55')}
      aria-disabled={!!why}
      aria-pressed={pressed}
      title={why}
      onClick={() => {
        const m = why ?? run();
        if (m) notify(m, 'warning', 3200);
      }}
    >
      {children}
    </Button>
  );
}
function Readout({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-muted px-3 py-1.5 text-[12.5px] tabular">{children}</p>;
}
function Pick<K extends string>({ keys, value, onPick, label }: { keys: readonly K[]; value: K; onPick: (k: K) => void; label: (k: K) => string }) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {keys.map((k) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onPick(k)} className={cn('rounded-md px-2 py-1 text-[12px] font-semibold', value === k ? 'bg-brand text-brand-foreground' : 'bg-muted hover:bg-muted/70')}>
          {label(k)}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ PH

function PhBench({ x, s, readOnly }: { x: Acids; s: ChemAcidsState; readOnly: boolean }) {
  const w = s.ph;
  const o = x.ops;
  const why = x.why;
  const [k, setK] = useState<PhSample>('HCL');
  const t = w.tubes[k];
  return (
    <div className="space-y-3">
      <div className={cn('flex flex-wrap justify-center gap-1.5 rounded-xl p-2', w.tile ? 'bg-white ring-1 ring-border' : 'bg-muted')}>
        {PH_SAMPLES.map((q) => (
          <TubeSwatch key={q} label={PH_LETTER[q]} colour={x.look.phColour(q)} sub={w.tubes[q].drops ? `${w.tubes[q].drops} d` : undefined} />
        ))}
      </div>
      <UiChart />
      <Readout>{w.rinsed ? 'Tubes rinsed with distilled water.' : 'Tubes not rinsed yet.'} {w.tile ? 'White tile behind the rack.' : ''}</Readout>
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. Prepare">
            <Op run={o.rinseTubes} why={why.rinse}>
              Rinse the tubes with distilled water
            </Op>
            <Op run={o.tile} why={why.tile}>
              White tile behind the rack
            </Op>
          </Step>
          <Step title={`2. Sample ${PH_LETTER[k]}: ${PH_INFO[k].label}`}>
            <Pick keys={PH_SAMPLES} value={k} onPick={setK} label={(q) => PH_LETTER[q]} />
            <div className="flex w-full flex-wrap gap-1.5">
              <Op run={() => o.pour(k, 'TWO')} why={why.pour(k)} brand={!t.vol}>
                Pour about 2 cm³
              </Op>
              <Op run={() => o.pour(k, 'FULL')} why={why.pour(k)}>
                Fill the tube
              </Op>
              <Op run={() => o.drops(k, 2)} why={why.drops(k)} brand={!!t.vol && !t.drops}>
                2 drops of indicator
              </Op>
              <Op run={() => o.drops(k, 1)} why={why.drops(k)}>
                1 more drop
              </Op>
              <Op run={() => o.shake(k)} why={why.shake(k)} brand={!!t.drops && !t.shaken}>
                Shake
              </Op>
              <Op run={() => o.compare(k)} why={why.compare(k)} brand={t.shaken && !t.compared}>
                Compare with the chart
              </Op>
            </div>
          </Step>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ IND

function IndBench({ x, s, readOnly }: { x: Acids; s: ChemAcidsState; readOnly: boolean }) {
  const w = s.ind;
  const o = x.ops;
  const why = x.why;
  const run = indOpenRun(w);
  const last = [...w.runs].reverse().find((r) => r.done && r.ind === run?.ind);
  const fast = run && last ? Math.max(0, Math.round((last.added - 1 - run.added) * 10) / 10) : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        {IND_SOLS.map((k) => (
          <div key={k} className="flex flex-col items-center">
            <div className="flex gap-0.5">
              <TubeSwatch label="ext" colour={w.tests[k].ext ? x.look.extract(k) : null} />
              <TubeSwatch label="UI" colour={w.tests[k].ui ? uiColour(x.v.ind.pH[k]) : null} />
            </div>
            <span className="text-[10.5px] text-muted-foreground">{IND_SOL_LABEL[k]}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <MeniscusLoupe level={w.burette} id="ind" />
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 80 80" className="h-[90px] w-[90px]" role="img" aria-label="Conical flask on a white tile">
            <rect x="4" y="72" width="72" height="6" fill="#ffffff" stroke="#c8d0d6" />
            {x.look.flask && <path d="M18 52 L62 52 L70 70 L10 70 Z" fill={x.look.flask} />}
            <path d="M32 6 L48 6 L48 28 L72 70 L8 70 L32 28 Z" fill="none" stroke="#8b98a3" strokeWidth="1.5" />
          </svg>
          <span className="text-[11px] text-muted-foreground">{run ? `${run.ind === 'MO' ? 'methyl orange' : 'zobo'} · ${run.added.toFixed(2)} cm³ run in` : w.flask ? 'NaOH, no indicator' : 'no flask'}</span>
        </div>
        <UiChart className="min-w-[200px] flex-1" />
      </div>
      <Readout>
        {w.solvent ? `Extract: ${w.solvent === 'ETHANOL' ? 'ethanol' : 'water'}${w.heat === 'BATH' ? ', warmed in a water bath' : w.heat === 'FLAME' ? ', heated over a flame' : ', cold'}${w.filtered ? ', filtered' : ', not filtered'}.` : 'Zobo calyces in the mortar.'} Titrations done: {w.runs.filter((r) => r.done).map((r) => `${r.ind === 'MO' ? 'MO' : 'Z'} ${r.added.toFixed(2)}`).join(', ') || 'none'}.
      </Readout>
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. Make the indicator">
            <Op run={() => o.crush('WATER', 'BATH')} why={why.crush} pressed={w.solvent === 'WATER' && w.heat === 'BATH'}>
              Crush with warm water (water bath)
            </Op>
            <Op run={() => o.crush('ETHANOL', 'BATH')} why={why.crush} pressed={w.solvent === 'ETHANOL' && w.heat === 'BATH'}>
              Crush with ethanol, warm in a water bath
            </Op>
            <Op run={() => o.crush('ETHANOL', 'FLAME')} why={why.crush} pressed={w.heat === 'FLAME'}>
              Ethanol, warm over the flame
            </Op>
            <Op run={() => o.crush('WATER', 'NONE')} why={why.crush} pressed={w.heat === 'NONE'}>
              Soak in cold water
            </Op>
            <Op run={o.filterExtract} why={why.filterExt} brand>
              Filter
            </Op>
          </Step>
          <Step title="2. Test in the five solutions">
            {IND_SOLS.map((k: IndSol) => (
              <span key={k} className="inline-flex gap-1">
                <Op run={() => o.testExtract(k)} why={why.ext(k)} pressed={w.tests[k].ext}>
                  {IND_SOL_LABEL[k]}: extract
                </Op>
                <Op run={() => o.testUi(k)} why={why.ui(k)} pressed={w.tests[k].ui}>
                  UI
                </Op>
              </span>
            ))}
          </Step>
          <Step title="3. Titrate 25.0 cm³ NaOH with HCl">
            <Op run={o.rinseBurette} why={why.rinseBur}>
              Rinse burette with HCl
            </Op>
            <Op run={o.fillBurette} why={why.fillBur} brand={w.burette === null}>
              Fill the burette
            </Op>
            <Op run={o.rinsePipette} why={why.rinsePip}>
              Rinse pipette with NaOH
            </Op>
            <Op run={o.pipette} why={why.pipette} brand={!run && !w.flask}>
              Pipette 25.0 cm³ NaOH
            </Op>
            <Op run={() => o.indicator('MO', 3)} why={why.indicator}>
              3 drops methyl orange
            </Op>
            <Op run={() => o.indicator('ZOBO', 3)} why={why.indicator}>
              3 drops zobo extract
            </Op>
            <Op run={() => o.indicator('ZOBO', 40)} why={why.indicator}>
              A dropperful of extract
            </Op>
          </Step>
          <Step title="4. Run in the acid (swirl)">
            {fast > 0 && (
              <Op run={() => o.addAcid(fast)} why={why.add}>
                Run in fast to 1 cm³ before the last titre
              </Op>
            )}
            <Op run={() => o.addAcid(5)} why={why.add}>
              +5.00
            </Op>
            <Op run={() => o.addAcid(1)} why={why.add}>
              +1.00
            </Op>
            <Op run={() => o.addAcid(0.5)} why={why.add}>
              +0.50
            </Op>
            <Op run={() => o.addAcid(0.1)} why={why.add}>
              +0.10
            </Op>
            <Op run={() => o.addAcid(0.05)} why={why.add} brand>
              One drop
            </Op>
            <Op run={o.endPoint} why={why.endPoint}>
              End point: read the burette
            </Op>
          </Step>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ ACID

const SOLID: Record<string, string> = { MG, ZN, CU, CUO, CACO3: MARBLE };
function AcidBench({ x, s, readOnly }: { x: Acids; s: ChemAcidsState; readOnly: boolean }) {
  const w = s.acid;
  const o = x.ops;
  const why = x.why;
  const pan = x.look.balance;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {ACID_TUBES.map((k) => {
          const t = w.tubes[k];
          const liquid = !t.acid ? null : k === 'CUO' && t.warmed ? CUCL2 : HCL_LIQ;
          return (
            <div key={k} className="flex flex-col items-center">
              <svg viewBox="0 0 24 70" className="h-[66px] w-[24px]" role="img" aria-label={`${ACID_TUBE_LABEL[k]}${t.acid ? ' with acid' : ''}`}>
                {liquid && <path d="M5 34 L19 34 L19 58 Q12 68 5 58 Z" fill={liquid} />}
                {!(k === 'CUO' && t.warmed) && <rect x="7" y="56" width="10" height="5" fill={SOLID[k]} />}
                {t.acid && ['MG', 'ZN', 'CACO3'].includes(k) && [0, 1, 2].map((b) => <circle key={b} cx={8 + b * 4} cy={44 + (b % 2) * 6} r="1.4" fill="#fff" stroke="#9fb0bb" strokeWidth="0.4" />)}
                <path d="M4 2 L4 58 Q12 70 20 58 L20 2" fill="none" stroke="#8b98a3" strokeWidth="1.4" />
              </svg>
              <span className="text-[10.5px] text-muted-foreground">{k === 'CACO3' ? 'marble' : k === 'CUO' ? 'CuO' : k[0] + k.slice(1).toLowerCase()}</span>
            </div>
          );
        })}
        {x.look.test && (
          <div className="ml-2 flex items-center gap-2">
            {x.look.test.test === 'LIME' && <TubeSwatch label="limewater" colour={x.look.test.tube === 'CACO3' ? LIME_MILKY : LIME_CLEAR} />}
            <Readout>{x.look.test.text}</Readout>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <BalanceDisplay value={pan.value} label={pan.what === 'total' ? 'Flask + contents' : pan.what === 'flask' ? 'Flask + acid + plug' : pan.what === 'chips' ? 'Marble chips' : w.zeroed ? 'Balance (zeroed)' : 'Balance (not zeroed)'} />
        {w.added && <Readout>{fmtClock(x.look.acidSec)} · {x.look.extent < 0.99 ? 'fizzing' : 'fizzing has stopped'}</Readout>}
      </div>
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. Metals, oxide and carbonate with dilute HCl">
            {ACID_TUBES.map((k) => (
              <Op key={k} run={() => o.tubeAcid(k)} why={why.tubeAcid(k)} pressed={w.tubes[k].acid}>
                Acid on {k === 'CACO3' ? 'marble' : k === 'CUO' ? 'CuO' : k}
              </Op>
            ))}
            <Op run={() => o.warm('GENTLE')} why={why.warm} pressed={w.tubes.CUO.warmed === 'GENTLE'}>
              Warm CuO gently
            </Op>
            <Op run={() => o.warm('STRONG')} why={why.warm} pressed={w.tubes.CUO.warmed === 'STRONG'}>
              Boil CuO hard
            </Op>
          </Step>
          <Step title="2. Test the gases">
            {(['MG', 'ZN', 'CU', 'CACO3'] as const).map((k) => (
              <span key={k} className="inline-flex gap-1">
                <Op run={() => o.gasTest(k, 'BURNING')} why={why.test(k)}>
                  {k === 'CACO3' ? 'Marble' : k}: burning splint
                </Op>
                <Op run={() => o.gasTest(k, 'LIME')} why={why.test(k)}>
                  limewater
                </Op>
              </span>
            ))}
          </Step>
          <Step title="3. Mass of CO₂ from about 2 g of marble">
            <Op run={o.zero} why={why.zero}>
              Zero the balance
            </Op>
            <Op run={o.tapChips} why={why.tapChips} brand>
              Tap a marble chip on
            </Op>
            <Op run={o.untapChips} why={why.untapChips}>
              Take one off
            </Op>
            {ACID_VOLS.map((vol) => (
              <Op key={vol} run={() => o.measureAcid(vol)} why={why.acidVol} pressed={w.acidVol === vol}>
                {vol} cm³ HCl into the flask
              </Op>
            ))}
            <Op run={o.plug} why={why.plug} pressed={w.plug}>
              Cotton-wool plug
            </Op>
            <Op run={o.weighFlask} why={why.weighFlask}>
              Weigh flask + acid
            </Op>
            <Op run={o.addChips} why={why.addChips} brand>
              Tip in the marble
            </Op>
            <Op run={o.weighTotal} why={why.weighTotal}>
              Read the balance
            </Op>
          </Step>
          {w.weighings.length > 0 && <Readout>Weighed at {w.weighings.map((t) => fmtClock(t)).join(', ')}.</Readout>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ HARD

function HardBench({ x, s, readOnly }: { x: Acids; s: ChemAcidsState; readOnly: boolean }) {
  const w = s.hard;
  const o = x.ops;
  const why = x.why;
  const run = hardOpenRun(w);
  const froth = x.look.lather === 'LASTING' ? 14 : x.look.lather === 'FROTH' ? 6 : 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <MeniscusLoupe level={w.burette} liquid={SOAP_LIQ} id="hard" caption="Soap solution: read to 0.1 cm³" />
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 80 80" className="h-[100px] w-[100px]" role="img" aria-label={`Stoppered conical flask${run ? ` with ${HARD_LABEL[run.sample]}` : ''}${froth ? ', lather on top' : ''}`}>
            {run && <path d="M16 50 L64 50 L72 70 L8 70 Z" fill={x.look.scum ? '#e7e9e6' : '#e3eef4'} />}
            {froth > 0 && <rect x={18} y={50 - froth} width={44} height={froth} rx={3} fill="#ffffff" stroke="#d5dde2" />}
            <path d="M32 6 L48 6 L48 28 L72 70 L8 70 L32 28 Z" fill="none" stroke="#8b98a3" strokeWidth="1.5" />
            <rect x="31" y="2" width="18" height="8" rx="2" fill="#7a5032" />
          </svg>
          <span className="text-[11px] text-muted-foreground">{run ? `${HARD_LABEL[run.sample]}${run.boiled ? ' (boiled)' : ''} · ${run.added.toFixed(1)} cm³ soap` : 'flask empty'}</span>
        </div>
      </div>
      <Readout>
        {run ? (x.look.lather === 'LASTING' ? 'A thick lather forms.' : x.look.lather === 'FROTH' ? 'A froth forms but soon breaks.' : x.look.scum ? 'White scum, no lather.' : 'No lather yet.') : 'No sample in the flask.'}
        {x.look.watched && run ? (x.look.watched === 'LASTING' ? ' The lather lasted 2 minutes.' : ' After a minute the lather had gone.') : ''}
        {' '}Done: {w.runs.filter((r) => r.done).map((r) => `${r.sample}${r.boiled ? '(b)' : ''} ${r.added.toFixed(1)}`).join(', ') || 'none'}.
      </Readout>
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. The soap burette">
            <Op run={o.hRinse} why={why.hRinse}>
              Rinse with soap solution
            </Op>
            <Op run={o.hFill} why={why.hFill} brand={w.burette === null}>
              Fill the burette
            </Op>
          </Step>
          <Step title="2. Boil the hard samples">
            {HARD_BOILABLE.map((k) => (
              <span key={k} className="inline-flex gap-1">
                <Op run={() => o.boil(k, 'FULL')} why={why.boil(k)} pressed={w.boiled[k] === 'FULL'}>
                  {k === 'TAP' ? 'Tap' : k === 'RAIN' ? 'Rain' : k}: 5 min, make up, filter
                </Op>
                <Op run={() => o.boil(k, 'SHORT')} why={why.boil(k)} pressed={w.boiled[k] === 'SHORT'}>
                  1 min
                </Op>
                <Op run={() => o.boil(k, 'NOMAKEUP')} why={why.boil(k)} pressed={w.boiled[k] === 'NOMAKEUP'}>
                  no make-up
                </Op>
              </span>
            ))}
          </Step>
          <Step title="3. 50.0 cm³ of a sample into the flask">
            {HARD_SAMPLES.map((k) => (
              <Op key={k} run={() => o.measure(k, false)} why={why.measure(k, false)}>
                {HARD_LABEL[k]}
              </Op>
            ))}
            {HARD_BOILABLE.map((k) => (
              <Op key={`b${k}`} run={() => o.measure(k, true)} why={why.measure(k, true)}>
                Boiled {k === 'TAP' ? 'tap' : k === 'RAIN' ? 'rain' : k}
              </Op>
            ))}
            <Op run={() => o.measure('TAP', false, 'ROUGH')} why={why.measure('TAP', false)}>
              Pour tap water in roughly
            </Op>
          </Step>
          <Step title="4. Soap, 0.5 cm³ at a time">
            <Op run={() => o.addSoap(0.5, 'SHAKE')} why={why.soap} brand>
              +0.5 cm³, stopper and shake
            </Op>
            <Op run={() => o.addSoap(0.5, 'SWIRL')} why={why.soap}>
              +0.5 cm³, swirl
            </Op>
            <Op run={() => o.addSoap(2, 'SHAKE')} why={why.soap}>
              +2.0 cm³ at once
            </Op>
            <Op run={o.watch} why={why.watch}>
              Watch for 2 minutes
            </Op>
            <Op run={o.finish} why={why.finish}>
              Read the burette
            </Op>
          </Step>
        </div>
      )}
    </div>
  );
}
