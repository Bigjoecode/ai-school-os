import { FOOD_ORG_LABEL, FOOD_SPOTS, FOOD_SPOT_SHOWS, crossPairs, type BioGeneticsState, type BioGeneticsVariant, type GenTask } from '@aischool/shared';
import { useMemo } from 'react';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { GlovesBox, HandLens, Ruler, Tray } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { discNow, heightNow, lastPair } from '../actions';
import { FLOOR, GSPOT, QUEUE, SEAT, SPOT_AT, recent, useGenBench } from './bench';
import { BeadBag, BeadBeaker, CardBox, Classmate, HandMirror, HandOnRuler, HeightBoard, IdChart, MeasuringTape, NotesStack, PairOnTray, PaperPad, Pooter, Protractor, SetSquare, SpotCardModel, SweepNet } from './models';
import { GEN_APPARATUS_LABEL, neededFor, type GenApparatusId, type GenScene } from './scene-state';

/**
 * The student's bench for each task — the height board with the classmate
 * being measured and the queue, the classmate across the bench with the
 * mirror and health cards, the beakers of beads and the tray, the field-note
 * cards with the sweep net — and the cupboard's apparatus. Everything is
 * drawn from the attempt's state.
 */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];
const S0 = CUPBOARD_SHELVES[0]! + 0.01;
const S1 = CUPBOARD_SHELVES[1]!;
const S2 = CUPBOARD_SHELVES[2]!;
const CUPBOARD_SLOT: Record<GenApparatusId, V3> = {
  board: [-0.85, S0, 0.04],
  beakers: [-0.35, S0, 0.04],
  beads: [-0.1, S0, 0.04],
  tray: [0.2, S0, 0.04],
  net: [0.6, S0, 0.04],
  setsquare: [-0.8, S1, 0.05],
  ruler: [-0.5, S1, 0.05],
  tape: [-0.2, S1, 0.05],
  mirror: [0.05, S1, 0.05],
  cards: [0.32, S1, 0.05],
  protractor: [0.6, S1, 0.05],
  sheet: [0.82, S1, 0.05],
  graph: [-0.8, S2, 0.05],
  notes: [-0.5, S2, 0.05],
  pooter: [-0.2, S2, 0.05],
  lens: [0.05, S2, 0.05],
  gloves: [0.32, S2, 0.06],
  idchart: [0.65, S2, 0.06],
};

