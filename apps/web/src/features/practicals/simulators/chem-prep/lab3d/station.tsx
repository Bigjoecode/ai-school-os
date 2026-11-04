import { amRun, dsRun, dsThermometer, prepTubes, prepTubeVisual, stdRun, type ChemPrepState, type ChemPrepVariant, type PrepItem, type PrepTask } from '@aischool/shared';
import { useMemo } from 'react';
import { Burette, DropperBottle, Filler, MeasuringCylinder, Pipette, ReagentBottle, WashBottle, WhiteTile } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { bookTexture, taskCardTexture } from '../../../lab3d-kit/textures';
import { Balance } from '../../chem-organic/lab3d/models';
import { FilterFunnel, SampleBeaker, TubeRack } from '../../chem-qualitative/lab3d/models';
import { PSPOT, halideSpot, reagentSpot, usePrepBench } from './bench';
import { DistillRig, Dryer, EvapDish, Fountain, GasJar, GasTube, PrepTube, RIG, SolBeaker, TempBath, VolFlask, WeighBottle, asOrgVisual } from './models';
import { PREP_APPARATUS_LABEL, type PrepApparatusId, type PrepScene } from './scene-state';

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];

/** The reagent dropper bottles of the tube tasks. */
export const PREP_REAGENTS: Record<'LECHAT' | 'HALOGEN', { id: PrepItem; name: string; colour: string; info: string }[]> = {
  LECHAT: [
    { id: 'FECL3', name: 'FeCl₃(aq)', colour: '#e0b25a', info: 'Iron(III) chloride: a source of Fe³⁺ (a reactant).' },
    { id: 'KSCN', name: 'KSCN(aq)', colour: '#eef2f5', info: 'Potassium thiocyanate: a source of SCN⁻ (the other reactant).' },
    { id: 'NH4CL', name: 'NH₄Cl(s)', colour: '#f4f4f0', info: 'Solid ammonium chloride: its Cl⁻ ties up Fe³⁺ as FeCl²⁺.' },
    { id: 'HCL', name: 'Dilute HCl', colour: '#eef2f5', info: 'Adds H⁺ to the chromate equilibrium.' },
    { id: 'NAOH', name: 'Dilute NaOH', colour: '#eef2f5', info: 'Removes H⁺ (OH⁻ + H⁺ → H₂O). Corrosive.' },
    { id: 'WATER', name: 'Distilled water', colour: '#e8f0f6', info: 'Dilutes every species in the tube.' },
  ],
  HALOGEN: [
    { id: 'CL2', name: 'Chlorine water (fresh)', colour: '#e9efc8', info: 'Pale yellow-green; toxic: a few drops, in a ventilated room. Made today.' },
    { id: 'CL2OLD', name: 'Chlorine water (old)', colour: '#eef2ea', info: 'Labelled “last term”: chlorine escapes and reacts with water in light, so it is weak.' },
    { id: 'BR2', name: 'Bromine water', colour: '#e39a35', info: 'Orange (yellow-brown). Toxic: a few drops only.' },
    { id: 'I2', name: 'Iodine solution', colour: '#7d3f14', info: 'Brown (iodine in KI).' },
    { id: 'HEXANE', name: 'Hexane', colour: '#f3f5f6', info: 'An organic solvent that does not mix with water; halogens dissolve in it with their own colours. Flammable.' },
    { id: 'STARCH', name: 'Starch solution', colour: '#eceae2', info: 'Blue-black with iodine.' },
  ],
};
export const PREP_HALIDES: { id: PrepItem; name: string }[] = [
  { id: 'KCL', name: 'KCl(aq)' },
  { id: 'KBR', name: 'KBr(aq)' },
  { id: 'KI', name: 'KI(aq)' },
  { id: 'WATER', name: 'Distilled water' },
];

