import { oxyGas, oxyLampAt, oxyRate, oxySplint, potoBubblePos, potoCondAt, type BioPlantState, type BioPlantVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { DropperBottle, ReagentBottle, Thermometer, WhiteTile } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { Forceps, HandLens, Scalpel } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { SolutionBeaker, StopwatchModel, WaterBath } from '../../bio-food-tests/lab3d/models';
import { lastRunShown } from '../readings';
import { PSPOT, lampSpot, leafSpot, usePlantBench } from './bench';
import {
  BagsModel,
  BenchLampModel,
  BowlModel,
  EthanolTubeModel,
  FanModel,
  FoilModel,
  GridPaperModel,
  KohFlaskModel,
  LeafModel,
  LeafyShoot,
  MetreRuleModel,
  OxyRigModel,
  PotometerModel,
  PottedPlantModel,
  SplintsModel,
  TroughModel,
  TubeRackModel,
  VaselineModel,
} from './models';
import { PLANT_APPARATUS_LABEL, usedBy, type PlantApparatusId, type PlantScene } from './scene-state';

/**
 * The student's bench for each task — the shoot, potometer, bowl, fan, lamp
 * and bags; the pondweed rig, the trough, the lamp on its metre rule; the
 * potted plant, the water bath, the ethanol, the tile, iodine and the grid —
 * and the cupboard's apparatus. Everything is drawn from the attempt's state.
 */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];

const S0 = CUPBOARD_SHELVES[0]! + 0.01;
const S1 = CUPBOARD_SHELVES[1]!;
const S2 = CUPBOARD_SHELVES[2]!;
const CUPBOARD_SLOT: Record<PlantApparatusId, V3> = {
  potometer: [-0.7, S0, 0.02],
  bowl: [0.05, S0, 0.04],
  fan: [0.65, S0, 0.04],
  blade: [-0.85, S1, 0.06],
  vaseline: [-0.6, S1, 0.05],
  lamp: [-0.32, S1, 0.03],
  bags: [-0.02, S1, 0.05],
  clock: [0.25, S1, 0.05],
  thermometer: [0.5, S1, 0.08],
  splint: [0.8, S1, 0.07],
  beaker: [-0.85, S2, 0.03],
  funnel: [-0.62, S2, 0.04],
  tube: [-0.45, S2, 0.06],
  rule: [-0.3, S2 + 0.2, 0.08],
  trough: [-0.1, S2, 0.04],
  bath: [0.15, S2 - 0.01, 0.03],
  tubes: [0.42, S2, 0.04],
  forceps: [0.6, S2, 0.07],
  tile: [0.78, S2, 0.04],
  foil: [-0.75, S2 + 0.25, 0.06],
  flask: [-0.5, S2 + 0.25, 0.04],
  grid: [-0.1, S2 + 0.25, 0.05],
  lens: [0.2, S2 + 0.25, 0.06],
};

