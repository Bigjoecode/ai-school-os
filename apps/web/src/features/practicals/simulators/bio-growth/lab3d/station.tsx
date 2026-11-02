import { GERM_TUBES, type BioGrowthState, type BioGrowthVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { ReagentBottle, Thermometer, WashBottle } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { DisinfectantBeaker, HandLens, Ruler, TapeRoll } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { BenchLampModel } from '../../bio-plant/lab3d/models';
import { GSPOT, tubeSpot } from './bench';
import { BoilerModel, Co2TestModel, CorkJarModel, CottonModel, FridgeModel, GermTubeModel, KlinostatModel, LightBoxModel, PotSeedlingsModel, ProtractorModel, RackModel, SawdustBoxModel, SeedDishModel, SeedJarModel, ThermosModel, co2Liquid, co2Now, tropAngles } from './models';
import { GROWTH_APPARATUS_LABEL, usedBy, type GrowthApparatusId, type GrowthScene } from './scene-state';

/**
 * The student's bench for each task — the four tubes in their rack and the
 * bench refrigerator; the box of sawdust, the seed jar and the ruler; the
 * vacuum flasks, the boiling beaker, disinfectant and the CO₂ test; the light
 * box, lamp, clinostat and the cork jar — and the cupboard's apparatus.
 * Everything is drawn from the attempt's state.
 */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];

const S0 = CUPBOARD_SHELVES[0]! + 0.01;
const S1 = CUPBOARD_SHELVES[1]!;
const S2 = CUPBOARD_SHELVES[2]!;
const CUPBOARD_SLOT: Record<GrowthApparatusId, V3> = {
  rack: [-0.75, S0, 0.04],
  box: [-0.35, S0, 0.03],
  flasks: [0.05, S0, 0.03],
  lightbox: [0.5, S0, 0.02],
  klinostat: [0.85, S0, 0.03],
  cotton: [-0.85, S1, 0.06],
  boiled: [-0.62, S1, 0.05],
  oil: [-0.42, S1, 0.05],
  labels: [-0.22, S1, 0.07],
  washbottle: [-0.02, S1, 0.05],
  jar: [0.2, S1, 0.04],
  thermometers: [0.42, S1, 0.08],
  disinfectant: [0.62, S1, 0.06],
  lamp: [0.85, S1, 0.03],
  ruler: [-0.8, S2, 0.08],
  lens: [-0.55, S2, 0.07],
  boiler: [-0.3, S2 - 0.01, 0.03],
  conical: [0.0, S2, 0.04],
  limewater: [0.22, S2, 0.06],
  corkjar: [0.45, S2, 0.04],
  protractor: [0.68, S2, 0.08],
  tape: [0.86, S2, 0.07],
};

