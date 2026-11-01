import { CHROM_DEPTHS, CHROM_LINE_AT, PPT_AN_VOLS, PPT_CAT_VOLS, PPT_INFO, SOL_ACID_VOLS, mpDissolved, mpProduct, solRodResult, solFiltrate, type ChemSaltsState } from '@aischool/shared';
import { Beaker, ChevronDown, FlaskConical, Lightbulb } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { notify } from '../../lab3d-kit/store';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { ANHYDROUS, CRYSTAL_BLUE, CUO_BLACK, TASK_TITLE, nextHint, pptBalance, solView, useSalts, type Flame, type Gauze, type Salts } from './actions';
import { Notebook, TaskBrief } from './notebook';
import { BalanceDisplay, PaperSvg, SpeedPicker, ThermoLoupe, fmtClock } from './parts';

/**
 * The 2D salts lab: the same state, actions and marks as the 3D lab. A
 * schematic bench for the lesson's task, the steps as buttons (every mistake
 * the grader marks can be made here too), the live readouts with time-lapse,
 * and the notebook.
 */
export default function ChemSaltsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'chem-salts'>) {
  const x = useSalts({ seed, state, onChange, readOnly, startedAt, practicalId });
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
          {task === 'SOL' && <SolBench x={x} s={state} readOnly={readOnly} />}
          {task === 'PPT' && <PptBench x={x} s={state} readOnly={readOnly} />}
          {task === 'CHROM' && <ChromBench x={x} s={state} readOnly={readOnly} />}
          {task === 'MP' && <MpBench x={x} s={state} readOnly={readOnly} />}
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
function Op({ x, run, why, children, brand, pressed }: { x?: Salts; run: () => string | undefined; why?: string; children: ReactNode; brand?: boolean; pressed?: boolean }) {
  void x;
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
        if (m) notify(m, 'warning', 2600);
      }}
    >
      {children}
    </Button>
  );
}
/** What stands on the gauze, and the burner. */
function HeatControls({ x, items }: { x: Salts; items: { id: Exclude<Gauze, null>; label: string }[] }) {
  const b = x.bench;
  return (
    <Step title="Tripod, gauze and Bunsen burner">
      <span className="text-[12.5px] text-muted-foreground">On the gauze:</span>
      {items.map((i) => (
        <Op key={i.id} run={() => (x.note(`gauze:${i.id}`), undefined)} pressed={b.gauze === i.id}>
          {i.label}
        </Op>
      ))}
      <Op run={() => (x.note('gauze:none'), undefined)} pressed={b.gauze === null}>
        Nothing
      </Op>
      <span className="ml-2 text-[12.5px] text-muted-foreground">Burner:</span>
      {(['OFF', 'LOW', 'HIGH'] as Flame[]).map((f) => (
        <Op key={f} run={() => (x.note(`burner:${f}`), undefined)} pressed={b.flame === f}>
          {f === 'OFF' ? 'Off' : f === 'LOW' ? 'Low flame' : 'High flame'}
        </Op>
      ))}
    </Step>
  );
}
function Readout({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-muted px-3 py-1.5 text-[12.5px] tabular">{children}</p>;
}

/** A schematic beaker / dish / funnel on a tripod over a burner. */
function HeatSvg({ flame, onGauze, children }: { flame: Flame; onGauze: ReactNode; children?: ReactNode }) {
  return (
    <svg viewBox="0 0 320 200" className="h-[190px] w-full" role="img" aria-label={`Burner ${flame === 'OFF' ? 'off' : 'lit'}`}>
      <rect x="0" y="192" width="320" height="8" className="fill-muted-foreground/25" />
      <g transform="translate(70 0)">
        <line x1="10" y1="190" x2="22" y2="120" className="stroke-muted-foreground" strokeWidth="3" />
        <line x1="110" y1="190" x2="98" y2="120" className="stroke-muted-foreground" strokeWidth="3" />
        <rect x="14" y="116" width="92" height="5" className="fill-muted-foreground/70" />
        <rect x="52" y="150" width="16" height="42" className="fill-muted-foreground/50" />
        {flame !== 'OFF' && <path d={flame === 'HIGH' ? 'M60 120 Q48 140 56 150 L64 150 Q72 140 60 120Z' : 'M60 134 Q53 144 57 150 L63 150 Q67 144 60 134Z'} fill="#5b8cff" opacity="0.8" />}
        <g transform="translate(60 116)">{onGauze}</g>
      </g>
      {children}
    </svg>
  );
}
function BeakerShape({ fill, level, powder, label }: { fill: string | null; level: number; powder?: number; label?: string }) {
  return (
    <g>
      {fill && <rect x={-26} y={-6 - level * 50} width={52} height={level * 50 + 4} fill={fill} opacity={0.85} />}
      {powder ? <ellipse cx={0} cy={-5} rx={Math.min(22, 6 + powder * 4)} ry={3} fill={CUO_BLACK} /> : null}
      <path d="M-28 -64 L-28 -2 L28 -2 L28 -64" fill="none" className="stroke-muted-foreground" strokeWidth="2" />
      {label && (
        <text x={0} y={-70} textAnchor="middle" fontSize="10" className="fill-muted-foreground">
          {label}
        </text>
      )}
    </g>
  );
}

// ------------------------------------------------------------------ SOL

function SolBench({ x, s, readOnly }: { x: Salts; s: ChemSaltsState; readOnly: boolean }) {
  const w = s.sol;
  const view = solView(x, s);
  const o = x.ops;
  const why = x.why;
  const b = x.bench;
  const lastRod = w.rod.length ? solRodResult(solFiltrate(x.v, w).n, w.rod.at(-1)!) : null;
  const dish = (
    <g>
      <path d="M-34 -4 Q0 22 34 -4" fill="none" className="stroke-muted-foreground" strokeWidth="2" />
      {view.dishColour && <path d={`M${-30 * view.dishFill - 4} -2 Q0 ${10 + 8 * view.dishFill} ${30 * view.dishFill + 4} -2Z`} fill={view.dishColour} />}
      {view.crystals > 0.001 && Array.from({ length: Math.min(14, Math.ceil(view.crystalFrac * 14)) }, (_, k) => <rect key={k} x={-18 + (k % 7) * 5.5} y={2 + Math.floor(k / 7) * 3} width={4} height={3} fill={CRYSTAL_BLUE} transform={`rotate(${k * 23} ${-16 + (k % 7) * 5.5} 3)`} />)}
      {view.dry && <ellipse cx={0} cy={3} rx={20} ry={4} fill={ANHYDROUS} stroke="#ccc" />}
    </g>
  );
  const beaker = <BeakerShape fill={view.beakerColour} level={w.acid ? Math.min(1, w.acid / 100) : 0} powder={view.undissolved} label="beaker" />;
  return (
    <div className="space-y-3">
      <HeatSvg flame={b.flame} onGauze={b.gauze === 'beaker' ? beaker : b.gauze === 'dish' ? dish : null}>
        {b.gauze !== 'beaker' && w.acid !== null && !w.filtered && <g transform="translate(270 190)">{beaker}</g>}
        {b.gauze !== 'dish' && w.filtered && <g transform="translate(270 180)">{dish}</g>}
        <g transform="translate(10 20)">
          <text fontSize="11" className="fill-foreground">
            {w.acid !== null && !w.filtered ? `Acid ${Math.round(x.look.acidT)} °C` : w.filtered && !w.dry && w.filteredAt === null ? `Dish ${Math.round(x.look.dishT)} °C · ${x.look.dishW.toFixed(1)} g water` : ''}
          </text>
        </g>
      </HeatSvg>
      <Readout>
        {w.acid === null
          ? 'Beaker empty.'
          : !w.filtered
            ? `${w.acid} cm³ acid, ${w.portions} spatula${w.portions === 1 ? '' : 's'} of CuO (${w.cuo.toFixed(2)} g) — ${view.excess ? 'black solid remains undissolved: the base is in excess.' : w.portions ? 'all dissolved: blue solution.' : 'colourless.'}`
            : w.dry
              ? 'The dish is dry: a white powder (anhydrous CuSO₄).'
              : w.filteredAt === null
                ? `Blue filtrate in the dish.${lastRod ? ` Last rod test: ${lastRod === 'NONE' ? 'no crystals on the rod' : lastRod === 'CRYSTALS' ? 'small crystals form on the cold rod' : 'crystals already crusting in the hot dish'}.` : ''}${view.crystals > 0.001 ? ' Blue crystals are growing.' : ''}`
                : `Crystals filtered off at ${Math.round(w.filteredAt)} °C.${w.wash ? ` Washed (${w.wash.toLowerCase()}).` : ''}${w.drying ? ` Dried (${w.drying.toLowerCase()}).` : ''}`}
      </Readout>
      {w.weighed && <BalanceDisplay value={view.product.mass} label="Crystals on the balance" />}
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. Measure the dilute H₂SO₄ (measuring cylinder)">
            {SOL_ACID_VOLS.map((v) => (
              <Op key={v} run={() => o.measureAcid(v)} why={why.acid} pressed={w.acid === v}>
                {v} cm³
              </Op>
            ))}
          </Step>
          <HeatControls x={x} items={[{ id: 'beaker', label: 'Beaker' }, { id: 'dish', label: 'Evaporating dish' }]} />
          <Step title="2. Copper(II) oxide">
            <Op run={o.addCuO} why={why.cuo} brand>
              Add a spatula of CuO
            </Op>
            <Op run={o.stir} why={why.stir}>
              Stir
            </Op>
            <Op run={o.filterExcess} why={why.filterExcess}>
              Filter off the excess into the dish
            </Op>
          </Step>
          <Step title="3. Evaporate, test, crystallise">
            <Op run={o.rodTest} why={why.rod}>
              Glass-rod test
            </Op>
            <Op run={o.filterCrystals} why={why.filterCrystals} brand>
              Filter off the crystals
            </Op>
          </Step>
          <Step title="4. Wash, dry, weigh">
            <Op run={() => o.washCrystals('COLD')} why={why.wash} pressed={w.wash === 'COLD'}>
              Wash: a little cold water
            </Op>
            <Op run={() => o.washCrystals('HOT')} why={why.wash} pressed={w.wash === 'HOT'}>
              Wash: hot water
            </Op>
            <Op run={() => o.dryCrystals('PAPER')} why={why.dry} pressed={w.drying === 'PAPER'}>
              Dry between filter papers
            </Op>
            <Op run={() => o.dryCrystals('HEAT')} why={why.dry} pressed={w.drying === 'HEAT'}>
              Dry by heating
            </Op>
            <Op run={o.weighCrystals} why={why.weigh} brand>
              Weigh
            </Op>
          </Step>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ PPT

function PptBench({ x, s, readOnly }: { x: Salts; s: ChemSaltsState; readOnly: boolean }) {
  const w = s.ppt;
  const i = PPT_INFO[x.v.ppt.pair];
  const o = x.ops;
  const why = x.why;
  const vol = (w.cat ?? 0) + (w.an ?? 0);
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 320 160" className="h-[160px] w-full" role="img" aria-label="Beaker, filter funnel and oven">
        <g transform="translate(70 150)">
          <BeakerShape fill={w.filtered ? null : w.mixed ? i.product.colour : w.cat ? '#e9f0f4' : null} level={w.filtered ? 0 : Math.min(1, vol / 70)} label={w.mixed && !w.filtered ? `${i.product.colourName} precipitate` : 'beaker'} />
        </g>
        <g transform="translate(180 40)">
          <path d="M-30 0 L30 0 L4 40 L4 70 L-4 70 L-4 40 Z" fill="none" className="stroke-muted-foreground" strokeWidth="2" />
          {w.filtered && <path d="M-18 10 L18 10 L4 32 L-4 32Z" fill={i.product.colour} stroke="#bbb" />}
          <text x="0" y="-6" textAnchor="middle" fontSize="10" className="fill-muted-foreground">
            filter funnel {w.washes ? `· washed ×${w.washes}` : ''}
          </text>
        </g>
        <g transform="translate(250 60)">
          <rect x="0" y="0" width="60" height="60" rx="4" className="fill-muted stroke-muted-foreground" />
          <rect x="8" y="8" width="44" height="34" fill={w.dried ? '#f7c56b' : '#ddd'} opacity="0.6" />
          <text x="30" y="56" textAnchor="middle" fontSize="9" className="fill-muted-foreground">
            oven {w.dried ? `×${w.dried}` : ''}
          </text>
        </g>
      </svg>
      <div className="flex flex-wrap gap-3">
        {w.paper && <BalanceDisplay value={x.v.ppt.paper} label="Dry filter paper" />}
        {w.weighings.length > 0 && <BalanceDisplay value={pptBalance(x, s)} label={`Paper + precipitate (after ${w.weighings.at(-1)} drying${w.weighings.at(-1) === 1 ? '' : 's'})`} />}
      </div>
      {!readOnly && (
        <div className="space-y-2">
          <Step title={`1. ${i.cation.formula} (${x.v.ppt.catConc.toFixed(2)} mol dm⁻³)`}>
            {PPT_CAT_VOLS.map((v) => (
              <Op key={v} run={() => o.measureCat(v)} why={why.pptCat} pressed={w.cat === v}>
                {v} cm³
              </Op>
            ))}
          </Step>
          <Step title={`2. Add ${i.anion.formula} (${x.v.ppt.anConc.toFixed(2)} mol dm⁻³) and stir`}>
            {PPT_AN_VOLS.map((v) => (
              <Op key={v} run={() => o.addAn(v)} why={why.pptAn} pressed={w.an === v}>
                {v} cm³
              </Op>
            ))}
            <Op run={o.stirPpt} why={why.pptStir}>
              Stir
            </Op>
          </Step>
          <Step title="3. Filter and wash">
            <Op run={o.weighPaper} why={why.pptPaper}>
              Weigh a dry filter paper
            </Op>
            <Op run={o.filterPpt} why={why.pptFilter} brand>
              Filter
            </Op>
            <Op run={o.rinseBeaker} why={why.pptRinse}>
              Rinse the beaker into the funnel
            </Op>
            <Op run={o.washPpt} why={why.pptWash}>
              Wash with distilled water
            </Op>
          </Step>
          <Step title="4. Dry and weigh">
            <Op run={() => o.dryPpt(false)} why={why.pptDry} brand>
              Dry in the warm oven
            </Op>
            <Op run={() => o.dryPpt(true)} why={why.pptDry}>
              Dry over the flame
            </Op>
            <Op run={o.weighPpt} why={why.pptWeigh}>
              Weigh paper + precipitate
            </Op>
          </Step>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ CHROM

function ChromBench({ x, s, readOnly }: { x: Salts; s: ChemSaltsState; readOnly: boolean }) {
  const w = s.chrom;
  const o = x.ops;
  const why = x.why;
  const [tool, setTool] = useState<'PENCIL' | 'INK'>('PENCIL');
  const [at, setAt] = useState<number>(1.5);
  const [solvent, setSolvent] = useState<'WATER' | 'ETHANOL'>(x.v.chrom.solvent);
  const [depth, setDepth] = useState<number>(1);
  return (
    <div className="space-y-3">
      <div className="flex justify-center overflow-x-auto">
        <PaperSvg v={x.v} w={w} t={x.look.devSeconds} px={28} className="h-[460px] w-auto shrink-0" />
      </div>
      <Readout>
        {w.inTank ? `In the tank ${w.covered ? '(covered)' : '(NOT covered)'} · ${fmtClock(x.look.devSeconds)} · front ${(x.look.front - (w.lineAt ?? 0)).toFixed(1)} cm above the baseline` : w.developed !== null ? `Run for ${fmtClock(w.developed)}. ${w.frontMarked ? 'Front marked in pencil.' : w.dried ? 'The front has dried and faded.' : 'Mark the front now!'}` : w.solvent ? `${w.solvent === 'WATER' ? 'Water' : 'Ethanol'} in the tank, ${w.depth} cm deep. Lid ${w.covered ? 'on' : 'off'}.` : 'The tank is empty.'}
      </Readout>
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. Baseline">
            {(['PENCIL', 'INK'] as const).map((t) => (
              <Op key={t} run={() => (setTool(t), undefined)} pressed={tool === t}>
                {t === 'PENCIL' ? 'Pencil' : 'Ink pen'}
              </Op>
            ))}
            {CHROM_LINE_AT.map((h) => (
              <Op key={h} run={() => (setAt(h), undefined)} pressed={at === h}>
                {h} cm up
              </Op>
            ))}
            <Op run={() => o.drawLine(tool, at)} why={why.line} brand>
              Draw the baseline
            </Op>
          </Step>
          <Step title="2. Spot the samples (capillary tubes)">
            {(['INK', 'A', 'B'] as const).map((l) => (
              <Op key={l} run={() => o.spot(l)} why={why.spot}>
                Spot {l === 'INK' ? 'the ink' : `dye ${l}`} ({w.spots.find((p) => p.lane === l)?.n ?? 0})
              </Op>
            ))}
            <Op run={o.drySpots} why={why.spot}>
              Let the spots dry
            </Op>
          </Step>
          <Step title="3. Solvent and tank">
            {(['WATER', 'ETHANOL'] as const).map((t) => (
              <Op key={t} run={() => (setSolvent(t), undefined)} pressed={solvent === t}>
                {t === 'WATER' ? 'Water' : 'Ethanol'}
              </Op>
            ))}
            {CHROM_DEPTHS.map((d) => (
              <Op key={d} run={() => (setDepth(d), undefined)} pressed={depth === d}>
                {d} cm deep
              </Op>
            ))}
            <Op run={() => o.pourSolvent(solvent, depth)} why={why.solvent}>
              Pour into the tank
            </Op>
            <Op run={o.placePaper} why={why.place} brand>
              Stand the paper in
            </Op>
            <Op run={() => o.cover(!w.covered)} pressed={w.covered}>
              {w.covered ? 'Lid on' : 'Put the lid on'}
            </Op>
          </Step>
          <Step title="4. Take it out">
            <Op run={o.removePaper} why={why.remove} brand>
              Remove the paper
            </Op>
            <Op run={o.markFront} why={why.mark}>
              Mark the solvent front (pencil)
            </Op>
            <Op run={o.dryPaper} why={why.dryPaper}>
              Let it dry
            </Op>
          </Step>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ MP

function MpBench({ x, s, readOnly }: { x: Salts; s: ChemSaltsState; readOnly: boolean }) {
  const w = s.mp;
  const o = x.ops;
  const why = x.why;
  const b = x.bench;
  const open = x.openRun();
  const dissolved = mpDissolved(x.v, w);
  const prod = mpProduct(x.v, w);
  const beaker = <BeakerShape fill={w.water ? '#e8f0f4' : null} level={Math.min(1, w.water / 160)} label={w.hotFiltered ? 'empty' : dissolved ? 'dissolved (sand, charcoal left)' : 'impure benzoic acid'} />;
  const oil = (
    <g>
      <BeakerShape fill="#e8c86a" level={0.7} label="oil bath" />
      <rect x={-2} y={-120} width={4} height={112} className="fill-muted-foreground/50" />
    </g>
  );
  return (
    <div className="space-y-3">
      <HeatSvg flame={b.flame} onGauze={b.gauze === 'beaker' ? beaker : b.gauze === 'oil' ? oil : null}>
        <text x="10" y="20" fontSize="11" className="fill-foreground">
          {b.gauze === 'oil' || w.runs.length ? `Oil bath ${x.look.bathT.toFixed(1)} °C (${x.look.bathRate >= 0 ? '+' : ''}${x.look.bathRate.toFixed(1)} °C/min)` : w.water ? `${w.water} cm³ of ${w.boiled ? 'boiling' : 'cold'} water` : ''}
        </text>
      </HeatSvg>
      <Readout>
        {!w.water ? 'Impure benzoic acid (with sand and charcoal) in the beaker.' : !w.hotFiltered ? (dissolved ? `${w.water} cm³: the benzoic acid has dissolved; the black charcoal and sand remain.` : `${w.water} cm³: white solid still undissolved${w.boiled ? '' : ' (the water is not boiling)'}.`) : !w.collected ? `Filtered hot${w.funnelWarm ? '' : ' (crystals blocked the cold funnel)'}. ${w.cooling ? `White needle crystals form${w.iced ? ' (in ice)' : ''}.` : 'Clear filtrate.'}` : `Crystals collected${w.washed ? ', washed' : ''}${w.dried ? ', dried' : ''}.`}
      </Readout>
      <div className="flex flex-wrap items-end gap-3">
        {w.weighedImpure && <BalanceDisplay value={x.v.mp.impure} label="Impure sample" />}
        {w.weighedPure && <BalanceDisplay value={prod.mass} label="Recrystallised" />}
        {(open || w.runs.length > 0 || b.gauze === 'oil') && <ThermoLoupe T={x.look.bathT} melt={open ? x.look.melt : null} sample={open?.sample} attached={open?.attached} />}
      </div>
      {w.runs.filter((r) => r.done).length > 0 && (
        <Readout>
          {w.runs
            .filter((r) => r.done)
            .map((r) => `${r.sample === 'IMPURE' ? 'Impure' : 'Recrystallised'}: ${r.start?.toFixed(1)}–${r.end?.toFixed(1)} °C`)
            .join(' · ')}
        </Readout>
      )}
      {!readOnly && (
        <div className="space-y-2">
          <HeatControls x={x} items={[{ id: 'beaker', label: 'Beaker' }, { id: 'oil', label: 'Oil bath' }]} />
          <Step title="1. Dissolve in the minimum of boiling water">
            <Op run={o.weighImpure} pressed={w.weighedImpure}>
              Weigh the impure sample
            </Op>
            <Op run={o.addWater} why={why.mpWater} brand>
              Add 10 cm³ of boiling water ({w.water})
            </Op>
          </Step>
          <Step title="2. Filter hot, crystallise">
            <Op run={o.warmFunnel} why={why.mpFunnel}>
              Warm the funnel
            </Op>
            <Op run={o.hotFilter} why={why.mpFilter} brand>
              Filter the hot solution
            </Op>
            <Op run={() => o.cool('SLOW')} why={why.mpCool}>
              Cool slowly
            </Op>
            <Op run={() => o.cool('FAST')} why={why.mpCool}>
              Plunge straight into ice
            </Op>
            <Op run={o.ice} why={why.mpIce}>
              Then the ice bath
            </Op>
          </Step>
          <Step title="3. Collect, wash, dry, weigh">
            <Op run={o.collect} why={why.mpCollect}>
              Filter off the crystals
            </Op>
            <Op run={o.washMp} why={why.mpWash}>
              Wash with ice-cold water
            </Op>
            <Op run={o.dryMp} why={why.mpDry}>
              Dry
            </Op>
            <Op run={o.weighPure} why={why.mpWeigh} brand>
              Weigh
            </Op>
          </Step>
          <Step title="4. Melting point (capillary in the oil bath)">
            <Op run={() => o.pack('IMPURE')} why={why.pack}>
              Pack: impure
            </Op>
            <Op run={() => o.pack('PURE')} why={why.pack ?? why.packPure}>
              Pack: recrystallised
            </Op>
            <Op run={o.attach} why={why.attach}>
              Fasten to the thermometer
            </Op>
            <Op run={o.recordStart} why={why.start} brand>
              Melting starts — read
            </Op>
            <Op run={o.recordEnd} why={why.end} brand>
              All melted — read
            </Op>
            {open && (
              <Op run={o.discardRun}>
                Discard this tube
              </Op>
            )}
          </Step>
        </div>
      )}
    </div>
  );
}
