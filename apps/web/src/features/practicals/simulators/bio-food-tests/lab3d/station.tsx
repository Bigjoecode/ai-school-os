import { AMY_BATHS, AMY_BATH_SHORT, FOOD_TEST_INFO, amySpots, foodObserve, type AmyBath, type BioFoodState, type BioFoodVariant, type FoodTest, type FoodVisual } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useState } from 'react';
import { DropperBottle, MeasuringCylinder, ReagentBottle, Thermometer } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { HandLens, Scalpel, Slide } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { Holder, TubeRack, TUBE } from '../../chem-qualitative/lab3d/models';
import { AMY_BATH_X, AMY_BATH_Z, BATH_TOP, FSPOT, HEAT_ANIM_MS, amyBathSpot, sampleSpot, useFoodBench } from './bench';
import { AmyBathModel, AmyTubeModel, FilterPaperModel, FoodTube, LetterBeaker, SolutionBeaker, SpottingTile, StopwatchModel, TILE, WaterBath } from './models';
import { FOOD_APPARATUS_LABEL, type FoodApparatusId, type FoodScene } from './scene-state';

/**
 * The student's bench for the food tests (samples P, Q and R, the reagent
 * shelf, the tube in use, the boiling water bath, the filter paper) or for
 * the amylase experiment (the baths with their tubes, the spotting tile, the
 * stopwatch, starch and saliva), and the cupboard's apparatus. Everything is
 * drawn from the attempt's state.
 */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];

/** The reagent bottles on the shelf (each starts or continues a test). */
export const FOOD_BOTTLES: { id: string; name: string; colour: string; tests: FoodTest['test'][] }[] = [
  { id: 'IODINE', name: 'Iodine', colour: '#c08a3a', tests: ['IODINE'] },
  { id: 'BENEDICT', name: "Benedict's", colour: '#2f6fd6', tests: ['BENEDICT', 'NONREDUCING'] },
  { id: 'HCL', name: 'dil. HCl', colour: '#e9eef2', tests: ['NONREDUCING'] },
  { id: 'NAHCO3', name: 'NaHCO₃', colour: '#f2f1ec', tests: ['NONREDUCING'] },
  { id: 'NAOH', name: 'NaOH', colour: '#e9eef2', tests: ['BIURET'] },
  { id: 'CUSO4', name: '1% CuSO₄', colour: '#8fc3ea', tests: ['BIURET'] },
  { id: 'MILLON', name: "Millon's", colour: '#ece9df', tests: ['MILLON'] },
  { id: 'SUDAN', name: 'Sudan III', colour: '#c62a2a', tests: ['SUDAN'] },
  { id: 'ETHANOL', name: 'Ethanol', colour: '#eef2f5', tests: ['EMULSION'] },
];
export const AMY_BOTTLES = FOOD_BOTTLES.filter((b) => b.id === 'IODINE' || b.id === 'BENEDICT');

const CUPBOARD_SLOT: Record<FoodApparatusId, V3> = {
  rack: [-0.8, CUPBOARD_SHELVES[1]!, 0.02],
  holder: [-0.45, CUPBOARD_SHELVES[1]!, 0.04],
  burner: [-0.1, CUPBOARD_SHELVES[1]!, 0.02],
  paper: [0.25, CUPBOARD_SHELVES[1]!, 0.06],
  cylinder: [0.6, CUPBOARD_SHELVES[1]!, 0.04],
  tile: [-0.7, CUPBOARD_SHELVES[2]!, 0.02],
  thermometer: [-0.3, CUPBOARD_SHELVES[2]!, 0.08],
  stopwatch: [0.05, CUPBOARD_SHELVES[2]!, 0.04],
  lens: [0.4, CUPBOARD_SHELVES[2]!, 0.04],
  slides: [-0.6, CUPBOARD_SHELVES[0]! + 0.01, 0.05],
  scalpel: [0.3, CUPBOARD_SHELVES[0]! + 0.01, 0.06],
};

