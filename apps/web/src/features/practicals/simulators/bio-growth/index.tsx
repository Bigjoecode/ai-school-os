import { GERM_TUBES, GROWTH_TASKS, GROWTH_TASK_TITLE, RESP_INDICATOR_LABEL, SEED_REF_LABEL, TROP_CTRL_LABEL, germKind, GERM_KIND_LABEL, type BioGrowthState, type SeedRef } from '@aischool/shared';
import { ChevronDown, Lightbulb, Sprout } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SimulatorProps } from '../types';
import { nextHint, useGrowth, type Growth } from './actions';
import { GermNotebook, RespNotebook, SeedNotebook, TropNotebook, Written } from './notebook';
import { lastSeedShown, lastTropShown, respReadText } from './readings';
import { TaskText } from './task-text';
import { FlasksSvg, GermTubesSvg, SeedlingSvg, TropSvg } from './visuals';

export default function BioGrowthLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'bio-growth'>) {
  const p = useGrowth({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { v, task } = p;
  const [brief, setBrief] = useState(true);
  const started = state.log.some((e) => !e.a.startsWith('task:') && !e.a.startsWith('safety'));
  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
          <span className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
            <Sprout className="size-4 text-muted-foreground" aria-hidden /> {GROWTH_TASK_TITLE[task]}
          </span>
          <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', brief && 'rotate-180')} aria-hidden />
        </button>
        {brief && (
          <div className="mt-3">
            <TaskText v={v} />
            {!readOnly && !practicalId && !started && (
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Experiment">
                {GROWTH_TASKS.map((t) => (
                  <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => p.chooseTask(t)} aria-pressed={task === t}>
                    {GROWTH_TASK_TITLE[t]}
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
          {task === 'GERM' ? <GermBench p={p} state={state} readOnly={readOnly} /> : task === 'SEEDLING' ? <SeedBench p={p} state={state} readOnly={readOnly} /> : task === 'RESP' ? <RespBench p={p} state={state} readOnly={readOnly} /> : <TropBench p={p} state={state} readOnly={readOnly} />}
        </Card>
        <div className="space-y-4">
          {task === 'GERM' ? <GermNotebook state={state} readOnly={readOnly} update={p.update} /> : task === 'SEEDLING' ? <SeedNotebook v={v} state={state} readOnly={readOnly} update={p.update} /> : task === 'RESP' ? <RespNotebook state={state} readOnly={readOnly} update={p.update} /> : <TropNotebook state={state} readOnly={readOnly} update={p.update} />}
          <Written state={state} readOnly={readOnly} update={p.update} />
        </div>
      </div>
    </div>
  );
}

export const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl border border-border p-3">
    <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
    {children}
  </div>
);
const B = ({ on, children, brand, disabled }: { on: () => unknown; children: React.ReactNode; brand?: boolean; disabled?: boolean }) => (
  <Button size="sm" variant={brand ? 'brand' : 'outline'} disabled={disabled} onClick={() => on()}>
    {children}
  </Button>
);
const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap gap-1.5">{children}</div>;

function GermBench({ p, state, readOnly }: { p: Growth; state: BioGrowthState; readOnly: boolean }) {
  const w = state.germ;
  const a = p.germ;
  const [k, setK] = useState(0);
  const t = w.tubes[k]!;
  const locked = w.day > 0;
  return (
    <div className="space-y-3">
      <GermTubesSvg v={p.v} w={w} label={`The four tubes on day ${w.day}`} />
      {!readOnly && !locked && (
        <Box title="Set up the tubes">
          <Row>
            <B brand={w.batch !== 'SORTED'} on={() => a.batch('SORTED')} disabled={w.batch === 'SORTED'}>
              Sort the seeds (same kind, size, age)
            </B>
            <B on={() => a.batch('MIXED')} disabled={!!w.batch}>
              Take a mixed handful
            </B>
          </Row>
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Tube">
            {GERM_TUBES.map((n, j) => (
              <button key={n} type="button" aria-pressed={j === k} onClick={() => setK(j)} className={cn('rounded-full border px-2.5 py-1 text-[12px]', j === k ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground hover:bg-muted')}>
                Tube {n}
              </button>
            ))}
          </div>
          <p className="my-2 text-[12px] text-muted-foreground">Tube {GERM_TUBES[k]}: {germKind(t) === 'OTHER' ? 'not set up yet' : GERM_KIND_LABEL[germKind(t)]}</p>
          <Row>
            <B on={() => a.cotton(k, 'MOIST')} disabled={!!t.water || t.cotton === 'MOIST'}>
              Moist cotton wool
            </B>
            <B on={() => a.cotton(k, 'DRY')} disabled={!!t.water || t.cotton === 'DRY'}>
              Dry cotton wool
            </B>
            <B on={() => a.water(k, 'BOILED')} disabled={!!t.cotton || !!t.water}>
              Boiled, cooled water
            </B>
            <B on={() => a.water(k, 'TAP')} disabled={!!t.cotton || !!t.water}>
              Tap water
            </B>
            <B on={() => a.oil(k)} disabled={!t.water || t.oil}>
              Layer of oil on top
            </B>
            <B brand on={() => a.sow(k)} disabled={!w.batch || t.seeds > 0}>
              Count in 10 seeds
            </B>
            <B on={() => a.sow(k, false)} disabled={!w.batch || t.seeds > 0}>
              Tip in a handful
            </B>
            <B on={() => a.fridge(k, !t.fridge)}>{t.fridge ? 'Take out of the fridge' : 'Into the refrigerator'}</B>
            <B on={() => a.label(k)} disabled={t.label}>
              Label it {GERM_TUBES[k]}
            </B>
            <B on={() => a.empty(k)} disabled={!t.seeds && !t.cotton && !t.water}>
              Empty it
            </B>
          </Row>
        </Box>
      )}
      <Box title={`Day ${w.day} of ${7}${w.looks.includes(w.day) ? ' — inspected' : ''}`}>
        {!readOnly && (
          <Row>
            <B on={a.wait} disabled={w.day >= 7 || !w.tubes.some((x) => x.seeds > 0)}>
              Leave them 1 day
            </B>
            <B brand on={a.look} disabled={w.day < 1 || w.looks.includes(w.day)}>
              Inspect and count today
            </B>
          </Row>
        )}
        <p className="mt-2 text-[12px] text-muted-foreground">A seed has germinated when its radicle shows. Swollen seeds have only taken up water.</p>
      </Box>
    </div>
  );
}

function SeedBench({ p, state, readOnly }: { p: Growth; state: BioGrowthState; readOnly: boolean }) {
  const w = state.seedling;
  const a = p.seedling;
  const [ref, setRef] = useState<SeedRef>('SEED');
  const last = lastSeedShown(p.v, state);
  return (
    <div className="space-y-3">
      <SeedlingSvg v={p.v} w={w} label={`The seed jar and the box of sawdust on day ${w.day}`} />
      {!readOnly && w.day === 0 && (
        <Box title="Sow the seeds">
          <Row>
            <B brand on={a.soak} disabled={w.soaked || w.box || w.jar}>
              Soak the seeds overnight
            </B>
            <B on={() => a.sow('box')} disabled={w.box}>
              Sow in the box of moist sawdust
            </B>
            <B on={() => a.sow('jar')} disabled={w.jar}>
              Seeds against the blotting paper of the jar
            </B>
          </Row>
        </Box>
      )}
      <Box title={`Day ${w.day}`}>
        {!readOnly && (
          <>
            <Row>
              <B on={a.water} disabled={(!w.box && !w.jar) || w.waters.includes(w.day)}>
                Water the sawdust and blotting paper
              </B>
              <B on={a.wait} disabled={(!w.box && !w.jar) || w.day >= 10}>
                Leave 1 day
              </B>
              <B on={a.draw} disabled={w.day < 1 || w.draws.includes(w.day)}>
                Draw the seedlings
              </B>
            </Row>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
              <span>Measure from:</span>
              {(['SEED', 'SOIL'] as SeedRef[]).map((r) => (
                <button key={r} type="button" aria-pressed={ref === r} onClick={() => setRef(r)} className={cn('rounded-full border px-2 py-0.5', ref === r ? 'border-brand bg-brand/10' : 'border-border text-muted-foreground')}>
                  {SEED_REF_LABEL[r]}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Row>
                <B brand on={() => a.measure('COWPEA', ref)} disabled={!w.jar || w.day < 1 || w.measures.some((m) => m.day === w.day && m.kind === 'COWPEA')}>
                  Measure the cowpea shoot
                </B>
                <B brand on={() => a.measure('MAIZE', ref)} disabled={!w.jar || w.day < 1 || w.measures.some((m) => m.day === w.day && m.kind === 'MAIZE')}>
                  Measure the maize shoot
                </B>
              </Row>
            </div>
          </>
        )}
        {last && (
          <p className="mt-2 text-[12.5px]">
            Ruler: {last.kind === 'COWPEA' ? 'cowpea' : 'maize'} shoot <span className="font-mono text-[15px] font-semibold">{last.mm} mm</span> (day {last.day})
          </p>
        )}
      </Box>
    </div>
  );
}

function RespBench({ p, state, readOnly }: { p: Growth; state: BioGrowthState; readOnly: boolean }) {
  const w = state.resp;
  const a = p.resp;
  const locked = w.startAt !== null && w.clock > w.startAt;
  return (
    <div className="space-y-3">
      <FlasksSvg v={p.v} w={w} label="The vacuum flasks, their thermometers and the CO₂ test" />
      {!readOnly && !locked && (
        <Box title="Set up the flasks">
          <Row>
            <B brand on={a.soak} disabled={w.soaked}>
              Soak the seeds 24 h
            </B>
            <B on={a.boil} disabled={!w.soaked || w.boiled}>
              Boil half for 10 min, cool
            </B>
            <B on={() => a.disinfect('LIVE')} disabled={!w.soaked || w.disLive || !!w.A.seeds}>
              Rinse germinating seeds in disinfectant
            </B>
            <B on={() => a.disinfect('BOILED')} disabled={!w.boiled || w.disBoiled || !!w.B.seeds}>
              Rinse boiled seeds in disinfectant
            </B>
          </Row>
          {(['A', 'B'] as const).map((f) => (
            <div key={f} className="mt-2">
              <p className="mb-1 text-[12px] font-medium">Flask {f}</p>
              <Row>
                <B on={() => a.fill(f, 'LIVE', 'FULL')} disabled={!!w[f].seeds || !w.soaked}>
                  Fill with germinating seeds
                </B>
                <B on={() => a.fill(f, 'BOILED', 'FULL')} disabled={!!w[f].seeds || !w.boiled}>
                  Fill with boiled seeds
                </B>
                <B on={() => a.fill(f, f === 'A' ? 'LIVE' : 'BOILED', 'HALF')} disabled={!!w[f].seeds || !w.soaked || (f === 'B' && !w.boiled)}>
                  Half fill
                </B>
                <B on={() => a.thermo(f)} disabled={!w[f].seeds || w[f].thermo}>
                  Thermometer in
                </B>
                <B on={() => a.plug(f, 'COTTON')} disabled={!w[f].thermo || !!w[f].plug}>
                  Plug loosely with cotton wool
                </B>
                <B on={() => a.plug(f, 'BUNG')} disabled={!w[f].thermo || !!w[f].plug}>
                  Seal with a rubber bung
                </B>
                <B on={() => a.invert(f)} disabled={!w[f].plug || w[f].inverted}>
                  Invert it
                </B>
              </Row>
            </div>
          ))}
        </Box>
      )}
      <Box title={`Clock: ${Math.round(w.clock)} h`}>
        {!readOnly && (
          <>
            <Row>
              <B brand on={a.read} disabled={w.startAt === null || w.reads.includes(w.clock)}>
                Read both thermometers
              </B>
              <B on={() => a.wait(1)} disabled={!w.soaked}>
                Wait 1 h
              </B>
              <B on={() => a.wait(24)} disabled={!w.soaked}>
                Wait 1 day
              </B>
            </Row>
            <div className="mt-2">
              <Row>
                {(['LIME', 'BICARB'] as const).map((ind) => (
                  <B key={ind} on={() => a.co2(ind)} disabled={!w.soaked || w.co2.at !== null}>
                    Germinating seeds → {RESP_INDICATOR_LABEL[ind].toLowerCase()}
                  </B>
                ))}
                <B on={a.co2Ctrl} disabled={w.co2.at === null || w.co2.ctrl || !w.boiled}>
                  Control: boiled seeds → same
                </B>
                <B on={a.co2Look} disabled={w.co2.at === null}>
                  Look at the CO₂ test
                </B>
              </Row>
            </div>
          </>
        )}
        <p className="mt-2 text-[12.5px]">{respReadText(p.v, state)}</p>
      </Box>
    </div>
  );
}

function TropBench({ p, state, readOnly }: { p: Growth; state: BioGrowthState; readOnly: boolean }) {
  const w = state.trop;
  const a = p.trop;
  const last = lastTropShown(p.v, state);
  return (
    <div className="space-y-3">
      <TropSvg v={p.v} w={w} label={`The tropism experiments on day ${w.day}`} />
      {!readOnly && w.day === 0 && (
        <Box title="Set up">
          <Row>
            <B brand on={a.box} disabled={w.box}>
              Test pot into the box
            </B>
            <B on={() => a.slit('LAMP')} disabled={!w.box || w.slit === 'LAMP'}>
              Slit towards the lamp
            </B>
            <B on={() => a.slit('AWAY')} disabled={!w.box || w.slit === 'AWAY'}>
              Slit away from the lamp
            </B>
            <B on={a.tape} disabled={!w.box || w.taped}>
              Tape the gaps (light-proof)
            </B>
            <B on={() => a.lamp(!w.lamp)}>{w.lamp ? 'Lamp off' : 'Lamp on'}</B>
            {(['KLINO', 'UNIFORM'] as const).map((c) => (
              <B key={c} on={() => a.ctrl(c)} disabled={w.ctrl === c}>
                Control pot: {TROP_CTRL_LABEL[c].toLowerCase()}
              </B>
            ))}
          </Row>
          <div className="mt-2">
            <Row>
              <B brand on={a.pin} disabled={w.pinned}>
                Pin 10 seedlings to the cork (all directions)
              </B>
              <B on={a.moisten} disabled={w.moist}>
                Wet the cotton wool in the jar
              </B>
              <B on={a.klinoSet} disabled={w.klinoSet}>
                A similar set on the clinostat
              </B>
              <B on={() => a.klino(!w.klinoOn)}>{w.klinoOn ? 'Clinostat off' : 'Clinostat on'}</B>
            </Row>
          </div>
        </Box>
      )}
      <Box title={`Day ${w.day}`}>
        {!readOnly && (
          <Row>
            <B on={a.wait} disabled={(!w.box && !w.pinned) || w.day >= 5}>
              Leave 1 day
            </B>
            <B on={a.water} disabled={(!w.box && !w.pinned) || w.waters.includes(w.day)}>
              Water the seedlings
            </B>
            <B brand on={() => a.measure('TEST')} disabled={w.day < 1 || !w.box || w.measures.some((m) => m.day === w.day && m.pot === 'TEST')}>
              Protractor: test shoot
            </B>
            <B brand on={() => a.measure('CTRL')} disabled={w.day < 1 || !w.ctrl || w.measures.some((m) => m.day === w.day && m.pot === 'CTRL')}>
              Protractor: control shoot
            </B>
            <B on={a.count} disabled={!w.pinned || w.day < 1 || w.countAt === w.day}>
              Count the radicles growing down
            </B>
          </Row>
        )}
        {last && (
          <p className="mt-2 text-[12.5px]">
            Protractor: {last.pot === 'TEST' ? 'test' : 'control'} shoot <span className="font-mono text-[15px] font-semibold">{last.deg}°</span> (day {last.day})
          </p>
        )}
        {w.countAt !== null && <p className="mt-1 text-[12.5px]">Counted on day {w.countAt}: look at the cork drawing and count the radicles growing downwards.</p>}
      </Box>
    </div>
  );
}
