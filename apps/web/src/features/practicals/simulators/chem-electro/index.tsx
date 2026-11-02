import { DISP_VOLS, RUST_TUBES, rustLook, type ChemElectroState, type RustTube } from '@aischool/shared';
import { Beaker, ChevronDown, FlaskConical, Lightbulb } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { notify } from '../../lab3d-kit/store';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { COPPER, FRESH_COPPER, IRON, RUST, TASK_TITLE, ZINC, ZNSO4, copperColour, dispBalance, elecBalance, fmtDays, mixedColour, nextHint, rustNow, useElectro, type Electro } from './actions';
import { Notebook, TaskBrief } from './notebook';
import { AmmeterFace, BalanceDisplay, GradTubeLoupe, SpeedPicker, StopwatchDisplay, ThermoLoupe, VoltmeterDisplay } from './parts';

/**
 * The 2D electrochemistry lab: the same state, actions and marks as the 3D
 * lab. A schematic bench for the lesson's task, the steps as buttons (every
 * mistake the grader marks can be made here too), the live meters with
 * time-lapse, and the notebook.
 */
export default function ChemElectroLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'chem-electro'>) {
  const x = useElectro({ seed, state, onChange, readOnly, startedAt, practicalId });
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
          {task === 'ELEC' && <ElecBench x={x} s={state} readOnly={readOnly} />}
          {task === 'CELL' && <CellBench x={x} s={state} readOnly={readOnly} />}
          {task === 'DISP' && <DispBench x={x} s={state} readOnly={readOnly} />}
          {task === 'RUST' && <RustBench x={x} s={state} readOnly={readOnly} />}
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
        if (m) notify(m, 'warning', 3000);
      }}
    >
      {children}
    </Button>
  );
}
function Readout({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-muted px-3 py-1.5 text-[12.5px] tabular">{children}</p>;
}

// ------------------------------------------------------------------ ELEC

function ElecBench({ x, s, readOnly }: { x: Electro; s: ChemElectroState; readOnly: boolean }) {
  const w = s.elec;
  const o = x.ops;
  const why = x.why;
  const bal = elecBalance(x, s);
  const dep = Math.min(1, x.look.deposit / 0.5);
  const cathodeLeft = w.cathodeTo !== 'POS';
  const sol = copperColour(x.look.cuConc);
  const plate = (px: number, gain: number, label: string) => (
    <g>
      <rect x={px - 4 - gain * 2} y={58} width={8 + gain * 4} height={78} fill={gain > 0 ? FRESH_COPPER : COPPER} stroke="#7a3a1d" strokeWidth="0.6" />
      <text x={px} y={52} textAnchor="middle" fontSize="9.5" className="fill-foreground">
        {label}
      </text>
    </g>
  );
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 320 190" className="h-[190px] w-full" role="img" aria-label="Copper voltameter: two copper plates in blue copper(II) sulphate solution, with the supply, ammeter, rheostat and key in series">
        <rect x={70} y={70} width={110} height={90} fill={sol} opacity={0.85} />
        <path d="M66 50 L66 162 L184 162 L184 50" fill="none" className="stroke-muted-foreground" strokeWidth="2" />
        {plate(w.gap === 'TOUCH' ? 118 : 96, cathodeLeft ? dep : 0, cathodeLeft ? 'cathode (−)' : 'anode')}
        {plate(w.gap === 'TOUCH' ? 132 : 154, cathodeLeft ? 0 : dep, cathodeLeft ? 'anode (+)' : 'cathode')}
        {w.connected && (
          <g fill="none" stroke="#c62828" strokeWidth="1.5">
            <path d="M96 58 L96 22 L230 22" />
            <path d="M154 58 L154 36 L210 36 L210 60 L300 60 L300 22 L270 22" />
          </g>
        )}
        <g transform="translate(230 10)">
          <rect width="40" height="24" rx="3" className="fill-muted stroke-muted-foreground" />
          <text x="20" y="16" textAnchor="middle" fontSize="9">d.c. 6 V</text>
        </g>
        <g transform="translate(270 70)">
          <circle r="16" className="fill-card stroke-muted-foreground" />
          <text y="4" textAnchor="middle" fontSize="11" fontWeight="700">A</text>
        </g>
        <g transform="translate(220 120)">
          <rect width="70" height="14" rx="3" fill="#a46a3b" />
          <rect x={(w.rheo / 120) * 64} y={-6} width="6" height="26" fill="#333" />
          <text x="35" y="34" textAnchor="middle" fontSize="9" className="fill-muted-foreground">rheostat {(w.rheo * 0.25).toFixed(2)} Ω</text>
        </g>
        <text x="10" y="184" fontSize="10" className="fill-muted-foreground">
          {w.closed ? 'Key closed: current flowing' : w.connected ? 'Key open' : 'Not connected'}
          {x.v.elec.electrodes === 'C' ? ' · carbon electrodes' : ''}
        </text>
      </svg>
      <div className="flex flex-wrap items-end gap-3">
        <AmmeterFace amps={x.look.current} />
        <StopwatchDisplay sec={x.look.run} running={w.closed} />
        {bal && <BalanceDisplay value={bal.cath} label={`Cathode plate (${w.weighedAfter ? 'after' : 'before'})`} />}
        {bal && <BalanceDisplay value={bal.an} label={`Anode plate (${w.weighedAfter ? 'after' : 'before'})`} />}
      </div>
      <Readout>
        {!w.connected ? 'Plates on the bench.' : w.ran === 0 && !w.closed ? 'Circuit connected; key open.' : w.removed ? `Plates out after ${Math.round(w.ran)} s. ${w.rinse ? `Rinsed (${w.rinse === 'GENTLE' ? 'gently' : 'rubbed'}).` : ''} ${w.dry ? `Dried (${w.dry.toLowerCase()}).` : ''}` : `Cathode: ${x.look.deposit > 0.02 ? 'a pink-brown layer of fresh copper' : 'bright'}; anode: ${x.look.deposit > 0.05 ? 'being eaten away' : 'unchanged'}. Solution ${x.v.elec.electrodes === 'C' ? (x.look.cuConc < 0.85 ? 'paler blue; bubbles at the anode' : 'blue; bubbles at the anode') : 'the same blue'}.`}
      </Readout>
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. Prepare and weigh the plates">
            <Op run={o.sandPlates} why={why.sand}>
              Clean with sandpaper
            </Op>
            <Op run={o.weighBefore} why={why.weighBefore} brand>
              Weigh both plates
            </Op>
          </Step>
          <Step title="2. Connect the circuit (ammeter in series)">
            <Op run={() => o.connect('NEG', 'APART')} why={why.connect} pressed={w.connected && w.cathodeTo === 'NEG' && w.gap === 'APART'}>
              Cathode to −, plates apart
            </Op>
            <Op run={() => o.connect('POS', 'APART')} why={why.connect} pressed={w.cathodeTo === 'POS'}>
              Cathode to +
            </Op>
            <Op run={() => o.connect('NEG', 'TOUCH')} why={why.connect} pressed={w.gap === 'TOUCH'}>
              Plates close together (touching)
            </Op>
            {w.gap === 'TOUCH' && <Op run={o.separate}>Move them apart</Op>}
          </Step>
          <Step title="3. Pass the current (keep it at 0.50 A)">
            <Op run={w.closed ? o.openKey : o.closeKey} why={w.closed ? undefined : why.key} brand>
              {w.closed ? 'Open the key (stop)' : 'Close the key (start)'}
            </Op>
            <Op run={() => o.rheostat(-4)} why={why.rheo}>
              ◀◀ less R
            </Op>
            <Op run={() => o.rheostat(-1)} why={why.rheo}>
              ◀ less R
            </Op>
            <Op run={() => o.rheostat(1)} why={why.rheo}>
              more R ▶
            </Op>
            <Op run={() => o.rheostat(4)} why={why.rheo}>
              more R ▶▶
            </Op>
          </Step>
          <Step title="4. Remove, rinse, dry, reweigh">
            <Op run={o.removePlates} why={why.remove}>
              Take the plates out
            </Op>
            <Op run={() => o.rinsePlates('GENTLE')} why={why.rinse} pressed={w.rinse === 'GENTLE'}>
              Rinse gently: water, then propanone
            </Op>
            <Op run={() => o.rinsePlates('RUB')} why={why.rinse} pressed={w.rinse === 'RUB'}>
              Wipe them clean with tissue
            </Op>
            <Op run={() => o.dryPlates('AIR')} why={why.dryPlates} pressed={w.dry === 'AIR'}>
              Let them dry in air
            </Op>
            <Op run={() => o.dryPlates('FLAME')} why={why.dryPlates} pressed={w.dry === 'FLAME'}>
              Dry over a Bunsen flame
            </Op>
            <Op run={o.weighAfter} why={why.weighAfter} brand>
              Reweigh both plates
            </Op>
          </Step>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ CELL

function CellBench({ x, s, readOnly }: { x: Electro; s: ChemElectroState; readOnly: boolean }) {
  const w = s.cell;
  const o = x.ops;
  const why = x.why;
  const swapped = w.placed === 'SWAPPED';
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 320 170" className="h-[170px] w-full" role="img" aria-label="Zinc–copper cell: zinc in zinc sulphate and copper in copper sulphate, joined by a salt bridge, with a voltmeter">
        {[
          { x0: 40, fill: ZNSO4, label: 'ZnSO₄', metal: swapped ? COPPER : ZINC, m: swapped ? 'Cu' : 'Zn' },
          { x0: 190, fill: copperColour(1), label: 'CuSO₄', metal: swapped ? ZINC : COPPER, m: swapped ? 'Zn' : 'Cu' },
        ].map((b) => (
          <g key={b.label}>
            <rect x={b.x0} y={80} width={90} height={70} fill={b.fill} opacity={0.85} />
            <path d={`M${b.x0 - 4} 60 L${b.x0 - 4} 152 L${b.x0 + 94} 152 L${b.x0 + 94} 60`} fill="none" className="stroke-muted-foreground" strokeWidth="2" />
            {w.placed && <rect x={b.x0 + 20} y={50} width={8} height={90} fill={b.metal} stroke="#555" strokeWidth="0.5" />}
            {w.placed && (
              <text x={b.x0 + 24} y={46} textAnchor="middle" fontSize="10" fontWeight="700">
                {b.m}
              </text>
            )}
            <text x={b.x0 + 45} y={166} textAnchor="middle" fontSize="10" className="fill-muted-foreground">
              {b.label}
            </text>
          </g>
        ))}
        {w.bridge && <path d="M100 120 L100 62 Q160 30 220 62 L220 120" fill="none" stroke={w.soaked ? '#d9d2b8' : '#f6f4ee'} strokeWidth="9" strokeLinejoin="round" />}
        {w.meter && w.leads && w.placed && (
          <g fill="none" strokeWidth="1.5">
            <path d="M64 50 L64 20 L140 20" stroke={w.leads === 'CORRECT' ? '#222' : '#c62828'} />
            <path d="M214 50 L214 20 L180 20" stroke={w.leads === 'CORRECT' ? '#c62828' : '#222'} />
          </g>
        )}
        <g transform="translate(140 8)">
          <rect width="40" height="24" rx="3" className="fill-muted stroke-muted-foreground" />
          <text x="20" y="16" textAnchor="middle" fontSize="10" fontWeight="700">V</text>
        </g>
      </svg>
      <div className="flex flex-wrap items-end gap-3">
        <VoltmeterDisplay volts={x.look.volts} label={w.meter === 'LOW' ? 'ordinary voltmeter' : w.meter ? 'high-resistance voltmeter' : 'voltmeter'} />
      </div>
      {w.readings.length > 0 && <Readout>Readings taken: {w.readings.length} (latest {w.readings.at(-1)!.bridge ? 'with' : 'without'} the bridge).</Readout>}
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. The half-cells">
            <Op run={o.sandStrips} why={why.cellSand}>
              Clean the strips with sandpaper
            </Op>
            <Op run={() => o.placeStrips('RIGHT')} why={why.place} pressed={w.placed === 'RIGHT'}>
              Zn in ZnSO₄, Cu in CuSO₄
            </Op>
            <Op run={() => o.placeStrips('SWAPPED')} why={why.place} pressed={swapped}>
              Zn in CuSO₄, Cu in ZnSO₄
            </Op>
          </Step>
          <Step title="2. The salt bridge">
            <Op run={o.soakBridge} why={why.soak}>
              Soak filter paper in KNO₃
            </Op>
            <Op run={() => o.setBridge(!w.bridge)} why={why.bridge} brand>
              {w.bridge ? 'Remove the salt bridge' : 'Put the salt bridge in'}
            </Op>
          </Step>
          <Step title="3. The voltmeter">
            <Op run={() => o.chooseMeter('HIGH')} pressed={w.meter === 'HIGH'}>
              High-resistance voltmeter
            </Op>
            <Op run={() => o.chooseMeter('LOW')} pressed={w.meter === 'LOW'}>
              Ordinary (moving-coil) voltmeter
            </Op>
            <Op run={() => o.connectLeads('CORRECT')} why={why.leads} pressed={w.leads === 'CORRECT'}>
              + to Cu, − to Zn
            </Op>
            <Op run={() => o.connectLeads('REVERSED')} why={why.leads} pressed={w.leads === 'REVERSED'}>
              + to Zn, − to Cu
            </Op>
            <Op run={o.readMeter} why={why.read} brand>
              Read the voltmeter
            </Op>
          </Step>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ DISP

function DispBench({ x, s, readOnly }: { x: Electro; s: ChemElectroState; readOnly: boolean }) {
  const w = s.disp;
  const o = x.ops;
  const why = x.why;
  const colour = w.cuso4 === null || w.filtered ? null : mixedColour(x.look.ions.cu, x.look.ions.fe);
  const e = x.look.extent;
  const bal = dispBalance(x, s);
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 320 170" className="h-[170px] w-full" role="img" aria-label="Beaker of copper sulphate solution with iron filings and a thermometer">
        {colour && <rect x={60} y={80} width={110} height={74} fill={colour} opacity={0.88} />}
        <path d="M56 50 L56 156 L174 156 L174 50" fill="none" className="stroke-muted-foreground" strokeWidth="2" />
        {w.added && !w.filtered && <ellipse cx={115} cy={150} rx={34} ry={4} fill={e > 0.6 ? FRESH_COPPER : e > 0.15 ? COPPER : IRON} />}
        {w.thermo && <rect x={140} y={22} width={5} height={128} rx={2} fill="#eef2f4" stroke="#999" />}
        {w.thermo && <rect x={141.3} y={148 - Math.max(0, x.look.temp) * 1.1} width={2.4} height={Math.max(0, x.look.temp) * 1.1} fill="#c62828" />}
        <g transform="translate(230 70)">
          <path d="M-30 0 L30 0 L4 40 L4 70 L-4 70 L-4 40 Z" fill="none" className="stroke-muted-foreground" strokeWidth="2" />
          {w.filtered && <path d="M-18 10 L18 10 L4 32 L-4 32Z" fill={FRESH_COPPER} stroke="#bbb" />}
          <text x="0" y="-6" textAnchor="middle" fontSize="10" className="fill-muted-foreground">
            filter funnel
          </text>
        </g>
      </svg>
      <div className="flex flex-wrap items-end gap-3">
        {w.thermo && !w.filtered && <ThermoLoupe temp={x.look.temp} caption="°C — to the nearest 0.5 °C" />}
        <BalanceDisplay value={bal} label={w.weighed ? 'Paper + copper' : w.taps > 0 && !w.added ? 'Iron filings' : w.paper ? 'Dry filter paper' : 'Balance'} />
        {w.taps > 0 && w.added && <BalanceDisplay value={x.look.fe} label="Iron used" />}
      </div>
      <Readout>
        {!w.added ? `${w.cuso4 === null ? 'Beaker empty.' : `${w.cuso4} cm³ of blue CuSO₄.`} ${w.filings ? `${w.filings === 'CLEAN' ? 'Clean' : 'Rusty'} filings: ${x.look.fe.toFixed(2)} g.` : ''}` : !w.filtered ? `${Math.round(e * 100)} % reacted · ${Math.round(x.look.dispSec)} s · ${e > 0.2 ? 'reddish-brown copper forming; the blue is fading towards green' : 'grey filings, blue solution'} · ${w.thermo && w.watched ? `${x.look.temp.toFixed(1)} °C` : 'thermometer not in'}` : `Filtered after ${Math.round(w.elapsed ?? 0)} s.${w.wash ? ` Washed (${w.wash.toLowerCase()}).` : ''}${w.dry ? ` Dried (${w.dry.toLowerCase()}).` : ''}`}
      </Readout>
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. Weigh about 0.56 g of iron filings">
            <Op run={() => o.chooseFilings('CLEAN')} why={why.filings} pressed={w.filings === 'CLEAN'}>
              Clean filings
            </Op>
            <Op run={() => o.chooseFilings('RUSTY')} why={why.filings} pressed={w.filings === 'RUSTY'}>
              Old rusty filings
            </Op>
            <Op run={o.tap} why={why.tap} brand>
              Tap a little onto the boat
            </Op>
            <Op run={o.untap} why={why.untap}>
              Tip a little back
            </Op>
          </Step>
          <Step title="2. CuSO₄ solution and thermometer">
            {DISP_VOLS.map((vol) => (
              <Op key={vol} run={() => o.measureCuSO4(vol)} why={why.cuso4} pressed={w.cuso4 === vol}>
                {vol} cm³
              </Op>
            ))}
            <Op run={o.thermometerIn} why={why.thermo}>
              Thermometer in
            </Op>
          </Step>
          <Step title="3. React">
            <Op run={() => o.addIron('STIR')} why={why.add} brand>
              Add the iron and stir
            </Op>
            <Op run={() => o.addIron('NONE')} why={why.add}>
              Add the iron and leave it
            </Op>
            <Op run={o.thermometerOut} why={why.unthermo}>
              Take the thermometer out
            </Op>
          </Step>
          <Step title="4. Filter, wash, dry, weigh">
            <Op run={o.weighPaper} why={why.paper}>
              Weigh a dry filter paper
            </Op>
            <Op run={o.filter} why={why.filter} brand>
              Filter
            </Op>
            <Op run={() => o.washCopper('PROPANONE')} why={why.dWash} pressed={w.wash === 'PROPANONE'}>
              Wash: water, then propanone
            </Op>
            <Op run={() => o.washCopper('WATER')} why={why.dWash} pressed={w.wash === 'WATER'}>
              Wash with water only
            </Op>
            <Op run={() => o.dryCopper('AIR')} why={why.dDry} pressed={w.dry === 'AIR'}>
              Dry in a warm place
            </Op>
            <Op run={() => o.dryCopper('FLAME')} why={why.dDry} pressed={w.dry === 'FLAME'}>
              Dry over a flame
            </Op>
            <Op run={o.weighCopper} why={why.dWeigh} brand>
              Weigh paper + copper
            </Op>
          </Step>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ RUST

const LOOK_TEXT = { NONE: 'no rust', SLIGHT: 'a little rust', MUCH: 'rusty', HEAVY: 'very rusty' } as const;
function RustBench({ x, s, readOnly }: { x: Electro; s: ChemElectroState; readOnly: boolean }) {
  const w = s.rust;
  const o = x.ops;
  const why = x.why;
  const tubeFill: Record<string, string> = { TAP: '#dcecf5', BOILED: '#e3f0f7', SALT: '#d9e8f0', CACL2: '#ffffff' };
  return (
    <div className="space-y-3">
      <svg viewBox="0 0 320 170" className="h-[170px] w-full" role="img" aria-label="Four test tubes with nails, and a graduated tube with iron wool standing in a trough">
        {RUST_TUBES.map((t, k) => {
          const tw = w.tubes[t];
          const idx = rustNow(x, s, t);
          const cx = 30 + k * 45;
          return (
            <g key={t}>
              {tw.content && tw.content !== 'CACL2' && <rect x={cx - 9} y={60} width={18} height={88} fill={tubeFill[tw.content]} />}
              {tw.content === 'CACL2' && <rect x={cx - 9} y={128} width={18} height={20} fill="#f3f1ea" />}
              {tw.oil && <rect x={cx - 9} y={56} width={18} height={8} fill="#e8c86a" />}
              {tw.nail && <rect x={cx - 2} y={74} width={4} height={60} fill={idx >= 0.05 ? RUST : '#8d949b'} opacity={idx >= 0.05 ? Math.min(1, 0.5 + idx * 0.4) : 1} />}
              <path d={`M${cx - 10} 30 L${cx - 10} 146 Q${cx} 158 ${cx + 10} 146 L${cx + 10} 30`} fill="none" className="stroke-muted-foreground" strokeWidth="1.5" />
              {tw.stopper && <rect x={cx - 11} y={24} width={22} height={10} rx={2} fill="#7a5032" />}
              <text x={cx} y={18} textAnchor="middle" fontSize="11" fontWeight="700">
                {t}
              </text>
              {w.started && tw.nail && (
                <text x={cx} y={168} textAnchor="middle" fontSize="7.5" className="fill-muted-foreground">
                  {LOOK_TEXT[rustLook(idx)]}
                </text>
              )}
            </g>
          );
        })}
        <g transform="translate(250 0)">
          <rect x={-40} y={110} width={80} height={46} fill="#d9ebf5" />
          <path d="M-42 100 L-42 158 L42 158 L42 100" fill="none" className="stroke-muted-foreground" strokeWidth="1.5" />
          <rect x={-7} y={14} width={14} height={130} fill="none" className="stroke-muted-foreground" />
          {w.wool && <rect x={-6} y={16} width={12} height={10} fill={w.wool === 'MOIST' ? '#6c6f73' : '#9a9da1'} />}
          {w.wool && <rect x={-6} y={14 + (x.look.volume / 60) * 128} width={12} height={130 - (x.look.volume / 60) * 128} fill="#cfe4f1" />}
          <text x={0} y={10} textAnchor="middle" fontSize="8" className="fill-muted-foreground">
            iron wool
          </text>
        </g>
      </svg>
      <div className="flex flex-wrap items-end gap-3">
        {w.wool && <GradTubeLoupe vol={x.look.volume} levelled={x.look.levelled} />}
        <Readout>{w.started ? fmtDays(x.look.day) : 'Not started'}</Readout>
      </div>
      {!readOnly && (
        <div className="space-y-2">
          <Step title="1. Nails and tubes">
            <Op run={o.sandNails} why={why.nails}>
              Clean the nails with sandpaper
            </Op>
            <Op run={() => o.fillTube('A', 'TAP')} why={why.tube} pressed={w.tubes.A.content === 'TAP'}>
              A: nail + tap water
            </Op>
            <Op run={o.boilWater} why={why.tube}>
              Boil distilled water
            </Op>
            <Op run={() => o.fillTube('B', 'BOILED')} why={why.tube} pressed={w.tubes.B.content === 'BOILED' && w.tubes.B.boiled}>
              B: nail + boiled water
            </Op>
            <Op run={() => o.fillUnboiled('B')} why={why.tube} pressed={w.tubes.B.content === 'BOILED' && !w.tubes.B.boiled}>
              B: nail + unboiled water
            </Op>
            <Op run={() => o.oil('B')} why={why.tube} pressed={w.tubes.B.oil}>
              B: layer of oil
            </Op>
            <Op run={() => o.fillTube('C', 'CACL2')} why={why.tube} pressed={w.tubes.C.content === 'CACL2'}>
              C: nail + anhydrous CaCl₂
            </Op>
            <Op run={() => o.stopper('C')} why={why.tube} pressed={w.tubes.C.stopper}>
              C: stopper
            </Op>
            <Op run={() => o.fillTube('D', 'SALT')} why={why.tube} pressed={w.tubes.D.content === 'SALT'}>
              D: nail + salt water
            </Op>
          </Step>
          <Step title="2. Iron wool in the graduated tube (50.0 cm³ of air)">
            <Op run={() => o.setWool('MOIST')} why={why.wool} pressed={w.wool === 'MOIST'}>
              Moist iron wool
            </Op>
            <Op run={() => o.setWool('DRY')} why={why.wool} pressed={w.wool === 'DRY'}>
              Dry iron wool
            </Op>
          </Step>
          <Step title="3. Leave for a week; read and observe">
            <Op run={o.startWeek} why={why.start} brand>
              Leave everything (start the week)
            </Op>
            <Op run={() => (x.skip(86_400_000), undefined)} why={w.started ? undefined : 'Start the week first.'}>
              +1 day
            </Op>
            <Op run={o.level} why={w.wool ? undefined : 'Set up the iron wool first.'} pressed={x.look.levelled}>
              Level the water inside and outside
            </Op>
            <Op run={o.readVolume} why={why.readVol} brand>
              Read the volume
            </Op>
            <Op run={o.observe} why={why.observe}>
              Look at the tubes
            </Op>
          </Step>
          {w.readings.length > 0 && <Readout>Readings: {w.readings.map((r) => `day ${r.day.toFixed(1)}${r.levelled ? '' : ' (not levelled)'}`).join(' · ')}</Readout>}
        </div>
      )}
    </div>
  );
}
export type { RustTube };
