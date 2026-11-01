import { type ChemSaltsState } from '@aischool/shared';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { notify } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { mpBalance, pptBalance, solView, type Flame, type Salts } from '../actions';
import { BalanceDisplay, PaperSvg, SpeedPicker, ThermoLoupe, fmtClock } from '../parts';
import { dockActions, LABELS, type ActionCtx } from './lab-actions';
import { APPARATUS_LABEL, type ApparatusId } from './scene-state';

/** The salts HUD: the dock (the next object's actions, the burner, time-lapse, live readouts) and the close-up reading panel. */

const Bt = ({ children, onClick, blocked, brand, label, danger }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; danger?: boolean }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', danger && !blocked && 'border-red-300/60', 'h-8 px-2 text-[12px]')} aria-disabled={!!blocked} title={blocked} aria-label={label} onClick={() => (blocked ? notify(blocked, 'warning', 2400) : onClick())}>
    {children}
  </Button>
);

export function SaltsDock({ ctx, compact }: { ctx: ActionCtx; compact: boolean }) {
  const { x, s } = ctx;
  const { target, actions } = dockActions(ctx);
  const heat = x.task === 'SOL' || x.task === 'MP';
  const name = target ? (APPARATUS_LABEL[target as ApparatusId] ?? LABELS[target] ?? target) : null;
  return (
    <div className={cn(dockClass, 'max-w-[min(640px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="Bench controls">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-white/85">
        <Live x={x} s={s} />
        {x.active && <SpeedPicker x={x} dark />}
      </div>
      {heat && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11.5px] text-white/70">Burner</span>
          {(['OFF', 'LOW', 'HIGH'] as Flame[]).map((f) => (
            <Bt key={f} brand={x.bench.flame === f} onClick={() => x.note(`burner:${f}`)} blocked={!ctx.scene.collected.has('burner') ? 'Collect the Bunsen burner first.' : undefined}>
              {f === 'OFF' ? 'Off' : f === 'LOW' ? 'Low' : 'High'}
            </Bt>
          ))}
        </div>
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {!compact && name && <span className="text-[11.5px] text-white/70">{name}:</span>}
          {actions.map((a) => (
            <Bt key={a.key} brand={a.tone === 'brand'} danger={a.tone === 'danger'} blocked={a.blocked} onClick={a.run}>
              {a.label}
            </Bt>
          ))}
        </div>
      )}
    </div>
  );
}

function Live({ x, s }: { x: Salts; s: ChemSaltsState }) {
  if (x.task === 'SOL') {
    const w = s.sol;
    if (w.acid !== null && !w.filtered) return <span>Acid {Math.round(x.look.acidT)} °C · CuO {w.portions} spatula{w.portions === 1 ? '' : 's'}{solView(x, s).excess ? ' · excess (black solid left)' : ''}</span>;
    if (w.filtered && w.filteredAt === null) return <span>{w.dry ? 'Dish dry: white powder' : `Dish ${Math.round(x.look.dishT)} °C · ${x.look.dishW.toFixed(1)} g water${solView(x, s).crystals > 0.001 ? ' · crystals growing' : ''}`}</span>;
    return <span>{w.weighed ? `Balance ${solView(x, s).product.mass.toFixed(2)} g` : 'Soluble salt'}</span>;
  }
  if (x.task === 'PPT') return <span>{s.ppt.weighings.length ? `Balance ${pptBalance(x, s)?.toFixed(2)} g` : s.ppt.paper ? `Filter paper ${x.v.ppt.paper.toFixed(2)} g` : 'Insoluble salt'}</span>;
  if (x.task === 'CHROM') {
    const w = s.chrom;
    if (w.inTank) return <span>Running {fmtClock(x.look.devSeconds)} · front {(x.look.front - (w.lineAt ?? 0)).toFixed(1)} cm above the baseline · lid {w.covered ? 'on' : 'OFF'}</span>;
    return <span>{w.developed !== null ? (w.frontMarked ? 'Front marked' : w.dried ? 'Front faded' : 'Mark the front!') : w.line ? `Baseline ${w.line === 'PENCIL' ? 'pencil' : 'ink'} at ${w.lineAt} cm` : 'Chromatography'}</span>;
  }
  const open = x.openRun();
  return <span>{x.bench.gauze === 'oil' || s.mp.runs.length ? `Oil ${x.look.bathT.toFixed(1)} °C (${x.look.bathRate >= 0 ? '+' : ''}${x.look.bathRate.toFixed(1)} °C/min)${open ? ` · ${open.sample === 'PURE' ? 'recrystallised' : 'impure'} ${x.look.melt <= 0 ? 'solid' : x.look.melt >= 1 ? 'clear' : 'melting'}` : ''}` : `Water ${s.mp.water} cm³`}</span>;
}

/** The close-up: the balance (salts), the chromatogram with its ruler, the thermometer and capillary. */
export function SaltsReadingPanel({ x, s, onBack }: { x: Salts; s: ChemSaltsState; onBack: () => void }) {
  const back = (
    <Button size="sm" variant="outline" className={cn(dockButton, 'h-8')} onClick={onBack}>
      <ArrowLeft /> Back to the bench
    </Button>
  );
  if (x.task === 'CHROM')
    return (
      <section className={cn(dockClass, 'max-h-[80vh] flex-col items-stretch overflow-y-auto bg-white/95 text-slate-900')} aria-label="The chromatogram and ruler">
        <p className="text-[12px]">Measure from the baseline to the centre of each spot and to the solvent front, to the nearest mm.</p>
        <PaperSvg v={x.v} w={s.chrom} t={x.look.devSeconds} px={34} className="h-[560px] w-auto self-center" />
        {back}
      </section>
    );
  if (x.task === 'MP') {
    const open = x.openRun();
    return (
      <section className={cn(dockClass, 'flex-col items-stretch bg-white/95 text-slate-900')} aria-label="Thermometer and capillary">
        <ThermoLoupe T={x.look.bathT} melt={open ? x.look.melt : null} sample={open?.sample} attached={open?.attached} />
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="brand" onClick={() => notify(x.ops.recordStart() ?? 'Reading taken: melting started.', 'info', 2200)} disabled={!!x.why.start}>
            Melting starts
          </Button>
          <Button size="sm" variant="brand" onClick={() => notify(x.ops.recordEnd() ?? 'Reading taken: completely melted.', 'info', 2200)} disabled={!!x.why.end}>
            All melted
          </Button>
          {back}
        </div>
      </section>
    );
  }
  const value = x.task === 'SOL' ? (s.sol.weighed ? solView(x, s).product.mass : null) : pptBalance(x, s) ?? (s.ppt.paper ? x.v.ppt.paper : null);
  void mpBalance;
  return (
    <section className={cn(dockClass, 'flex-col items-stretch')} aria-label="The balance">
      <BalanceDisplay value={value} label="Record every digit (2 d.p.)" />
      {back}
    </section>
  );
}