const CUPBOARD_SLOT: Record<PrepApparatusId, V3> = {
  balance: [-0.85, CUPBOARD_SHELVES[1]!, 0.04],
  bottle: [-0.6, CUPBOARD_SHELVES[1]!, 0.06],
  beaker: [-0.4, CUPBOARD_SHELVES[1]!, 0.06],
  funnel: [-0.2, CUPBOARD_SHELVES[1]!, 0.06],
  washBottle: [0.0, CUPBOARD_SHELVES[1]!, 0.06],
  flasks: [0.25, CUPBOARD_SHELVES[1]!, 0.04],
  pipette: [0.6, CUPBOARD_SHELVES[1]!, 0.06],
  rack: [0.85, CUPBOARD_SHELVES[1]!, 0.04],
  tile: [-0.85, CUPBOARD_SHELVES[2]!, 0.06],
  baths: [-0.6, CUPBOARD_SHELVES[2]!, 0.04],
  dishKit: [-0.3, CUPBOARD_SHELVES[2]!, 0.04],
  still: [0.05, CUPBOARD_SHELVES[2]!, 0.04],
  gasKit: [0.45, CUPBOARD_SHELVES[2]!, 0.04],
  dryers: [0.8, CUPBOARD_SHELVES[2]!, 0.06],
  jars: [-0.7, CUPBOARD_SHELVES[0]! + 0.01, 0.06],
  fountainKit: [-0.3, CUPBOARD_SHELVES[0]! + 0.01, 0.04],
  burette: [0.2, CUPBOARD_SHELVES[0]! + 0.01, 0.05],
  cylinder: [0.55, CUPBOARD_SHELVES[0]! + 0.01, 0.06],
};

function ApparatusModel({ id, glow }: { id: PrepApparatusId; glow?: boolean }) {
  switch (id) {
    case 'balance':
      return <Balance grams={null} glow={glow} />;
    case 'bottle':
      return <WeighBottle grams={0} glow={glow} />;
    case 'beaker':
      return <SolBeaker powder={false} water={false} rod glow={glow} />;
    case 'funnel':
      return <FilterFunnel residue={null} glow={glow} />;
    case 'washBottle':
      return <WashBottle glow={glow} />;
    case 'flasks':
      return <group scale={0.7}><VolFlask f={null} label="250 cm³" glow={glow} /></group>;
    case 'pipette':
      return <group rotation={[0, 0, Math.PI / 2]} scale={0.5}><Pipette filled={0} glow={glow} /></group>;
    case 'rack':
      return <TubeRack tubes={[]} glow={glow} />;
    case 'tile':
      return <WhiteTile glow={glow} />;
    case 'baths':
      return <group scale={0.7}><TempBath kind="ICE" glow={glow} /></group>;
    case 'dishKit':
      return <group scale={0.5}><EvapDish water={0} dry={false} spat={false} lit={false} bath={false} glow={glow} /></group>;
    case 'still':
      return <group scale={0.3}><VolFlask f={null} label="still" glow={glow} /></group>;
    case 'gasKit':
      return <group scale={0.4}><ReagentBottle name="tube" band="#64748b" glow={glow} /></group>;
    case 'dryers':
      return <group scale={0.7}><Dryer kind="CAO" glow={glow} /></group>;
    case 'jars':
      return <group scale={0.6}><ReagentBottle name="gas jar" band="#94a3b8" glow={glow} /></group>;
    case 'fountainKit':
      return <group scale={0.35}><VolFlask f={null} label="fountain" glow={glow} /></group>;
    case 'burette':
      return <group scale={0.3}><Burette level={null} bubble={false} detail={false} /></group>;
    case 'cylinder':
      return <MeasuringCylinder glow={glow} />;
  }
}

export function PrepCupboard({ scene }: { scene: PrepScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as PrepApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={PREP_APPARATUS_LABEL[id]} labelY={0.28} position={CUPBOARD_SLOT[id]} drag={carry}>
            {(active) => (
              <group>
                <ApparatusModel id={id} glow={active} />
                <mesh position={[0, 0.07, 0]}>
                  <boxGeometry args={[0.16, 0.16, 0.12]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            )}
          </Interactive>
        ))}
    </group>
  );
}

const CARD: Record<PrepTask, string[]> = {
  STANDARD: ['250 cm³ of 0.100 mol dm⁻³ Na₂CO₃: weigh ≈2.65 g by difference.', 'Dissolve, transfer with rinsings, make up to the mark, invert.', 'Pipette 25.0 cm³ into flask 2, make up. C₁V₁ = C₂V₂.'],
  LECHAT: ['Pale-red Fe³⁺/SCN⁻ mixture: control, + FeCl₃, + KSCN, + NH₄Cl.', 'One tube in hot water, one in iced water. Compare.', 'Chromate: + acid, then + alkali. Work out Kc.'],
  DISTIL: ['Filter; weigh dish; 50.0 cm³; evaporate; water bath; constant mass.', 'Distil: granules, thermometer at side arm, water in at bottom.', 'Collect, read the temperature, test the distillate.'],
  HALOGEN: ['Each halogen water with the other halides (6 tubes).', 'Hexane, shake: the colour of the upper layer.', 'Controls; starch; order of reactivity.'],
  AMMONIA: ['NH₄Cl + Ca(OH)₂, tube sloping down, heat gently.', 'Dry the gas; collect it the right way.', 'Litmus, HCl fumes, fountain. Work out the volume.'],
};

