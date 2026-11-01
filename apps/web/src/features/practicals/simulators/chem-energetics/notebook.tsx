import { EN_M, SOLY_MASS, SOLY_WATER0, type ChemEnergeticsState, type ChemEnergeticsVariant, type EnAnswerId, type EnNature, type EnergeticsTask } from '@aischool/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { RatesGraph } from '../chem-rates/graph';
import { AnswerRow, Cell } from '../phy-common';
import { KIND_LABEL, type Energetics } from './actions';

/** The question paper for each task (the 2D task card and the 3D bench's task card). */
export function EnTaskText({ task, v }: { task: EnergeticsTask | null; v: ChemEnergeticsVariant }) {
  const given = (
    <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
      {v.given.map((g) => (
        <li key={g}>{g}</li>
      ))}
    </ul>
  );
  if (task === 'SOLY')
    return (
      <>
        <p>You are provided with potassium trioxonitrate(V), a boiling tube, a thermometer, a water bath, a burette of distilled water and a balance.</p>
        {given}
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Weigh {SOLY_MASS.toFixed(1)} g of KNO₃ into the boiling tube and add {SOLY_WATER0.toFixed(1)} cm³ of water from the burette.</li>
          <li>Warm the tube in the water bath, stirring, until all the solid dissolves.</li>
          <li>Take it out and let it cool, stirring with the thermometer. Record the temperature at which crystals first appear.</li>
          <li>Add 1.0 cm³ more water, warm to redissolve and repeat. Continue for at least four volumes of water.</li>
          <li>Calculate the solubility (g per 100 g of water) for each temperature and plot solubility against temperature.</li>
          <li>From your curve find the solubility at {v.tHi} °C and at {v.tLo} °C, the mass of crystals deposited when a solution saturated in 100 g of water at {v.tHi} °C cools to {v.tLo} °C, and the solubility at {v.tLo} °C in mol per kg of water (KNO₃ = {EN_M.KNO3}).</li>
          <li>Define solubility and explain why crystals form on cooling. State two precautions.</li>
        </ol>
      </>
    );
  if (task === 'SOLN')
    return (
      <>
        <p>You are provided with a polystyrene cup, a thermometer, a measuring cylinder, a balance and a spatula.</p>
        {given}
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Measure 50.0 cm³ of distilled water into the polystyrene cup and record its temperature.</li>
          <li>Add 4.00 g of NH₄NO₃, stir until dissolved and record the lowest temperature reached.</li>
          <li>Calculate the heat absorbed and the enthalpy change per mole of NH₄NO₃ (NH₄NO₃ = 80).</li>
          <li>Repeat with 2.00 g of NaOH pellets in 50.0 cm³ of fresh water and record the highest temperature. Compare the two.</li>
          <li>Explain the temperature changes in terms of heat energy. State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with a polystyrene cup with a lid, a thermometer, two 50 cm³ measuring cylinders and a beaker to support the cup.</p>
      {given}
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>Measure 50.0 cm³ of A into the polystyrene cup (in the beaker). Record its steady temperature.</li>
        <li>Measure 50.0 cm³ of B into a cylinder and record its temperature. Take the mean of the two as the initial temperature.</li>
        <li>Pour B quickly into A, cover, stir with the thermometer and record the highest temperature reached.</li>
        <li>Calculate the heat given out (Q = mcΔT, mixture 100 g), the moles of water formed, and the heat of neutralisation in kJ mol⁻¹.</li>
        <li>Explain why ΔH is about −57 kJ mol⁻¹ for any strong acid and strong base, and why a weak acid gives less. State two precautions.</li>
      </ol>
      <p className="text-muted-foreground">H⁺(aq) + OH⁻(aq) → H₂O(l)</p>
    </>
  );
}

const UNIT_HINT: Record<string, string> = { J: 'e.g. J', mol: 'unit', 'kJ/mol': 'unit', 'g/100g': 'unit', g: 'unit', 'mol/kg': 'unit' };

