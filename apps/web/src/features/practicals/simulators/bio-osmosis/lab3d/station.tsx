import { PLAS_MEDIA, agarCore, agarSide, potatoPhase, potatoTruth, type BioOsmosisState, type BioOsmosisVariant, type PlasMedium } from '@aischool/shared';
import { DropperBottle, ReagentBottle, Thermometer, WhiteTile } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { FilterPaper, Forceps, HandLens, MountedNeedle, OnionBulb, Ruler, rulerZeroX, Scalpel, SlideBox } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { StopwatchModel } from '../../bio-food-tests/lab3d/models';
import { MicroscopeModel, PreparedSlide } from '../../bio-microscope/lab3d/microscope';
import { OSPOT, beakerSpot, cubeOnTile, cylOnTile, useOsmoBench } from './bench';
import { ACID_LEVEL, AcidBeaker, AgarBlock, AgarCubeModel, BalanceModel, CorkBorer, PAN_Y, PotatoCylinder, PotatoTuber, SolutionBeakerModel } from './models';
import { OSMO_APPARATUS_LABEL, type OsmoApparatusId, type OsmoScene } from './scene-state';
import { useMemo } from 'react';
import { potatoShown } from '../readings';

/**
 * The student's bench for each task — the potato, tile, borer, beakers,
 * ruler and balance; the onion, slide, droppers and microscope; the agar
 * block, the beaker of acid and the stopwatch — and the cupboard's apparatus.
 * Everything is drawn from the attempt's state.
 */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];
export const DROPPERS: Record<PlasMedium, { name: string; colour: string }> = { WATER: { name: 'Water', colour: '#cfe6f2' }, SUCROSE: { name: '1 M sucrose', colour: '#eef0ea' }, SALT: { name: 'Strong salt', colour: '#e7eef0' } };
export const dropperSpot = (k: number): V3 => [OSPOT.droppers[0] + k * 0.08, 0, OSPOT.droppers[2]];

const CUPBOARD_SLOT: Record<OsmoApparatusId, V3> = {
  borer: [-0.8, CUPBOARD_SHELVES[1]!, 0.04],
  scalpel: [-0.45, CUPBOARD_SHELVES[1]!, 0.06],
  tile: [-0.1, CUPBOARD_SHELVES[1]!, 0.02],
  ruler: [0.3, CUPBOARD_SHELVES[1]!, 0.06],
  balance: [0.72, CUPBOARD_SHELVES[1]!, 0.02],
  paper: [-0.8, CUPBOARD_SHELVES[2]!, 0.05],
  forceps: [-0.45, CUPBOARD_SHELVES[2]!, 0.06],
  beakers: [-0.1, CUPBOARD_SHELVES[2]!, 0.03],
  clock: [0.25, CUPBOARD_SHELVES[2]!, 0.05],
  beaker: [0.62, CUPBOARD_SHELVES[2]!, 0.03],
  microscope: [-0.7, CUPBOARD_SHELVES[0]! + 0.01, 0.02],
  slides: [-0.25, CUPBOARD_SHELVES[0]! + 0.01, 0.05],
  needle: [0.1, CUPBOARD_SHELVES[0]! + 0.01, 0.06],
  lens: [0.4, CUPBOARD_SHELVES[0]! + 0.01, 0.05],
  thermometer: [0.7, CUPBOARD_SHELVES[0]! + 0.01, 0.08],
};

