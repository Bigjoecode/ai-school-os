import { EN_VOLS, SOLY_ADDS, SOLY_WATER0, type ChemEnergeticsState } from '@aischool/shared';
import { ArrowDown, ArrowUp, Eye, Flame, RotateCw, Save, Snowflake, Sparkles, Thermometer, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLabView, type DragState } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { halfDegree, nextKind, openRun, openTube, useLive, type Energetics } from '../actions';
import { SpeedPicker, ThermoLoupe, clockText } from '../parts';
import { useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The energetics HUD: the dock (set up, then each step), the eye-level reading panel and the drag feedback. */

const Bt = ({ children, onClick, blocked, brand, label, className }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; className?: string }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', 'h-8 px-2 text-[12px]', className)} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const sel = 'h-8 rounded-md border border-white/20 bg-white/10 px-1 text-[12px] text-white [&>option]:text-slate-900';

export function EnDock({ o, s, scene, ops, compact }: { o: Energetics; s: ChemEnergeticsState; scene: SceneState; ops: Ops; compact: boolean }) {
  const task = s.task ?? 'NEUT';
  useLive(o.cupLive() || o.phase() !== 'idle' || !!o.thermoWhere(), 150);
  const b = useBench();
  if (!scene.set) {
    if (task === 'SOLY')
      return (
        <div className={dockClass} aria-label="Set up">
          {scene.nextPlace && (
            <Bt brand onClick={ops.placeNext} blocked={ops.why.place}>
              {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
            </Bt>
          )}
        </div>
      );
    return (
      <div className={dockClass} aria-label="Set up">
        <Bt brand onClick={() => ops.vessel('CUP')} blocked={ops.why.vessel}>
          Use the polystyrene cup
        </Bt>
        {scene.collected.has('glassBeaker') && (
          <Bt onClick={() => ops.vessel('BEAKER')} blocked={ops.why.vessel}>
            Use the glass beaker
          </Bt>
        )}
      </div>
    );
  }
  const temp = (
    <span className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-[13px] tabular" aria-label="Thermometer">
      <Thermometer className="mr-1 inline size-3.5" aria-hidden />
      {o.thermoWhere() || task === 'SOLY' ? `≈${halfDegree(task === 'SOLY' ? o.tubeThermo() : o.thermoNow())} °C` : '—'}
    </span>
  );
  if (task === 'SOLY') {
    const t = openTube(s);
    const ph = o.phase();
    const first = s.soly.runs.length === 0;
    return (
      <div className={cn(dockClass, 'max-w-[min(640px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="Solubility">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-white/80">{t ? `${t.r.water.toFixed(1)} cm³ water · ${ph === 'heat' ? 'warming' : ph === 'cool' ? (o.crystalsShown() ? 'crystals!' : 'cooling') : 'in the rack'}` : `${s.soly.runs.filter((r) => r.done).length} saturation temperatures`}</span>
          {temp}
          <SpeedPicker speed={o.speed} onSpeed={o.setSpeed} dark />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {s.soly.mass === null && (
            <Bt brand onClick={() => ops.kno3(4)} blocked={ops.why.kno3}>
              Weigh 4.0 g KNO₃
            </Bt>
          )}
          {s.soly.mass !== null && !t && (
            <>
              {first ? (
                <Bt brand onClick={() => ops.water(SOLY_WATER0)} blocked={ops.why.water}>
                  Burette: {SOLY_WATER0.toFixed(1)} cm³ water
                </Bt>
              ) : (
                <>
                  <select className={sel} value={b.add} onChange={(e) => b.set({ add: Number(e.target.value) })} aria-label="Water to add">
                    {SOLY_ADDS.map((x) => (
                      <option key={x} value={x}>
                        +{x.toFixed(1)} cm³
                      </option>
                    ))}
                  </select>
                  <Bt brand onClick={() => ops.water(b.add)} blocked={ops.why.water}>
                    Add water
                  </Bt>
                </>
              )}
            </>
          )}
          {t && ph !== 'heat' && (
            <Bt brand={ph === 'idle'} onClick={() => ops.heat('BATH')} blocked={ops.why.heat}>
              Into the bath
            </Bt>
          )}
          {t && ph !== 'heat' && scene.collected.has('burner') && (
            <Bt onClick={() => ops.heat('FLAME')} blocked={ops.why.heat}>
              <Flame /> {compact ? '' : 'Flame'}
            </Bt>
          )}
          {ph === 'heat' && (
            <Bt brand={o.solidLeft() < 0.001} onClick={ops.cool}>
              <Snowflake /> Take out to cool
            </Bt>
          )}
          {t && (
            <Bt brand={!o.stirring() && ph === 'cool'} onClick={() => ops.tubeStir()} label={o.stirring() ? 'Stop stirring' : 'Stir'}>
              <RotateCw /> {o.stirring() ? 'Stirring' : 'Stir'}
            </Bt>
          )}
          {t && ph === 'cool' && (
            <Bt brand onClick={ops.crystals}>
              <Sparkles /> Crystals!
            </Bt>
          )}
          {t && (
            <Bt onClick={() => useLabView.getState().set({ mode: 'read', selected: null, spot: null })}>
              <Eye /> {compact ? '' : 'Eye level'}
            </Bt>
          )}
        </div>
      </div>
    );
  }
  const r = openRun(s);
  const neut = task === 'NEUT';
  const kind = r?.r.kind === 'NAOH' || (!r && nextKind(s) === 'NAOH') ? 'NAOH' : 'SALT';
  return (
    <div className={cn(dockClass, 'max-w-[min(640px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label={neut ? 'Heat of neutralisation' : 'Heat of solution'}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] text-white/80">{r ? (r.r.mixed ? `${clockText(o.tMix())} since mixing` : `${r.r.volA} cm³ in the cup`) : `${s.runs.filter((x) => x.done).length} run(s) done`}</span>
        {temp}
        <SpeedPicker speed={o.speed} onSpeed={o.setSpeed} dark />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!s.setup.support && !r && (
          <Bt onClick={ops.support} blocked={ops.why.vessel}>
            Stand the cup in the beaker
          </Bt>
        )}
        {!r && (
          <>
            <select className={sel} value={b.volA} onChange={(e) => b.set({ volA: Number(e.target.value) })} aria-label={neut ? 'Volume of acid' : 'Volume of water'}>
              {EN_VOLS.map((x) => (
                <option key={x} value={x}>
                  {x}.0 cm³
                </option>
              ))}
            </select>
            <Bt brand onClick={() => ops.measureA(b.volA)} blocked={ops.why.measureA}>
              {neut ? 'Acid into the cup' : kind === 'NAOH' ? 'Fresh water into the cup' : 'Water into the cup'}
            </Bt>
          </>
        )}
        {r && !r.r.mixed && (
          <>
            <Bt brand={o.thermoWhere() !== 'A' && !r.r.readA} onClick={() => ops.thermoTo('A')} blocked={ops.why.thermo}>
              <Thermometer /> {neut ? 'In acid' : 'In water'}
            </Bt>
            {neut && r.r.volB === 0 && (
              <>
                <select className={sel} value={b.volB} onChange={(e) => b.set({ volB: Number(e.target.value) })} aria-label="Volume of alkali">
                  {EN_VOLS.map((x) => (
                    <option key={x} value={x}>
                      {x}.0 cm³
                    </option>
                  ))}
                </select>
                <Bt brand={r.r.readA} onClick={() => ops.measureB(b.volB)} blocked={ops.why.measureB}>
                  Alkali into cylinder
                </Bt>
              </>
            )}
            {neut && r.r.volB > 0 && (
              <Bt brand={o.thermoWhere() !== 'B' && !r.r.readB} onClick={() => ops.thermoTo('B')} blocked={ops.why.thermo}>
                <Thermometer /> In alkali
              </Bt>
            )}
            {!neut && r.r.solid === 0 && (
              <>
                <select className={sel} value={b.mass} onChange={(e) => b.set({ mass: Number(e.target.value) })} aria-label="Mass">
                  {[1, 2, 4, 8].map((x) => (
                    <option key={x} value={x}>
                      {x.toFixed(2)} g
                    </option>
                  ))}
                </select>
                <Bt brand={kind === 'SALT' && r.r.readA} onClick={() => ops.weigh('SALT', b.mass)} blocked={ops.why.weigh}>
                  Weigh NH₄NO₃
                </Bt>
                <Bt brand={kind === 'NAOH' && r.r.readA} onClick={() => ops.weigh('NAOH', b.mass)} blocked={ops.why.weigh}>
                  Weigh NaOH
                </Bt>
              </>
            )}
            <Bt onClick={ops.read} blocked={ops.why.read} label="Take a thermometer reading">
              Take reading
            </Bt>
            <Bt brand={r.r.readA && (neut ? r.r.readB : r.r.solid > 0)} onClick={ops.mix} blocked={ops.why.mix}>
              {neut ? 'Pour B in quickly' : 'Tip the solid in'}
            </Bt>
          </>
        )}
        {r?.r.mixed && (
          <>
            <Bt brand={r.r.lidAt === null} onClick={ops.lid} blocked={ops.why.lid}>
              Lid on
            </Bt>
            <Bt brand={r.r.stirAt === null} onClick={ops.stir} blocked={ops.why.stir}>
              <RotateCw /> Stir
            </Bt>
            <Bt onClick={ops.read} label="Take a thermometer reading now">
              Take reading
            </Bt>
            <Bt onClick={() => useLabView.getState().set({ mode: 'read', selected: null, spot: null })}>
              <Eye /> {compact ? '' : 'Eye level'}
            </Bt>
            <Bt onClick={ops.finish}>
              <Save /> Finish
            </Bt>
          </>
        )}
        {r && (
          <Bt onClick={ops.pourAway} label="Pour away">
            <Trash2 />
          </Bt>
        )}
      </div>
    </div>
  );
}

/** Eye-level reading: the thermometer close-up, with the notebook cells it belongs in. */
export function EnReadingPanel({ o, s, ops, onBack }: { o: Energetics; s: ChemEnergeticsState; ops: Ops; onBack: () => void }) {
  const eye = useLabView((v) => v.eye);
  const setView = useLabView((v) => v.set);
  const snap = useBench((b) => b.snap);
  useLive(o.cupLive() || o.phase() !== 'idle' || !!o.thermoWhere(), 100);
  const level = Math.abs(eye) < 0.004 ? 'level' : eye > 0 ? 'above' : 'below';
  const nudge = (d: number) => setView({ eye: Math.max(-0.05, Math.min(0.05, eye + d)) });
  const task = s.task ?? 'NEUT';
  const soly = task === 'SOLY';
  const temp = soly ? o.tubeThermo() : o.thermoNow();
  const r = openRun(s) ?? (s.runs.length ? { i: s.runs.length - 1, r: s.runs.at(-1)! } : null);
  const t = openTube(s) ?? (s.soly.runs.length ? { i: s.soly.runs.length - 1, r: s.soly.runs.at(-1)! } : null);
  const where = o.thermoWhere();
  const key: 'a' | 'b' | 'extreme' = !r?.r.mixed ? (where === 'B' ? 'b' : 'a') : 'extreme';
  const cellLabel = key === 'a' ? (task === 'NEUT' ? 'Acid θ / °C' : 'Initial θ / °C') : key === 'b' ? 'Alkali θ / °C' : r?.r.kind === 'SALT' ? 'Lowest θ / °C' : 'Highest θ / °C';
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-w-lg rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label="Reading the thermometer">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
          <Eye className="size-4 text-muted-foreground" aria-hidden /> Read the thermometer
        </p>
        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-medium', level === 'level' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')} aria-live="polite">
          {level === 'level' ? 'Eye level' : `Eye ${level}`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <ThermoLoupe temp={temp} caption={snap ? `Your last reading: about ${halfDegree(snap.value)} °C (${snap.label}).` : undefined} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1">
            <Button size="icon-sm" variant="outline" onClick={() => nudge(0.002)} aria-label="Raise your eye">
              <ArrowUp />
            </Button>
            <Button size="icon-sm" variant="outline" onClick={() => nudge(-0.002)} aria-label="Lower your eye">
              <ArrowDown />
            </Button>
            {!soly && r?.r.mixed && <span className="self-center rounded-md bg-muted px-2 py-0.5 font-mono text-[13px] tabular">{clockText(o.tMix())}</span>}
          </div>
          {soly ? (
            <>
              <Button size="sm" variant="brand" onClick={ops.crystals} aria-disabled={!!ops.why.crystals}>
                <Sparkles /> Crystals appear — read now
              </Button>
              {t && (
                <label className="block text-[11.5px] text-muted-foreground">
                  θ / °C (run {t.i + 1}, {t.r.water.toFixed(1)} cm³)
                  <Input value={s.solyTable[t.i]?.temp ?? ''} onChange={(e) => o.update((x) => ({ ...x, solyTable: x.solyTable.map((row, k) => (k === t.i ? { ...row, temp: e.target.value.slice(0, 40) } : row)) }))} inputMode="decimal" className="mt-0.5 h-9 w-[92px] tabular" />
                </label>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="brand" onClick={ops.read} aria-disabled={!!ops.why.read}>
                <Thermometer /> Read now
              </Button>
              {r && (
                <label className="block text-[11.5px] text-muted-foreground">
                  {cellLabel} (run {r.i + 1})
                  <Input value={s.table[r.i]?.[key] ?? ''} onChange={(e) => o.update((x) => ({ ...x, table: x.table.map((row, k) => (k === r.i ? { ...row, [key]: e.target.value.slice(0, 40) } : row)) }))} inputMode="decimal" className="mt-0.5 h-9 w-[92px] tabular" />
                </label>
              )}
            </>
          )}
          <Button size="sm" variant="outline" onClick={onBack}>
            Back to bench
          </Button>
        </div>
      </div>
    </section>
  );
}

export function EnDragFeedback({ drag }: { drag: DragState }) {
  const pill = 'absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg';
  if (drag.kind === 'swirl') return <span className={pill}>Stirring — keep moving in circles ({Math.round(drag.value * 100)} %)</span>;
  return null;
}