export function Notebook({ v, state, readOnly, update, remove, className }: { v: ChemEnergeticsVariant; state: ChemEnergeticsState; readOnly: boolean; update: Energetics['update']; remove?: (i: number) => void; className?: string }) {
  const task = state.task ?? 'NEUT';
  const setAnswer = (id: EnAnswerId, key: 'value' | 'unit', value: string) => update((s) => ({ ...s, answers: { ...s.answers, [id]: { ...s.answers[id], [key]: value } } }));
  const setWritten = (key: 'explanation' | 'precautions', value: string) => update((s) => ({ ...s, written: { ...s.written, [key]: value.slice(0, 2000) } }));
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Your record</h3>
      {task === 'SOLY' ? <SolyRecord state={state} readOnly={readOnly} update={update} remove={remove} /> : <CupRecord state={state} readOnly={readOnly} update={update} remove={remove} />}
      <div className="mt-5 space-y-3">
        <p className="text-[12.5px] font-semibold">Calculations</p>
        {v.tasks.map((t, k) => (
          <AnswerRow key={t.id} id={`en-${t.id}`} label={`(${['i', 'ii', 'iii', 'iv'][k]}) ${t.label}`} answer={state.answers[t.id]} onChange={(key, x) => setAnswer(t.id, key, x)} readOnly={readOnly} unitHint={UNIT_HINT[t.unit] ?? 'unit'} />
        ))}
      </div>
      <div className="mt-5 space-y-3">
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="en-explanation">
            {task === 'NEUT' ? 'Why is ΔH about −57 kJ mol⁻¹ for any strong acid and strong base, and less negative for ethanoic acid?' : task === 'SOLN' ? 'Explain, in terms of heat energy, why the temperature fell with NH₄NO₃ but rose with NaOH' : 'Define solubility, and explain why crystals form as the solution cools'}
          </label>
          <Textarea id="en-explanation" value={state.written.explanation} onChange={(e) => setWritten('explanation', e.target.value)} disabled={readOnly} rows={3} />
        </div>
        <div>
          <label className="mb-1 block text-[12.5px] font-semibold" htmlFor="en-precautions">
            Two precautions you took
          </label>
          <Textarea id="en-precautions" value={state.written.precautions} onChange={(e) => setWritten('precautions', e.target.value)} disabled={readOnly} rows={3} />
        </div>
      </div>
    </Card>
  );
}

function NaturePick({ label, value, onPick, readOnly }: { label: string; value: EnNature | null; onPick: (x: EnNature | null) => void; readOnly: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      {(['EXO', 'ENDO'] as const).map((x) => (
        <Button key={x} size="sm" variant={value === x ? 'brand' : 'outline'} disabled={readOnly} onClick={() => onPick(value === x ? null : x)} aria-pressed={value === x}>
          {x === 'EXO' ? 'Exothermic' : 'Endothermic'}
        </Button>
      ))}
    </div>
  );
}

