import { ORG_TEST_INFO, orgObserve, orgSampleName, soapRun, type ChemOrganicState, type ChemOrganicVariant, type OrgStep, type OrgTask, type OrgTestId, type OrgVisual } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import { Burette, DropperBottle, MeasuringCylinder, ReagentBottle, Thermometer } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { bookTexture, taskCardTexture } from '../../../lab3d-kit/textures';
import { LetterBeaker, WaterBath } from '../../bio-food-tests/lab3d/models';
import { Holder, TubeRack, TUBE } from '../../chem-qualitative/lab3d/models';
import { BATH_TOP, HEAT_ANIM_MS, OSPOT, sampleSpot, useOrgBench } from './bench';
import { Balance, EsterBeaker, LatherTube, OrgTube, SoapBeaker, SoapFunnel, SplintKit } from './models';
import { ORG_APPARATUS_LABEL, type OrgApparatusId, type OrgScene } from './scene-state';

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];

/** The reagent bottles on each task's shelf: the test each starts, or the addition it makes to the tube in use. */
export interface OrgBottle {
  id: string;
  name: string;
  colour: string;
  task: Exclude<OrgTask, 'SOAP'>;
  start?: [OrgTestId, OrgStep?];
  step?: OrgStep;
  teacher?: boolean;
  info: string;
}
export const ORG_BOTTLES: OrgBottle[] = [
  { id: 'BROMINE', name: 'Bromine water', colour: '#e08a2c', task: 'GROUPS', start: ['BROMINE'], info: 'Orange (yellow-brown). Toxic: a few drops only. Decolourised rapidly by a C=C double bond.' },
  { id: 'KMNO4', name: 'Acid. KMnO₄', colour: '#6f1d78', task: 'GROUPS', start: ['KMNO4'], info: 'Purple. Decolourised rapidly by an alkene.' },
  { id: 'DICHROMATE', name: 'Acid. K₂Cr₂O₇', colour: '#e8791c', task: 'GROUPS', start: ['DICHROMATE'], info: 'Orange. Warmed with an alkanol it turns green (Cr³⁺).' },
  { id: 'SODIUM', name: 'Sodium (teacher)', colour: '#c9cbc6', task: 'GROUPS', start: ['SODIUM'], teacher: true, info: 'Stored under paraffin. Reacts violently with water: the teacher adds a tiny piece to dry samples only.' },
  { id: 'NAHCO3', name: 'NaHCO₃', colour: '#f2f1ec', task: 'GROUPS', start: ['NAHCO3'], info: 'Sodium hydrogencarbonate: an acid makes it fizz (CO₂).' },
  { id: 'ETHANOIC', name: 'Ethanoic acid', colour: '#eef2f5', task: 'GROUPS', start: ['ESTER', 'ACID_PARTNER'], step: 'ACID_PARTNER', info: 'The partner for an alkanol in esterification.' },
  { id: 'ETHANOL', name: 'Ethanol', colour: '#eef2f5', task: 'GROUPS', start: ['ESTER', 'ETHANOL_PARTNER'], step: 'ETHANOL_PARTNER', info: 'The partner for an acid in esterification. Flammable.' },
  { id: 'H2SO4', name: 'Conc. H₂SO₄ (teacher)', colour: '#eef2f5', task: 'GROUPS', step: 'H2SO4', teacher: true, info: 'Very corrosive: the teacher adds 3 drops. It catalyses esterification.' },
  { id: 'BENEDICT', name: "Benedict's", colour: '#2f6fd6', task: 'CARBS', start: ['BENEDICT'], step: 'BENEDICT', info: 'Blue. Heated with a reducing sugar: green, yellow, orange, then a brick-red precipitate (Cu₂O).' },
  { id: 'FEHLING', name: "Fehling's A+B", colour: '#1f4fb8', task: 'CARBS', start: ['FEHLING'], info: 'Deep blue. Fehling’s B contains NaOH: corrosive. Same result as Benedict’s.' },
  { id: 'IODINE', name: 'Iodine in KI', colour: '#c08a3a', task: 'CARBS', start: ['IODINE'], info: 'Yellow-brown; blue-black with starch. Do not heat.' },
  { id: 'HCL', name: 'Dilute HCl', colour: '#e9eef2', task: 'CARBS', start: ['HYDROLYSIS', 'ACID'], step: 'ACID', info: 'Boiled with the sample it hydrolyses sucrose and starch.' },
  { id: 'NAHCO3C', name: 'NaHCO₃', colour: '#f2f1ec', task: 'CARBS', step: 'NEUTRALISE', info: 'Neutralises the acid (it fizzes) before Benedict’s is added.' },
  { id: 'NAOH', name: 'NaOH(aq)', colour: '#e9eef2', task: 'PROTEINS', start: ['BIURET', 'NAOH'], step: 'NAOH', info: 'Corrosive: goggles. The first Biuret reagent.' },
  { id: 'CUSO4', name: '1% CuSO₄', colour: '#8fc3ea', task: 'PROTEINS', step: 'CUSO4', info: 'Drop by drop: too much blue masks the violet.' },
  { id: 'MILLON', name: "Millon's (teacher)", colour: '#ece9df', task: 'PROTEINS', start: ['MILLON'], teacher: true, info: 'Contains mercury: toxic, teacher only.' },
  { id: 'HNO3', name: 'Conc. HNO₃ (teacher)', colour: '#f3f0d8', task: 'PROTEINS', start: ['XANTHO', 'HNO3'], step: 'HNO3', teacher: true, info: 'Very corrosive: teacher only. Turns proteins yellow on warming.' },
  { id: 'NH3', name: 'NH₃(aq)', colour: '#e9eef2', task: 'PROTEINS', step: 'NH3', info: 'Turns the yellow of the xanthoproteic test orange.' },
  { id: 'NINHYDRIN', name: 'Ninhydrin', colour: '#efeaf4', task: 'PROTEINS', start: ['NINHYDRIN'], info: 'Warmed with proteins or amino acids: blue-violet. Stains skin.' },
];
export const bottlesFor = (task: OrgTask) => ORG_BOTTLES.filter((b) => b.task === task);

