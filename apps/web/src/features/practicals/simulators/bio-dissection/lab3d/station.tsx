import { SLICES, type BioDissectionState, type BioDissectionVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { WashBottle } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { DisinfectantBeaker, GlovesBox, HandLens, TapeRoll } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { FridgeModel } from '../../bio-growth/lab3d/models';
import { DSPOT, plateSpot } from './bench';
import { BagsModel, BalsamModel, BowlModel, BreadModel, EosinBeakerModel, IncubatorModel, KitModel, MarkerModel, PlateModel, RatBoardModel, RazorModel, ScopeModel, SoilPotModel, StopwatchModel, ThreadModel, TileModel, UprightRuler } from './models';
import { DISSECT_APPARATUS_LABEL, usedBy, type DissectApparatusId, type DissectScene } from './scene-state';

/**
 * The student's bench for each task — the balsam plant, the eosin beaker
 * and ruler, the tile, razor, lens and microscope; the dissecting board with
 * the rat and the kit; the four agar plates, the incubator, the bread and the
 * refrigerator — and the cupboard's apparatus. Everything is drawn from the
 * attempt's state.
 */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];
const S0 = CUPBOARD_SHELVES[0]! + 0.01;
const S1 = CUPBOARD_SHELVES[1]!;
const S2 = CUPBOARD_SHELVES[2]!;
const CUPBOARD_SLOT: Record<DissectApparatusId, V3> = {
  microscope: [-0.75, S0, 0.03],
  incubator: [0.3, S0, 0.02],
  plates: [0.82, S0, 0.04],
  eosin: [-0.85, S1, 0.05],
  bowl: [-0.62, S1, 0.05],
  tile: [-0.4, S1, 0.05],
  kit: [-0.15, S1, 0.05],
  washbottle: [0.08, S1, 0.05],
  disinfectant: [0.3, S1, 0.06],
  bread: [0.55, S1, 0.05],
  bags: [0.82, S1, 0.05],
  razor: [-0.85, S2, 0.08],
  lens: [-0.62, S2, 0.07],
  stopwatch: [-0.4, S2, 0.07],
  ruler: [-0.15, S2, 0.05],
  thread: [0.1, S2, 0.06],
  marker: [0.35, S2, 0.07],
  tape: [0.62, S2, 0.07],
};

export function ApparatusModel({ id, glow }: { id: DissectApparatusId; glow?: boolean }) {
  switch (id) {
    case 'eosin':
      return <EosinBeakerModel red glow={glow} />;
    case 'bowl':
      return <BowlModel glow={glow} />;
    case 'tile':
      return (
        <mesh position={[0, 0.004, 0]} material={mat.tile()}>
          <boxGeometry args={[0.15, 0.008, 0.15]} />
        </mesh>
      );
    case 'razor':
      return <RazorModel glow={glow} />;
    case 'lens':
      return <HandLens glow={glow} />;
    case 'microscope':
      return (
        <group scale={0.7}>
          <ScopeModel slide={false} glow={glow} />
        </group>
      );
    case 'stopwatch':
      return <StopwatchModel minutes={0} glow={glow} />;
    case 'ruler':
      return (
        <group scale={0.5}>
          <UprightRuler glow={glow} />
        </group>
      );
    case 'kit':
      return <KitModel glow={glow} />;
    case 'thread':
      return <ThreadModel glow={glow} />;
    case 'washbottle':
      return <WashBottle glow={glow} />;
    case 'disinfectant':
      return <DisinfectantBeaker glow={glow} />;
    case 'plates':
      return (
        <group>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[0, 0.006 + k * 0.014, 0]} material={mat.glass()}>
              <cylinderGeometry args={[0.045, 0.045, 0.013, 24]} />
            </mesh>
          ))}
        </group>
      );
    case 'incubator':
      return (
        <group scale={0.55}>
          <IncubatorModel temp={null} glow={glow} />
        </group>
      );
    case 'bread':
      return (
        <mesh position={[0, 0.02, 0]} material={mat.woodDark()}>
          <boxGeometry args={[0.1, 0.04, 0.1]} />
        </mesh>
      );
    case 'bags':
      return <BagsModel glow={glow} />;
    case 'marker':
      return <MarkerModel glow={glow} />;
    case 'tape':
      return <TapeRoll glow={glow} />;
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench, by tapping or dragging it to the tray). */
export function DissectCupboard({ scene }: { scene: DissectScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as DissectApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={DISSECT_APPARATUS_LABEL[id]} labelY={0.3} position={CUPBOARD_SLOT[id]} drag={carry}>
            {(active) => (
              <group>
                <ApparatusModel id={id} glow={active} />
                <mesh position={[0, 0.07, 0]}>
                  <boxGeometry args={[0.18, 0.16, 0.12]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            )}
          </Interactive>
        ))}
    </group>
  );
}

