import {
  RATES_CROSS_ACID,
  RATES_CROSS_CARD,
  RATES_HCL,
  RATES_MG_AR,
  RATES_TEMP_CARD,
  RATES_TEMP_THIO,
  RATES_THIO,
  RATES_VM,
  type ChemRatesState,
  type ChemRatesVariant,
  type PhyGraphLine,
  type RatesAnswerId,
  type RatesTask,
} from '@aischool/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { AnswerRow, Cell } from '../phy-common';
import type { Rates } from './actions';
import { numericPoints, RatesGraph, type XY } from './graph';

/** The question paper for each task (the 2D task card and the 3D bench's task card). */
export function RatesTaskText({ task, v }: { task: RatesTask | null; v: ChemRatesVariant }) {
  if (task === 'CROSS')
    return (
      <>
        <p>
          You are provided with {RATES_THIO.toFixed(2)} mol dm⁻³ sodium thiosulphate (Na₂S₂O₃), {RATES_HCL.toFixed(1)} mol dm⁻³ hydrochloric acid, distilled water, a 250 cm³ conical flask, measuring cylinders, a stopwatch, a thermometer, a water bath and a white paper marked with a bold cross.
        </p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Put 50 cm³ of the thiosulphate in the flask on the cross. Add {RATES_CROSS_ACID} cm³ of the acid, start the stopwatch and swirl. Looking down through the solution, stop the watch when the cross can no longer be seen. Record the time t.</li>
          <li>Repeat with {RATES_CROSS_CARD.slice(1).join(', ')} cm³ of thiosulphate, each made up to 50 cm³ with distilled water (same volume of acid).</li>
          <li>Using {RATES_TEMP_THIO} cm³ of thiosulphate + {50 - RATES_TEMP_THIO} cm³ of water each time, repeat at about {RATES_TEMP_CARD.join(', ')} °C (warm the flask in the water bath), recording the temperature of the mixture.</li>
          <li>Calculate 1/t for every run. Plot 1/t against the volume of thiosulphate and find the slope.</li>
          <li>From your graph find the time for {v.queryVol} cm³ of thiosulphate; from the temperature results, by what factor does the rate increase for a 10 °C rise?</li>
          <li>Explain your results using the collision theory. State two precautions.</li>
        </ol>
        <p className="text-muted-foreground">Na₂S₂O₃ + 2HCl → 2NaCl + SO₂ + S + H₂O</p>
      </>
    );
  return (
    <>
      <p>
        You are provided with a piece of magnesium ribbon of mass {v.mgMass.toFixed(3)} g, 1.0 mol dm⁻³ and 0.50 mol dm⁻³ hydrochloric acid, a conical flask with a bung and delivery tube, a 100 cm³ gas syringe, a stopwatch, a balance and sandpaper.
      </p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Clean and weigh the magnesium. Put 50 cm³ of 1.0 mol dm⁻³ HCl in the flask and connect the gas syringe, checking that the apparatus is airtight.</li>
        <li>Drop the magnesium in, replace the bung at once and start the stopwatch. Record the volume of gas every 30 s until no more gas is produced.</li>
        <li>Repeat with 50 cm³ of 0.50 mol dm⁻³ HCl and a fresh {v.mgMass.toFixed(3)} g piece of magnesium.</li>
        <li>Plot the volume of hydrogen against time for both runs on the same axes. Draw tangents at t = 0 and find the initial rate of each.</li>
        <li>Calculate the theoretical volume of hydrogen (Mg = {RATES_MG_AR}; 1 mol of gas occupies {RATES_VM.toLocaleString('en-GB')} cm³ at r.t.p.).</li>
        <li>Explain the shape of the graphs and the effect of concentration. State two precautions.</li>
      </ol>
      <p className="text-muted-foreground">Mg + 2HCl → MgCl₂ + H₂</p>
    </>
  );
}

const C1 = '#2563eb';
const C2 = '#d97706';
const CT = '#16a34a';