export function PrepStation({ v, state, scene }: { v: ChemPrepVariant; state: ChemPrepState; scene: PrepScene }) {
  const task = state.task ?? v.task;
  const card = useMemo(() => taskCardTexture(CARD[task]), [task]);
  const book = useMemo(() => bookTexture(), []);
  const has = (id: PrepApparatusId) => scene.collected.has(id);
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {task === 'STANDARD' && <StandardBench v={v} state={state} has={has} />}
      {(task === 'LECHAT' || task === 'HALOGEN') && <TubeBench state={state} task={task} has={has} />}
      {task === 'DISTIL' && <DistilBench v={v} state={state} has={has} />}
      {task === 'AMMONIA' && <AmmoniaBench v={v} state={state} has={has} />}
      <Interactive id="card" label="Task card" bench position={at(PSPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(PSPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
        <mesh position={[0, 0.006, 0]} material={mat.red()}>
          <boxGeometry args={[0.3, 0.008, 0.2]} />
        </mesh>
        <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.29, 0.19]} />
          <meshStandardMaterial map={book} roughness={0.85} />
        </mesh>
      </Interactive>
      {(['burette', 'cylinder'] as const)
        .filter((id) => scene.collected.has(id))
        .map((id, k) => (
          <Interactive key={id} id={id} label={PREP_APPARATUS_LABEL[id]} bench position={[PSPOT.extras[0], 0.004, PSPOT.extras[2] - 0.12 * k]} labelY={0.06}>
            {(a) => (id === 'cylinder' ? <MeasuringCylinder glow={a} /> : <group scale={0.3}><Burette level={null} bubble={false} detail={false} glow={a} /></group>)}
          </Interactive>
        ))}
    </group>
  );
}

type Has = (id: PrepApparatusId) => boolean;

function StandardBench({ v, state, has }: { v: ChemPrepVariant; state: ChemPrepState; has: Has }) {
  const r = useMemo(() => stdRun(v, state.events), [v, state.events]);
  return (
    <>
      <Interactive id="stockJar" label="Anhydrous Na₂CO₃ (M = 106)" bench position={at(PSPOT.stockJar)} labelY={0.16}>
        {(a) => <ReagentBottle name="Na₂CO₃" sub="anhydrous" band="#0f766e" liquid="#f6f6f2" glow={a} />}
      </Interactive>
      {has('bottle') && (
        <Interactive id="bottle" label={r.tipped ? 'Weighing bottle (tipped out)' : `Weighing bottle${r.inBottle > 0 ? ' with Na₂CO₃' : ''}`} bench position={at(PSPOT.bottle)} labelY={0.08}>
          {(a) => <WeighBottle grams={r.inBottle} glow={a} />}
        </Interactive>
      )}
      {has('balance') && (
        <Interactive id="balance" label={`Balance: ${(r.balance ?? 0).toFixed(2)} g`} bench position={at(PSPOT.balance)} labelY={0.1}>
          {(a) => <Balance grams={r.balance} glow={a} />}
        </Interactive>
      )}
      {has('beaker') && (
        <Interactive id="beaker" label={r.poured ? `Beaker (rinsed ${r.rinses}×)` : r.dissolved ? 'Beaker: clear solution' : 'Beaker and glass rod'} bench position={at(PSPOT.beaker)} labelY={0.12}>
          {(a) => <SolBeaker powder={r.where === 'BEAKER' && !r.dissolved} water={r.water && r.where === 'BEAKER' && !r.poured} rod glow={a} />}
        </Interactive>
      )}
      {has('washBottle') && (
        <Interactive id="washBottle" label="Wash bottle of distilled water (and a dropper)" bench position={at(PSPOT.washBottle)} labelY={0.18}>
          {(a) => <WashBottle glow={a} />}
        </Interactive>
      )}
      {has('flasks') && (
        <>
          <Interactive id="flask" label={`Flask 1: ${r.f1.started ? `${r.f1.vol.toFixed(1)} cm³` : 'empty'}`} bench position={at(PSPOT.flask)} labelY={0.3}>
            {(a) => <VolFlask f={r.f1} label="250 cm³ ①" funnel={has('funnel') && r.poured && !r.f1.filled} stopper={r.f1.mixed > 0} glow={a} />}
          </Interactive>
          <Interactive id="flask2" label={`Flask 2: ${r.f2.started ? `${r.f2.vol.toFixed(1)} cm³` : 'empty'}`} bench position={at(PSPOT.flask2)} labelY={0.3}>
            {(a) => <VolFlask f={r.f2} label="250 cm³ ②" stopper={r.f2.mixed > 0} glow={a} />}
          </Interactive>
        </>
      )}
      {has('pipette') && (
        <Interactive id="pipette" label={r.pipetted ? 'Pipette (used)' : '25.0 cm³ pipette and filler'} bench position={at(PSPOT.pipette)} labelY={0.06}>
          {(a) => (
            <group>
              <group position={[0, 0.008, 0]} rotation={[0, 0.2, Math.PI / 2]} scale={0.8}>
                <Pipette filled={0} glow={a} />
              </group>
              <group position={[0.12, 0, 0.04]}>
                <Filler glow={a} />
              </group>
            </group>
          )}
        </Interactive>
      )}
    </>
  );
}