export function DissectStation({ v, state, scene, seed }: { v: BioDissectionVariant; state: BioDissectionState; scene: DissectScene; seed: number }) {
  const task = state.task ?? 'EOSIN';
  const card = useMemo(
    () =>
      task === 'RAT'
        ? bioTaskCardTexture('Rat dissection', ['Gloves; pin ventral side up.', 'Lift skin; cut the midline.', 'Seeker: display the gut.', 'Measure; draw as displayed.'])
        : task === 'MICROBE'
          ? bioTaskCardTexture('Microorganisms', ['Label plates on the BASE.', 'Air 20 min; fingers ± soap.', 'Tape, invert, 25–30 °C.', 'Count; never open plates.'])
          : bioTaskCardTexture('Eosin and xylem', ['Wash roots; stand in eosin.', 'Read the red line often.', 'Thin sections on the tile.', 'Shade only the xylem.']),
    [task],
  );
  const book = useMemo(() => bioBookTexture('Practical notebook'), []);
  const extras = (Object.keys(CUPBOARD_SLOT) as DissectApparatusId[]).filter((id) => scene.collected.has(id) && !usedBy(task).includes(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {task === 'RAT' ? <RatBench3 state={state} scene={scene} /> : task === 'MICROBE' ? <MicroBench3 v={v} state={state} scene={scene} seed={seed} /> : <EosinBench3 v={v} state={state} scene={scene} />}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={DISSECT_APPARATUS_LABEL[id]} bench position={[DSPOT.extras[0], 0.004, DSPOT.extras[2] - 0.13 * k]} labelY={0.08}>
          {(a) => (
            <group scale={0.5}>
              <ApparatusModel id={id} glow={a} />
            </group>
          )}
        </Interactive>
      ))}
      <Interactive id="card" label="Task card" bench position={at(DSPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(DSPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
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

function EosinBench3({ v, state, scene }: { v: BioDissectionVariant; state: BioDissectionState; scene: DissectScene }) {
  const has = (id: DissectApparatusId) => scene.collected.has(id);
  const w = state.eosin;
  const plantAt = w.dye ? DSPOT.eosin : DSPOT.plant;
  return (
    <>
      {!w.dye && (
        <Interactive id="pot" label={w.wash ? 'Empty plant pot' : 'Balsam seedling in a pot of soil'} bench position={at(DSPOT.plant)} labelY={0.1}>
          {(a) => <SoilPotModel glow={a} />}
        </Interactive>
      )}
      <Interactive id="plant" label={w.dye ? `Balsam plant in eosin (${w.clock} min)` : w.wash ? 'Balsam plant, roots washed' : 'Young balsam plant'} bench position={at(plantAt, w.dye ? 0.0 : w.wash ? 0.06 : 0.01)} labelY={0.34} drag={() => 'plantdrag'}>
        {(a) => <BalsamModel v={v} w={w} glow={a} />}
      </Interactive>
      {has('eosin') && (
        <>
          <Interactive id="eosin" label="Beaker of eosin" bench position={at(DSPOT.eosin)} labelY={0.12}>
            {(a) => <EosinBeakerModel red glow={a} />}
          </Interactive>
          {has('ruler') && (
            <Interactive id="ruler" label="30 cm ruler (0 at the dye surface)" bench position={at([DSPOT.eosin[0] + 0.05, 0, DSPOT.eosin[2]], 0.06 - 0.003)} labelY={0.34}>
              {(a) => <UprightRuler glow={a} />}
            </Interactive>
          )}
        </>
      )}
      {!has('eosin') && has('ruler') && (
        <Interactive id="ruler" label="30 cm ruler" bench position={at(DSPOT.eruler)} labelY={0.34}>
          {(a) => <UprightRuler glow={a} />}
        </Interactive>
      )}
      {has('bowl') && (
        <Interactive id="bowl" label="Bowl of water" bench position={at(DSPOT.bowl)} labelY={0.08}>
          {(a) => <BowlModel glow={a} />}
        </Interactive>
      )}
      {has('tile') && (
        <Interactive id="tile" label={`White tile${w.sections.length ? ` (${w.sections.length} section${w.sections.length === 1 ? '' : 's'})` : ''}`} bench position={at(DSPOT.tile)} labelY={0.05}>
          {(a) => <TileModel v={v} w={w} glow={a} />}
        </Interactive>
      )}
      {has('razor') && (
        <Interactive id="razor" label="Razor blade" bench position={at(DSPOT.razor)} labelY={0.04}>
          {(a) => <RazorModel glow={a} />}
        </Interactive>
      )}
      {has('lens') && (
        <Interactive id="lens" label="Hand lens" bench position={at(DSPOT.lens)} labelY={0.05}>
          {(a) => <HandLens glow={a} />}
        </Interactive>
      )}
      {has('microscope') && (
        <Interactive id="microscope" label="Microscope" bench position={at(DSPOT.microscope)} labelY={0.28}>
          {(a) => <ScopeModel slide={w.views.some((x) => x.tool === 'MICRO')} glow={a} />}
        </Interactive>
      )}
      {has('stopwatch') && (
        <Interactive id="stopwatch" label={`Stopwatch (${w.clock} min)`} bench position={at(DSPOT.stopwatch)} labelY={0.05}>
          {(a) => <StopwatchModel minutes={w.clock} glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function RatBench3({ state, scene }: { state: BioDissectionState; scene: DissectScene }) {
  const has = (id: DissectApparatusId) => scene.collected.has(id);
  const w = state.rat;
  return (
    <>
      <Interactive id="rat" label={w.pinned ? 'The rat, pinned out on the board' : 'The rat on a dissecting board (killed humanely by the teacher)'} bench position={at(DSPOT.board)} labelY={0.1}>
        {(a) => <RatBoardModel w={w} glow={a} />}
      </Interactive>
      <Interactive id="gloves" label={w.gloves ? 'Box of gloves (wearing a pair)' : 'Box of disposable gloves'} bench position={at(DSPOT.gloves)} labelY={0.1}>
        {(a) => <GlovesBox open={w.gloves} glow={a} />}
      </Interactive>
      {has('kit') && (
        <Interactive id="kit" label="Dissecting kit" bench position={at(DSPOT.kit)} labelY={0.05}>
          {(a) => <KitModel glow={a} />}
        </Interactive>
      )}
      {has('thread') && (
        <Interactive id="thread" label="Reel of thread" bench position={at(DSPOT.thread)} labelY={0.06}>
          {(a) => <ThreadModel glow={a} />}
        </Interactive>
      )}
      {has('ruler') && (
        <Interactive id="ruler" label="30 cm ruler" bench position={at(DSPOT.rruler)} rotation={[-Math.PI / 2, 0, 0]} labelY={0.05} drag={() => 'rulerdrag'}>
          {(a) => (
            <group position={[0, -0.15, 0]}>
              <UprightRuler glow={a} />
            </group>
          )}
        </Interactive>
      )}
      {has('washbottle') && (
        <Interactive id="washbottle" label="Wash bottle of water" bench position={at(DSPOT.washbottle)} labelY={0.2}>
          {(a) => <WashBottle glow={a} />}
        </Interactive>
      )}
      {has('disinfectant') && (
        <Interactive id="disinfectant" label="Disinfectant" bench position={at(DSPOT.disinfectant)} labelY={0.12}>
          {(a) => <DisinfectantBeaker used={w.cleaned} glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function MicroBench3({ v, state, scene, seed }: { v: BioDissectionVariant; state: BioDissectionState; scene: DissectScene; seed: number }) {
  const has = (id: DissectApparatusId) => scene.collected.has(id);
  const w = state.micro;
  const inside = w.incAt !== null && w.countAt === null;
  const days = w.incAt === null ? null : w.day - w.incAt;
  return (
    <>
      {has('plates') &&
        w.plates.map((_, k) => {
          const p = plateSpot(k, inside);
          return (
            <Interactive key={k} id={`plate:${k}`} label={`Agar plate ${k + 1}${w.plates[k]!.label ? '' : ' (not labelled)'}`} bench position={at(p)} labelY={0.06} drag={() => 'platedrag'}>
              {(a) => <PlateModel v={v} w={w} k={k} days={days} seed={seed} glow={a} />}
            </Interactive>
          );
        })}
      {has('incubator') && (
        <Interactive id="incubator" label={`Incubator${w.temp ? ` (${w.temp} °C)` : ''}`} bench position={at(DSPOT.incubator)} labelY={0.3}>
          {(a) => <IncubatorModel temp={w.temp} glow={a} />}
        </Interactive>
      )}
      {has('bread') &&
        SLICES.map((n, k) => {
          const cold = w.slices[k]!.place === 'COLD' && w.breadAt !== null;
          const pos: V3 = cold ? [DSPOT.fridge[0], 0.05, DSPOT.fridge[2] + 0.02] : [DSPOT.bread[0] - 0.11 + k * 0.11, 0, DSPOT.bread[2]];
          return (
            <Interactive key={n} id={`slice:${k}`} label={`Bread slice ${n}`} bench position={at(pos)} labelY={0.05}>
              {(a) => <BreadModel v={v} w={w} k={k} d={w.day} glow={a} />}
            </Interactive>
          );
        })}
      <Interactive id="fridge" label="Bench refrigerator (5 °C)" bench position={at(DSPOT.fridge)} rotation={[0, -0.35, 0]} labelY={0.4}>
        {(a) => <FridgeModel glow={a} />}
      </Interactive>
      {has('bags') && (
        <Interactive id="bags" label="Polythene bags" bench position={at(DSPOT.bags)} labelY={0.04}>
          {(a) => <BagsModel glow={a} />}
        </Interactive>
      )}
      {has('marker') && (
        <Interactive id="marker" label="Marker pen" bench position={at(DSPOT.marker)} labelY={0.04}>
          {(a) => <MarkerModel glow={a} />}
        </Interactive>
      )}
      {has('tape') && (
        <Interactive id="tape" label="Adhesive tape" bench position={at(DSPOT.tape)} labelY={0.05}>
          {(a) => <TapeRoll glow={a} />}
        </Interactive>
      )}
      {has('disinfectant') && (
        <Interactive id="disinfectant" label="Disinfectant" bench position={at(DSPOT.mdisinfectant)} labelY={0.12}>
          {(a) => <DisinfectantBeaker used={w.wiped} glow={a} />}
        </Interactive>
      )}
      {has('lens') && (
        <Interactive id="lens" label="Hand lens" bench position={at(DSPOT.mlens)} labelY={0.05}>
          {(a) => <HandLens glow={a} />}
        </Interactive>
      )}
      {has('microscope') && (
        <Interactive id="microscope" label="Microscope (teacher’s slide of bread mould)" bench position={at(DSPOT.mmicroscope)} labelY={0.28}>
          {(a) => <ScopeModel slide={w.slide} glow={a} />}
        </Interactive>
      )}
    </>
  );
}
