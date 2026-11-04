import {
  DIODE_CARD_FWD,
  DIODE_CARD_REV,
  DIODE_MA,
  DIODE_R,
  DIODE_V,
  EM_AMMETER,
  EM_CARD,
  FIELD_STARTS,
  IND_CARD_N,
  IND_DIVS,
  MAG_COLS,
  compassAt,
  diodeReading,
  diodeSolve,
  emCurrent,
  indDeflection,
  indShown,
  sheetCfg,
  type MagAnswerId,
  type MagTask,
  type PhyMagnetismState,
  type PhyMagnetismVariant,
} from '@aischool/shared';
import { Lightbulb, Magnet } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AnswerRow, Cell, PhyGraph, Step, TaskCard, numericPoints } from '../phy-common';
import type { SimulatorProps } from '../types';
import { CORE_NAME, diodeNow, emSettings, fieldCfgNow, lastLift, magHint, moveLabel, openSheet, shownSheet, TASK_NAME, useMagnetism, type Magnetism } from './actions';
import { CompassFace, FieldCanvas, MeterDial, NailClips, SignedGraph } from './instruments';

/** The question paper for each task. */
export function MagTaskText({ task, v }: { task: MagTask | null; v?: PhyMagnetismVariant }) {
  switch (task) {
    case 'FIELD':
      return (
        <>
          <p>You are provided with a bar magnet, a small plotting compass, a drawing board, white paper, a sharp pencil and a ruler.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>Away from iron objects, mark the magnetic meridian on the paper using the compass alone. Place the magnet on the paper with its N pole pointing geographic north and draw its outline.</li>
            <li>Place the compass near the N pole; mark dots at both ends of the needle. Move the compass so its tail is at the last dot and mark again; continue to the S pole. Join the dots with a smooth curve. Plot at least four lines and put arrows on them.</li>
            <li>Locate the two neutral points X (east) and Y (west), where the compass rests in any direction. Measure their distances from the centre of the magnet and find the mean.</li>
            <li>Reverse the magnet (N pole pointing south) on a fresh sheet and repeat (iii) for the two neutral points on its axis.</li>
            <li>Calculate mean axial distance ÷ mean equatorial distance. State two precautions.</li>
          </ol>
        </>
      );
    case 'ELECTROMAGNET':
      return (
        <>
          <p>You are provided with a large iron nail, about 2 m of insulated copper wire, two dry cells, an ammeter, a rheostat, a key and steel paper clips.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>Wind 30 turns tightly on the nail and connect it in series with the ammeter, rheostat, key and cells.</li>
            <li>Set the current to {EM_CARD[0]!.toFixed(1)} A, close the key, dip the nail into the clips, lift it and count the clips held. Open the key. Repeat and take the mean.</li>
            <li>Repeat for {EM_CARD.slice(1).map((x) => x.toFixed(1)).join(', ')} A.</li>
            <li>Increase the turns to 60 and repeat at 1.0 A. Remove the nail and try the coil alone at 1.0 A.</li>
            <li>Plot the number of clips against current; find the initial slope. Calculate clips (60 turns) ÷ clips (30 turns) at 1.0 A. State two precautions.</li>
          </ol>
        </>
      );
    case 'INDUCTION':
      return (
        <>
          <p>You are provided with coils of 200 and 600 turns, a centre-zero galvanometer, two bar magnets and connecting wires.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>Connect the 200-turn coil to the galvanometer.</li>
            <li>Push the N pole of a magnet into the coil and note the size and direction of the deflection; hold it still inside; pull it out.</li>
            <li>Repeat faster, then with the S pole, then with two magnets together, then with the 600-turn coil. Tabulate your observations.</li>
            <li>
              Calculate the ratios fast ÷ slow and 600 turns ÷ 200 turns. A coil of {IND_CARD_N} turns has a flux change of {v ? (v.cardPhi * 1e4).toFixed(1) : '3.0'} × 10⁻⁴ Wb in {v ? v.cardDt.toFixed(2) : '0.10'} s: calculate the induced e.m.f., and the e.m.f. if the magnet moves twice as fast.
            </li>
            <li>When an N pole approaches the coil, what pole appears at the face of the coil nearest to it (Lenz’s law)? State two precautions.</li>
          </ol>
        </>
      );
    case 'DIODE':
      return (
        <>
          <p>You are provided with a silicon diode, a {DIODE_R} Ω protective resistor, three cells with a potentiometer, a milliammeter (0–{DIODE_MA.fsd} mA), a voltmeter (0–1 V and 0–10 V) and a key.</p>
          <ol className="list-[lower-roman] space-y-0.5 pl-6">
            <li>Connect the diode in forward bias in series with the resistor and milliammeter; the voltmeter across the diode only.</li>
            <li>Increase the p.d. in steps ({DIODE_CARD_FWD.join(', ')} V) and record the current, opening the key between readings.</li>
            <li>Reverse the diode and record the current for p.d.s of {DIODE_CARD_REV.join(', ')} V (enter them as negative).</li>
            <li>Plot I against V for both directions on the same axes. Draw the tangent to the steep part; find the knee voltage where it meets the V axis.</li>
            <li>Calculate the dynamic resistance ΔV/ΔI from the tangent and the static resistance V/I at 0.70 V. State two precautions.</li>
          </ol>
        </>
      );
    default:
      return <p>Choose the experiment.</p>;
  }
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button size="sm" variant={on ? 'brand' : 'outline'} onClick={onClick} aria-pressed={on}>
      {children}
    </Button>
  );
}
function Nudge({ name, move, steps }: { name: string; move: (d: number) => void; steps: [number, number] }) {
  return (
    <span className="inline-flex gap-1">
      {[-steps[0], -steps[1], steps[1], steps[0]].map((d) => (
        <Button key={d} size="sm" variant="outline" onClick={() => move(d)} aria-label={`${name} ${d > 0 ? '+' : '−'}${Math.abs(d)}`}>
          {d > 0 ? '+' : '−'}
          {Math.abs(d)}
        </Button>
      ))}
    </span>
  );
}