export const SOAP_BOTTLES = [
  { id: 'OIL', name: 'Palm oil', band: '#d9601c', liquid: '#d9601c' },
  { id: 'NAOH', name: '20% NaOH', band: '#b91c1c', liquid: '#eef2f5' },
  { id: 'BRINE', name: 'Brine (sat. NaCl)', band: '#1d4ed8', liquid: '#e3edf2' },
  { id: 'WATER', name: 'Distilled water', band: '#0e7490', liquid: '#e8f0f6' },
  { id: 'HARD', name: 'Hard water', band: '#6b7280', liquid: '#eceee8' },
] as const;

const CUPBOARD_SLOT: Record<OrgApparatusId, V3> = {
  rack: [-0.8, CUPBOARD_SHELVES[1]!, 0.02],
  holder: [-0.45, CUPBOARD_SHELVES[1]!, 0.04],
  bath: [-0.1, CUPBOARD_SHELVES[1]!, 0.02],
  gasKit: [0.25, CUPBOARD_SHELVES[1]!, 0.06],
  cylinder: [0.6, CUPBOARD_SHELVES[1]!, 0.04],
  burner: [-0.75, CUPBOARD_SHELVES[2]!, 0.02],
  beaker: [-0.4, CUPBOARD_SHELVES[2]!, 0.06],
  rod: [-0.15, CUPBOARD_SHELVES[2]!, 0.08],
  funnel: [0.1, CUPBOARD_SHELVES[2]!, 0.04],
  balance: [0.45, CUPBOARD_SHELVES[2]!, 0.04],
  burette: [-0.6, CUPBOARD_SHELVES[0]! + 0.01, 0.05],
  thermometer: [0.3, CUPBOARD_SHELVES[0]! + 0.01, 0.06],
};