function TubeBench({ state, task, has }: { state: ChemPrepState; task: 'LECHAT' | 'HALOGEN'; has: Has }) {
  const active = usePrepBench((b) => b.active);
  const tubes = prepTubes(task, state.events);
  const cur = active >= 0 && active < tubes.length ? active : tubes.length - 1;
  const t = tubes[cur];
  const vis = t ? prepTubeVisual(task, state.events, cur) : null;
  const inBath = task === 'LECHAT' && t && t.temp !== 'ROOM' ? t.temp : null;
  const rackTubes = tubes
    .map((_, i) => i)
    .filter((i) => i !== cur)
    .slice(-6)
    .map((i) => {
      const o = asOrgVisual(prepTubeVisual(task, state.events, i));
      return { liquid: o.liquid, ppt: null, solid: null, bubbles: false, fumes: null, ring: null, flame: null, deposit: null, droplets: false, sublimate: false, probes: [] };
    });
  const reagents = PREP_REAGENTS[task];
  return (
    <>
      {task === 'LECHAT' && (
        <Interactive id="stock" label={state.events.some((e) => e.a === 'STOCK') ? 'Beaker of Fe³⁺/SCN⁻ mixture' : 'Beaker for the Fe³⁺/SCN⁻ mixture'} bench position={at(PSPOT.stock)} labelY={0.12}>
          {(a) => <SampleBeaker colour={state.events.some((e) => e.a === 'STOCK') ? ([...state.events].reverse().find((e) => e.a === 'STOCK')!.x === 'CONC' ? '#8a0f14' : '#e7a98a') : '#e8f0f6'} glow={a} />}
        </Interactive>
      )}
      {task === 'LECHAT' && (
        <Interactive id="chromate" label="Potassium chromate(VI) solution (toxic)" bench position={[PSPOT.stock[0] - 0.16, 0, PSPOT.stock[2]]} labelY={0.16}>
          {(a) => <ReagentBottle name="K₂CrO₄" band="#ca8a04" liquid="#f0cf2a" glow={a} />}
        </Interactive>
      )}
      {task === 'HALOGEN' &&
        PREP_HALIDES.map((h, k) => (
          <Interactive key={h.id} id={`halide:${h.id}`} label={h.name} bench position={at(halideSpot(k))} labelY={0.16}>
            {(a) => <ReagentBottle name={h.name.replace('(aq)', '')} band={h.id === 'WATER' ? '#0e7490' : '#475569'} r={0.03} h={0.11} glow={a} />}
          </Interactive>
        ))}
      <group position={at(PSPOT.reagents)}>
        <mesh position={[0.18, 0.004, 0.03]} material={mat.wood()}>
          <boxGeometry args={[0.46, 0.008, 0.14]} />
        </mesh>
      </group>
      {reagents.map((b, k) => (
        <Interactive key={b.id} id={`reagent:${b.id}`} label={b.name} bench position={at(reagentSpot(k), 0.008)} labelY={0.11}>
          {(a) => <DropperBottle name={b.name} colour={b.colour} glow={a} />}
        </Interactive>
      ))}
      {has('rack') && (
        <Interactive id="rack" label={tubes.length ? `Test tubes (${tubes.length} used)` : 'Clean test tubes'} bench position={at(PSPOT.rack)} labelY={0.18}>
          {(a) => <TubeRack tubes={rackTubes} glow={a} />}
        </Interactive>
      )}
      {has('tile') && (
        <Interactive id="tile" label="White tile (to compare colours)" bench position={at(PSPOT.tile)} labelY={0.04}>
          {(a) => <WhiteTile glow={a} />}
        </Interactive>
      )}
      {t && !inBath && (
        <Interactive id="tube" label={`Tube ${cur + 1} (in use)`} bench position={at(PSPOT.tube, 0.008)} labelY={0.2}>
          {(a) => <PrepTube vis={vis} glow={a} />}
        </Interactive>
      )}
      {task === 'LECHAT' && has('baths') && (
        <>
          <Interactive id="hot" label="Hot water (about 70 °C)" bench position={at(PSPOT.hot)} labelY={0.18}>
            {(a) => (
              <TempBath kind="HOT" glow={a}>
                {inBath === 'HOT' && (
                  <group position={[0, 0.02, 0]}>
                    <PrepTube vis={vis} />
                  </group>
                )}
              </TempBath>
            )}
          </Interactive>
          <Interactive id="ice" label="Iced water (about 2 °C)" bench position={at(PSPOT.ice)} labelY={0.18}>
            {(a) => (
              <TempBath kind="ICE" glow={a}>
                {inBath === 'ICE' && (
                  <group position={[0, 0.02, 0]}>
                    <PrepTube vis={vis} />
                  </group>
                )}
              </TempBath>
            )}
          </Interactive>
        </>
      )}
    </>
  );
}