// ------------------------------------------------------------------ benches

function FieldBench({ o, s, lab }: { o: Magnetism; s: PhyMagnetismState; lab: boolean }) {
  const v = o.v;
  const sh = shownSheet(s);
  const cfg = openSheet(s) ? sheetCfg(openSheet(s)!.sheet) : fieldCfgNow(s);
  const c = compassAt(v, cfg, { x: s.cx, y: s.cy });
  const [msg, setMsg] = useState<string | null>(null);
  const [ruler, setRuler] = useState<number | null>(null);
  const mark = ruler !== null && sh ? sh.sheet.neutrals[ruler] : null;
  return (
    <>
      <FieldCanvas v={v} s={s} compass={lab || !!sh} ruler={mark ?? null} onPick={lab ? (x, y) => o.setCompassAt(x, y) : undefined} />
      <div className="flex flex-wrap items-start gap-3">
        <CompassFace heading={c.heading} loose={c.loose} label={`Compass at (${s.cx.toFixed(1)}, ${s.cy.toFixed(1)}) cm from the centre (x east, y north).`} />
        {sh && sh.sheet.neutrals.length > 0 && (
          <div className="space-y-1 text-[12px]">
            <p className="font-medium">Lay the rule from the centre to a mark:</p>
            <div className="flex flex-wrap gap-1">
              {sh.sheet.neutrals.map((_, j) => (
                <Toggle key={j} on={ruler === j} onClick={() => setRuler(ruler === j ? null : j)}>
                  Mark {j + 1}
                </Toggle>
              ))}
            </div>
          </div>
        )}
      </div>
      {lab && (
        <div className="space-y-2">
          <Step title="1. The paper and the magnet">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={s.meridian ? 'outline' : 'brand'} onClick={o.markMeridian}>
                Mark the meridian (compass alone)
              </Button>
              <Button size="sm" variant={s.steelAway ? 'outline' : 'brand'} onClick={o.clearSteel}>
                Put the keys and phone away
              </Button>
              <Toggle on={s.facing === 'north'} onClick={() => o.setFacing('north')}>
                N pole pointing north
              </Toggle>
              <Toggle on={s.facing === 'south'} onClick={() => o.setFacing('south')}>
                N pole pointing south
              </Toggle>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['one', 'like', 'unlike'] as const).map((a) => (
                <Toggle key={a} on={s.arr === a} onClick={() => o.setArr(a)}>
                  {a === 'one' ? 'One magnet' : a === 'like' ? 'Two: like poles facing' : 'Two: unlike poles facing'}
                </Toggle>
              ))}
              <Toggle on={s.compass === 'small'} onClick={() => o.setCompass(s.compass === 'small' ? 'large' : 'small')}>
                {s.compass === 'small' ? 'Small compass' : 'Large compass'}
              </Toggle>
              <Toggle on={s.tapEach} onClick={() => o.setTapEach(!s.tapEach)}>
                {s.tapEach ? 'Tapping before each dot' : 'Not tapping'}
              </Toggle>
            </div>
          </Step>
          <Step title="2. Plot the field lines">
            <div className="flex flex-wrap items-center gap-1 text-[12px]">
              <span className="text-muted-foreground">Start a line at point:</span>
              {FIELD_STARTS.map((_, j) => (
                <Button key={j} size="sm" variant="outline" onClick={() => setMsg(o.startLine(j))}>
                  {j + 1}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => setMsg(o.nextDot())}>
                Mark the next dot
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMsg(o.nextDot(true))}>
                Dot to dot to the end
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMsg(o.arrows())}>
                Draw arrows N → S
              </Button>
              <Button size="sm" variant="ghost" onClick={o.freshSheet}>
                Fresh sheet
              </Button>
            </div>
          </Step>
          <Step title="3. Find the neutral points">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-muted-foreground">Move the compass (or click the paper):</span>
              <Nudge name="East" move={(d) => o.moveCompass(d, 0)} steps={[1, 0.2]} />
              <Nudge name="North" move={(d) => o.moveCompass(0, d)} steps={[1, 0.2]} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => setMsg(o.markNeutral())}>
                Mark a neutral point here
              </Button>
              <Button size="sm" variant="ghost" onClick={o.unmark}>
                Rub out the last mark
              </Button>
            </div>
          </Step>
          {msg && <p className="text-[12px] text-warning">{msg}</p>}
        </div>
      )}
    </>
  );
}

