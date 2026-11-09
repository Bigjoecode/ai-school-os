import type { GenCheckResult, GenOption, GenToolShape } from '@aischool/shared';
import { ArrowDown, ArrowUp, Backpack, Book, Box, Brush, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, CookingPot, Drill, Drum, FileText, FlaskConical, Gauge, Glasses, Hammer, Hand, Leaf, Lightbulb, type LucideIcon, Music, Package, Paintbrush, Pencil, Piano, Ruler, Scale, ShieldCheck, Shirt, Slice, Soup, Spline, SquareDashed, Utensils, UtensilsCrossed, Wind, Wrench, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { GEN_STAGES, stageDone, type GenHandle } from './actions';

/** Light icons for a cheap phone: the 2D bench needs no pictures beyond these. */
const ICONS: Record<GenToolShape, LucideIcon> = {
  saw: Slice,
  hammer: Hammer,
  chisel: Pencil,
  plane: Package,
  square: SquareDashed,
  rule: Ruler,
  gauge: Gauge,
  clamp: Wrench,
  screwdriver: Wrench,
  spanner: Wrench,
  pliers: Wrench,
  drill: Drill,
  brush: Paintbrush,
  bottle: FlaskConical,
  jar: Box,
  bowl: Soup,
  pot: CookingPot,
  pan: CookingPot,
  knife: UtensilsCrossed,
  spoon: Utensils,
  board: SquareDashed,
  scale: Scale,
  stove: CookingPot,
  book: Book,
  paper: FileText,
  pencil: Pencil,
  gloves: Hand,
  goggles: Glasses,
  apron: Shirt,
  mask: Wind,
  instrument: Music,
  drum: Drum,
  keyboard: Piano,
  meter: Gauge,
  wire: Spline,
  tray: Backpack,
  box: Package,
  cloth: Brush,
  plant: Leaf,
  generic: Package,
};
export const ToolIcon = ({ shape, className }: { shape: GenToolShape; className?: string }) => {
  const I = ICONS[shape];
  return <I className={className} aria-hidden />;
};

function Note({ r }: { r?: GenCheckResult }) {
  if (!r) return null;
  return (
    <p role="status" className={cn('mt-2 flex items-start gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px]', r.ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
      {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span>{r.message}</span>
    </p>
  );
}
const whyOf = (r: GenCheckResult | undefined, id: string) => r?.wrong.find((w) => w.id === id)?.why;
const isRight = (h: GenHandle, id: string) => h.paper.reveal?.correct.includes(id) ?? null;

/** One selectable line: a big tap target. Tone shows only what the server has said. */
function Tick({ on, children, onClick, disabled, why, right, radio }: { on: boolean; children: ReactNode; onClick: () => void; disabled: boolean; why?: string; right?: boolean | null; radio?: boolean }) {
  return (
    <li>
      <button
        type="button"
        role={radio ? 'radio' : 'checkbox'}
        aria-checked={on}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex min-h-11 w-full items-start gap-2.5 rounded-xl border px-3 py-2 text-left text-[13.5px] leading-snug transition-colors',
          on ? 'border-brand bg-brand-soft' : 'border-border hover:bg-muted/60',
          why && 'border-warning bg-warning-soft/60',
          right === true && 'border-success/60',
          right === false && on && 'border-danger/60',
        )}
      >
        <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center border', radio ? 'rounded-full' : 'rounded-md', on ? 'border-brand bg-brand text-white' : 'border-border')}>{on && <CheckCircle2 className="size-3.5" aria-hidden />}</span>
        <span className="min-w-0 flex-1">
          {children}
          {why && <span className="mt-1 block text-[12.5px] text-warning">{why}</span>}
        </span>
      </button>
    </li>
  );
}

const CheckBtn = ({ h, id, onClick, label = 'Check' }: { h: GenHandle; id: string; onClick: () => void; label?: string }) =>
  h.canCheck ? (
    <Button size="sm" variant="outline" className="mt-2" onClick={onClick} loading={h.busy === id}>
      <Lightbulb /> {label}
    </Button>
  ) : null;

function SafetyStage({ h }: { h: GenHandle }) {
  const r = h.results.safety;
  return (
    <>
      <p className="text-[13.5px] text-muted-foreground">Choose everything that is right for this job. Some of these are bad practice: leave them out.</p>
      <ul className="mt-2 grid gap-1.5">
        {h.paper.safety.map((o) => (
          <Tick key={o.id} on={h.s.safety.includes(o.id)} disabled={h.readOnly} onClick={() => (h.clearResult('safety'), h.toggle('safety', o.id))} why={whyOf(r, o.id)} right={isRight(h, o.id)}>
            {o.text}
          </Tick>
        ))}
      </ul>
      <CheckBtn h={h} id="safety" label="Check my safety choices" onClick={() => void h.runCheck('safety', { section: 'safety', pick: h.s.safety })} />
      <Note r={r} />
    </>
  );
}

function SetOutStage({ h }: { h: GenHandle }) {
  const r = h.results.tools;
  return (
    <>
      <p className="text-[13.5px] text-muted-foreground">Take what this job needs from the bench. Things it does not need only get in the way.</p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {h.paper.tools.map((t) => (
          <Tick key={t.id} on={h.s.tools.includes(t.id)} disabled={h.readOnly} onClick={() => (h.clearResult('tools'), h.toggle('tools', t.id))} why={whyOf(r, t.id)} right={isRight(h, t.id)}>
            <span className="flex items-center gap-2">
              <ToolIcon shape={t.shape} className="size-4 shrink-0 text-muted-foreground" /> {t.text}
            </span>
          </Tick>
        ))}
      </ul>
      <CheckBtn h={h} id="tools" label="Check my bench" onClick={() => void h.runCheck('tools', { section: 'tools', pick: h.s.tools })} />
      <Note r={r} />
    </>
  );
}

function Options({ h, list, item, options, resultKey, section }: { h: GenHandle; list: 'decisions' | 'observations'; item: string; options: GenOption[]; resultKey: string; section: 'decision' | 'observation' }) {
  const r = h.results[resultKey];
  return (
    <>
      <ul className="mt-1.5 grid gap-1.5" role="radiogroup">
        {options.map((o) => (
          <Tick
            key={o.id}
            radio
            on={h.s[list][item] === o.id}
            disabled={h.readOnly}
            right={isRight(h, o.id)}
            onClick={() => {
              h.choose(list, item, o.id);
              // Guided: the consequence comes straight away; in an exam nothing does.
              void h.runCheck(resultKey, { section, id: item, pick: [o.id] });
            }}
          >
            {o.text}
          </Tick>
        ))}
      </ul>
      <Note r={r} />
    </>
  );
}

function ProcedureStage({ h }: { h: GenHandle }) {
  const { steps, decisions } = h.paper;
  const text = (id: string) => steps.find((x) => x.id === id)?.text ?? '';
  const left = steps.filter((x) => !h.s.order.includes(x.id));
  const r = h.results.order;
  return (
    <>
      <p className="text-[13.5px] text-muted-foreground">Tap the steps in the order you would do them. Use the arrows to change your mind.</p>
      {h.s.order.length > 0 && (
        <ol className="mt-2 grid gap-1.5">
          {h.s.order.map((id, i) => (
            <li key={id} className={cn('flex items-start gap-2 rounded-xl border border-brand/40 bg-brand-soft/50 px-2.5 py-2 text-[13.5px] leading-snug', h.paper.reveal && h.paper.reveal.order[i] !== id && 'border-danger/50')}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-white">{i + 1}</span>
              <span className="min-w-0 flex-1">{text(id)}</span>
              {!h.readOnly && (
                <span className="flex shrink-0 items-center">
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => (h.clearResult('order'), h.move(id, -1))}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === h.s.order.length - 1} onClick={() => (h.clearResult('order'), h.move(id, 1))}>
                    <ArrowDown />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Take out" onClick={() => (h.clearResult('order'), h.unplace(id))}>
                    <X />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {left.length > 0 && !h.readOnly && (
        <ul className="mt-2 grid gap-1.5">
          {left.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => (h.clearResult('order'), h.place(x.id))} className="min-h-11 w-full rounded-xl border border-dashed border-border px-3 py-2 text-left text-[13.5px] leading-snug hover:bg-muted/60">
                {x.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      <CheckBtn h={h} id="order" label="Check my order" onClick={() => void h.runCheck('order', { section: 'order', pick: h.s.order })} />
      <Note r={r} />
      {decisions.length > 0 && <h3 className="mt-4 font-display text-[14.5px] font-semibold tracking-tight">Decisions at key steps</h3>}
      {decisions.map((d) => (
        <div key={d.id} className="mt-2.5">
          {d.context && <p className="text-[12.5px] text-muted-foreground">After: {d.context}</p>}
          <p className="text-[13.5px] font-medium">{d.prompt}</p>
          <Options h={h} list="decisions" item={d.id} options={d.options} resultKey={`d:${d.id}`} section="decision" />
        </div>
      ))}
    </>
  );
}

function ObserveStage({ h }: { h: GenHandle }) {
  const { observations, numerics } = h.paper;
  return (
    <>
      {!observations.length && !numerics.length && <p className="text-[13.5px] text-muted-foreground">This practical has nothing to record here: carry on.</p>}
      {observations.map((o) => (
        <div key={o.id} className="mb-3">
          <p className="text-[13.5px] font-medium">{o.prompt}</p>
          <Options h={h} list="observations" item={o.id} options={o.options} resultKey={`o:${o.id}`} section="observation" />
        </div>
      ))}
      {numerics.map((n) => {
        const a = h.s.numerics[n.id] ?? { value: '', unit: '' };
        const key = `n:${n.id}`;
        return (
          <div key={n.id} className="mb-3">
            <p className="text-[13.5px] font-medium">{n.prompt}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Input aria-label="Your answer" inputMode="decimal" className="h-10 w-32" value={a.value} disabled={h.readOnly} onChange={(e) => (h.clearResult(key), h.numeric(n.id, { value: e.target.value }))} placeholder="Answer" />
              {n.wantsUnit && <Input aria-label="Unit" className="h-10 w-24" value={a.unit} disabled={h.readOnly} onChange={(e) => (h.clearResult(key), h.numeric(n.id, { unit: e.target.value }))} placeholder="Unit" />}
              {h.paper.reveal?.numbers[n.id] && <span className="text-[12.5px] text-muted-foreground">Answer: {h.paper.reveal.numbers[n.id]}</span>}
            </div>
            <CheckBtn h={h} id={key} onClick={() => void h.runCheck(key, { section: 'numeric', id: n.id, value: a.value, unit: a.unit })} />
            <Note r={h.results[key]} />
          </div>
        );
      })}
    </>
  );
}

function FaultStage({ h }: { h: GenHandle }) {
  if (!h.paper.faults.length) return <p className="text-[13.5px] text-muted-foreground">No fault scenario on this paper: carry on.</p>;
  return (
    <>
      {h.paper.faults.map((f) => {
        const key = `f:${f.id}`;
        const r = h.results[key];
        const picked = h.s.faults[f.id] ?? [];
        return (
          <div key={f.id}>
            <p className="rounded-xl bg-muted px-3 py-2 text-[13.5px] leading-relaxed">{f.scenario}</p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">Tap every fault. Leave sound work alone.</p>
            <ul className="mt-1.5 grid gap-1.5">
              {f.lines.map((l) => (
                <Tick key={l.id} on={picked.includes(l.id)} disabled={h.readOnly} onClick={() => (h.clearResult(key), h.toggleFault(f.id, l.id))} why={whyOf(r, l.id)} right={isRight(h, l.id)}>
                  {l.text}
                </Tick>
              ))}
            </ul>
            <CheckBtn h={h} id={key} label="Check the faults" onClick={() => void h.runCheck(key, { section: 'fault', id: f.id, pick: picked })} />
            <Note r={r} />
          </div>
        );
      })}
    </>
  );
}

function WriteUpStage({ h }: { h: GenHandle }) {
  const { written } = h.paper;
  return (
    <div className="grid gap-3">
      <label className="grid gap-1 text-[13.5px] font-medium">
        {written.precautions}
        <Textarea rows={4} value={h.s.written.precautions} disabled={h.readOnly} onChange={(e) => h.write('precautions', e.target.value)} />
      </label>
      <label className="grid gap-1 text-[13.5px] font-medium">
        {written.explanation}
        <Textarea rows={4} value={h.s.written.explanation} disabled={h.readOnly} onChange={(e) => h.write('explanation', e.target.value)} />
      </label>
    </div>
  );
}

const STAGE_VIEW = [SafetyStage, SetOutStage, ProcedureStage, ObserveStage, FaultStage, WriteUpStage];
export function GenStage({ h, stage }: { h: GenHandle; stage: number }) {
  const V = STAGE_VIEW[stage] ?? SafetyStage;
  return <V h={h} />;
}

/** The six stages as a strip of tappable numbers. */
export function GenStepper({ h, stage, onStage }: { h: GenHandle; stage: number; onStage: (i: number) => void }) {
  return (
    <nav aria-label="Stages of this practical" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {GEN_STAGES.map((g, i) => {
        const done = stageDone(h.s, h.paper, i);
        return (
          <button key={g.key} type="button" onClick={() => onStage(i)} aria-current={stage === i ? 'step' : undefined} className={cn('flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12.5px] font-medium', stage === i ? 'border-brand bg-brand text-white' : done ? 'border-success/50 text-success' : 'border-border text-muted-foreground')}>
            {done && stage !== i ? <CheckCircle2 className="size-3.5" aria-hidden /> : <span className="tabular">{i + 1}</span>} {g.label}
          </button>
        );
      })}
    </nav>
  );
}

/** One stage with its stepper and Back / Next: the whole worksheet, in the 2D page and the 3D notebook alike. */
export function GenWorkbook({ h, stage, onStage, end }: { h: GenHandle; stage: number; onStage: (i: number) => void; end?: ReactNode }) {
  const g = GEN_STAGES[stage]!;
  return (
    <div>
      <GenStepper h={h} stage={stage} onStage={onStage} />
      <h2 className="mt-2 flex items-center gap-1.5 font-display text-[16px] font-semibold tracking-tight">
        {stage === 0 && <ShieldCheck className="size-4 text-brand" aria-hidden />}
        {g.title}
      </h2>
      <div className="mt-1.5">
        <GenStage h={h} stage={stage} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" disabled={stage === 0} onClick={() => onStage(stage - 1)}>
          <ChevronLeft /> Back
        </Button>
        {stage < GEN_STAGES.length - 1 ? (
          <Button size="sm" variant="brand" onClick={() => onStage(stage + 1)}>
            Next: {GEN_STAGES[stage + 1]!.label} <ChevronRight />
          </Button>
        ) : (
          end
        )}
      </div>
    </div>
  );
}

const WORKTOP: Record<string, string> = { workshop: '#c49a6c', kitchen: '#cfd8dc', studio: '#3f3a52', field: '#a3b18a', drawing: '#dfe7ee', lab: '#55646e' };
/** The 2D bench: what the student has taken, on a worktop the colour of the room. */
export function BenchStrip({ h }: { h: GenHandle }) {
  const taken = h.paper.tools.filter((t) => h.s.tools.includes(t.id));
  return (
    <div className="flex min-h-14 items-center gap-1.5 overflow-x-auto rounded-xl px-2.5 py-2 shadow-inner" style={{ background: WORKTOP[h.paper.room] }} aria-label={taken.length ? `On your bench: ${taken.map((t) => t.text).join(', ')}` : 'Your bench is empty'}>
      {taken.length === 0 && <span className="rounded-md bg-black/55 px-2 py-0.5 text-[12.5px] text-white">Your bench is empty.</span>}
      {taken.map((t) => (
        <span key={t.id} title={t.text} className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/90 text-foreground shadow-sm">
          <ToolIcon shape={t.shape} className="size-5" />
        </span>
      ))}
    </div>
  );
}