export function ApparatusModel({ id, glow }: { id: PlantApparatusId; glow?: boolean }) {
  switch (id) {
    case 'potometer':
      return (
        <group scale={0.4}>
          <PotometerModel bubble={null} sealed={false} fitted={false} glow={glow} />
        </group>
      );
    case 'bowl':
      return (
        <group scale={0.6}>
          <BowlModel glow={glow} />
        </group>
      );
    case 'blade':
      return <Scalpel glow={glow} />;
    case 'vaseline':
      return <VaselineModel glow={glow} />;
    case 'fan':
      return (
        <group scale={0.6}>
          <FanModel on={false} glow={glow} />
        </group>
      );
    case 'lamp':
      return (
        <group scale={0.6}>
          <BenchLampModel on={false} glow={glow} />
        </group>
      );
    case 'bags':
      return <BagsModel glow={glow} />;
    case 'clock':
      return <StopwatchModel sec={null} glow={glow} />;
    case 'thermometer':
      return <Thermometer glow={glow} />;
    case 'splint':
      return <SplintsModel glowing={false} relit={false} glow={glow} />;
    case 'beaker':
      return (
        <group scale={0.7}>
          <OxyRigModel funnel={false} plant={false} tube={false} rate={0} gas={0} nahco3={false} glow={glow} />
        </group>
      );
    case 'funnel':
      return (
        <group rotation={[Math.PI, 0, 0]} position={[0, 0.06, 0]}>
          <mesh material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.012, 0.045, 0.05, 20, 1, true]} />
          </mesh>
        </group>
      );
    case 'tube':
      return (
        <mesh position={[0, 0.07, 0]} material={mat.glass()} renderOrder={5}>
          <cylinderGeometry args={[0.0095, 0.0095, 0.14, 12, 1, true]} />
        </mesh>
      );
    case 'rule':
      return (
        <group scale={0.5} position={[-0.25, 0, 0]}>
          <MetreRuleModel glow={glow} />
        </group>
      );
    case 'trough':
      return <TroughModel glow={glow} />;
    case 'bath':
      return (
        <group scale={0.55}>
          <WaterBath lit={false} glow={glow} />
        </group>
      );
    case 'tubes':
      return <TubeRackModel glow={glow} />;
    case 'forceps':
      return <Forceps glow={glow} />;
    case 'tile':
      return <WhiteTile glow={glow} />;
    case 'foil':
      return <FoilModel glow={glow} />;
    case 'flask':
      return <KohFlaskModel glow={glow} />;
    case 'grid':
      return <GridPaperModel glow={glow} />;
    case 'lens':
      return <HandLens glow={glow} />;
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench, by tapping or dragging it to the tray). */
export function PlantCupboard({ scene }: { scene: PlantScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as PlantApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={PLANT_APPARATUS_LABEL[id]} labelY={0.3} position={CUPBOARD_SLOT[id]} drag={carry}>
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

export function PlantStation({ v, state, scene }: { v: BioPlantVariant; state: BioPlantState; scene: PlantScene }) {
  const task = state.task ?? 'POTOMETER';
  const has = (id: PlantApparatusId) => scene.collected.has(id);
  const card = useMemo(
    () =>
      task === 'OXYGEN'
        ? bioTaskCardTexture('Oxygen from pondweed', ['NaHCO₃, funnel, tube; heat filter.', 'Lamp at 10 cm; wait 5 min.', 'Count bubbles 1 min, three times.', 'Further away until it stops.'])
        : task === 'STARCH'
          ? bioTaskCardTexture('Starch in a leaf', ['Destarched plant; foil; KOH flask.', 'Light 4–6 h; pick the leaves.', 'Boil; FLAME OFF; ethanol in bath.', 'Soften, tile, iodine; grid count.'])
          : bioTaskCardTexture('Potometer', ['Cut and fit under water; Vaseline.', 'One bubble; adjust 5 min.', 'Time 30 mm three times.', 'Still, fan, lamp, dark, humid.']),
    [task],
  );
  const book = useMemo(() => bioBookTexture('Practical notebook'), []);
  const extras = (['lens', 'potometer', 'bowl', 'fan', 'lamp', 'bags', 'beaker', 'trough', 'rule', 'bath', 'tubes', 'flask', 'foil', 'grid', 'thermometer', 'splint', 'tile', 'forceps'] as PlantApparatusId[]).filter((id) => has(id) && !usedBy(task).includes(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {task === 'POTOMETER' ? <PotoBench v={v} state={state} scene={scene} /> : task === 'OXYGEN' ? <OxyBench v={v} state={state} scene={scene} /> : <StarchBench v={v} state={state} scene={scene} />}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={PLANT_APPARATUS_LABEL[id]} bench position={[PSPOT.extras[0], 0.004, PSPOT.extras[2] - 0.13 * k]} labelY={0.08}>
          {(a) => (
            <group scale={0.5}>
              <ApparatusModel id={id} glow={a} />
            </group>
          )}
        </Interactive>
      ))}
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
    </group>
  );
}