function EmBench({ o, s, lab }: { o: Magnetism; s: PhyMagnetismState; lab: boolean }) {
  const v = o.v;
  const last = lastLift(v, s);
  const lastIdx = (p: (a: string) => boolean) => s.log.reduce((m, e, i) => (p(e.a) ? i : m), -1);
  const lifting = s.key && !!last && lastIdx((a) => a.startsWith('lift')) > lastIdx((a) => a === 'key:on');
  const I = s.key ? emCurrent(v, { turns: s.turns, rheo: s.rheo, heat: s.heat }) : 0;
  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <NailClips clips={lifting ? last!.clips : !s.key && last ? last.left : 0} lifting={lifting || (!s.key && !!last && last.left > 0)} turns={s.turns} core={s.core} />
        <MeterDial label="A" unit="Ammeter" value={I} fsd={EM_AMMETER.fsd} minor={EM_AMMETER.minor} major={EM_AMMETER.major} caption={s.key ? 'Read to 0.05 A.' : 'Key open: no current.'} />
      </div>
      {lab && (
        <div className="space-y-2">
          <Step title="1. The coil and the core">
            <div className="flex flex-wrap gap-1.5">
              <Toggle on={s.turns === 30} onClick={() => o.wind(30)}>
                30 turns
              </Toggle>
              <Toggle on={s.turns === 60} onClick={() => o.wind(60)}>
                60 turns
              </Toggle>
              <Toggle on={!s.mixed} onClick={() => o.setMixed(!s.mixed)}>
                {s.mixed ? 'Some turns wound the other way' : 'All turns the same way'}
              </Toggle>
              {(['iron', 'steel', 'none'] as const).map((c) => (
                <Toggle key={c} on={s.core === c} onClick={() => o.setCore(c)}>
                  {CORE_NAME[c]}
                </Toggle>
              ))}
            </div>
          </Step>
          <Step title="2. Current, key and clips">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-muted-foreground">Rheostat ({Math.round(s.rheo * 100)} %):</span>
              <Nudge name="Rheostat" move={o.moveRheo} steps={[0.05, 0.005]} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={s.key ? 'outline' : 'brand'} onClick={s.key ? o.openKey : o.closeKey}>
                {s.key ? 'Open the key' : 'Close the key'}
              </Button>
              <Button size="sm" disabled={!s.key} onClick={() => o.lift()}>
                Dip into the clips and lift
              </Button>
            </div>
          </Step>
        </div>
      )}
    </>
  );
}