export function ApparatusModel({ id, glow }: { id: GenApparatusId; glow?: boolean }) {
  switch (id) {
    case 'board':
      return (
        <group scale={0.12}>
          <HeightBoard glow={glow} />
        </group>
      );
    case 'setsquare':
      return <SetSquare glow={glow} />;
    case 'ruler':
      return (
        <group scale={0.6}>
          <Ruler glow={glow} />
        </group>
      );
    case 'tape':
      return <MeasuringTape glow={glow} />;
    case 'graph':
      return <PaperPad glow={glow} w={0.14} d={0.18} />;
    case 'sheet':
      return <PaperPad glow={glow} w={0.14} d={0.18} ruled />;
    case 'mirror':
      return <HandMirror glow={glow} />;
    case 'cards':
      return <CardBox glow={glow} />;
    case 'protractor':
      return <Protractor glow={glow} />;
    case 'beakers':
      return (
        <group>
          <group position={[-0.045, 0, 0]}>
            <BeadBeaker red={0} total={0} glow={glow} />
          </group>
          <group position={[0.045, 0, 0]}>
            <BeadBeaker red={0} total={0} />
          </group>
        </group>
      );
    case 'beads':
      return <BeadBag glow={glow} />;
    case 'tray':
      return (
        <group scale={0.6}>
          <Tray glow={glow} />
        </group>
      );
    case 'notes':
      return <NotesStack glow={glow} />;
    case 'net':
      return (
        <group scale={0.4}>
          <SweepNet glow={glow} />
        </group>
      );
    case 'pooter':
      return <Pooter glow={glow} />;
    case 'lens':
      return <HandLens glow={glow} />;
    case 'gloves':
      return <GlovesBox glow={glow} />;
    case 'idchart':
      return (
        <group scale={0.5}>
          <IdChart glow={glow} />
        </group>
      );
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench, by tapping or dragging it to the tray). */
export function GenCupboard({ scene }: { scene: GenScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as GenApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={GEN_APPARATUS_LABEL[id]} labelY={0.3} position={CUPBOARD_SLOT[id]} drag={carry}>
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

const hit = (w: number, h: number, d: number, y = h / 2) => (
  <mesh position={[0, y, 0]}>
    <boxGeometry args={[w, h, d]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
  </mesh>
);

export function GenStation({ v, state, scene }: { v: BioGeneticsVariant; state: BioGeneticsState; scene: GenScene }) {
  const task = state.task ?? 'HEIGHT';
  const has = (id: GenApparatusId) => scene.collected.has(id);
  const card = useMemo(
    () =>
      task === 'DISCRETE'
        ? bioTaskCardTexture('Discontinuous variation', ['Record anonymously, by number.', 'Tongue rolling: up to 3 attempts each.', 'Blood groups from the health cards.', '%, pie chart (tongue), bar chart (blood).'])
        : task === 'CROSS'
          ? bioTaskCardTexture('Model monohybrid cross', ['50 red + 50 white in each beaker.', 'One from each, without looking.', 'Return and shake; 100 draws.', 'Ratio x : 1; compare with 3 : 1.'])
          : task === 'FOOD'
            ? bioTaskCardTexture('Food chains and pyramids', ['Gloves on; survey all 7 spots.', '3 food chains; the food web.', 'Trophic levels; % efficiency.', 'Pyramids of numbers and energy to scale.'])
            : bioTaskCardTexture('Height and hand span', ['Shoes off; set square on the head.', 'Read at eye level, nearest cm.', 'Hand span, fingers spread (0.5 cm).', 'Equal classes; histogram; mean, mode.']),
    [task],
  );
  const book = useMemo(() => bioBookTexture('Practical notebook'), []);
  const need = neededFor(task).map((a) => a.id);
  const extras = (Object.keys(CUPBOARD_SLOT) as GenApparatusId[]).filter((id) => has(id) && !need.includes(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {task === 'HEIGHT' ? <HeightBench v={v} state={state} scene={scene} /> : task === 'DISCRETE' ? <DiscBench v={v} state={state} scene={scene} /> : task === 'CROSS' ? <CrossBench v={v} state={state} scene={scene} /> : <FoodBench v={v} state={state} scene={scene} />}
      {has('graph') && (
        <Interactive id="graph" label="Graph paper (your chart is drawn in the notebook)" bench position={at(GSPOT.graph)} labelY={0.04}>
          {(a) => <PaperPad glow={a} />}
        </Interactive>
      )}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={GEN_APPARATUS_LABEL[id]} bench position={[GSPOT.extras[0], 0.004, GSPOT.extras[2] - 0.13 * k]} labelY={0.08}>
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

function HeightBench({ v, state, scene }: { v: BioGeneticsVariant; state: BioGeneticsState; scene: GenScene }) {
  const w = state.height;
  const has = (id: GenApparatusId) => scene.collected.has(id);
  const measureAt = useGenBench((b) => b.measureAt);
  const spanAt = useGenBench((b) => b.spanAt);
  const now = heightNow(v, state);
  const p = v.height.people[w.at]!;
  const said = state.log.some((e) => e.a === `declined:${w.at}`);
  const look = v.height.looks[w.at]!;
  const stand = said ? [GSPOT.board[0] + 0.45, GSPOT.board[2] + 0.25] : [GSPOT.board[0], GSPOT.board[2] + 0.1];
  const headY = (p.h / 100) * 1.0 + (w.shoesOff ? 0 : p.shoe / 100);
  const squareOn = w.square && has('setsquare') && recent(measureAt, 3500);
  return (
    <>
      {has('board') && (
        <Interactive id="board" label={now.h !== null ? `Height board: classmate ${w.at + 1} — ${now.h} cm` : 'Height board (metre rule on a stand)'} position={at(GSPOT.board)} labelY={2.05}>
          {(a) => (
            <group>
              <HeightBoard glow={a} />
              {hit(0.2, 2, 0.1)}
            </group>
          )}
        </Interactive>
      )}
      <Interactive id="classmate" label={said ? `Classmate ${w.at + 1} (would rather not be measured)` : `Classmate ${w.at + 1}${w.shoesOff ? ', shoes off' : ''}`} position={[stand[0]!, FLOOR + 0.02, stand[1]!]} labelY={1.85}>
        {(a) => (
          <group rotation={[0, said ? -0.6 : 0, 0]}>
            <Classmate height={p.h / 100} look={look} shoes={!w.shoesOff} glow={a} wave={said && recent(measureAt, 2500)} />
            {hit(0.4, 1.7, 0.3)}
          </group>
        )}
      </Interactive>
      {squareOn && !said && (
        <group position={[GSPOT.board[0] + 0.02, FLOOR + 0.02 + headY + 0.08, GSPOT.board[2] + 0.06]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
          <SetSquare />
        </group>
      )}
      {!w.shoesOff ? null : (
        <group position={[GSPOT.board[0] - 0.4, FLOOR, GSPOT.board[2] + 0.3]}>
          {[-0.06, 0.06].map((x) => (
            <mesh key={x} position={[x, 0.025, 0]} material={mat.black()}>
              <boxGeometry args={[0.09, 0.05, 0.22]} />
            </mesh>
          ))}
        </group>
      )}
      {QUEUE.map((q, k) => {
        const i = w.at + 1 + k;
        if (i >= v.height.n) return null;
        return (
          <group key={i} position={[q[0], FLOOR, q[1]]} rotation={[0, -0.9, 0]}>
            <Classmate height={v.height.people[i]!.h / 100} look={v.height.looks[i]!} />
          </group>
        );
      })}
      {has('setsquare') && !squareOn && (
        <Interactive id="setsquare" drag={() => 'squaredrag'} label={w.square ? 'Set square (used on every head)' : 'Set square'} bench position={at(GSPOT.setsquare)} labelY={0.05}>
          {(a) => <SetSquare glow={a} />}
        </Interactive>
      )}
      {has('ruler') && (
        <Interactive id="ruler" label={now.s !== null ? `Ruler: hand span ${now.s.toFixed(1)} cm` : 'Ruler — hand span'} bench position={at(GSPOT.ruler)} labelY={0.06}>
          {(a) => (
            <group>
              <Ruler glow={a} />
              {recent(spanAt, 6000) && (
                <group position={[0, 0.004, -0.045]}>
                  <HandOnRuler spread={w.spread} tone={look.tone} />
                </group>
              )}
            </group>
          )}
        </Interactive>
      )}
    </>
  );
}

function DiscBench({ v, state, scene }: { v: BioGeneticsVariant; state: BioGeneticsState; scene: GenScene }) {
  const w = state.disc;
  const has = (id: GenApparatusId) => scene.collected.has(id);
  const rollAt = useGenBench((b) => b.rollAt);
  const cardAt = useGenBench((b) => b.cardAt);
  const now = discNow(v, state);
  const tongue = recent(rollAt, 3500) && now.roll ? (now.roll === 'R' ? 'U' : 'flat') : null;
  return (
    <>
      <Interactive id="classmate" label={`Classmate ${w.at + 1}${now.roll ? (now.roll === 'R' ? ' — rolls the tongue' : ` — cannot roll it (${now.tries} attempt${now.tries === 1 ? '' : 's'})`) : ''}`} position={[SEAT[0], FLOOR, SEAT[1]]} labelY={1.5}>
        {(a) => (
          <group>
            <Classmate height={1.62} look={v.disc.looks[w.at]!} seated tongue={tongue} glow={a} />
            {hit(0.4, 1.3, 0.4)}
          </group>
        )}
      </Interactive>
      {QUEUE.map((q, k) => {
        const i = w.at + 1 + k;
        if (i >= v.disc.n) return null;
        return (
          <group key={i} position={[q[0] - 0.4, FLOOR, q[1] - 0.1]} rotation={[0, -0.9, 0]}>
            <Classmate height={1.58 + ((i * 7) % 10) / 100} look={v.disc.looks[i]!} />
          </group>
        );
      })}
      {has('mirror') && (
        <Interactive id="mirror" label="Hand mirror (the classmate can watch their tongue)" bench position={at(GSPOT.mirror)} labelY={0.05}>
          {(a) => <HandMirror glow={a} />}
        </Interactive>
      )}
      {has('cards') && (
        <Interactive id="cards" label={now.card ? `Health card ${w.at + 1}: blood group ${now.card}` : `Health cards (card ${w.at + 1} not read)`} bench position={at(GSPOT.cards)} labelY={0.12}>
          {(a) => <CardBox glow={a} pulled={recent(cardAt, 3000)} />}
        </Interactive>
      )}
      {has('sheet') && (
        <Interactive id="sheet" label="Survey sheet" bench position={at(GSPOT.sheet)} labelY={0.04}>
          {(a) => <PaperPad glow={a} w={0.16} d={0.22} ruled />}
        </Interactive>
      )}
      {has('protractor') && (
        <Interactive id="protractor" label="Protractor (for the pie chart)" bench position={at(GSPOT.protractor)} labelY={0.04}>
          {(a) => <Protractor glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function CrossBench({ v, state, scene }: { v: BioGeneticsVariant; state: BioGeneticsState; scene: GenScene }) {
  const w = state.cross;
  const has = (id: GenApparatusId) => scene.collected.has(id);
  const drawAt = useGenBench((b) => b.drawAt);
  const last = lastPair(state, v.seed);
  const pairs = crossPairs(w, v.seed);
  // Beads kept out of the beakers (not returned).
  const out = [0, 0];
  const outR = [0, 0];
  w.draws.forEach((d, n) => {
    if (d.back || !pairs[n]) return;
    out[0]++;
    out[1]++;
    if (pairs[n]!.a) outR[0]!++;
    if (pairs[n]!.b) outR[1]!++;
  });
  const fill = w.fill;
  const red = (b: 0 | 1) => (!fill ? 0 : fill === 'EQUAL' ? 50 : fill === 'SEPARATE' ? (b ? 0 : 100) : b ? 0 : 50) - outR[b]!;
  const total = (b: 0 | 1) => (!fill ? 0 : 100) - out[b]!;
  return (
    <>
      {has('beakers') && (
        <>
          <Interactive id="beakerA" drag={() => 'beaddrag'} label={fill ? `Beaker A (parent 1): ${red(0)} red, ${total(0) - red(0)} white` : 'Beaker A (empty)'} bench position={at(GSPOT.beakerA)} labelY={0.14}>
            {(a) => <BeadBeaker red={red(0)} total={total(0)} glow={a} shakeAt={w.back ? drawAt : 0} />}
          </Interactive>
          <Interactive id="beakerB" drag={() => 'beaddrag'} label={fill ? `Beaker B (parent 2): ${red(1)} red, ${total(1) - red(1)} white` : 'Beaker B (empty)'} bench position={at(GSPOT.beakerB)} labelY={0.14}>
            {(a) => <BeadBeaker red={red(1)} total={total(1)} glow={a} shakeAt={w.back ? drawAt : 0} />}
          </Interactive>
        </>
      )}
      {has('beads') && !fill && (
        <Interactive id="beads" label="Red and white beads (100 of each)" bench position={at(GSPOT.beads)} labelY={0.08}>
          {(a) => <BeadBag glow={a} />}
        </Interactive>
      )}
      {has('tray') && (
        <Interactive id="tray" label={last ? `Tray: draw ${last.n} — ${last.p.g}` : 'Tray for the pair drawn'} bench position={at(GSPOT.tray)} labelY={0.06}>
          {(a) => (
            <group scale={0.6}>
              <Tray glow={a} />
              {last && <PairOnTray a={last.p.a} b={last.p.b} />}
            </group>
          )}
        </Interactive>
      )}
      {has('sheet') && (
        <Interactive id="sheet" label={`Tally sheet (${w.draws.length} draws)`} bench position={[0.5, 0, 0.2]} labelY={0.04}>
          {(a) => <PaperPad glow={a} w={0.16} d={0.22} ruled />}
        </Interactive>
      )}
    </>
  );
}

function FoodBench({ v, state, scene }: { v: BioGeneticsVariant; state: BioGeneticsState; scene: GenScene }) {
  const w = state.food;
  const has = (id: GenApparatusId) => scene.collected.has(id);
  const surveyAt = useGenBench((b) => b.surveyAt);
  return (
    <>
      {has('notes') &&
        FOOD_SPOTS.map((s, k) => {
          const seen = w.visited.includes(s);
          const counts = FOOD_SPOT_SHOWS[s].count.map((o) => `${FOOD_ORG_LABEL[o]}: ${v.food.counts[o]}`).join(', ');
          return (
            <Interactive key={s} id={`spot:${s}`} label={seen ? `Field spot surveyed — ${counts}` : 'Field spot (not yet surveyed)'} bench position={SPOT_AT(k)} labelY={0.04}>
              {(a) => <SpotCardModel spot={s} seen={seen} counts={counts} glow={a} />}
            </Interactive>
          );
        })}
      {has('net') && (
        <Interactive id="net" drag={() => 'netdrag'} label="Sweep net" bench position={at(GSPOT.net, 0.01)} labelY={0.1}>
          {(a) => <SweepNet glow={a} swingAt={surveyAt} />}
        </Interactive>
      )}
      {has('lens') && (
        <Interactive id="lens" label="Hand lens" bench position={at(GSPOT.lens)} labelY={0.05}>
          {(a) => <HandLens glow={a} />}
        </Interactive>
      )}
      {has('gloves') && (
        <Interactive id="gloves" label={w.gloves ? 'Gloves (wearing a pair)' : 'Gloves'} bench position={at(GSPOT.gloves)} labelY={0.1}>
          {(a) => <GlovesBox glow={a} open={w.gloves} />}
        </Interactive>
      )}
      {has('idchart') && (
        <Interactive id="idchart" label="Identification chart" bench position={at(GSPOT.idchart)} labelY={0.22}>
          {(a) => <IdChart glow={a} />}
        </Interactive>
      )}
    </>
  );
}
export type { GenTask };