export function ApparatusModel({ id, glow }: { id: GrowthApparatusId; glow?: boolean }) {
  switch (id) {
    case 'rack':
      return (
        <group scale={0.6}>
          <RackModel glow={glow} />
        </group>
      );
    case 'cotton':
      return <CottonModel glow={glow} />;
    case 'boiled':
      return <ReagentBottle name="Boiled water" band="#1565c0" sub="cooled" glow={glow} />;
    case 'oil':
      return <ReagentBottle name="Oil" band="#c99a06" sub="vegetable" liquid="#e8c95a" glow={glow} />;
    case 'labels':
      return (
        <mesh position={[0, 0.004, 0]} material={mat.white()}>
          <boxGeometry args={[0.06, 0.008, 0.04]} />
        </mesh>
      );
    case 'washbottle':
      return <WashBottle glow={glow} />;
    case 'box':
      return (
        <group scale={0.5}>
          <mesh position={[0, 0.03, 0]} material={mat.wood()}>
            <boxGeometry args={[0.3, 0.06, 0.16]} />
          </mesh>
        </group>
      );
    case 'jar':
      return (
        <group scale={0.6}>
          <mesh position={[0, 0.13, 0]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.05, 0.05, 0.26, 20, 1, true]} />
          </mesh>
        </group>
      );
    case 'ruler':
      return <Ruler glow={glow} />;
    case 'lens':
      return <HandLens glow={glow} />;
    case 'flasks':
      return (
        <group scale={0.5}>
          <mesh position={[-0.05, 0.1, 0]} material={mat.steel()}>
            <cylinderGeometry args={[0.04, 0.04, 0.2, 20]} />
          </mesh>
          <mesh position={[0.05, 0.1, 0]} material={mat.steel()}>
            <cylinderGeometry args={[0.04, 0.04, 0.2, 20]} />
          </mesh>
        </group>
      );
    case 'thermometers':
      return (
        <group position={[-0.14, 0, 0]}>
          <Thermometer glow={glow} />
        </group>
      );
    case 'disinfectant':
      return <DisinfectantBeaker glow={glow} />;
    case 'boiler':
      return (
        <group scale={0.55}>
          <BoilerModel lit={false} seeds={false} glow={glow} />
        </group>
      );
    case 'conical':
      return (
        <group scale={0.8}>
          <Co2TestModel seeds="LIVE" liquid="#eef6fa" bubbling={false} glow={glow} />
        </group>
      );
    case 'limewater':
      return <ReagentBottle name="Lime water" band="#607d8b" sub="Ca(OH)₂" glow={glow} />;
    case 'lightbox':
      return (
        <group scale={0.55}>
          <LightBoxModel slit="LAMP" taped={false} glow={glow} />
        </group>
      );
    case 'lamp':
      return (
        <group scale={0.6}>
          <BenchLampModel on={false} glow={glow} />
        </group>
      );
    case 'klinostat':
      return (
        <group scale={0.6}>
          <mesh position={[0, 0.03, 0]} material={mat.darkMetal()}>
            <boxGeometry args={[0.12, 0.06, 0.1]} />
          </mesh>
        </group>
      );
    case 'corkjar':
      return (
        <group scale={0.6}>
          <mesh position={[0, 0.12, 0]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[0.055, 0.055, 0.24, 20, 1, true]} />
          </mesh>
          <mesh position={[0, 0.13, 0]} rotation={[Math.PI / 2, 0, 0]} material={mat.cork()}>
            <cylinderGeometry args={[0.03, 0.03, 0.02, 16]} />
          </mesh>
        </group>
      );
    case 'protractor':
      return <ProtractorModel glow={glow} />;
    case 'tape':
      return <TapeRoll glow={glow} />;
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench, by tapping or dragging it to the tray). */
export function GrowthCupboard({ scene }: { scene: GrowthScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as GrowthApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={GROWTH_APPARATUS_LABEL[id]} labelY={0.3} position={CUPBOARD_SLOT[id]} drag={carry}>
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

export function GrowthStation({ v, state, scene }: { v: BioGrowthVariant; state: BioGrowthState; scene: GrowthScene }) {
  const task = state.task ?? 'GERM';
  const has = (id: GrowthApparatusId) => scene.collected.has(id);
  const card = useMemo(
    () =>
      task === 'SEEDLING'
        ? bioTaskCardTexture('Epigeal and hypogeal', ['Soak; sow in sawdust and jar.', 'Water daily; leave 1 day.', 'Measure both shoots daily.', 'Draw at day 3 and day 7.'])
        : task === 'RESP'
          ? bioTaskCardTexture('Respiring seeds', ['Boil half; disinfect both.', 'A: live, B: boiled; plug, invert.', 'Read daily for 3 days.', 'Lime water + control.'])
          : task === 'TROPISM'
            ? bioTaskCardTexture('Tropisms', ['Box: slit to lamp; tape gaps.', 'Control on the clinostat.', 'Pin seedlings on moist cork.', 'Protractor daily; count.'])
            : bioTaskCardTexture('Germination', ['A moist, B dry, C boiled+oil, D cold.', '10 sorted seeds in each; label.', 'Count radicles every day.', '% = germinated ÷ sown × 100.']),
    [task],
  );
  const book = useMemo(() => bioBookTexture('Practical notebook'), []);
  const extras = (['lens', 'rack', 'box', 'jar', 'flasks', 'lightbox', 'klinostat', 'corkjar', 'boiler', 'conical', 'thermometers', 'disinfectant', 'oil', 'boiled', 'labels', 'ruler', 'protractor', 'tape', 'lamp', 'cotton', 'washbottle', 'limewater'] as GrowthApparatusId[]).filter((id) => has(id) && !usedBy(task).includes(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {task === 'GERM' ? <GermBench3 v={v} state={state} scene={scene} /> : task === 'SEEDLING' ? <SeedBench3 v={v} state={state} scene={scene} /> : task === 'RESP' ? <RespBench3 v={v} state={state} scene={scene} /> : <TropBench3 v={v} state={state} scene={scene} />}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={GROWTH_APPARATUS_LABEL[id]} bench position={[GSPOT.extras[0], 0.004, GSPOT.extras[2] - 0.13 * k]} labelY={0.08}>
          {(a) => (
            <group scale={0.5}>
              <ApparatusModel id={id} glow={a} />
            </group>
          )}
        </Interactive>
      ))}
      <Interactive id="card" label="Task card" bench position={at(GSPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(GSPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
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

function GermBench3({ v, state, scene }: { v: BioGrowthVariant; state: BioGrowthState; scene: GrowthScene }) {
  const has = (id: GrowthApparatusId) => scene.collected.has(id);
  const w = state.germ;
  return (
    <>
      <Interactive id="seeds" label={w.batch ? `Cowpea seeds (${w.batch === 'SORTED' ? 'sorted' : 'mixed handful'})` : 'Packet of cowpea seeds'} bench position={at(GSPOT.seeds)} labelY={0.05}>
        {(a) => <SeedDishModel soaked={false} glow={a} />}
      </Interactive>
      <Interactive id="fridge" label="Bench refrigerator (5 °C)" bench position={at(GSPOT.fridge)} rotation={[0, -0.35, 0]} labelY={0.4} drag={() => 'tubedrag'}>
        {(a) => <FridgeModel glow={a} />}
      </Interactive>
      {has('rack') && (
        <>
          <Interactive id="rack" label="Test-tube rack" bench position={at(GSPOT.rack)} labelY={0.2}>
            {(a) => <RackModel glow={a} />}
          </Interactive>
          {w.tubes.map((t, k) => (
            <Interactive key={k} id={`tube:${k}`} label={`Tube ${GERM_TUBES[k]}${t.label ? '' : ' (not labelled)'}${t.fridge ? ' — in the refrigerator' : ''}`} bench position={at(tubeSpot(k, t.fridge))} labelY={0.18} drag={() => 'tubedrag'}>
              {(a) => <GermTubeModel v={v} w={w} t={t} k={k} d={w.day} glow={a} />}
            </Interactive>
          ))}
        </>
      )}
      {has('cotton') && (
        <Interactive id="cotton" label="Cotton wool" bench position={at(GSPOT.cotton)} labelY={0.06}>
          {(a) => <CottonModel glow={a} />}
        </Interactive>
      )}
      {has('boiled') && (
        <Interactive id="boiled" label="Boiled, cooled water" bench position={at(GSPOT.boiled)} labelY={0.16}>
          {(a) => <ReagentBottle name="Boiled water" band="#1565c0" sub="cooled" glow={a} />}
        </Interactive>
      )}
      {has('oil') && (
        <Interactive id="oil" label="Oil" bench position={at(GSPOT.oil)} labelY={0.16}>
          {(a) => <ReagentBottle name="Oil" band="#c99a06" sub="vegetable" liquid="#e8c95a" glow={a} />}
        </Interactive>
      )}
      {has('labels') && (
        <Interactive id="labels" label="Labels and a marker" bench position={at(GSPOT.labels)} labelY={0.04}>
          {(a) => (
            <group>
              <mesh position={[0, 0.003, 0]} material={mat.white()}>
                <boxGeometry args={[0.07, 0.006, 0.045]} />
              </mesh>
              <mesh position={[0.05, 0.006, 0]} rotation={[0, 0, Math.PI / 2]} material={mat.black()}>
                <cylinderGeometry args={[0.005, 0.005, 0.08, 8]} />
              </mesh>
              {a && <mesh position={[0, 0.012, 0]} material={mat.highlight()}><boxGeometry args={[0.08, 0.002, 0.05]} /></mesh>}
            </group>
          )}
        </Interactive>
      )}
      {has('washbottle') && (
        <Interactive id="washbottle" label="Wash bottle of water" bench position={at(GSPOT.washbottle)} labelY={0.2}>
          {(a) => <WashBottle glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function SeedBench3({ v, state, scene }: { v: BioGrowthVariant; state: BioGrowthState; scene: GrowthScene }) {
  const has = (id: GrowthApparatusId) => scene.collected.has(id);
  const w = state.seedling;
  return (
    <>
      <Interactive id="seeds" label={w.soaked ? 'Soaked cowpea and maize seeds' : 'Cowpea and maize seeds in a dish'} bench position={at(GSPOT.soakbeaker)} labelY={0.05}>
        {(a) => <SeedDishModel soaked={w.soaked} maize glow={a} />}
      </Interactive>
      {has('box') && (
        <Interactive id="box" label={w.box ? `Box of sawdust (day ${w.day})` : 'Box of moist sawdust'} bench position={at(GSPOT.box)} labelY={0.14}>
          {(a) => <SawdustBoxModel v={v} w={w} glow={a} />}
        </Interactive>
      )}
      {has('jar') && (
        <Interactive id="jar" label={w.jar ? `Seed jar (day ${w.day})` : 'Seed jar (gas jar and blotting paper)'} bench position={at(GSPOT.jar)} labelY={0.3}>
          {(a) => <SeedJarModel v={v} w={w} glow={a} />}
        </Interactive>
      )}
      {has('ruler') && (
        <Interactive id="ruler" label="30 cm ruler" bench position={at(GSPOT.ruler)} rotation={[0, 0.3, 0]} labelY={0.03}>
          {(a) => <Ruler glow={a} />}
        </Interactive>
      )}
      {has('washbottle') && (
        <Interactive id="washbottle" label="Wash bottle of water" bench position={at([-0.66, 0, 0.16])} labelY={0.2}>
          {(a) => <WashBottle glow={a} />}
        </Interactive>
      )}
      {has('lens') && (
        <Interactive id="lens" label="Hand lens" bench position={at(GSPOT.lens)} labelY={0.03}>
          {(a) => <HandLens glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function RespBench3({ v, state, scene }: { v: BioGrowthVariant; state: BioGrowthState; scene: GrowthScene }) {
  const has = (id: GrowthApparatusId) => scene.collected.has(id);
  const w = state.resp;
  const c = co2Now(v, w);
  return (
    <>
      <Interactive id="seeds" label={w.soaked ? `Soaked seeds${w.disLive ? ' (disinfected)' : ''}` : 'Cowpea seeds in a dish'} bench position={at(GSPOT.seedbeaker)} labelY={0.05}>
        {(a) => <SeedDishModel soaked={w.soaked} glow={a} />}
      </Interactive>
      {has('flasks') &&
        (['A', 'B'] as const).map((f) => (
          <Interactive key={f} id={`flask:${f}`} label={`Vacuum flask ${f}${w[f].seeds ? (w[f].seeds === 'LIVE' ? ' (germinating seeds)' : ' (boiled seeds)') : ' (empty)'}`} bench position={at(f === 'A' ? GSPOT.flaskA : GSPOT.flaskB)} labelY={0.5}>
            {(a) => <ThermosModel flask={w[f]} letter={f} glow={a} />}
          </Interactive>
        ))}
      {has('boiler') && (
        <Interactive id="boiler" label={w.boiled ? 'Beaker of water (half the seeds boiled)' : 'Beaker of water on a tripod and Bunsen'} bench position={at(GSPOT.boiler)} labelY={0.3}>
          {(a) => <BoilerModel lit={w.soaked && !w.boiled} seeds={w.boiled && !w.B.seeds} glow={a} />}
        </Interactive>
      )}
      {has('disinfectant') && (
        <Interactive id="disinfectant" label="Dilute disinfectant" bench position={at(GSPOT.disinfectant)} labelY={0.1}>
          {(a) => <DisinfectantBeaker used={w.disLive || w.disBoiled} glow={a} />}
        </Interactive>
      )}
      {has('cotton') && (
        <Interactive id="cotton" label="Cotton wool" bench position={at([-0.42, 0, 0.26])} labelY={0.06}>
          {(a) => <CottonModel glow={a} />}
        </Interactive>
      )}
      {has('thermometers') && !(w.A.thermo && w.B.thermo) && (
        <Interactive id="thermometers" label="Thermometers" bench position={at(GSPOT.thermometers)} labelY={0.04}>
          {(a) => (
            <group position={[-0.14, 0, 0]}>
              <Thermometer glow={a} />
            </group>
          )}
        </Interactive>
      )}
      {has('conical') && (
        <Interactive id="co2" label={w.co2.ind ? `CO₂ test (${w.co2.ind === 'LIME' ? 'lime water' : 'indicator'})` : 'Conical flask, stopper and delivery tube'} bench position={at(GSPOT.conical)} labelY={0.18}>
          {(a) => (
            <group>
              <Co2TestModel seeds="LIVE" liquid={co2Liquid(w.co2.ind, c?.live ?? 0)} bubbling={w.co2.at !== null} glow={a} />
              {w.co2.ctrl && (
                <group position={[0, 0, 0.1]}>
                  <Co2TestModel seeds="BOILED" liquid={co2Liquid(w.co2.ind, c?.ctrl ?? 0)} bubbling={false} />
                </group>
              )}
            </group>
          )}
        </Interactive>
      )}
      {has('limewater') && (
        <Interactive id="limewater" label="Lime water and hydrogencarbonate indicator" bench position={at(GSPOT.limewater)} labelY={0.16}>
          {(a) => (
            <group>
              <ReagentBottle name="Lime water" band="#607d8b" sub="Ca(OH)₂" glow={a} />
              <group position={[0.09, 0, 0]}>
                <ReagentBottle name="Indicator" band="#c62828" sub="hydrogencarb." liquid="#d8343f" />
              </group>
            </group>
          )}
        </Interactive>
      )}
    </>
  );
}

function TropBench3({ v, state, scene }: { v: BioGrowthVariant; state: BioGrowthState; scene: GrowthScene }) {
  const has = (id: GrowthApparatusId) => scene.collected.has(id);
  const w = state.trop;
  const ang = tropAngles(v, w);
  return (
    <>
      <Interactive id="pots" label="Two pots of maize seedlings" bench position={at(GSPOT.pots)} labelY={0.18} drag={() => 'potdrag'}>
        {(a) => (
          <group>
            {!w.box && <PotSeedlingsModel deg={0} glow={a} />}
            {!w.ctrl && (
              <group position={[0.11, 0, 0]}>
                <PotSeedlingsModel deg={0} glow={a} />
              </group>
            )}
            {w.box && w.ctrl && (
              <mesh position={[0, 0.002, 0]}>
                <boxGeometry args={[0.06, 0.004, 0.06]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
          </group>
        )}
      </Interactive>
      {has('lightbox') && (
        <Interactive id="lightbox" label={w.box ? `Light-proof box${w.slit ? `, slit ${w.slit === 'LAMP' ? 'towards the lamp' : 'away from the lamp'}` : ''}${w.taped ? ', gaps taped' : ''}` : 'Light-proof box with a slit'} bench position={at(GSPOT.lightbox)} labelY={0.3}>
          {(a) => (
            <LightBoxModel slit={w.slit} taped={w.taped} glow={a}>
              {w.box && (
                <group position={[0, 0.006, 0.01]}>
                  <PotSeedlingsModel deg={ang.test} />
                </group>
              )}
            </LightBoxModel>
          )}
        </Interactive>
      )}
      {has('lamp') && (
        <Interactive id="lamp" label={w.lamp ? 'Bench lamp (on)' : 'Bench lamp'} bench position={at(GSPOT.lamp)} labelY={0.28}>
          {(a) => <BenchLampModel on={w.lamp} glow={a} />}
        </Interactive>
      )}
      {has('klinostat') && (
        <Interactive id="klinostat" label={`Clinostat (${w.klinoOn ? 'turning' : 'off'})`} bench position={at(GSPOT.klinostat)} labelY={0.25}>
          {(a) => <KlinostatModel on={w.klinoOn} pot={w.ctrl === 'KLINO'} set={w.klinoSet} ctrlDeg={ang.ctrl} v={v} w={w} glow={a} />}
        </Interactive>
      )}
      {w.ctrl === 'UNIFORM' && (
        <Interactive id="ctrlpot" label="Control pot in uniform light" bench position={at([0.3, 0, 0.18])} labelY={0.18}>
          {(a) => <PotSeedlingsModel deg={ang.ctrl} glow={a} />}
        </Interactive>
      )}
      {has('corkjar') && (
        <Interactive id="corkjar" label={w.pinned ? `Cork of pinned seedlings (day ${w.day})` : 'Cork in a gas jar, pins and cotton wool'} bench position={at(GSPOT.corkjar)} labelY={0.3}>
          {(a) => <CorkJarModel v={v} w={w} glow={a} />}
        </Interactive>
      )}
      {has('protractor') && (
        <Interactive id="protractor" label="Protractor" bench position={at(GSPOT.protractor)} labelY={0.03}>
          {(a) => <ProtractorModel glow={a} />}
        </Interactive>
      )}
      {has('tape') && (
        <Interactive id="tape" label="Black tape" bench position={at(GSPOT.tape)} labelY={0.04}>
          {(a) => <TapeRoll glow={a} />}
        </Interactive>
      )}
      {has('washbottle') && (
        <Interactive id="washbottle" label="Wash bottle of water" bench position={at([-0.66, 0, 0.0])} labelY={0.2}>
          {(a) => <WashBottle glow={a} />}
        </Interactive>
      )}
    </>
  );
}