function IndBench({ o, s, lab }: { o: Magnetism; s: PhyMagnetismState; lab: boolean }) {
  const v = o.v;
  const [run, setRun] = useState<{ k: number; at: number } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const loop = () => {
      tick((n) => n + 1);
      if (performance.now() < run.at + 2200) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run]);
  const offset = !s.galvoFar && s.magIn ? indDeflection(v, 0, { kind: 'still', coil: s.coil, pole: s.pole, magnets: s.magnets, speed: s.speed, axis: s.axis, galvoFar: false }) : 0;
  let needle = offset;
  if (run) {
    const t = (performance.now() - run.at) / 1000;
    const m = s.moves[run.k];
    if (m && t < 2.2) {
      const peak = indShown(indDeflection(v, run.k, m));
      const env = t < 0.35 ? Math.sin((t / 0.35) * (Math.PI / 2)) : Math.max(0, 1 - (t - 0.35) / 1.2);
      needle = m.kind === 'still' ? peak : offset + (peak - offset) * env;
    }
  }
  const go = (kind: 'in' | 'still' | 'out') => {
    const k = o.move(kind);
    if (k !== null) setRun({ k, at: performance.now() });
  };
  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        <MeterDial label="G" unit="Galvanometer" value={needle} fsd={IND_DIVS} minor={1} major={10} centre caption="Centre zero: note which way and how far it swings (to 0.5 division)." />
        <svg viewBox="0 0 260 120" className="w-full max-w-[280px] rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-200 dark:from-slate-800 dark:to-slate-900" role="img" aria-label={`${s.coil}-turn coil; the magnet ${s.magIn ? 'inside' : 'outside'} it, ${s.pole} pole first`}>
          <rect x={120} y={35} width={110} height={50} rx={6} fill="#e2b47c" stroke="#8a5a2b" />
          {Array.from({ length: s.coil === 600 ? 22 : 10 }, (_, n) => (
            <line key={n} x1={124 + n * (102 / (s.coil === 600 ? 22 : 10))} x2={124 + n * (102 / (s.coil === 600 ? 22 : 10))} y1={35} y2={85} stroke="#b5651d" strokeWidth={s.coil === 600 ? 2 : 3} />
          ))}
          <g transform={`translate(${s.magIn ? 125 : 10} ${s.axis ? 50 : 18})`}>
            <rect width={50} height={20} fill={s.pole === 'N' ? '#e8edf2' : '#c62828'} />
            <rect x={50} width={50} height={20} fill={s.pole === 'N' ? '#c62828' : '#e8edf2'} />
            <text x={88} y={14} fontSize="11" fontWeight="800" fill={s.pole === 'N' ? '#fff' : '#111'}>
              {s.pole}
            </text>
          </g>
        </svg>
      </div>
      {lab && (
        <div className="space-y-2">
          <Step title="1. The coil, the magnet and the galvanometer">
            <div className="flex flex-wrap gap-1.5">
              <Toggle on={s.coil === 200} onClick={() => o.setCoil(200)}>
                200 turns
              </Toggle>
              <Toggle on={s.coil === 600} onClick={() => o.setCoil(600)}>
                600 turns
              </Toggle>
              <Toggle on={s.pole === 'N'} onClick={() => o.setPole(s.pole === 'N' ? 'S' : 'N')}>
                {s.pole} pole first
              </Toggle>
              <Toggle on={s.magnets === 2} onClick={() => o.setMagnets(s.magnets === 2 ? 1 : 2)}>
                {s.magnets === 2 ? 'Two magnets' : 'One magnet'}
              </Toggle>
              <Toggle on={s.speed === 'fast'} onClick={() => o.setSpeed(s.speed === 'fast' ? 'slow' : 'fast')}>
                {s.speed === 'fast' ? 'Quickly' : 'Slowly'}
              </Toggle>
              <Toggle on={s.axis} onClick={() => o.setAxis(!s.axis)}>
                {s.axis ? 'Along the axis' : 'From the side'}
              </Toggle>
              <Toggle on={s.galvoFar} onClick={() => o.setGalvoFar(!s.galvoFar)}>
                {s.galvoFar ? 'Galvanometer well away' : 'Galvanometer beside the coil'}
              </Toggle>
            </div>
          </Step>
          <Step title="2. Move the magnet">
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" disabled={s.magIn} onClick={() => go('in')}>
                Push it in
              </Button>
              <Button size="sm" variant="outline" disabled={!s.magIn} onClick={() => go('still')}>
                Hold it still inside
              </Button>
              <Button size="sm" disabled={!s.magIn} onClick={() => go('out')}>
                Pull it out
              </Button>
            </div>
          </Step>
        </div>
      )}
    </>
  );
}