function ApparatusModel({ id, glow }: { id: FoodApparatusId; glow?: boolean }) {
  switch (id) {
    case 'rack':
      return <TubeRack tubes={[]} glow={glow} />;
    case 'holder':
      return <Holder glow={glow} />;
    case 'burner':
      return <WaterBath lit={false} glow={glow} />;
    case 'paper':
      return <FilterPaperModel spot={null} glow={glow} />;
    case 'cylinder':
      return <MeasuringCylinder glow={glow} />;
    case 'tile':
      return <SpottingTile wells={[]} iodine={false} glow={glow} />;
    case 'thermometer':
      return <Thermometer glow={glow} />;
    case 'stopwatch':
      return <StopwatchModel sec={null} glow={glow} />;
    case 'lens':
      return <HandLens glow={glow} />;
    case 'slides':
      return <Slide />;
    case 'scalpel':
      return <Scalpel glow={glow} />;
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench, by tapping or dragging it to the tray). */
export function FoodCupboard({ scene }: { scene: FoodScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as FoodApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={FOOD_APPARATUS_LABEL[id]} labelY={0.28} position={CUPBOARD_SLOT[id]} drag={carry}>
            {(active) => (
              <group scale={id === 'burner' ? 0.7 : 1}>
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

/** A small stand for the tube in use. */
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

/** The visual of a test, with the heating animation running its colour on from where it was. */
function useAnimatedVisual(v: BioFoodVariant, s: BioFoodState, i: number): { vis: FoodVisual | null; heating: boolean } {
  const anim = useFoodBench((b) => b.anim);
  const [, tick] = useState(0);
  const t = s.tests[i];
  const running = !!anim && anim.i === i && performance.now() - anim.at < HEAT_ANIM_MS;
  useFrame(() => {
    if (running) tick((x) => (x + 1) % 1000);
  });
  return useMemo(() => {
    if (!t) return { vis: null, heating: false };
    if (!running || !anim) return { vis: foodObserve(v, s, t).visual, heating: false };
    const f = Math.min(1, (performance.now() - anim.at) / HEAT_ANIM_MS);
    // Quantised so the colours (and their cached materials) come in small steps.
    const heat = Math.round((anim.from + (t.heat - anim.from) * f) / 3) * 3;
    return { vis: foodObserve(v, s, { ...t, heat }).visual, heating: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, s, t, running, anim, running ? Math.floor(performance.now() / 120) : 0]);
}

export function FoodStation({ v, state, scene }: { v: BioFoodVariant; state: BioFoodState; scene: FoodScene }) {
  const active = useFoodBench((b) => b.active);
  const has = (id: FoodApparatusId) => scene.collected.has(id);
  const task = state.task ?? 'FOOD';
  const tests = state.tests;
  const cur = active >= 0 && active < tests.length ? tests[active]! : null;
  const { vis, heating } = useAnimatedVisual(v, state, active);
  const inBath = !!cur && FOOD_TEST_INFO[cur.test].heats && (heating || cur.heat > 0) && !cur.direct && has('burner');
  const rackTubes = tests
    .map((t, i) => ({ t, i }))
    .filter(({ i }) => i !== active)
    .slice(-6)
    .map(({ t }) => {
      const o = foodObserve(v, state, t).visual;
      return { liquid: o.liquid, ppt: o.ppt, solid: null, bubbles: false, fumes: null, ring: null, flame: null, deposit: null, droplets: false, sublimate: false, probes: [] };
    });
  const card = useMemo(
    () => (task === 'AMYLASE' ? bioTaskCardTexture('Salivary amylase', ['Iodine on the spotting tile.', 'Starch + saliva in each bath, 5 min.', 'Mix; a drop on iodine every 30 s.', 'End point: iodine stays brown.']) : bioTaskCardTexture('Food tests', ['Test P, Q and R for starch,', 'reducing sugar, protein and fat.', "Benedict's: in the water bath.", 'Record test · observation · inference.'])),
    [task],
  );
  const book = useMemo(() => bioBookTexture('Practical notebook'), []);
  const grease = tests.map((t, i) => ({ t, i })).filter((x) => x.t.test === 'GREASE').at(-1);
  const greaseVis = grease ? foodObserve(v, state, grease.t).visual.paper : null;
  const tubeAt: V3 = inBath ? [FSPOT.bath[0] - 0.018, BATH_TOP + 0.004, FSPOT.bath[2] + 0.012] : at(FSPOT.tube, 0.008);

  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>

      {task === 'FOOD' ? (
        <>
          {v.samples.map((sm, k) => (
            <Interactive key={sm.letter} id={`sample:${sm.letter}`} label={`Sample ${sm.letter}`} bench position={at(sampleSpot(k))} labelY={0.12}>
              {(a) => <LetterBeaker letter={sm.letter} colour={sm.content.look.hex} glow={a} />}
            </Interactive>
          ))}
          <group position={at(FSPOT.reagents)}>
            <mesh position={[0.2, 0.004, 0.03]} material={mat.wood()}>
              <boxGeometry args={[0.5, 0.008, 0.14]} />
            </mesh>
            {FOOD_BOTTLES.map((b, k) => (
              <Interactive key={b.id} id={`bottle:${b.id}`} label={b.name} bench position={[(k % 5) * 0.09, 0.008, Math.floor(k / 5) * 0.065]} labelY={0.11} drag={() => 'reagentdrag'}>
                {(a) => <DropperBottle name={b.name} colour={b.colour} glow={a} />}
              </Interactive>
            ))}
          </group>
          {has('paper') && (
            <Interactive id="paper" label={greaseVis === 'translucent' ? 'Filter paper (a translucent spot)' : 'Filter paper'} bench position={at(FSPOT.paper)} labelY={0.04}>
              {(a) => <FilterPaperModel spot={greaseVis} glow={a} />}
            </Interactive>
          )}
        </>
      ) : (
        <AmyBench v={v} state={state} scene={scene} />
      )}

      {/* the tube in use: in its stand, or in the boiling water bath */}
      {has('rack') && (
        <group position={at(FSPOT.tube)}>
          <TubeStand />
        </group>
      )}
      {cur && (
        <Interactive id="tube" label={`Test ${active + 1}: ${cur.sample} — ${FOOD_TEST_INFO[cur.test].short}${inBath ? ' (in the water bath)' : ''}`} bench position={tubeAt} labelY={0.2} drag={() => 'tubedrag'}>
          {(a) => <FoodTube vis={vis} glow={a} />}
        </Interactive>
      )}
      {has('burner') && (
        <Interactive id="bath" label={scene.burnerOn ? 'Boiling water bath (burner lit)' : 'Water bath (burner off)'} bench position={at(FSPOT.bath)} labelY={0.32}>
          {(a) => <WaterBath lit={scene.burnerOn} glow={a} />}
        </Interactive>
      )}
      {has('rack') && (
        <Interactive id="rack" label={tests.length ? `Test tubes (${tests.length} used)` : 'Test tubes'} bench position={at(FSPOT.rack)} labelY={0.18}>
          {(a) => <TubeRack tubes={rackTubes} glow={a} />}
        </Interactive>
      )}
      {has('holder') && !inBath && (
        <Interactive id="holder" label="Test-tube holder" bench position={at(FSPOT.holder)} labelY={0.06}>
          {(a) => <Holder glow={a} />}
        </Interactive>
      )}
      {has('cylinder') && (
        <Interactive id="cylinder" label="10 cm³ measuring cylinder" bench position={at(FSPOT.cylinder)} labelY={0.2}>
          {(a) => <MeasuringCylinder glow={a} />}
        </Interactive>
      )}
      {(['lens', 'slides', 'scalpel', 'thermometer', 'stopwatch', 'tile', 'paper'] as const)
        .filter((id) => has(id) && !(task === 'AMYLASE' && ['thermometer', 'stopwatch', 'tile'].includes(id)) && !(task === 'FOOD' && id === 'paper'))
        .map((id, k) => (
          <Interactive key={id} id={id} label={FOOD_APPARATUS_LABEL[id]} bench position={[FSPOT.extras[0], 0.004, FSPOT.extras[2] - 0.12 * k]} labelY={0.06}>
            {(a) => <ApparatusModel id={id} glow={a} />}
          </Interactive>
        ))}

      <Interactive id="card" label="Task card" bench position={at(FSPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(FSPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
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

/** The amylase bench: starch, saliva and the reagents; the baths with their tubes; the spotting tile; the stopwatch. */
function AmyBench({ v, state, scene }: { v: BioFoodVariant; state: BioFoodState; scene: FoodScene }) {
  const has = (id: FoodApparatusId) => scene.collected.has(id);
  // Each row of the tile is a tube; its wells are the latest drops (one per time tested).
  const times = [...new Set(state.spots.map((x) => x.t))].sort((a, b) => a - b).slice(-TILE.cols);
  const wells = state.tubes.slice(0, TILE.rows).map((_, r) => {
    const sp = amySpots(v, state, r);
    return times.map((t) => sp.find((x) => x.t === t)?.stage ?? null);
  });
  const byBath = (b: AmyBath) => state.tubes.map((t, i) => ({ t, i })).filter((x) => x.t.bath === b);
  return (
    <>
      {/* starch, saliva, iodine and Benedict's */}
      <Interactive id="starch" label="1% starch solution" bench position={at(FSPOT.amyReagents)} labelY={0.14}>
        {(a) => <ReagentBottle name="Starch" band="#2d5d8a" sub="1% solution" liquid="#eceae2" r={0.03} h={0.1} glow={a} />}
      </Interactive>
      <Interactive id="saliva" label="Saliva solution (your own)" bench position={[FSPOT.amyReagents[0] + 0.11, 0, FSPOT.amyReagents[2]]} labelY={0.11}>
        {(a) => <SolutionBeaker colour="#eeece4" glow={a} />}
      </Interactive>
      {AMY_BOTTLES.map((b, k) => (
        <Interactive key={b.id} id={`bottle:${b.id}`} label={b.name} bench position={[FSPOT.amyReagents[0] + 0.21 + k * 0.07, 0, FSPOT.amyReagents[2]]} labelY={0.11} drag={() => 'reagentdrag'}>
          {(a) => <DropperBottle name={b.name} colour={b.colour} glow={a} />}
        </Interactive>
      ))}
      {/* the baths: ice, room, 37 °C and 45 °C on the bench; the boiling bath is the water bath on the burner */}
      {AMY_BATHS.filter((b) => b !== 'BOILING').map((b) => (
        <Interactive key={b} id={`amybath:${b}`} label={`${AMY_BATH_SHORT[b]} bath`} bench position={at(amyBathSpot(b))} labelY={0.18}>
          {(a) => (
            <AmyBathModel kind={b === 'ICE' ? 'ice' : 'water'} label={AMY_BATH_SHORT[b].replace('~', '')} glow={a}>
              {byBath(b).map((x, k) => (
                <group key={x.i} position={[-0.022 + k * 0.016, 0.004, 0.01 - (k % 2) * 0.016]}>
                  <AmyTubeModel n={x.i + 1} />
                </group>
              ))}
            </AmyBathModel>
          )}
        </Interactive>
      ))}
      {has('burner') &&
        byBath('BOILING').map((x, k) => (
          <group key={x.i} position={[FSPOT.bath[0] + 0.018 - k * 0.016, BATH_TOP + 0.004, FSPOT.bath[2] - 0.014]}>
            <AmyTubeModel n={x.i + 1} />
          </group>
        ))}
      {has('tile') && (
        <Interactive id="tile" label={state.tile ? 'Spotting tile (iodine in the wells)' : 'Spotting tile'} bench position={at(FSPOT.tile)} labelY={0.06}>
          {(a) => <SpottingTile wells={wells} iodine={state.tile} glow={a} />}
        </Interactive>
      )}
      {has('stopwatch') && (
        <Interactive id="stopwatch" label={state.clock === null ? 'Stopwatch' : `Stopwatch: ${state.clock} s`} bench position={at(FSPOT.stopwatch)} labelY={0.05}>
          {(a) => <StopwatchModel sec={state.clock} glow={a} />}
        </Interactive>
      )}
      {has('thermometer') && (
        <Interactive id="thermometer" label="Thermometer" bench position={[AMY_BATH_X.WARM + 0.14, 0.004, AMY_BATH_Z + 0.05]} labelY={0.05}>
          {(a) => <Thermometer glow={a} />}
        </Interactive>
      )}
    </>
  );
}
