import { HARD_LABEL, PH_LETTER, PH_SAMPLES, hardOpenRun, indOpenRun, type ChemAcidsState } from '@aischool/shared';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { notify } from '../../../lab3d-kit/store';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { SOAP_LIQ, fmtClock, type Acids } from '../actions';
import { BalanceDisplay, MeniscusLoupe, SpeedPicker, TubeSwatch, UiChart } from '../parts';
import { dockActions, labelOf, type ActionCtx } from './lab-actions';
import { APPARATUS_LABEL, type ApparatusId } from './scene-state';

/** The acids HUD: the dock (the next object's actions, the burette controls, time-lapse, live readouts) and the close-up reading panel. */

const Bt = ({ children, onClick, blocked, brand, danger }: { children: React.ReactNode; onClick: () => void; blocked?: string; brand?: boolean; danger?: boolean }) => (
  <Button size="sm" variant={brand && !blocked ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && dockButton, blocked && 'opacity-55', danger && !blocked && 'border-red-300/60', 'h-8 px-2 text-[12px]')} aria-disabled={!!blocked} title={blocked} onClick={() => (blocked ? notify(blocked, 'warning', 2400) : onClick())}>
    {children}
  </Button>
);
const run = (m: string | undefined) => m && notify(m, 'warning', 3200);