function ApparatusModel({ id, glow }: { id: OrgApparatusId; glow?: boolean }) {
  switch (id) {
    case 'rack':
      return <TubeRack tubes={[]} glow={glow} />;
    case 'holder':
      return <Holder glow={glow} />;
    case 'bath':
      return <WaterBath lit={false} glow={glow} />;
    case 'gasKit':
      return <SplintKit glow={glow} />;
    case 'cylinder':
      return <MeasuringCylinder glow={glow} />;
    case 'burner':
      return <SoapBeaker r={null} lit={false} glow={glow} />;
    case 'beaker':
      return <EsterBeaker ester={false} glow={glow} />;
    case 'rod':
      return (
        <mesh position={[0, 0.003, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.glass()}>
          <cylinderGeometry args={[0.003, 0.003, 0.2, 8]} />
        </mesh>
      );
    case 'funnel':
      return <SoapFunnel soap={false} glow={glow} />;
    case 'balance':
      return <Balance grams={null} glow={glow} />;
    case 'burette':
      return <group scale={0.3}><Burette level={null} bubble={false} detail={false} /></group>;
    case 'thermometer':
      return <Thermometer glow={glow} />;
  }
}

export function OrgCupboard({ scene }: { scene: OrgScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as OrgApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={ORG_APPARATUS_LABEL[id]} labelY={0.28} position={CUPBOARD_SLOT[id]} drag={carry}>
            {(active) => (
              <group scale={id === 'bath' || id === 'burner' ? 0.7 : 1}>
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

function TubeStand() {
  return (
    <group>
      <mesh position={[0, 0.004, 0]} material={mat.wood()}>
        <boxGeometry args={[0.07, 0.008, 0.05]} />
      </mesh>
      <mesh position={[0.026, 0.05, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.0022, 0.0022, 0.092, 8]} />
      </mesh>
      <mesh position={[0, 0.092, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.metal()}>
        <torusGeometry args={[TUBE.r + 0.0018, 0.0013, 6, 22]} />
      </mesh>
    </group>
  );
}

/** The visual of a test, with the heating animation running its colour on. */
function useAnimatedVisual(v: ChemOrganicVariant, s: ChemOrganicState, i: number): { vis: OrgVisual | null; heating: boolean } {
  const anim = useOrgBench((b) => b.anim);
  const [, tick] = useState(0);
  const t = s.tests[i];
  const running = !!anim && anim.i === i && performance.now() - anim.at < HEAT_ANIM_MS;
  useFrame(() => {
    if (running) tick((x) => (x + 1) % 1000);
  });
  return useMemo(() => {
    if (!t) return { vis: null, heating: false };
    if (!running || !anim) return { vis: orgObserve(v, t).visual, heating: false };
    const f = Math.min(1, (performance.now() - anim.at) / HEAT_ANIM_MS);
    const heat = Math.round((anim.from + (t.heat - anim.from) * f) / 3) * 3;
    return { vis: orgObserve(v, { ...t, heat }).visual, heating: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, s, t, running, anim, running ? Math.floor(performance.now() / 120) : 0]);
}

export function OrgStation({ v, state, scene }: { v: ChemOrganicVariant; state: ChemOrganicState; scene: OrgScene }) {
  const task = state.task ?? 'GROUPS';
  const card = useMemo(
    () =>
      taskCardTexture(
        task === 'SOAP'
          ? ['10 cm³ palm oil + 20 cm³ 20% NaOH: boil 15–20 min, stirring; top up water.', 'Brine salts out the soap: filter, wash, dry, weigh.', 'Lather in distilled and in hard water. Work out the % yield.']
          : task === 'CARBS'
            ? ["W–Z: Benedict's in the water bath, iodine.", 'No reducing sugar? Boil with HCl, neutralise, Benedict’s again.', 'Record TEST | OBSERVATION | INFERENCE; name the carbohydrates.']
            : task === 'PROTEINS'
              ? ['P, Q, R and water: Biuret (CuSO₄ drop by drop).', "Confirm: Millon's, xanthoproteic or ninhydrin; heat to coagulate.", 'Record TEST | OBSERVATION | INFERENCE.']
              : ['A–D: bromine water, warm K₂Cr₂O₇, NaHCO₃ (lime water).', 'Esterify the alkanol: warm with acid + conc. H₂SO₄, pour into water.', 'Record TEST | OBSERVATION | INFERENCE; name each series.'],
      ),
    [task],
  );
  const book = useMemo(() => bookTexture(), []);
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {task === 'SOAP' ? <SoapBench v={v} state={state} scene={scene} /> : <TubeBench v={v} state={state} scene={scene} />}
      <Interactive id="card" label="Task card" bench position={at(OSPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(OSPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
        <mesh position={[0, 0.006, 0]} material={mat.red()}>
          <boxGeometry args={[0.3, 0.008, 0.2]} />
        </mesh>
        <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.29, 0.19]} />
          <meshStandardMaterial map={book} roughness={0.85} />
        </mesh>
      </Interactive>
      {(['burette', 'thermometer'] as const)
        .filter((id) => scene.collected.has(id))
        .map((id, k) => (
          <Interactive key={id} id={id} label={ORG_APPARATUS_LABEL[id]} bench position={[OSPOT.extras[0], 0.004, OSPOT.extras[2] - 0.12 * k]} labelY={0.06}>
            {(a) => (id === 'thermometer' ? <Thermometer glow={a} /> : <group scale={0.3}><Burette level={null} bubble={false} detail={false} glow={a} /></group>)}
          </Interactive>
        ))}
    </group>
  );
}

function TubeBench({ v, state, scene }: { v: ChemOrganicVariant; state: ChemOrganicState; scene: OrgScene }) {
  const active = useOrgBench((b) => b.active);
  const has = (id: OrgApparatusId) => scene.collected.has(id);
  const task = state.task ?? 'GROUPS';
  const tests = state.tests;
  const cur = active >= 0 && active < tests.length ? tests[active]! : null;
  const { vis, heating } = useAnimatedVisual(v, state, active);
  const inBath = !!cur && (ORG_TEST_INFO[cur.test].heats || cur.test === 'IODINE') && (heating || cur.heat > 0 || cur.boil > 0) && !cur.direct && has('bath');
  const rackTubes = tests
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => i !== active)
    .slice(-6)
    .map(({ t }) => {
      const o = orgObserve(v, t).visual;
      return { liquid: o.liquid, ppt: o.ppt, solid: null, bubbles: false, fumes: null, ring: null, flame: null, deposit: null, droplets: false, sublimate: false, probes: [] };
    });
  const tubeAt: V3 = inBath ? [OSPOT.bath[0] - 0.018, BATH_TOP + 0.004, OSPOT.bath[2] + 0.012] : at(OSPOT.tube, 0.008);
  const lastEster = [...tests].reverse().find((t) => t.test === 'ESTER' && t.steps.includes('POUR'));
  const esterOut = lastEster ? orgObserve(v, lastEster).positive : false;
  const bottles = bottlesFor(task);
  return (
    <>
      {v.samples.map((sm, k) => (
        <Interactive key={sm.letter} id={`sample:${sm.letter}`} label={sm.letter === 'H2O' ? 'Distilled water (control)' : `Sample ${sm.letter}`} bench position={at(sampleSpot(k))} labelY={0.12}>
          {(a) => <LetterBeaker letter={sm.letter === 'H2O' ? 'W' : sm.letter} colour={sm.content.look.hex} glow={a} />}
        </Interactive>
      ))}
      <group position={at(OSPOT.reagents)}>
        <mesh position={[0.18, 0.004, 0.03]} material={mat.wood()}>
          <boxGeometry args={[0.46, 0.008, 0.14]} />
        </mesh>
        {bottles.map((b, k) => (
          <Interactive key={b.id} id={`bottle:${b.id}`} label={b.name} bench position={[(k % 4) * 0.11, 0.008, Math.floor(k / 4) * 0.07]} labelY={0.11} drag={() => 'reagentdrag'}>
            {(a) => <DropperBottle name={b.name.replace(/ \(teacher\)/, '')} colour={b.colour} glow={a} />}
          </Interactive>
        ))}
      </group>
      {has('rack') && (
        <group position={at(OSPOT.tube)}>
          <TubeStand />
        </group>
      )}
      {cur && (
        <Interactive id="tube" label={`Test ${active + 1}: ${orgSampleName(cur.sample)} — ${ORG_TEST_INFO[cur.test].short}${inBath ? ' (in the water bath)' : ''}`} bench position={tubeAt} labelY={0.2} drag={() => 'tubedrag'}>
          {(a) => <OrgTube vis={vis} glow={a} />}
        </Interactive>
      )}
      {has('bath') && (
        <Interactive id="bath" label={scene.burnerOn ? 'Boiling water bath (burner lit)' : 'Water bath (burner off)'} bench position={at(OSPOT.bath)} labelY={0.32}>
          {(a) => <WaterBath lit={scene.burnerOn} glow={a} />}
        </Interactive>
      )}
      {has('rack') && (
        <Interactive id="rack" label={tests.length ? `Test tubes (${tests.length} used)` : 'Test tubes'} bench position={at(OSPOT.rack)} labelY={0.18}>
          {(a) => <TubeRack tubes={rackTubes} glow={a} />}
        </Interactive>
      )}
      {has('holder') && !inBath && (
        <Interactive id="holder" label="Test-tube holder" bench position={at(OSPOT.holder)} labelY={0.06}>
          {(a) => <Holder glow={a} />}
        </Interactive>
      )}
      {has('gasKit') && (
        <Interactive id="gasKit" label="Splints and lime water" bench position={at(OSPOT.gasKit)} labelY={0.08}>
          {(a) => <SplintKit glow={a} />}
        </Interactive>
      )}
      {has('cylinder') && (
        <Interactive id="cylinder" label="Measuring cylinder" bench position={at(OSPOT.cylinder)} labelY={0.2}>
          {(a) => <MeasuringCylinder glow={a} />}
        </Interactive>
      )}
      {task === 'GROUPS' && (
        <Interactive id="waterBeaker" label={lastEster ? (esterOut ? 'Beaker of water: an oily, fruity-smelling layer' : 'Beaker of water (no ester)') : 'Beaker of cold water'} bench position={at(OSPOT.waterBeaker)} labelY={0.1}>
          {(a) => <EsterBeaker ester={esterOut} glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function SoapBench({ v, state, scene }: { v: ChemOrganicVariant; state: ChemOrganicState; scene: OrgScene }) {
  const has = (id: OrgApparatusId) => scene.collected.has(id);
  const r = useMemo(() => soapRun(v, state.soap), [v, state.soap]);
  const lastWeigh = [...state.soap].reverse().find((e) => e.a === 'WEIGH_OIL' || e.a === 'WEIGH_SOAP');
  const grams = !lastWeigh ? null : lastWeigh.a === 'WEIGH_OIL' ? (r.oilWeighed ? v.soap.oilMass : null) : r.soapMass;
  return (
    <>
      {SOAP_BOTTLES.map((b, k) => (
        <Interactive key={b.id} id={`soapbottle:${b.id}`} label={b.name} bench position={[OSPOT.soapBottles[0] + k * 0.09, 0, OSPOT.soapBottles[2]]} labelY={0.16}>
          {(a) => <ReagentBottle name={b.name.split(' (')[0]!} band={b.band} liquid={b.liquid} r={0.03} h={0.11} glow={a} />}
        </Interactive>
      ))}
      {has('burner') && (
        <Interactive id="beaker" label={has('beaker') ? `Beaker on the tripod${r.boiled ? ` (boiled ${Math.round(r.boiled / 60)} min)` : ''}` : 'Tripod, gauze and burner'} bench position={at(OSPOT.soap)} labelY={0.4}>
          {(a) => <SoapBeaker r={has('beaker') ? r : null} lit={scene.burnerOn} glow={a} />}
        </Interactive>
      )}
      {has('beaker') && !has('burner') && (
        <Interactive id="beaker" label="250 cm³ beaker" bench position={at(OSPOT.soap)} labelY={0.14}>
          {(a) => <EsterBeaker ester={false} glow={a} />}
        </Interactive>
      )}
      {has('balance') && (
        <Interactive id="balance" label={grams === null ? 'Balance' : `Balance: ${grams.toFixed(2)} g`} bench position={at(OSPOT.balance)} labelY={0.1}>
          {(a) => <Balance grams={grams} glow={a} />}
        </Interactive>
      )}
      {has('funnel') && (
        <Interactive id="funnel" label={r.filtered ? 'Filter funnel: the soap on the paper' : 'Filter funnel and paper'} bench position={at(OSPOT.funnel)} labelY={0.14}>
          {(a) => <SoapFunnel soap={r.filtered} glow={a} />}
        </Interactive>
      )}
      {has('cylinder') && (
        <Interactive id="cylinder" label="Measuring cylinder" bench position={at(OSPOT.cylinder)} labelY={0.2}>
          {(a) => <MeasuringCylinder glow={a} />}
        </Interactive>
      )}
      {has('rod') && (
        <Interactive id="rod" label="Glass stirring rod" bench position={at(OSPOT.rod)} labelY={0.04}>
          {() => (
            <mesh position={[0, 0.003, 0]} rotation={[0, 0.3, Math.PI / 2]} material={mat.glass()}>
              <cylinderGeometry args={[0.003, 0.003, 0.2, 8]} />
            </mesh>
          )}
        </Interactive>
      )}
      <group position={at(OSPOT.lather)}>
        <Interactive id="lather:soft" label={r.soft ? 'Distilled water + soap: lots of lather' : 'Tube of distilled water'} bench position={[0, 0, 0]} labelY={0.18}>
          {(a) => <LatherTube kind={r.soft ? 'soft' : null} label="soft" glow={a} />}
        </Interactive>
        <Interactive id="lather:hard" label={r.hard ? 'Hard water + soap: scum, little lather' : 'Tube of hard water'} bench position={[0.04, 0, 0]} labelY={0.18}>
          {(a) => <LatherTube kind={r.hard ? 'hard' : null} label="hard" glow={a} />}
        </Interactive>
      </group>
    </>
  );
}