export function ApparatusModel({ id, glow }: { id: OsmoApparatusId; glow?: boolean }) {
  switch (id) {
    case 'borer':
      return <CorkBorer glow={glow} />;
    case 'scalpel':
      return <Scalpel glow={glow} />;
    case 'tile':
      return <WhiteTile glow={glow} />;
    case 'ruler':
      return (
        <group scale={0.6}>
          <Ruler glow={glow} />
        </group>
      );
    case 'balance':
      return (
        <group scale={0.7}>
          <BalanceModel mass={null} glow={glow} />
        </group>
      );
    case 'paper':
      return <FilterPaper glow={glow} />;
    case 'forceps':
      return <Forceps glow={glow} />;
    case 'beakers':
      return <SolutionBeakerModel conc={0} cylinder={null} glow={glow} />;
    case 'clock':
      return <StopwatchModel sec={null} glow={glow} />;
    case 'beaker':
      return <AcidBeaker level={0} glow={glow} />;
    case 'microscope':
      return (
        <group scale={0.7}>
          <MicroscopeModel scope={() => ({ objective: 4, coarse: 10, fine: 0, diaphragm: 100, lamp: 0 })} slide={null} clipped={false} glow={glow} lampOn={false} />
        </group>
      );
    case 'slides':
      return <SlideBox glow={glow} />;
    case 'needle':
      return <MountedNeedle glow={glow} />;
    case 'lens':
      return <HandLens glow={glow} />;
    case 'thermometer':
      return <Thermometer glow={glow} />;
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench, by tapping or dragging it to the tray). */
export function OsmoCupboard({ scene }: { scene: OsmoScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as OsmoApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={OSMO_APPARATUS_LABEL[id]} labelY={0.3} position={CUPBOARD_SLOT[id]} drag={carry}>
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

export function OsmoStation({ v, state, scene }: { v: BioOsmosisVariant; state: BioOsmosisState; scene: OsmoScene }) {
  const task = state.task ?? 'POTATO';
  const has = (id: OsmoApparatusId) => scene.collected.has(id);
  const card = useMemo(
    () =>
      task === 'PLASMOLYSIS'
        ? bioTaskCardTexture('Plasmolysis', ['Mount the red epidermis in water.', 'Strong solution under the cover slip.', 'Wait 5–10 min; count at ×40.', 'Water again: deplasmolysis.'])
        : task === 'AGAR'
          ? bioTaskCardTexture('Agar cubes', ['Cut 1, 2 and 3 cm cubes (+ a spare).', 'Area, volume and SA : V.', 'All into the acid together.', 'Time each until colourless.'])
          : bioTaskCardTexture('Osmosis: potato', ['Bore and trim cylinders to 50 mm.', 'Blot, measure and weigh.', 'Soak 30–60 min in each solution.', 'Blot, measure, weigh; graph.']),
    [task],
  );
  const book = useMemo(() => bioBookTexture('Practical notebook'), []);
  // The extras the student took that this task does not use go to the side of the bench.
  const extras = (['lens', 'thermometer', 'microscope', 'balance', 'borer', 'beaker', 'beakers', 'slides', 'needle'] as OsmoApparatusId[]).filter((id) => has(id) && !usedBy(task).includes(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {task === 'POTATO' ? <PotatoBench v={v} state={state} scene={scene} /> : task === 'PLASMOLYSIS' ? <PlasBench state={state} scene={scene} /> : <AgarBench v={v} state={state} scene={scene} />}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={OSMO_APPARATUS_LABEL[id]} bench position={[OSPOT.extras[0], 0.004, OSPOT.extras[2] - 0.13 * k]} labelY={0.08}>
          {(a) => (
            <group scale={0.6}>
              <ApparatusModel id={id} glow={a} />
            </group>
          )}
        </Interactive>
      ))}
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
    </group>
  );
}
const usedBy = (task: string): OsmoApparatusId[] => (task === 'POTATO' ? ['borer', 'scalpel', 'tile', 'ruler', 'balance', 'paper', 'forceps', 'beakers', 'clock'] : task === 'PLASMOLYSIS' ? ['microscope', 'slides', 'needle', 'paper', 'forceps', 'tile'] : ['scalpel', 'tile', 'ruler', 'forceps', 'beaker', 'clock']);

function PotatoBench({ v, state, scene }: { v: BioOsmosisVariant; state: BioOsmosisState; scene: OsmoScene }) {
  const has = (id: OsmoApparatusId) => scene.collected.has(id);
  const w = state.potato;
  const sel = useOsmoBench((b) => b.sel);
  const lying = useOsmoBench((b) => b.lying);
  const shown = sel >= 0 && sel < w.cyl.length ? potatoShown(v, state, sel) : null;
  const diam = v.potato.diameter;
  const lenOf = (k: number) => {
    const c = w.cyl[k]!;
    const t = potatoTruth(v.potato, k, c, w.clock);
    return potatoPhase(c) === 'B' ? t.L0 : t.L;
  };
  const rulerX = OSPOT.ruler[0] + rulerZeroX;
  return (
    <>
      {has('tile') && (
        <Interactive id="tile" label="White tile" bench position={at(OSPOT.tile)} labelY={0.04}>
          {(a) => <WhiteTile glow={a} />}
        </Interactive>
      )}
      <Interactive id="tuber" label="Irish potato" bench position={at(OSPOT.tuber, has('tile') ? 0.008 : 0)} labelY={0.1}>
        {(a) => <PotatoTuber bored={w.cyl.length} glow={a} />}
      </Interactive>
      {has('borer') && (
        <Interactive id="borer" label="Cork borer" bench position={at(OSPOT.borer)} labelY={0.05}>
          {(a) => <CorkBorer glow={a} />}
        </Interactive>
      )}
      {has('scalpel') && (
        <Interactive id="scalpel" label="Scalpel" bench position={at(OSPOT.scalpel)} labelY={0.04}>
          {(a) => <Scalpel glow={a} />}
        </Interactive>
      )}
      {has('ruler') && (
        <Interactive id="ruler" label="Ruler (mm)" bench position={at(OSPOT.ruler)} labelY={0.04}>
          {(a) => <Ruler glow={a} />}
        </Interactive>
      )}
      {has('balance') && (
        <Interactive id="balance" label={shown?.mass !== null && shown?.mass !== undefined && lying === 'balance' ? `Balance: ${shown.mass.toFixed(2)} g` : 'Electronic balance'} bench position={at(OSPOT.balance)} labelY={0.12}>
          {(a) => <BalanceModel mass={lying === 'balance' ? (shown?.mass ?? null) : null} glow={a} />}
        </Interactive>
      )}
      {has('paper') && (
        <Interactive id="paper" label="Filter paper (for blotting)" bench position={at(OSPOT.paper)} labelY={0.03}>
          {(a) => <FilterPaper glow={a} />}
        </Interactive>
      )}
      {has('forceps') && (
        <Interactive id="forceps" label="Forceps" bench position={at(OSPOT.forceps)} labelY={0.03}>
          {(a) => <Forceps glow={a} />}
        </Interactive>
      )}
      {has('clock') && (
        <Interactive id="clock" label="Stopwatch (soak time)" bench position={at(OSPOT.clock)} labelY={0.05}>
          {(a) => <StopwatchModel sec={w.cyl.some((c) => c.placedAt !== null) ? (w.clock - (w.cyl.find((c) => c.placedAt !== null)!.placedAt ?? 0)) * 60 : null} glow={a} />}
        </Interactive>
      )}
      {has('beakers') &&
        w.cyl.map((c, k) => (
          <Interactive key={`b${k}`} id={`beaker:${k}`} label={`Beaker ${k + 1}: ${c.conc === 0 ? 'distilled water' : `${c.conc.toFixed(1)} mol/dm³ sucrose`}`} bench position={at(beakerSpot(k))} labelY={0.12}>
            {(a) => <SolutionBeakerModel conc={c.conc} cylinder={potatoPhase(c) === 'SOAK' ? { length: lenOf(k), diameter: diam } : null} glow={a} />}
          </Interactive>
        ))}
      {w.cyl.map((c, k) => {
        if (potatoPhase(c) === 'SOAK') return null;
        const L = lenOf(k);
        const onRuler = k === sel && lying === 'ruler' && has('ruler');
        const onPan = k === sel && lying === 'balance' && has('balance');
        const pos: V3 = onRuler ? [rulerX, 0.003, OSPOT.ruler[2] - 0.004] : onPan ? [OSPOT.balance[0] - L / 2000, PAN_Y, OSPOT.balance[2] - 0.02] : cylOnTile(k).slice() as V3;
        const soft = potatoPhase(c) === 'A' && potatoTruth(v.potato, k, c, w.clock).pm < -1.5;
        return (
          <Interactive key={`c${k}`} id={`cyl:${k}`} label={`Cylinder ${k + 1} (${c.conc.toFixed(1)} M)${c.trimmed ? '' : ', untrimmed'}`} bench position={pos} rotation={onRuler || onPan ? [0, 0, 0] : [0, Math.PI / 2, 0]} labelY={0.03} drag={() => 'cyldrag'}>
            {(a) => <PotatoCylinder length={L} diameter={diam} sag={soft ? 1 : 0} glow={a || k === sel} />}
          </Interactive>
        );
      })}
    </>
  );
}

function PlasBench({ state, scene }: { state: BioOsmosisState; scene: OsmoScene }) {
  const has = (id: OsmoApparatusId) => scene.collected.has(id);
  const w = state.plas;
  const look = { medium: w.mount ? (w.mount === 'SALT' || w.irrigations.at(-1)?.to === 'SALT' ? ('SALT' as const) : ('WATER' as const)) : null, specimen: w.peeled && !!w.mount, coverslip: w.coverslip ? ('ANGLE' as const) : null, cavity: false, crashed: false };
  const scope = { objective: w.objective, coarse: 50, fine: 0, diaphragm: 60, lamp: 70 };
  return (
    <>
      <Interactive id="onion" label={w.peeled ? 'Red onion (a strip of epidermis peeled)' : 'Red onion'} bench position={at(OSPOT.onion)} labelY={0.1}>
        {(a) => <OnionBulb red glow={a} />}
      </Interactive>
      {PLAS_MEDIA.map((m, k) => (
        <Interactive key={m} id={`dropper:${m}`} label={`${DROPPERS[m].name} (dropper bottle)`} bench position={dropperSpot(k)} labelY={0.1} drag={() => 'dropperdrag'}>
          {(a) => <DropperBottle name={DROPPERS[m].name} colour={DROPPERS[m].colour} glow={a} />}
        </Interactive>
      ))}
      {has('tile') && (
        <group position={at(OSPOT.slideTile)}>
          <WhiteTile />
        </group>
      )}
      {has('slides') && !w.onStage && (
        <Interactive id="slide" label={!w.mount ? 'Clean slide' : w.coverslip ? 'Your slide (cover slip on)' : 'Your slide (no cover slip yet)'} bench position={at(OSPOT.slideTile, has('tile') ? 0.008 : 0)} labelY={0.04}>
          {(a) => (
            <group>
              <PreparedSlide look={look} />
              {a && (
                <mesh position={[0.004, 0.003, 0]} material={mat.highlight()}>
                  <boxGeometry args={[0.08, 0.002, 0.03]} />
                </mesh>
              )}
            </group>
          )}
        </Interactive>
      )}
      {has('microscope') && (
        <group position={at(OSPOT.scope)}>
          <Interactive id="scope" label={w.onStage ? `Microscope (×${w.objective} objective)` : 'Microscope'} bench labelY={0.46}>
            {(a) => <MicroscopeModel scope={() => scope} slide={w.onStage ? look : null} clipped={w.onStage} glow={a} />}
          </Interactive>
        </group>
      )}
      {has('paper') && (
        <Interactive id="paper" label="Filter paper" bench position={[OSPOT.slideTile[0] + 0.17, 0, OSPOT.slideTile[2] + 0.06]} labelY={0.03}>
          {(a) => <FilterPaper glow={a} />}
        </Interactive>
      )}
      {has('forceps') && (
        <Interactive id="forceps" label="Forceps" bench position={[OSPOT.onion[0] + 0.1, 0, OSPOT.onion[2] + 0.13]} labelY={0.03}>
          {(a) => <Forceps glow={a} />}
        </Interactive>
      )}
      {has('needle') && (
        <Interactive id="needle" label="Mounted needle" bench position={at(OSPOT.needle)} labelY={0.03}>
          {(a) => <MountedNeedle glow={a} />}
        </Interactive>
      )}
      {has('slides') && (
        <Interactive id="slides" label="Slides and cover slips" bench position={[OSPOT.slideTile[0] - 0.02, 0, OSPOT.slideTile[2] - 0.17]} labelY={0.05}>
          {(a) => <SlideBox glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function AgarBench({ v, state, scene }: { v: BioOsmosisVariant; state: BioOsmosisState; scene: OsmoScene }) {
  const has = (id: OsmoApparatusId) => scene.collected.has(id);
  const w = state.agar;
  const sel = useOsmoBench((b) => b.sel);
  const lying = useOsmoBench((b) => b.lying);
  const inAcid = w.cubes.map((c, i) => ({ c, i })).filter((x) => x.c.placedAt !== null && x.c.cutAt === null);
  const rulerX = OSPOT.ruler[0] + rulerZeroX;
  const level = w.acid ? ACID_LEVEL[w.acid] : 0;
  return (
    <>
      {has('tile') && (
        <Interactive id="tile" label="White tile" bench position={at(OSPOT.block)} labelY={0.04}>
          {(a) => <WhiteTile glow={a} />}
        </Interactive>
      )}
      <Interactive id="block" label="Pink agar (phenolphthalein and alkali)" bench position={[OSPOT.block[0] - 0.03, has('tile') ? 0.008 : 0, OSPOT.block[2] - 0.03]} labelY={0.06}>
        {(a) => <AgarBlock glow={a} />}
      </Interactive>
      {has('scalpel') && (
        <Interactive id="scalpel" label="Scalpel" bench position={[OSPOT.block[0] + 0.2, 0, OSPOT.block[2] + 0.12]} labelY={0.04}>
          {(a) => <Scalpel glow={a} />}
        </Interactive>
      )}
      {has('ruler') && (
        <Interactive id="ruler" label="Ruler (mm)" bench position={at(OSPOT.ruler)} labelY={0.04}>
          {(a) => <Ruler glow={a} />}
        </Interactive>
      )}
      {has('forceps') && (
        <Interactive id="forceps" label="Forceps" bench position={at(OSPOT.forceps)} labelY={0.03}>
          {(a) => <Forceps glow={a} />}
        </Interactive>
      )}
      <Interactive id="acidbottle" label="Dilute hydrochloric acid (0.1 mol/dm³)" bench position={at(OSPOT.acidBottle)} labelY={0.16}>
        {(a) => <ReagentBottle name="Dil. HCl" band="#b3262b" sub="0.1 mol/dm³" glow={a} />}
      </Interactive>
      {has('beaker') && (
        <Interactive id="acid" label={w.acid ? 'Beaker of dilute acid' : 'Empty 400 cm³ beaker'} bench position={at(OSPOT.acidBeaker)} labelY={0.15}>
          {(a) => (
            <AcidBeaker level={level} glow={a}>
              {inAcid.map(({ c, i }, k) => {
                const s = agarSide(v.agar, i, c);
                return (
                  <group key={i} position={[-0.026 + (k % 3) * 0.026, 0.003, -0.012 + Math.floor(k / 3) * 0.026]}>
                    <AgarCubeModel side={s} core={agarCore(v.agar, i, c, w, w.clock)} />
                  </group>
                );
              })}
            </AcidBeaker>
          )}
        </Interactive>
      )}
      {has('clock') && (
        <Interactive id="stopwatch" label={inAcid.length || w.cubes.some((c) => c.placedAt !== null) ? `Stopwatch: ${w.clock} min` : 'Stopwatch'} bench position={at(OSPOT.stopwatch)} labelY={0.05}>
          {(a) => <StopwatchModel sec={w.cubes.some((c) => c.placedAt !== null) ? w.clock * 60 : null} glow={a} />}
        </Interactive>
      )}
      {w.cubes.map((c, i) => {
        if (c.placedAt !== null && c.cutAt === null) return null;
        const s = agarSide(v.agar, i, c);
        const onRuler = i === sel && lying === 'ruler' && has('ruler');
        const pos: V3 = onRuler ? [rulerX + s / 2000, 0.003, OSPOT.ruler[2] - 0.006 - s / 2000] : (cubeOnTile(i).slice() as V3);
        return (
          <Interactive key={i} id={`cube:${i}`} label={`Cube ${i + 1} (${c.size} cm)${c.cutAt !== null ? ', cut open' : ''}`} bench position={pos} labelY={0.05} drag={() => 'cubedrag'}>
            {(a) => <AgarCubeModel side={s} core={c.cutAt !== null ? agarCore(v.agar, i, c, w, c.cutAt) : 1} cut={c.cutAt !== null} glow={a || i === sel} />}
          </Interactive>
        );
      })}
    </>
  );
}