function DiodeBench({ o, s, lab }: { o: Magnetism; s: PhyMagnetismState; lab: boolean }) {
  const v = o.v;
  const live = s.key ? diodeSolve(v, diodeNow(s), s.burnt) : null;
  const r = live ? diodeReading(v, { ...diodeNow(s), range: s.range, open: s.burnt }) : null;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <MeterDial label="V" unit="Voltmeter" value={r ? r.Vtrue : 0} fsd={DIODE_V[s.range].fsd} minor={DIODE_V[s.range].minor} major={DIODE_V[s.range].major} caption={`0–${s.range} V range, across the ${s.vm === 'diode' ? 'diode' : 'diode and the resistor'}.`} />
        <MeterDial label="mA" unit="Milliammeter" value={r ? Math.abs(r.mAtrue) : 0} fsd={DIODE_MA.fsd} minor={DIODE_MA.minor} major={DIODE_MA.major} caption="Read to 0.5 mA." />
      </div>
      {s.burnt && <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] text-danger">The diode got very hot and failed: no current flows now. Replace it — and keep the protective resistor in the circuit.</p>}
      {lab && (
        <div className="space-y-2">
          <Step title="1. The circuit">
            <div className="flex flex-wrap gap-1.5">
              <Toggle on={s.bias === 'fwd'} onClick={() => o.setBias(s.bias === 'fwd' ? 'rev' : 'fwd')}>
                {s.bias === 'fwd' ? 'Forward bias' : 'Reverse bias'}
              </Toggle>
              <Toggle on={s.resistor} onClick={() => o.setResistor(!s.resistor)}>
                {s.resistor ? `${DIODE_R} Ω resistor in` : 'No protective resistor'}
              </Toggle>
              <Toggle on={s.vm === 'diode'} onClick={() => o.setVm(s.vm === 'diode' ? 'both' : 'diode')}>
                {s.vm === 'diode' ? 'Voltmeter across the diode' : 'Voltmeter across diode + resistor'}
              </Toggle>
              <Toggle on={s.range === 1} onClick={() => o.setRange(s.range === 1 ? 10 : 1)}>
                {s.range === 1 ? '0–1 V range' : '0–10 V range'}
              </Toggle>
              {s.burnt && (
                <Button size="sm" variant="outline" onClick={o.replaceDiode}>
                  Replace the diode
                </Button>
              )}
            </div>
          </Step>
          <Step title="2. Set the p.d. and read">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-muted-foreground">Potentiometer ({(s.pot * 100).toFixed(1)} %):</span>
              <Nudge name="Potentiometer" move={o.movePot} steps={[0.05, 0.002]} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant={s.key ? 'outline' : 'brand'} onClick={s.key ? o.openKey : o.closeKey}>
                {s.key ? 'Open the key' : 'Close the key'}
              </Button>
              <Button size="sm" disabled={!s.key} onClick={() => o.read()}>
                Record this reading
              </Button>
            </div>
          </Step>
        </div>
      )}
    </>
  );
}