/** A tangent at t = 0 to start from: the line from the origin through the first point, extended (drag it to touch the curve). */
const tangentStart = (pts: XY[]): PhyGraphLine | null => {
  const first = [...pts].filter((p) => p.x > 0).sort((a, b) => a.x - b.x)[0];
  if (!first) return null;
  const x2 = first.x * 2.5;
  return { x1: 0, y1: 0, x2, y2: Number(((first.y / first.x) * x2).toPrecision(4)) };
};
/** A best line to start from: through the lowest and highest points. */
const lineStart = (pts: XY[]): PhyGraphLine | null => {
  if (pts.length < 2) return null;
  const lo = pts.reduce((a, b) => (b.x < a.x ? b : a));
  const hi = pts.reduce((a, b) => (b.x > a.x ? b : a));
  return { x1: lo.x, y1: lo.y, x2: hi.x, y2: hi.y };
};

export function Notebook({ v, state, readOnly, update, removeCross, discard, className }: { v: ChemRatesVariant; state: ChemRatesState; readOnly: boolean; update: Rates['update']; removeCross?: (i: number) => void; discard?: (i: number) => void; className?: string }) {
  const task = state.task ?? 'MG';
  const setAnswer = (id: RatesAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const setWritten = (key: 'explanation' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, 2000) } }));
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {task === 'MG' ? <MgRecord v={v} state={state} readOnly={readOnly} update={update} discard={discard} /> : <CrossRecord v={v} state={state} readOnly={readOnly} update={update} removeCross={removeCross} />}
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {task === 'MG' ? (
          <>
            <AnswerRow id="rateA" label="(i) Initial rate of run 1 (gradient of the tangent at t = 0)" answer={state.answers.rateA} onChange={(k, x) => setAnswer('rateA', k, x)} readOnly={readOnly} unitHint="unit" />
            <AnswerRow id="rateB" label="(ii) Initial rate of run 2" answer={state.answers.rateB} onChange={(k, x) => setAnswer('rateB', k, x)} readOnly={readOnly} unitHint="unit" />
            <AnswerRow id="vTheory" label={`(iii) Theoretical volume of hydrogen from ${v.mgMass.toFixed(3)} g of magnesium`} answer={state.answers.vTheory} onChange={(k, x) => setAnswer('vTheory', k, x)} readOnly={readOnly} unitHint="unit" />
          </>
        ) : (
          <>
            <AnswerRow id="slope" label="(i) Slope of the graph of 1/t against the volume of thiosulphate" answer={state.answers.slope} onChange={(k, x) => setAnswer('slope', k, x)} readOnly={readOnly} unitHint="unit" />
            <AnswerRow id="tQuery" label={`(ii) From your graph, the time for ${v.queryVol} cm³ of thiosulphate (made up to 50 cm³)`} answer={state.answers.tQuery} onChange={(k, x) => setAnswer('tQuery', k, x)} readOnly={readOnly} unitHint="unit" />
            <AnswerRow id="factor" label="(iii) How many times faster the reaction goes for a 10 °C rise" answer={state.answers.factor} onChange={(k, x) => setAnswer('factor', k, x)} readOnly={readOnly} unitHint="unit" noUnit />
          </>
        )}
      </div>
      <div className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="rates-explanation">
            {task === 'MG' ? 'Explain the shape of the graphs and the effect of concentration' : 'Explain the effects of concentration and temperature (collision theory)'}
          </label>
          <Textarea id="rates-explanation" value={state.written.explanation} onChange={(e) => setWritten('explanation', e.target.value)} disabled={readOnly} rows={3} />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="rates-precautions">
            Two precautions you took
          </label>
          <Textarea id="rates-precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}