function DistilBench({ v, state, has }: { v: ChemPrepVariant; state: ChemPrepState; has: Has }) {
  const r = useMemo(() => dsRun(v, state.events), [v, state.events]);
  const last = [...state.events].reverse().find((e) => e.a === 'HEAT_DISH' || e.a === 'BATH_DISH' || e.a === 'COOL');
  const reading = dsThermometer(v, r);
  return (
    <>
      <Interactive id="seawater" label="Sea water (with a little sand)" bench position={[PSPOT.funnel[0] - 0.14, 0, PSPOT.funnel[2]]} labelY={0.16}>
        {(a) => <ReagentBottle name="Sea water" band="#0e7490" liquid="#d8e6ea" glow={a} />}
      </Interactive>
      {has('funnel') && (
        <Interactive id="funnel" label={r.filtered ? 'Filter funnel: sand on the paper' : 'Filter funnel and paper'} bench position={at(PSPOT.funnel)} labelY={0.16}>
          {(a) => <FilterFunnel residue={r.filtered ? '#c9b48a' : null} glow={a} />}
        </Interactive>
      )}
      {has('balance') && (
        <Interactive id="balance" label={`Balance: ${(r.balance ?? 0).toFixed(2)} g`} bench position={at(PSPOT.dbalance)} labelY={0.1}>
          {(a) => <Balance grams={r.balance} glow={a} />}
        </Interactive>
      )}
      {has('dishKit') && (
        <Interactive id="dish" label={`Evaporating dish${r.measured ? (r.water > 0 ? ` (${r.water.toFixed(0)} cm³)` : ': white salt') : ''}`} bench position={at(PSPOT.dish)} labelY={0.3}>
          {(a) => <EvapDish water={r.water} dry={r.measured && r.water === 0} spat={r.spat > 0} lit={!!last && last.a !== 'COOL' && r.hot} bath={last?.a === 'BATH_DISH'} glow={a} />}
        </Interactive>
      )}
      {has('still') && (
        <group position={at(PSPOT.rig)}>
          <Interactive id="dflask" label={`Distillation flask${r.filled ? ` (${r.liquidVol.toFixed(0)} cm³)` : ''}${r.heating ? ' — heating' : ''}`} bench position={[0, 0, 0]} labelY={0.32}>
            {(a) => <DistillRig r={r} reading={reading} glow={a ? 'flask' : null} />}
          </Interactive>
          <Interactive id="thermometer" label={r.thermo ? `Thermometer: ${reading.toFixed(1)} °C` : 'Thermometer (not fitted)'} bench position={RIG.thermo} labelY={0.16}>
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[0.03, 0.14, 0.03]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </Interactive>
          <Interactive id="condenser" label={r.condenser ? `Liebig condenser (water in at the ${r.condenser.toLowerCase()})` : 'Liebig condenser (not connected)'} bench position={RIG.condenser} labelY={0.08}>
            <mesh rotation={[0, 0, -0.22]}>
              <boxGeometry args={[0.3, 0.05, 0.05]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </Interactive>
          <Interactive id="receiver" label={`Receiver: ${r.distillate.toFixed(0)} cm³ of distillate`} bench position={[RIG.receiver[0] + 0.02, 0, 0]} labelY={0.14}>
            <mesh position={[0, 0.05, 0]}>
              <boxGeometry args={[0.08, 0.1, 0.08]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </Interactive>
        </group>
      )}
    </>
  );
}

function AmmoniaBench({ v, state, has }: { v: ChemPrepVariant; state: ChemPrepState; has: Has }) {
  const r = useMemo(() => amRun(v, state.events), [v, state.events]);
  return (
    <>
      {has('balance') && (
        <Interactive id="balance" label={`Balance: ${(r.balance ?? 0).toFixed(2)} g`} bench position={at(PSPOT.abalance)} labelY={0.1}>
          {(a) => <Balance grams={r.balance} glow={a} />}
        </Interactive>
      )}
      <Interactive id="mortar" label={r.mixed ? 'Mixed NH₄Cl and Ca(OH)₂' : 'NH₄Cl and Ca(OH)₂ (mix them here)'} bench position={at(PSPOT.mortar)} labelY={0.12}>
        {(a) => <SolBeaker powder={r.nh4 !== null && !r.loaded} water={false} rod={r.mixed && !r.loaded} glow={a} />}
      </Interactive>
      <group position={[PSPOT.mortar[0] - 0.14, 0, PSPOT.mortar[2] + 0.02]}>
        <ReagentBottle name="NH₄Cl" band="#7c3aed" liquid="#f6f6f2" r={0.028} h={0.1} />
        <group position={[0, 0, 0.09]}>
          <ReagentBottle name="Ca(OH)₂" band="#0369a1" liquid="#f6f6f2" r={0.028} h={0.1} />
        </group>
      </group>
      {has('gasKit') && (
        <Interactive id="gtube" label={r.cracked ? 'Hard-glass tube (cracked!)' : 'Hard-glass tube, clamp and burner'} bench position={at(PSPOT.gasRig)} labelY={0.4}>
          {(a) => <GasTube r={r} glow={a} />}
        </Interactive>
      )}
      {has('dryers') && (
        <Interactive id="dryer" label={r.dryer ? `Drying agent: ${r.dryer === 'CAO' ? 'quicklime' : r.dryer === 'H2SO4' ? 'conc. H₂SO₄' : 'CaCl₂'}` : 'Drying agents'} bench position={at(PSPOT.dryer)} labelY={0.22}>
          {(a) => <Dryer kind={r.dryer} glow={a} />}
        </Interactive>
      )}
      {has('jars') && (
        <>
          <Interactive id="jar" label={r.collect ? `Gas jar (${r.collect === 'UPWARD' ? 'inverted' : r.collect === 'DOWNWARD' ? 'upright' : 'over water'})` : 'Gas jar'} bench position={at(PSPOT.jar)} labelY={0.32}>
            {(a) => <GasJar r={r} glow={a} />}
          </Interactive>
          <Interactive id="testKit" label="Red litmus paper and a bottle of conc. HCl with a glass rod" bench position={at(PSPOT.testKit)} labelY={0.14}>
            {(a) => <ReagentBottle name="conc. HCl" band="#b91c1c" r={0.026} h={0.1} glow={a} />}
          </Interactive>
        </>
      )}
      {has('fountainKit') && (
        <Interactive id="trough" label={r.fountain !== null ? 'Fountain: pink water in the flask' : 'Fountain flask over a trough (phenolphthalein in the water)'} bench position={at(PSPOT.trough)} labelY={0.42}>
          {(a) => <Fountain strength={r.fountain} glow={a} />}
        </Interactive>
      )}
    </>
  );
}