function PotoBench({ v, state, scene }: { v: BioPlantVariant; state: BioPlantState; scene: PlantScene }) {
  const has = (id: PlantApparatusId) => scene.collected.has(id);
  const w = state.poto;
  const cond = w.bubble ? potoCondAt(w, w.clock) : null;
  const pos = w.bubble ? potoBubblePos(v.poto, w) : null;
  const last = lastRunShown(v, state);
  const shoot = <LeafyShoot cond={cond} />;
  return (
    <>
      {!w.fit && (
        <Interactive id="shoot" label={w.cut ? `Leafy shoot (cut ${w.cut === 'WATER' ? 'under water' : 'in air'})` : 'Leafy shoot (hibiscus)'} bench position={w.cut === 'WATER' ? [PSPOT.bowl[0], 0.03, PSPOT.bowl[2]] : at(PSPOT.shoot)} rotation={w.cut ? [0, 0, Math.PI / 2] : [0, 0, 0]} labelY={0.3}>
          {(a) => <LeafyShoot cond={null} glow={a} />}
        </Interactive>
      )}
      {has('potometer') && (
        <Interactive id="potometer" label={w.bubble ? `Potometer: bubble at ${Math.round(pos ?? 0)} mm` : 'Bubble potometer'} bench position={at(PSPOT.potometer)} labelY={0.3}>
          {(a) => (
            <PotometerModel bubble={pos} sealed={w.sealed} fitted={!!w.fit} glow={a}>
              {shoot}
            </PotometerModel>
          )}
        </Interactive>
      )}
      {has('bowl') && (
        <Interactive id="bowl" label="Bowl of water" bench position={at(PSPOT.bowl)} labelY={0.1}>
          {(a) => <BowlModel glow={a} />}
        </Interactive>
      )}
      {has('blade') && (
        <Interactive id="blade" label="Razor blade" bench position={at(PSPOT.blade)} labelY={0.04}>
          {(a) => <Scalpel glow={a} />}
        </Interactive>
      )}
      {has('vaseline') && (
        <Interactive id="vaseline" label="Vaseline" bench position={at(PSPOT.vaseline)} labelY={0.06}>
          {(a) => <VaselineModel glow={a} />}
        </Interactive>
      )}
      {has('fan') && (
        <Interactive id="fan" label={cond === 'FAN' ? 'Fan (on)' : 'Electric fan'} bench position={at(PSPOT.fan)} labelY={0.3}>
          {(a) => <FanModel on={cond === 'FAN'} glow={a} />}
        </Interactive>
      )}
      {has('lamp') && (
        <Interactive id="lamp" label={cond === 'LAMP' ? 'Bench lamp (on)' : 'Bench lamp'} bench position={at(PSPOT.lamp)} rotation={[0, -1.1, 0]} labelY={0.28}>
          {(a) => <BenchLampModel on={cond === 'LAMP'} glow={a} />}
        </Interactive>
      )}
      {has('bags') && (
        <Interactive id="bags" label="Black bag and clear polythene bag" bench position={at(PSPOT.bags)} labelY={0.05}>
          {(a) => <BagsModel glow={a} />}
        </Interactive>
      )}
      {has('clock') && (
        <Interactive id="clock" label={last ? `Stopwatch: ${last.sec.toFixed(1)} s` : 'Stopwatch'} bench position={at(PSPOT.clock)} labelY={0.05}>
          {(a) => <StopwatchModel sec={last ? last.sec : null} glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function OxyBench({ v, state, scene }: { v: BioPlantVariant; state: BioPlantState; scene: PlantScene }) {
  const has = (id: PlantApparatusId) => scene.collected.has(id);
  const w = state.oxy;
  const d = oxyLampAt(w, w.clock);
  const rate = oxyRate(v.oxy, w, w.clock);
  const gas = Math.min(0.85, oxyGas(v.oxy, w, w.clock) / 12);
  const sp = oxySplint(v.oxy, w);
  return (
    <>
      <Interactive id="weed" label={w.plant ? 'Pondweed (in the beaker)' : 'Freshly cut pondweed (Elodea) in a dish'} bench position={at(PSPOT.weed)} labelY={0.06}>
        {(a) => (
          <group>
            <SolutionBeaker colour="#d6e8f5" glow={a} />
            {!w.plant && (
              <mesh position={[0, 0.05, 0]} material={mat.green()}>
                <boxGeometry args={[0.05, 0.004, 0.02]} />
              </mesh>
            )}
          </group>
        )}
      </Interactive>
      <Interactive id="bottle" label="Sodium hydrogencarbonate" bench position={at(PSPOT.bottle)} labelY={0.16}>
        {(a) => <ReagentBottle name="NaHCO₃" band="#2e7d32" sub="solid" glow={a} />}
      </Interactive>
      {has('beaker') && (
        <Interactive id="rig" label={w.plant ? `Pondweed under the funnel${w.tubeAt !== null ? ', tube over the stem' : ''}` : 'Large beaker of water'} bench position={at(PSPOT.beaker)} labelY={0.32}>
          {(a) => <OxyRigModel funnel={has('funnel') && w.plant} plant={w.plant} tube={w.tubeAt !== null} rate={rate} gas={gas} nahco3={w.nahco3} glow={a} />}
        </Interactive>
      )}
      {has('thermometer') && w.plant && (
        <Interactive id="thermometer" label="Thermometer in the beaker" bench position={[PSPOT.beaker[0] + 0.045, 0.03, PSPOT.beaker[2] + 0.02]} labelY={0.25}>
          {(a) => <Thermometer glow={a} />}
        </Interactive>
      )}
      {has('trough') && (
        <Interactive id="trough" label={w.shield ? 'Water trough (in place as a heat filter)' : 'Water trough'} bench position={w.shield ? at(PSPOT.trough) : [PSPOT.trough[0] + 0.1, 0, PSPOT.trough[2] - 0.3]} labelY={0.15}>
          {(a) => <TroughModel glow={a} />}
        </Interactive>
      )}
      {has('rule') && (
        <Interactive id="rule" label="Metre rule" bench position={[PSPOT.beaker[0] + 0.07, 0, PSPOT.rule[2]]} labelY={0.04}>
          {(a) => <MetreRuleModel glow={a} />}
        </Interactive>
      )}
      {has('lamp') && (
        <Interactive id="lamp" label={d === null ? 'Bench lamp (off)' : `Bench lamp at ${d} cm`} bench position={at(lampSpot(d))} labelY={0.28} drag={() => 'lampdrag'}>
          {(a) => <BenchLampModel on={d !== null} glow={a} />}
        </Interactive>
      )}
      {has('splint') && (
        <Interactive id="splint" label="Wooden splints" bench position={at(PSPOT.splint)} labelY={0.04}>
          {(a) => <SplintsModel glowing={w.splintAt !== null} relit={!!sp?.relit} glow={a} />}
        </Interactive>
      )}
      {has('clock') && (
        <Interactive id="clock" label={`Stopwatch: ${Math.round(w.clock)} min`} bench position={at(PSPOT.oclock)} labelY={0.05}>
          {(a) => <StopwatchModel sec={w.plant ? w.clock * 60 : null} glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function StarchBench({ v, state, scene }: { v: BioPlantVariant; state: BioPlantState; scene: PlantScene }) {
  const has = (id: PlantApparatusId) => scene.collected.has(id);
  const w = state.starch;
  const sel = usePlantBench((b) => b.sel);
  const fireAt = usePlantBench((b) => b.fireAt);
  const fire = fireAt > 0 && performance.now() - fireAt < 4000;
  const cur = w.leaves[sel];
  const green = cur ? Math.min(1, cur.eth / 5) : 0;
  return (
    <>
      <Interactive id="pot" label={w.plant ? (w.plant === 'DESTARCHED' ? `Plant A (destarched) — ${w.hours} h in the light` : `Plant B (from the window) — ${w.hours} h`) : 'Two potted plants: A (destarched) and B (from the window)'} bench position={at(PSPOT.pot)} labelY={0.4}>
        {(a) => (
          <PottedPlantModel
            foil={w.foil}
            koh={w.koh}
            picked={w.leaves.map((l) => l.kind)}
            dark={w.plant === 'DESTARCHED' && w.hours === 0}
            glow={a}
          />
        )}
      </Interactive>
      {has('foil') && (
        <Interactive id="foil" label="Aluminium foil" bench position={at(PSPOT.foil)} labelY={0.05}>
          {(a) => <FoilModel glow={a} />}
        </Interactive>
      )}
      {has('flask') && !w.koh && (
        <Interactive id="flask" label="Flask with potassium hydroxide" bench position={at(PSPOT.flask)} labelY={0.14}>
          {(a) => <KohFlaskModel glow={a} />}
        </Interactive>
      )}
      {has('bath') && (
        <Interactive id="bath" label={w.flame ? 'Water bath (Bunsen on, boiling)' : w.hot ? 'Water bath (hot; flame off)' : 'Water bath (cold)'} bench position={at(PSPOT.bath)} labelY={0.4}>
          {(a) => (
            <WaterBath lit={w.flame} glow={a}>
              {cur && cur.eth > 0 && (
                <group position={[0.02, 0.01, 0]}>
                  <EthanolTubeModel green={green} fire={fire} />
                </group>
              )}
            </WaterBath>
          )}
        </Interactive>
      )}
      <Interactive id="ethanol" label="Ethanol (highly flammable)" bench position={at(PSPOT.ethanol)} labelY={0.16}>
        {(a) => <ReagentBottle name="Ethanol" band="#c62828" sub="FLAMMABLE" glow={a} />}
      </Interactive>
      {has('tubes') && (
        <Interactive id="tubes" label="Boiling tubes" bench position={at(PSPOT.rack)} labelY={0.16}>
          {(a) => <TubeRackModel glow={a} />}
        </Interactive>
      )}
      <Interactive id="warm" label="Beaker of warm water (to soften the leaf)" bench position={at(PSPOT.warm)} labelY={0.1}>
        {(a) => <SolutionBeaker colour="#dcebf3" glow={a} />}
      </Interactive>
      <Interactive id="iodine" label="Iodine solution (dropper bottle)" bench position={at(PSPOT.iodine)} labelY={0.1}>
        {(a) => <DropperBottle name="Iodine" colour="#b8742a" glow={a} />}
      </Interactive>
      {has('tile') && (
        <Interactive id="tile" label="White tile" bench position={at(PSPOT.tile)} labelY={0.04}>
          {(a) => <WhiteTile glow={a} />}
        </Interactive>
      )}
      {has('grid') && (
        <Interactive id="grid" label="1 cm² grid paper" bench position={at(PSPOT.grid)} labelY={0.03}>
          {(a) => <GridPaperModel glow={a} />}
        </Interactive>
      )}
      {has('forceps') && (
        <Interactive id="forceps" label="Forceps" bench position={at(PSPOT.forceps)} labelY={0.03}>
          {(a) => <Forceps glow={a} />}
        </Interactive>
      )}
      {w.leaves.map((l, k) => {
        const onGrid = w.grid.leaf === k && has('grid');
        const onTile = !onGrid && l.tile && has('tile') && k === sel;
        const pos: V3 = onGrid ? at(PSPOT.grid, 0.001) : onTile ? at(PSPOT.tile, 0.009) : (leafSpot(k).slice() as V3);
        return (
          <Interactive key={k} id={`leaf:${k}`} label={`Leaf ${k + 1}: ${l.kind.toLowerCase()}${l.iodine ? ' (iodine added)' : ''}`} bench position={pos} labelY={0.04} drag={() => 'leafdrag'}>
            {(a) => <LeafModel v={v} w={w} leaf={l} glow={a || k === sel} />}
          </Interactive>
        );
      })}
    </>
  );
}