function CupRecord({ state, readOnly, update, remove }: { state: ChemEnergeticsState; readOnly: boolean; update: Energetics['update']; remove?: (i: number) => void }) {
  const neut = (state.task ?? 'NEUT') === 'NEUT';
  const setCell = (i: number, key: 'a' | 'b' | 'initial' | 'extreme' | 'dT', value: string) => update((s) => ({ ...s, table: s.table.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
  const cols: { key: 'a' | 'b' | 'initial' | 'extreme' | 'dT'; head: (kind: string) => string }[] = neut
    ? [
        { key: 'a', head: () => 'Acid θ / °C' },
        { key: 'b', head: () => 'Alkali θ / °C' },
        { key: 'initial', head: () => 'Initial θ / °C' },
        { key: 'extreme', head: () => 'Highest θ / °C' },
        { key: 'dT', head: () => 'ΔT / K' },
      ]
    : [
        { key: 'a', head: () => 'Initial θ / °C' },
        { key: 'extreme', head: () => 'Lowest / highest θ / °C' },
        { key: 'dT', head: () => 'ΔT / K' },
      ];
  const setNature = (which: 'main' | 'other', x: EnNature | null) => update((s) => ({ ...s, nature: { ...s.nature, [which]: x } }), `nature:${which}:${x ?? 'none'}`);
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              {!neut && <th className="px-1 py-1 font-medium">Solid</th>}
              {cols.map((c) => (
                <th key={c.key} className="px-1 py-1 font-medium">
                  {c.head('')}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {state.runs.length === 0 && (
              <tr>
                <td colSpan={cols.length + 2} className="py-3 text-muted-foreground">
                  A row appears when you measure {neut ? 'the acid' : 'the water'} into the cup.
                </td>
              </tr>
            )}
            {state.runs.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {!neut && <td className="px-1 text-[11.5px] text-muted-foreground">{r.solid ? KIND_LABEL[r.kind] : '—'}</td>}
                {cols.map((c) => (
                  <td key={c.key} className="px-1 py-1.5">
                    <Cell value={state.table[i]?.[c.key] ?? ''} onChange={(x) => setCell(i, c.key, x)} readOnly={readOnly} label={`Run ${i + 1}: ${c.head('')}`} />
                  </td>
                ))}
                <td>
                  {!readOnly && remove && r.done && (
                    <Button size="icon-sm" variant="ghost" onClick={() => remove(i)} aria-label={`Delete run ${i + 1}`}>
                      ×
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{neut ? 'Temperatures to one decimal place (nearest 0.5 °C). Initial = mean of the acid and alkali; ΔT = highest − initial. The last completed run is marked.' : 'Temperatures to one decimal place (nearest 0.5 °C). ΔT = the size of the change. The last NH₄NO₃ and NaOH runs are marked.'}</p>
      <div className="mt-3 space-y-1.5">
        <NaturePick label={neut ? 'Neutralisation is' : 'Dissolving NH₄NO₃ is'} value={state.nature.main} onPick={(x) => setNature('main', x)} readOnly={readOnly} />
        {!neut && <NaturePick label="Dissolving NaOH is" value={state.nature.other} onPick={(x) => setNature('other', x)} readOnly={readOnly} />}
      </div>
    </>
  );
}

function SolyRecord({ state, readOnly, update, remove }: { state: ChemEnergeticsState; readOnly: boolean; update: Energetics['update']; remove?: (i: number) => void }) {
  const setCell = (i: number, key: 'water' | 'temp' | 'sol', value: string) => update((s) => ({ ...s, solyTable: s.solyTable.map((r, k) => (k === i ? { ...r, [key]: value } : r)) }));
  const points = state.solyTable.flatMap((r) => {
    const x = Number(r.temp.trim());
    const y = Number(r.sol.trim());
    return r.temp.trim() && r.sol.trim() && Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
  });
  return (
    <>
      <p className="mb-1 text-[12.5px] text-muted-foreground">Mass of KNO₃: {state.soly.mass === null ? '— (not weighed yet)' : `${state.soly.mass.toFixed(1)} g`}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] text-muted-foreground">
              <th className="px-1 py-1 font-medium">Water / cm³</th>
              <th className="px-1 py-1 font-medium">θ crystals appear / °C</th>
              <th className="px-1 py-1 font-medium">Solubility / g per 100 g water</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.soly.runs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-muted-foreground">
                  A row appears each time you add water to the tube.
                </td>
              </tr>
            )}
            {state.soly.runs.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {(['water', 'temp', 'sol'] as const).map((k) => (
                  <td key={k} className="px-1 py-1.5">
                    <Cell value={state.solyTable[i]?.[k] ?? ''} onChange={(x) => setCell(i, k, x)} readOnly={readOnly} label={`Run ${i + 1}: ${k === 'water' ? 'volume of water' : k === 'temp' ? 'temperature' : 'solubility'}`} />
                  </td>
                ))}
                <td className="px-1 text-[11px] text-muted-foreground">
                  {r.done ? '' : 'in progress'}
                  {!readOnly && remove && r.done && (
                    <Button size="icon-sm" variant="ghost" onClick={() => remove(i)} aria-label={`Delete run ${i + 1}`}>
                      ×
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">Water: the total in the tube (1.0 cm³ = 1.0 g). Solubility = {SOLY_MASS.toFixed(1)} × 100 ÷ water. θ to one decimal place.</p>
      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold">Solubility curve</p>
        <RatesGraph
          xLabel="Temperature / °C"
          yLabel="Solubility / g per 100 g"
          readOnly={readOnly}
          series={[{ id: 's', label: 'KNO₃', colour: '#2563eb', points, curve: state.curve, onCurve: (c) => update((s) => ({ ...s, curve: c }), `curve:${c ?? 'none'}`) }]}
          lines={[]}
        />
      </div>
    </>
  );
}