export function AcidsDock({ ctx, compact }: { ctx: ActionCtx; compact: boolean }) {
  const { x, s } = ctx;
  const d = dockActions(ctx);
  const target = d.target;
  const iRun = x.task === 'IND' ? indOpenRun(s.ind) : null;
  const hRun = x.task === 'HARD' ? hardOpenRun(s.hard) : null;
  // the burette has its own row while a titration is going on
  const actions = (iRun || hRun) && (target === 'flask' || target === 'burette') ? [] : d.actions;
  const name = target ? (APPARATUS_LABEL[target as ApparatusId] ?? labelOf(target, x) ?? target) : null;
  return (
    <div className={cn(dockClass, 'max-w-[min(680px,calc(100vw-1rem))] flex-col items-stretch gap-1.5')} aria-label="Bench controls">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-white/85">
        <Live x={x} s={s} />
        {x.active && <SpeedPicker x={x} dark />}
      </div>
      {iRun && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11.5px] text-white/70">Burette</span>
          <Bt onClick={() => run(x.ops.addAcid(1))}>+1.00</Bt>
          <Bt onClick={() => run(x.ops.addAcid(0.5))}>+0.50</Bt>
          <Bt onClick={() => run(x.ops.addAcid(0.1))}>+0.10</Bt>
          <Bt brand onClick={() => run(x.ops.addAcid(0.05))}>
            One drop
          </Bt>
          <Bt onClick={() => run(x.ops.endPoint())}>End point</Bt>
        </div>
      )}
      {hRun && (
        <div className="flex flex-wrap items-center gap-1">
          <Bt brand={x.look.lather !== 'LASTING'} onClick={() => run(x.ops.addSoap(0.5, 'SHAKE'))}>
            +0.5 cm³, shake
          </Bt>
          <Bt brand={x.look.lather === 'LASTING' && !hRun.watched} onClick={() => run(x.ops.watch())}>
            Wait 2 min
          </Bt>
          <Bt brand={hRun.watched} onClick={() => run(x.ops.finish())}>
            Lather lasts: end point
          </Bt>
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

function Live({ x, s }: { x: Acids; s: ChemAcidsState }) {
  if (x.task === 'PH') {
    const done = PH_SAMPLES.filter((k) => s.ph.tubes[k].compared).length;
    return <span>pH tests: {done}/9 compared{s.ph.rinsed ? '' : ' · tubes not rinsed'}</span>;
  }
  if (x.task === 'IND') {
    const r = indOpenRun(s.ind);
    return <span>{s.ind.burette === null ? 'Burette empty' : `Burette ${s.ind.burette.toFixed(2)} cm³`}{r ? ` · ${r.ind === 'MO' ? 'methyl orange' : 'zobo'} · ${r.added.toFixed(2)} cm³ run in` : ''} · titrations {s.ind.runs.filter((q) => q.done).length}</span>;
  }
  if (x.task === 'ACID') return <span>Balance {x.look.balance.value.toFixed(2)} g{s.acid.added ? ` · ${fmtClock(x.look.acidSec)} · ${x.look.extent < 0.99 ? 'fizzing' : 'stopped fizzing'}` : ''}</span>;
  const r = hardOpenRun(s.hard);
  return <span>{s.hard.burette === null ? 'Soap burette empty' : `Soap burette ${s.hard.burette.toFixed(1)} cm³`}{r ? ` · ${HARD_LABEL[r.sample]}${r.boiled ? ' (boiled)' : ''} · ${r.added.toFixed(1)} cm³ · ${x.look.lather === 'LASTING' ? 'lather' : x.look.lather === 'FROTH' ? 'froth' : x.look.scum ? 'scum' : 'no lather'}` : ''}</span>;
}

/** The close-up: the tubes against the chart, the burette's meniscus and the flask, the balance. */
export function AcidsReadingPanel({ x, s, onBack }: { x: Acids; s: ChemAcidsState; onBack: () => void }) {
  const back = (
    <Button size="sm" variant="outline" className={cn(dockButton, 'h-8')} onClick={onBack}>
      <ArrowLeft /> Back to the bench
    </Button>
  );
  const panel = cn(dockClass, 'absolute bottom-2 right-2 z-20 max-h-[70vh] max-w-[min(460px,calc(100vw-1rem))] flex-col items-stretch overflow-y-auto bg-white/95 text-slate-900 sm:bottom-4 sm:right-4');
  if (x.task === 'PH')
    return (
      <section className={panel} aria-label="The tubes held against the colour chart">
        <UiChart tubes={PH_SAMPLES.filter((k) => s.ph.tubes[k].vol).map((k) => ({ label: PH_LETTER[k], colour: x.look.phColour(k) }))} />
        <p className="text-[12px] text-slate-600">{s.ph.tile ? 'Against the white tile, in daylight.' : 'Against the dark bench — use the white tile.'} Record each pH as a whole number.</p>
        {back}
      </section>
    );
  if (x.task === 'IND') {
    const r = indOpenRun(s.ind);
    return (
      <section className={panel} aria-label="The burette and the flask">
        <div className="flex flex-wrap items-end gap-3">
          <MeniscusLoupe level={s.ind.burette} id="ind3d" />
          <div className="flex flex-col items-center gap-1">
            <TubeSwatch label="flask" colour={x.look.flask} />
            <span className="max-w-[120px] text-center text-[11px] text-slate-600">{r ? `${r.ind === 'MO' ? 'Methyl orange' : 'Zobo extract'} · ${r.added.toFixed(2)} cm³ run in` : 'No titration running.'}</span>
          </div>
        </div>
        {r && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={() => run(x.ops.addAcid(0.05))}>
              One drop
            </Button>
            <Button size="sm" variant="brand" onClick={() => run(x.ops.endPoint())}>
              End point
            </Button>
          </div>
        )}
        {back}
      </section>
    );
  }
  if (x.task === 'ACID')
    return (
      <section className={panel} aria-label="The balance">
        <BalanceDisplay value={x.look.balance.value} label={x.look.balance.what === 'total' ? 'Flask + contents' : x.look.balance.what === 'flask' ? 'Flask + acid + plug' : x.look.balance.what === 'chips' ? 'Marble chips' : 'Empty pan'} />
        {s.acid.added && <p className="text-[12px]">{fmtClock(x.look.acidSec)} after adding the marble · {x.look.extent < 0.99 ? 'still fizzing' : 'no more bubbles'}</p>}
        <div className="flex flex-wrap gap-1.5">
          {s.acid.added && (
            <Button size="sm" variant="brand" onClick={() => run(x.ops.weighTotal()) || notify('Reading taken: write it in your notebook.', 'info', 2000)}>
              Take this reading
            </Button>
          )}
          {back}
        </div>
      </section>
    );
  const r = hardOpenRun(s.hard);
  return (
    <section className={panel} aria-label="The soap burette">
      <MeniscusLoupe level={s.hard.burette} liquid={SOAP_LIQ} id="hard3d" caption="Soap solution: read to 0.1 cm³" />
      <p className="text-[12px]">{r ? `${HARD_LABEL[r.sample]}${r.boiled ? ' (boiled)' : ''}: ${r.added.toFixed(1)} cm³ of soap run in. ${x.look.lather === 'LASTING' ? 'Thick lather.' : x.look.lather === 'FROTH' ? 'A froth that soon breaks.' : 'No lather.'}` : 'No sample in the flask.'}</p>
      {back}
    </section>
  );
}
