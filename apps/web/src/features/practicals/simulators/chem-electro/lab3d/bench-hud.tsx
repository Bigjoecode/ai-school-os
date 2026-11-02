import { type ChemElectroState } from '@aischool/shared';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { notify } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { dispBalance, elecBalance, fmtClock, fmtDays, type Electro } from '../actions';
import { AmmeterFace, BalanceDisplay, GradTubeLoupe, SpeedPicker, StopwatchDisplay, ThermoLoupe, VoltmeterDisplay } from '../parts';
import { dockActions, LABELS, type ActionCtx } from './lab-actions';
import { APPARATUS_LABEL, type ApparatusId } from './scene-state';

/** The electrochemistry HUD: the dock (the next object's actions, the key and rheostat, time-lapse, live readouts) and the close-up reading panel. */

const Bt = ({ children, onClick, blocked, brand, danger }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; danger?: boolean }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', danger && !blocked && 'border-red-300/60', 'h-8 px-2 text-[12px]')} aria-disabled={!!blocked} title={blocked} onClick={() => (blocked ? notify(blocked, 'warning', 2400) : onClick())}>
    {children}
  </Button>
);
const run = (m: string | undefined) => m && notify(m, 'warning', 3000);

export function ElectroDock({ ctx, compact }: { ctx: ActionCtx; compact: boolean }) {
  const { x, s } = ctx;
  const d = dockActions(ctx);
  const target = d.target;
  // the rheostat and the key have their own row while the circuit is connected
  const actions = x.task === 'ELEC' && ctx.s.elec.connected && !ctx.s.elec.removed && (target === 'rheostat' || target === 'key') ? [] : d.actions;
  const name = target ? (APPARATUS_LABEL[target as ApparatusId] ?? LABELS[target] ?? target) : null;
  const e = s.elec;
  return (
    <div className={cn(dockClass, 'max-w-[min(660px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="Bench controls">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-white/85">
        <Live x={x} s={s} />
        {x.active && <SpeedPicker x={x} dark />}
      </div>
      {x.task === 'ELEC' && e.connected && !e.removed && (
        <div className="flex flex-wrap items-center gap-1">
          <Bt brand={!e.closed} onClick={() => run(e.closed ? x.ops.openKey() : x.ops.closeKey())}>
            {e.closed ? 'Open key' : 'Close key'}
          </Bt>
          <span className="text-[11.5px] text-white/70">Rheostat</span>
          <Bt onClick={() => run(x.ops.rheostat(-4))}>◀◀</Bt>
          <Bt onClick={() => run(x.ops.rheostat(-1))}>◀ less R</Bt>
          <Bt onClick={() => run(x.ops.rheostat(1))}>more R ▶</Bt>
          <Bt onClick={() => run(x.ops.rheostat(4))}>▶▶</Bt>
        </div>
      )}
      {x.task === 'RUST' && s.rust.started && (
        <div className="flex flex-wrap items-center gap-1">
          <Bt onClick={() => x.skip(86_400_000)}>+1 day</Bt>
          <Bt onClick={() => run(x.ops.level())} brand={!x.look.levelled}>
            Level the tube
          </Bt>
          <Bt onClick={() => run(x.ops.readVolume())}>Read the volume</Bt>
          <Bt onClick={() => run(x.ops.observe())}>Look at the tubes</Bt>
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

function Live({ x, s }: { x: Electro; s: ChemElectroState }) {
  if (x.task === 'ELEC') {
    const e = s.elec;
    if (!e.connected) return <span>{e.weighedBefore ? 'Plates weighed' : e.sanded ? 'Plates clean' : 'Electrolysis'}</span>;
    return (
      <span>
        {e.closed ? `${x.look.current.toFixed(2)} A` : 'Key open'} · stopwatch {fmtClock(x.look.run)}
        {e.removed ? ' · plates out' : ''}
      </span>
    );
  }
  if (x.task === 'CELL') return <span>{x.look.volts === null ? 'Voltmeter not connected' : `Voltmeter ${x.look.volts.toFixed(2)} V`} · bridge {s.cell.bridge ? (s.cell.soaked ? 'in' : 'in (dry!)') : 'out'}</span>;
  if (x.task === 'DISP') {
    const d = s.disp;
    if (!d.added) return <span>{d.taps ? `Iron ${x.look.fe.toFixed(2)} g` : 'Displacement'}{d.thermo ? ` · ${x.look.temp.toFixed(1)} °C` : ''}</span>;
    if (!d.filtered) return <span>{Math.round(x.look.extent * 100)} % reacted · {fmtClock(x.look.dispSec)}{d.watched ? ` · ${x.look.temp.toFixed(1)} °C` : ''}</span>;
    return <span>{d.weighed ? `Paper + copper ${dispBalance(x, s)?.toFixed(2)} g` : 'Copper filtered off'}</span>;
  }
  return <span>{s.rust.started ? fmtDays(x.look.day) : 'Rusting'}{s.rust.wool ? ` · tube ${x.look.volume.toFixed(1)} cm³${x.look.levelled ? ' (levelled)' : ''}` : ''}</span>;
}

/** The close-up: the ammeter and stopwatch (and balance), the voltmeter, the thermometer, the graduated tube. */
export function ElectroReadingPanel({ x, s, onBack }: { x: Electro; s: ChemElectroState; onBack: () => void }) {
  const back = (
    <Button size="sm" variant="outline" className={cn(dockButton, 'h-8')} onClick={onBack}>
      <ArrowLeft /> Back to the bench
    </Button>
  );
  const panel = cn(dockClass, 'max-h-[80vh] flex-col items-stretch overflow-y-auto bg-white/95 text-slate-900');
  if (x.task === 'ELEC') {
    const bal = elecBalance(x, s);
    return (
      <section className={panel} aria-label="Ammeter, stopwatch and balance">
        <div className="flex flex-wrap items-end gap-3">
          <AmmeterFace amps={x.look.current} />
          <StopwatchDisplay sec={x.look.run} running={s.elec.closed} />
        </div>
        {bal && (
          <div className="flex flex-wrap gap-3">
            <BalanceDisplay value={bal.cath} label={`Cathode (${s.elec.weighedAfter ? 'after' : 'before'})`} />
            <BalanceDisplay value={bal.an} label={`Anode (${s.elec.weighedAfter ? 'after' : 'before'})`} />
          </div>
        )}
        {s.elec.connected && !s.elec.removed && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => run(x.ops.rheostat(-1))}>
              ◀ less R
            </Button>
            <Button size="sm" variant="outline" onClick={() => run(x.ops.rheostat(1))}>
              more R ▶
            </Button>
          </div>
        )}
        {back}
      </section>
    );
  }
  if (x.task === 'CELL')
    return (
      <section className={panel} aria-label="The voltmeter">
        <VoltmeterDisplay volts={x.look.volts} label={s.cell.meter === 'LOW' ? 'moving-coil voltmeter' : 'high-resistance voltmeter'} />
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="brand" onClick={() => notify(x.ops.readMeter() ?? 'Reading taken.', 'info', 2000)} disabled={!!x.why.read}>
            Take the reading
          </Button>
          {back}
        </div>
      </section>
    );
  if (x.task === 'DISP') {
    const bal = dispBalance(x, s);
    return (
      <section className={panel} aria-label="Thermometer and balance">
        <div className="flex flex-wrap items-end gap-3">
          {s.disp.thermo && <ThermoLoupe temp={x.look.temp} caption="°C — to the nearest 0.5 °C" />}
          <BalanceDisplay value={bal} label="Balance" />
        </div>
        {back}
      </section>
    );
  }
  return (
    <section className={panel} aria-label="Graduated tube">
      <GradTubeLoupe vol={x.look.volume} levelled={x.look.levelled} />
      <p className="text-[12px]">{fmtDays(x.look.day)}</p>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => run(x.ops.level())}>
          Level the water
        </Button>
        <Button size="sm" variant="brand" onClick={() => run(x.ops.readVolume()) || notify('Reading taken: write it in your notebook.', 'info', 2000)} disabled={!!x.why.readVol}>
          Read the volume
        </Button>
        {back}
      </div>
    </section>
  );
}