function MgRecord({ state, readOnly, update, discard }: { v: ChemRatesVariant; state: ChemRatesState; readOnly: boolean; update: Rates['update']; discard?: (i: number) => void }) {
  const setCell = (i: number, key: 't' | 'v1' | 'v2', value: string) => update((s) => ({ ...s, mg: s.mg.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
  const pa = numericPoints(state.mg.map((r) => [r.t, r.v1]));
  const pb = numericPoints(state.mg.map((r) => [r.t, r.v2]));
  const runReads = (i: number) => state.readings.filter((e) => e.run === i);
  return (
    <>
      {state.readings.length > 0 && (
        <div className="mb-3 rounded-xl border border-border p-2 text-[12px]">
          <p className="mb-1 font-semibold">When you read the syringe (stopwatch)</p>
          {[0, 1].map((i) =>
            runReads(i).length ? (
              <p key={i} className="tabular text-muted-foreground">
                Run {i + 1}: {runReads(i).map((e) => `${e.at.toFixed(1)} s`).join(', ')}
                {!readOnly && discard && state.mgRuns[i]?.done && (
                  <Button size="sm" variant="ghost" className="ml-1 h-6 px-1.5 text-[11.5px]" onClick={() => discard(i)}>
                    Discard run {i + 1}
                  </Button>
                )}
              </p>
            ) : null,
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="px-1 py-1 font-medium">t / s</th>
              <th className="px-1 py-1 font-medium">V (run 1, 1.0 mol dm⁻³) / cm³</th>
              <th className="px-1 py-1 font-medium">V (run 2, 0.50 mol dm⁻³) / cm³</th>
            </tr>
          </thead>
          <tbody>
            {state.mgRows.length === 0 && (
              <tr>
                <td colSpan={3} className="py-3 text-muted-foreground">
                  Rows appear as you start the stopwatch and read the syringe (every 30 s).
                </td>
              </tr>
            )}
            {state.mgRows.map((slot, i) => (
              <tr key={slot} className="border-t border-border">
                {(['t', 'v1', 'v2'] as const).map((k) => (
                  <td key={k} className="px-1 py-1.5">
                    <Cell value={state.mg[i]?.[k] ?? ''} onChange={(x) => setCell(i, k, x)} readOnly={readOnly} label={`Row ${i + 1} (${slot} s): ${k === 't' ? 'time' : k === 'v1' ? 'volume run 1' : 'volume run 2'}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">Write each volume as you read it, to the nearest 0.5 cm³. V = 0 at t = 0.</p>
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">Graph of V against t</p>
        <RatesGraph
          xLabel="t / s"
          yLabel="V / cm³"
          readOnly={readOnly}
          series={[
            { id: 'a', label: 'Run 1', colour: C1, points: pa, curve: state.curves.a, onCurve: (c) => update((s) => ({ ...s, curves: { ...s.curves, a: c } })) },
            { id: 'b', label: 'Run 2', colour: C2, points: pb, curve: state.curves.b, onCurve: (c) => update((s) => ({ ...s, curves: { ...s.curves, b: c } })) },
          ]}
          lines={[
            { id: 'tanA', label: 'Tangent (run 1)', colour: C1, line: state.tangents.a, onLine: (l) => update((s) => ({ ...s, tangents: { ...s.tangents, a: l } })), place: () => tangentStart(pa), placeLabel: 'tangent at t = 0 (run 1)' },
            { id: 'tanB', label: 'Tangent (run 2)', colour: C2, line: state.tangents.b, onLine: (l) => update((s) => ({ ...s, tangents: { ...s.tangents, b: l } })), place: () => tangentStart(pb), placeLabel: 'tangent at t = 0 (run 2)' },
          ]}
        />
      </div>
    </>
  );
}

function CrossRecord({ state, readOnly, update, removeCross }: { v: ChemRatesVariant; state: ChemRatesState; readOnly: boolean; update: Rates['update']; removeCross?: (i: number) => void }) {
  const setCell = (i: number, key: 'v' | 'w' | 'th' | 't' | 'inv', value: string) => update((s) => ({ ...s, cross: s.cross.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
  const rows = state.crossRuns.map((r, i) => ({ r, i, row: state.cross[i]! }));
  const conc = rows.filter((x) => x.r.kind === 'CONC');
  const temp = rows.filter((x) => x.r.kind === 'TEMP');
  const pts = numericPoints(conc.map((x) => [x.row.v, x.row.inv]));
  const del = (i: number) =>
    !readOnly && removeCross ? (
      <Button size="icon-sm" variant="ghost" onClick={() => removeCross(i)} aria-label={`Delete run ${i + 1}`}>
        ×
      </Button>
    ) : null;
  const stopwatch = (x: (typeof rows)[number]) => (x.r.done && x.r.elapsed !== null ? `${x.r.elapsed.toFixed(2)} s` : x.r.done ? '—' : 'in the flask');
  return (
    <>
      <p className="mb-1 text-[12.5px] font-semibold">Part 1: concentration (room temperature)</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[380px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="px-1 py-1 font-medium">Na₂S₂O₃ / cm³</th>
              <th className="px-1 py-1 font-medium">Water / cm³</th>
              <th className="px-1 py-1 font-medium">t / s</th>
              <th className="px-1 py-1 font-medium">1/t / s⁻¹</th>
              <th className="px-1 py-1 font-medium">Watch</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {conc.length === 0 && (
              <tr>
                <td colSpan={6} className="py-3 text-muted-foreground">
                  A row appears when you measure a mixture into the flask.
                </td>
              </tr>
            )}
            {conc.map((x) => (
              <tr key={x.i} className="border-t border-border">
                {(['v', 'w', 't', 'inv'] as const).map((k) => (
                  <td key={k} className="px-1 py-1.5">
                    <Cell value={x.row[k]} onChange={(val) => setCell(x.i, k, val)} readOnly={readOnly} label={`Run ${x.i + 1}: ${k}`} />
                  </td>
                ))}
                <td className="px-1 text-[11.5px] tabular text-muted-foreground">{stopwatch(x)}</td>
                <td>{del(x.i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mb-1 mt-4 text-[12.5px] font-semibold">Part 2: temperature ({RATES_TEMP_THIO} cm³ thiosulphate + {50 - RATES_TEMP_THIO} cm³ water)</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="px-1 py-1 font-medium">θ / °C</th>
              <th className="px-1 py-1 font-medium">t / s</th>
              <th className="px-1 py-1 font-medium">1/t / s⁻¹</th>
              <th className="px-1 py-1 font-medium">Watch</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {temp.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-muted-foreground">
                  A row appears when you warm a mixture in the water bath.
                </td>
              </tr>
            )}
            {temp.map((x) => (
              <tr key={x.i} className="border-t border-border">
                {(['th', 't', 'inv'] as const).map((k) => (
                  <td key={k} className="px-1 py-1.5">
                    <Cell value={x.row[k]} onChange={(val) => setCell(x.i, k, val)} readOnly={readOnly} label={`Run ${x.i + 1}: ${k}`} />
                  </td>
                ))}
                <td className="px-1 text-[11.5px] tabular text-muted-foreground">{stopwatch(x)}</td>
                <td>{del(x.i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">t from the stopwatch; 1/t to 3 significant figures (e.g. 1 ÷ 25.4 = 0.0394 s⁻¹); θ from the thermometer in the mixture, to 1 °C.</p>
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">Graph of 1/t against the volume of thiosulphate</p>
        <RatesGraph
          xLabel="V(Na₂S₂O₃) / cm³"
          yLabel="1/t / s⁻¹"
          readOnly={readOnly}
          extent={{ x: 50, y: 0 }}
          series={[{ id: 'c', label: 'Your points', colour: C1, points: pts }]}
          lines={[{ id: 'best', label: 'Your line', colour: CT, line: state.line, onLine: (l) => update((s) => ({ ...s, line: l })), place: () => lineStart(pts), placeLabel: 'a straight line' }]}
        />
      </div>
    </>
  );
}