export default function PhyMagnetismLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-magnetism'>) {
  const o = useMagnetism({ seed, state, onChange, readOnly, startedAt, practicalId });
  const { task } = o;
  const lab = !readOnly;
  return (
    <div className="space-y-4">
      <TaskCard icon={<Magnet className="size-4 text-muted-foreground" aria-hidden />}>
        <MagTaskText task={state.task} v={o.v} />
        {lab && state.log.filter((e) => !e.a.startsWith('task')).length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {(['FIELD', 'ELECTROMAGNET', 'INDUCTION', 'DIODE'] as const).map((t) => (
              <Button key={t} size="sm" variant={state.task === t ? 'brand' : 'outline'} onClick={() => o.chooseTask(t)} aria-pressed={state.task === t}>
                {TASK_NAME[t]}
              </Button>
            ))}
          </div>
        )}
      </TaskCard>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start [&>*]:min-w-0">
        <Card className="space-y-3 p-4 sm:p-5">
          <h3 className="font-display text-[15px] font-semibold tracking-tight">{TASK_NAME[task]}</h3>
          {lab && mode === 'LAB' && (
            <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {magHint(state)}
            </p>
          )}
          {task === 'FIELD' && <FieldBench o={o} s={state} lab={lab} />}
          {task === 'ELECTROMAGNET' && <EmBench o={o} s={state} lab={lab} />}
          {task === 'INDUCTION' && <IndBench o={o} s={state} lab={lab} />}
          {task === 'DIODE' && <DiodeBench o={o} s={state} lab={lab} />}
        </Card>
        <Notebook task={task} state={state} readOnly={readOnly} o={o} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the notebook

const HEADS: Record<MagTask, Record<string, string>> = {
  FIELD: {},
  ELECTROMAGNET: { N: 'Turns N', I: 'I / A', c1: 'Clips (1)', c2: 'Clips (2)', c: 'Mean clips' },
  INDUCTION: { dir: 'Direction (L/R/0)', size: 'Size / div' },
  DIODE: { V: 'V / V', I: 'I / mA' },
};
const ANSWERS: Record<MagTask, { id: MagAnswerId; label: string; noUnit?: boolean }[]> = {
  FIELD: [
    { id: 'me', label: '(i) Mean distance of X and Y from the centre (N pointing north)' },
    { id: 'ma', label: '(ii) Mean distance of the axial neutral points (N pointing south)' },
    { id: 'ratio', label: '(iii) Mean axial distance ÷ mean equatorial distance', noUnit: true },
  ],
  ELECTROMAGNET: [
    { id: 'slope', label: '(i) Initial slope of the graph (clips per ampere)' },
    { id: 'rturns', label: '(ii) Clips with 60 turns ÷ clips with 30 turns (same current)', noUnit: true },
  ],
  INDUCTION: [
    { id: 'emf', label: '(i) E = NΔΦ/Δt for the card’s coil' },
    { id: 'emf2', label: '(ii) E when the magnet moves twice as fast' },
    { id: 'rspeed', label: '(iii) Swing when fast ÷ swing when slow (N in, 200 turns)', noUnit: true },
    { id: 'rturns', label: '(iv) Swing with 600 turns ÷ swing with 200 turns (same movement)', noUnit: true },
    { id: 'lenz', label: '(v) The pole at the face of the coil as an N pole approaches (N or S)', noUnit: true },
  ],
  DIODE: [
    { id: 'knee', label: '(i) Knee voltage (where your tangent meets the V axis)' },
    { id: 'rdyn', label: '(ii) Dynamic resistance ΔV ÷ ΔI from the tangent' },
    { id: 'rstat', label: '(iii) Static resistance V ÷ I at 0.70 V' },
  ],
};
const CELLS: Record<MagTask, { id: string; label: string }[]> = {
  FIELD: [
    { id: 'xe', label: 'X (east) / cm' },
    { id: 'yw', label: 'Y (west) / cm' },
    { id: 'an', label: 'Axial, north end / cm' },
    { id: 'as', label: 'Axial, south end / cm' },
  ],
  ELECTROMAGNET: [{ id: 'nc', label: 'Clips held by the coil with no core' }],
  INDUCTION: [],
  DIODE: [],
};

