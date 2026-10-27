import { qualObserve, qualSamples, QUAL_SAMPLE_LABEL, type ChemQualitativeState, type ChemQualitativeVariant, type QualSample } from '@aischool/shared';
import { useMemo } from 'react';
import { BlobShadow, Burette, DropperBottle, Pipette, ReagentBottle, Thermometer, WashBottle } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { bookTexture, taskCardTexture } from '../../../lab3d-kit/textures';
import { FUME_SPOT, QSPOT, useQualBench } from './bench';
import { Burner, FilterFunnel, FlameWire, GasKit, GasProbe, HeldInHolder, Holder, NichromeWire, SampleBeaker, Spatula, TestTube, TUBE, TubeRack } from './models';
import { QUAL_APPARATUS_LABEL, type QualApparatusId, type QualScene } from './scene-state';

/**
 * The student's bench for qualitative analysis: the sample C, the prepared
 * solution / filtrate / residue, the reagent shelf, the test tube in use (with
 * its gas tests) beside the Bunsen burner, the rack of earlier tubes, and the
 * cupboard's apparatus. Everything is drawn from the attempt's state.
 */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];

/** The reagent bottles on the shelf (one bottle may serve several tests). */
export const QUAL_BOTTLES: { id: string; name: string; colour: string; reagents: string[] }[] = [
  { id: 'HNO3', name: 'dil. HNO₃', colour: '#e9eef2', reagents: ['DIL_HNO3', 'AGNO3'] },
  { id: 'HCL', name: 'dil. HCl', colour: '#e9eef2', reagents: ['DIL_HCL'] },
  { id: 'H2SO4', name: 'conc. H₂SO₄', colour: '#efe9cf', reagents: ['CONC_H2SO4', 'CONC_H2SO4_CU', 'BROWN_RING'] },
  { id: 'NAOH', name: 'NaOH', colour: '#e9eef2', reagents: ['NAOH', 'NAOH_WARM', 'DEVARDA'] },
  { id: 'NH3', name: 'NH₃(aq)', colour: '#e9eef2', reagents: ['NH3'] },
  { id: 'AGNO3', name: 'AgNO₃', colour: '#e7e6e0', reagents: ['AGNO3'] },
  { id: 'BACL2', name: 'BaCl₂', colour: '#e9eef2', reagents: ['BACL2'] },
  { id: 'KMNO4', name: 'KMnO₄', colour: '#8a2f9e', reagents: ['KMNO4'] },
  { id: 'K2CR2O7', name: 'K₂Cr₂O₇', colour: '#f08a24', reagents: ['K2CR2O7'] },
  { id: 'FESO4', name: 'FeSO₄', colour: '#cfe5ae', reagents: ['BROWN_RING'] },
  { id: 'KI', name: 'KI', colour: '#e9eef2', reagents: ['KI'] },
  { id: 'KSCN', name: 'KSCN', colour: '#e9eef2', reagents: ['KSCN'] },
  { id: 'OXALATE', name: '(NH₄)₂C₂O₄', colour: '#e9eef2', reagents: ['OXALATE'] },
  { id: 'DEVARDA', name: "Devarda's", colour: '#b8b8b0', reagents: ['DEVARDA'] },
  { id: 'CU', name: 'Cu turnings', colour: '#b5652d', reagents: ['CONC_H2SO4_CU'] },
];

const CUPBOARD_SLOT: Record<QualApparatusId, V3> = {
  rack: [-0.8, CUPBOARD_SHELVES[1]!, 0.02],
  holder: [-0.45, CUPBOARD_SHELVES[1]!, 0.04],
  burner: [-0.15, CUPBOARD_SHELVES[1]!, 0.02],
  spatula: [0.15, CUPBOARD_SHELVES[1]!, 0.08],
  wire: [0.45, CUPBOARD_SHELVES[1]!, 0.06],
  gasKit: [-0.7, CUPBOARD_SHELVES[2]!, 0.02],
  funnel: [-0.3, CUPBOARD_SHELVES[2]!, 0.02],
  washBottle: [0.05, CUPBOARD_SHELVES[2]!, 0.02],
  burette: [-0.75, CUPBOARD_SHELVES[0]! + 0.008, 0.06],
  pipette: [0.25, CUPBOARD_SHELVES[0]! + 0.012, 0.02],
  thermometer: [0.75, CUPBOARD_SHELVES[1]!, 0.1],
};