export function Notebook({ task, state, readOnly, o }: { task: MagTask; state: PhyMagnetismState; readOnly: boolean; o: Pick<Magnetism, 'setRowCell' | 'removeRow' | 'setCell' | 'setAnswer' | 'update'> }) {
  const cols = MAG_COLS[task];
  const head = HEADS[task];
  const settings = task === 'ELECTROMAGNET' ? emSettings(state) : [];
  const rowLabel = (key: number) => {
    if (task === 'ELECTROMAGNET') {
      const x = settings[key];
      return x ? `${key + 1}. ${x.l.turns} turns, ${CORE_NAME[x.l.core]}${x.l.mixed ? ' (mixed)' : ''}` : `Setting ${key + 1}`;
    }
    if (task === 'INDUCTION') return state.moves[key] ? `${key + 1}. ${moveLabel(state.moves[key]!)}` : `Move ${key + 1}`;
    if (task === 'DIODE') {
      const r = state.reads[key];
      return r ? `${key + 1}. ${r.bias === 'fwd' ? 'forward' : 'reverse'}` : `Reading ${key + 1}`;
    }
    return String(key);
  };
  const emPts = numericPoints(state.rows.filter((r) => settings[r.key] && settings[r.key]!.l.turns === 30 && settings[r.key]!.l.core === 'iron' && !settings[r.key]!.l.mixed).map((r) => [r.c.I, r.c.c]));
  const diodePts = numericPoints(state.rows.map((r) => [r.c.V, r.c.I]));
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {cols.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-muted-foreground">
                <th className="py-1 pr-1 font-medium" />
                {cols.map((c) => (
                  <th key={c} className="px-1 py-1 font-medium">
                    {head[c]}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {state.rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} className="py-3 text-muted-foreground">
                    A row appears at your first {task === 'ELECTROMAGNET' ? 'lift with each setting' : task === 'INDUCTION' ? 'movement' : 'reading'}.
                  </td>
                </tr>
              )}
              {state.rows.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="max-w-[150px] py-1.5 pr-1 text-[11px] leading-tight text-muted-foreground">{rowLabel(r.key)}</td>
                  {cols.map((c) => (
                    <td key={c} className="px-1 py-1.5">
                      <Cell value={r.c[c] ?? ''} onChange={(x) => o.setRowCell(r.key, c, x)} readOnly={readOnly} label={`${rowLabel(r.key)} ${head[c]}`} />
                    </td>
                  ))}
                  <td>
                    {!readOnly && (
                      <Button size="icon-sm" variant="ghost" onClick={() => o.removeRow(r.key)} aria-label={`Delete the row ${rowLabel(r.key)}`}>
                        ×
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {CELLS[task].length > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          {CELLS[task].map((c) => (
            <label key={c.id} className="text-[12px] text-muted-foreground">
              <span className="mb-1 block">{c.label}</span>
              <Cell value={state.cells[c.id] ?? ''} onChange={(x) => o.setCell(c.id, x)} readOnly={readOnly} label={c.label} />
            </label>
          ))}
        </div>
      )}
      {task === 'ELECTROMAGNET' && (
        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-semibold">Graph of clips against current (30 turns, soft iron)</p>
          <PhyGraph points={emPts} line={state.line} onLine={(line) => o.update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="I / A" yLabel="clips" />
        </div>
      )}
      {task === 'DIODE' && (
        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-semibold">Graph of I against V (forward and reverse)</p>
          <SignedGraph points={diodePts} line={state.line} onLine={(line) => o.update((s) => ({ ...s, line }))} readOnly={readOnly} xLabel="V / V" yLabel="I / mA" />
        </div>
      )}
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Results</p>
        {ANSWERS[task].map((a) => (
          <AnswerRow key={a.id} id={a.id} label={a.label} answer={state.answers[a.id]} onChange={(k, x) => o.setAnswer(a.id, k, x)} readOnly={readOnly} unitHint="unit" noUnit={a.noUnit} />
        ))}
      </div>
      <div className="mt-5">
        <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="mag-precautions">
          Two precautions you took
        </label>
        <Textarea id="mag-precautions" value={state.written.precautions} onChange={(e) => o.update((s) => ({ ...s, written: { precautions: e.target.value.slice(0, 2000) } }))} disabled={readOnly} rows={3} />
      </div>
    </Card>
  );
}