function ApparatusModel({ id, glow }: { id: QualApparatusId; glow?: boolean }) {
  switch (id) {
    case 'rack':
      return <TubeRack tubes={[]} glow={glow} />;
    case 'holder':
      return <Holder glow={glow} />;
    case 'burner':
      return <Burner lit={false} glow={glow} />;
    case 'spatula':
      return <Spatula glow={glow} />;
    case 'wire':
      return <NichromeWire glow={glow} />;
    case 'gasKit':
      return <GasKit glow={glow} />;
    case 'funnel':
      return <FilterFunnel residue={null} glow={glow} />;
    case 'washBottle':
      return <WashBottle glow={glow} />;
    case 'burette':
      return (
        <group rotation={[0, 0, Math.PI / 2]}>
          <Burette level={null} bubble={false} detail={false} glow={glow} />
        </group>
      );
    case 'pipette':
      return (
        <group rotation={[0, 0, Math.PI / 2]}>
          <Pipette filled={0} glow={glow} />
        </group>
      );
    case 'thermometer':
      return <Thermometer glow={glow} />;
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench, by tapping or dragging it to the tray). */
export function QualCupboard({ scene }: { scene: QualScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as QualApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={QUAL_APPARATUS_LABEL[id]} labelY={0.25} position={CUPBOARD_SLOT[id]} drag={carry}>
            {(active) => (
              <group>
                <ApparatusModel id={id} glow={active} />
                <mesh position={[0, 0.06, 0]}>
                  <boxGeometry args={[0.14, 0.14, 0.12]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            )}
          </Interactive>
        ))}
    </group>
  );
}

/** A small stand for the tube in use: base, post and a ring that holds the tube upright. */
function TubeStand() {
  return (
    <group>
      <mesh position={[0, 0.004, 0]} material={mat.wood()}>
        <boxGeometry args={[0.07, 0.008, 0.05]} />
      </mesh>
      <mesh position={[0.026, 0.05, 0]} material={mat.metal()}>
        <cylinderGeometry args={[0.0022, 0.0022, 0.092, 8]} />
      </mesh>
      <mesh position={[0.018, 0.092, 0]} material={mat.metal()}>
        <boxGeometry args={[0.016, 0.003, 0.003]} />
      </mesh>
      <mesh position={[0, 0.092, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.metal()}>
        <torusGeometry args={[TUBE.r + 0.0018, 0.0013, 6, 22]} />
      </mesh>
      <BlobShadow r={0.04} />
    </group>
  );
}

/** Colour of a prepared sample's liquid (from the water / acid test that made it). */
function sampleColour(v: ChemQualitativeVariant, s: ChemQualitativeState, sample: QualSample): string {
  const made = s.tests.find((t) => (sample === 'RESIDUE_SOLN' ? t.sample === 'RESIDUE' && t.reagent === 'DIL_HNO3' : t.sample === 'SOLID' && (t.reagent === 'WATER' || t.reagent === 'DIL_HNO3')));
  return (made && qualObserve(v, made).visual.liquid) ?? '#e6eff8';
}

export function QualStation({ v, state, scene }: { v: ChemQualitativeVariant; state: ChemQualitativeState; scene: QualScene }) {
  const active = useQualBench((b) => b.active);
  const has = (id: QualApparatusId) => scene.collected.has(id);
  const samples = qualSamples(v, state.tests);
  const tests = state.tests;
  const cur = active >= 0 && active < tests.length ? tests[active]! : null;
  const vis = useMemo(() => (cur ? qualObserve(v, cur).visual : null), [v, cur]);
  const heating = !!cur && (cur.reagent === 'HEAT' || cur.reagent === 'FLAME') && scene.burnerOn;
  const flameTest = cur?.reagent === 'FLAME';
  // The rack shows the latest earlier tubes (not the one in use).
  const rackTubes = tests
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => i !== active)
    .slice(-6)
    .map(({ t }) => qualObserve(v, t).visual);
  const card = useMemo(() => taskCardTexture([v.given, 'Carry out tests on C, test every gas, and record TEST | OBSERVATION | INFERENCE.', 'Then name the ions and write an ionic equation.']), [v]);
  const book = useMemo(() => bookTexture(), []);
  // A test that gives off a harmful gas is carried to the fume cupboard: its tube (and the burner, when heating) and its gas tests are drawn there.
  const inFume = !!cur && !flameTest && scene.fume.has(active);
  const tubeSpot = inFume ? FUME_SPOT : QSPOT.tube;
  const burnerSpot = inFume && heating ? ([FUME_SPOT[0] + 0.004, FUME_SPOT[1], FUME_SPOT[2]] as const) : QSPOT.burner;
  const tubeAt: V3 = heating ? [burnerSpot[0] - 0.004, burnerSpot[1] + 0.196, burnerSpot[2]] : at(tubeSpot, 0.008);
  const tilt = heating ? 0.62 : 0;
  const residue = samples.includes('RESIDUE') ? (v.partner?.solid.hex ?? '#f3f2ec') : null;

  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>

      {/* the sample C, and the solution / filtrate / residue once prepared */}
      <Interactive id="sample:SOLID" label="Sample C" bench position={at(QSPOT.sampleC)} labelY={0.2}>
        {(a) => <ReagentBottle name="C" band="#7a1f6b" sub="solid sample" liquid={v.main.solid.hex} amber={false} r={0.03} h={0.1} glow={a} />}
      </Interactive>
      {samples
        .filter((x) => x !== 'SOLID')
        .map((x, k) => (
          <Interactive key={x} id={`sample:${x}`} label={x === 'SOLUTION' ? 'Solution of C' : QUAL_SAMPLE_LABEL[x]} bench position={[QSPOT.samples[0] + (k % 2) * 0.09, 0, QSPOT.samples[2] + Math.floor(k / 2) * 0.1]} labelY={0.12}>
            {(a) => (x === 'RESIDUE' ? <FilterFunnel residue={residue} glow={a} /> : <SampleBeaker colour={sampleColour(v, state, x)} glow={a} />)}
          </Interactive>
        ))}

      {/* reagent shelf: two rows of dropper bottles */}
      <group position={at(QSPOT.reagents)}>
        <mesh position={[0.2, 0.004, 0.03]} material={mat.wood()}>
          <boxGeometry args={[0.5, 0.008, 0.14]} />
        </mesh>
        {QUAL_BOTTLES.map((b, k) => (
          <Interactive key={b.id} id={`bottle:${b.id}`} label={b.name} bench position={[(k % 8) * 0.058, 0.008, Math.floor(k / 8) * 0.065]} labelY={0.11}>
            {(a) => <DropperBottle name={b.name} colour={b.colour} glow={a} />}
          </Interactive>
        ))}
      </group>

      {/* the tube in use: in its stand, or held over the flame */}
      {has('rack') && (
        <group position={at(QSPOT.tube)}>
          <TubeStand />
        </group>
      )}
      {inFume && !heating && (
        <group position={at(FUME_SPOT)}>
          <TubeStand />
        </group>
      )}
      {cur && !flameTest && (
        <Interactive id="tube" label={`Test ${active + 1}${inFume ? ' (in the fume cupboard)' : ''}`} bench position={tubeAt} rotation={[0, 0, tilt]} labelY={0.22}>
          {(a) => (
            <group>
              <TestTube vis={vis} hot={heating} glow={a} />
              {heating && <HeldInHolder />}
              {/* the gas tests stay upright at the mouth of the tube, even while it is tilted over the flame */}
              {!!vis?.probes.length && (
                <group position={[0, TUBE.h, 0]} rotation={[0, 0, -tilt]}>
                  <group position={[0, -TUBE.h, 0]}>
                    {vis.probes.map((p, k) => <GasProbe key={p.test} test={p.test} colour={p.colour} k={k} />)}
                  </group>
                </group>
              )}
            </group>
          )}
        </Interactive>
      )}
      {cur && flameTest && (
        <Interactive id="tube" label={`Test ${active + 1}: flame test`} bench position={[QSPOT.burner[0] - 0.011, 0.19, QSPOT.burner[2]]} rotation={[0, 0, -0.35]} labelY={0.1}>
          {(a) => <FlameWire glow={a} />}
        </Interactive>
      )}
      {has('burner') && (
        <Interactive id="burner" label={`${scene.burnerOn ? 'Bunsen burner (lit)' : 'Bunsen burner'}${burnerSpot !== QSPOT.burner ? ' — in the fume cupboard' : ''}`} bench position={at(burnerSpot)} labelY={0.25}>
          {(a) => <Burner lit={scene.burnerOn} colour={flameTest && scene.burnerOn ? (vis?.flame ?? null) : null} glow={a} />}
        </Interactive>
      )}
      {has('rack') && (
        <Interactive id="rack" label={tests.length ? `Test tubes (${tests.length} used)` : 'Test tubes'} bench position={at(QSPOT.rack)} labelY={0.18}>
          {(a) => <TubeRack tubes={rackTubes} glow={a} />}
        </Interactive>
      )}
      {has('holder') && !heating && (
        <Interactive id="holder" label="Test-tube holder" bench position={at(QSPOT.holder)} labelY={0.06}>
          {(a) => <Holder glow={a} />}
        </Interactive>
      )}
      {has('wire') && !(cur && flameTest) && (
        <Interactive id="wire" label="Nichrome wire" bench position={at(QSPOT.wire)} labelY={0.06}>
          {(a) => <NichromeWire glow={a} />}
        </Interactive>
      )}
      {has('spatula') && (
        <Interactive id="spatula" label="Spatula" bench position={at(QSPOT.spatula)} labelY={0.05}>
          {(a) => <Spatula glow={a} />}
        </Interactive>
      )}
      {has('gasKit') && (
        <Interactive id="gasKit" label="Gas-test kit" bench position={at(QSPOT.gasKit)} labelY={0.1}>
          {(a) => <GasKit glow={a} />}
        </Interactive>
      )}
      {has('funnel') && !samples.includes('RESIDUE') && (
        <Interactive id="funnel" label="Filter funnel" bench position={[QSPOT.samples[0] + 0.18, 0, QSPOT.samples[2]]} labelY={0.12}>
          {(a) => <FilterFunnel residue={null} glow={a} />}
        </Interactive>
      )}
      {has('washBottle') && (
        <Interactive id="washBottle" label="Wash bottle (distilled water)" bench position={at(QSPOT.washBottle)} labelY={0.22}>
          {(a) => <WashBottle glow={a} />}
        </Interactive>
      )}
      {(['burette', 'pipette', 'thermometer'] as const)
        .filter(has)
        .map((id, k) => (
          <Interactive key={id} id={id} label={QUAL_APPARATUS_LABEL[id]} bench position={[QSPOT.extras[0], 0.006, QSPOT.extras[2] - 0.12 * k]} rotation={[0, 0, Math.PI / 2]} labelY={0.05}>
            {(a) => <ApparatusModel id={id} glow={a} />}
          </Interactive>
        ))}

      {/* task card and notebook */}
      <Interactive id="card" label="Task card" bench position={at(QSPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(QSPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
        <mesh position={[0, 0.006, 0]} material={mat.red()}>
          <boxGeometry args={[0.3, 0.008, 0.2]} />
        </mesh>
        <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.29, 0.19]} />
          <meshStandardMaterial map={book} roughness={0.85} />
        </mesh>
      </Interactive>
    </group>
  );
}
