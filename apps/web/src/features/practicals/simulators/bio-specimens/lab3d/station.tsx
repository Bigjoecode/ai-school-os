import type { BenchSpecimen, BioSpecimensState, BioSpecimensVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { DoubleSide } from 'three';
import { BlobShadow, BunsenBurner, GlowRing, TestTubeRack, Thermometer } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD as CUP, STATION } from '../../../lab3d-kit/layout';
import { liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { useLabView } from '../../../lab3d-kit/store';
import { Box, Forceps, GlovesBox, HandLens, PetriDish, Rod, Ruler, Scalpel, Tray } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture, displayCardTexture, letterCardTexture } from '../../bio-common/lab3d/textures';
import { APPARATUS_LABEL, CUPBOARD, SPOT, trayAt, type ApparatusId, type SceneState } from './scene-state';
import { specimenTexture } from './specimen-texture';

type V3 = [number, number, number];
const at = (spot: readonly [number, number, number], dy = 0): V3 => [spot[0], spot[1] + dy, spot[2]];

/** Preserved animals stand in jars of formalin; small things lie in Petri dishes; the rest on enamel trays. */
const JAR = new Set(['earthworm', 'toad', 'tilapia', 'agama', 'tapeworm', 'snail', 'heart-ls', 'kidney-ls']);
const DISH = new Set(['housefly', 'anopheles', 'culex', 'tsetse', 'simulium', 'weevil', 'tick', 'maggot', 'pupa', 'termite', 'tridax', 'grass-flower', 'cockroach-nymph', 'maize-grain', 'cotton-stainer', 'desmodium', 'lichen', 'caudal', 'premolar', 'incisor', 'canine', 'molar']);
export const holder = (id: string) => (JAR.has(id) ? 'jar' : DISH.has(id) ? 'dish' : 'tray');

/** How big a specimen's drawing box is on the bench (metres): its true size where known (its drawing spans 160 of 200 units), within what fits a tray. */
export function boxSize(sp: BenchSpecimen, v: BioSpecimensVariant, i: number): number {
  const L = i === v.measured ? v.trueLength : sp.def.lengthCm ? (sp.def.lengthCm[0] + sp.def.lengthCm[1]) / 2 : 9;
  const box = (L / 100) * (200 / 160);
  const h = holder(sp.id);
  return Math.max(0.03, Math.min(h === 'dish' ? 0.08 : h === 'jar' ? 0.13 : 0.24, box));
}

/** Smaller than this (drawing box, metres: a specimen under about 5.5 cm) and it is hard to see from the bench. */
const SMALL_BOX = 0.07;
/** The drawing box a small specimen is shown at on its display stand. */
const DISPLAY_BOX = 0.11;
/** Height of the display stand under the dish. */
export const STAND_H = 0.07;

/**
 * How a specimen is shown on the bench. Small ones (insects, ticks, small
 * vertebrae and teeth …) sit in a Petri dish on a raised display stand, drawn
 * larger, with a card giving the display scale; the hand-lens and ruler views
 * still show them at their true size (and the ruler reads the true length).
 */
export function benchDisplay(sp: BenchSpecimen, v: BioSpecimensVariant, i: number): { size: number; mag: number } {
  const L = i === v.measured ? v.trueLength : sp.def.lengthCm ? (sp.def.lengthCm[0] + sp.def.lengthCm[1]) / 2 : 9;
  const trueBox = (L / 100) * (200 / 160);
  if (trueBox >= SMALL_BOX) return { size: boxSize(sp, v, i), mag: 1 };
  return { size: DISPLAY_BOX, mag: Math.max(2, Math.round(DISPLAY_BOX / trueBox)) };
}

/** A specimen as it lies on the bench: its drawing as a cut-out in a jar, a dish or on a tray (small ones in a dish on a display stand), with its letter card. */
export function BenchSpecimenModel({ sp, size, glow, mag = 1 }: { sp: BenchSpecimen; size: number; glow?: boolean; mag?: number }) {
  const tex = specimenTexture(sp.id);
  const card = useMemo(() => letterCardTexture(sp.letter), [sp.letter]);
  const magCard = useMemo(() => (mag > 1 ? displayCardTexture(mag) : null), [mag]);
  const kind = mag > 1 ? 'stand' : holder(sp.id);
  const plane = (
    <mesh renderOrder={3}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.08} roughness={0.7} side={DoubleSide} depthWrite />
    </mesh>
  );
  return (
    <group>
      {kind === 'stand' ? (
        <group position={[0, 0, -0.01]}>
          {/* a white display stand, its top tilted towards the student, with the dish on it */}
          <mesh position={[0, STAND_H / 2, 0]} material={mat.white()}>
            <cylinderGeometry args={[size * 0.62 + 0.012, size * 0.66 + 0.02, STAND_H, 28]} />
          </mesh>
          <group position={[0, STAND_H, 0]} rotation={[0.28, 0, 0]}>
            <PetriDish r={size * 0.62 + 0.012} glow={false} />
            <group position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              {plane}
            </group>
          </group>
          {magCard && (
            <mesh position={[0, STAND_H * 0.5, size * 0.66 + 0.026]}>
              <planeGeometry args={[0.075, 0.028]} />
              <meshStandardMaterial map={magCard} roughness={0.8} />
            </mesh>
          )}
          <BlobShadow r={size * 0.75 + 0.03} />
        </group>
      ) : kind === 'jar' ? (
        <group position={[0, 0, -0.01]}>
          <mesh position={[0, size * 0.6 + 0.01, 0]} scale={[size * 0.42 + 0.012, size * 1.2 + 0.02, size * 0.42 + 0.012]} material={mat.glass()} renderOrder={5}>
            <cylinderGeometry args={[1, 1, 1, 24]} />
          </mesh>
          <mesh position={[0, size * 0.55 + 0.01, 0]} scale={[size * 0.4 + 0.01, size * 1.1 + 0.01, size * 0.4 + 0.01]} material={liquidMaterial('#ece0a8', 0.28)} renderOrder={4}>
            <cylinderGeometry args={[1, 1, 1, 24]} />
          </mesh>
          <Rod p={[0, size * 1.2 + 0.032, 0]} s={[size * 0.44 + 0.013, 0.022, size * 0.44 + 0.013]} m={mat.darkMetal()} />
          <group position={[0, size * 0.55 + 0.01, 0]} scale={0.8}>
            {plane}
          </group>
          <BlobShadow r={size * 0.55 + 0.02} />
        </group>
      ) : kind === 'dish' ? (
        <group position={[0, 0, -0.01]}>
          <PetriDish r={size * 0.62 + 0.012} glow={false} />
          <group position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            {plane}
          </group>
        </group>
      ) : (
        <group position={[0, 0, -0.01]}>
          <Tray w={Math.max(0.2, size + 0.03)} d={Math.max(0.16, size * 0.8 + 0.03)} />
          <group position={[0, 0.0075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            {plane}
          </group>
        </group>
      )}
      {/* the letter card, folded, in front */}
      <group position={[0, 0, kind === 'stand' ? size * 0.66 + 0.065 : 0.1]}>
        <mesh position={[0, 0.022, 0.008]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[0.045, 0.045]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.022, -0.008]} rotation={[0.35, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.045, 0.045]} />
        </mesh>
      </group>
      {glow && <GlowRing r={Math.max(0.1, size * (kind === 'stand' ? 0.8 : 0.65))} />}
    </group>
  );
}

function ApparatusModel({ id, glow }: { id: ApparatusId; glow?: boolean }) {
  switch (id) {
    case 'lens':
      return <HandLens glow={glow} />;
    case 'ruler':
      return <Ruler glow={glow} />;
    case 'forceps':
      return <Forceps glow={glow} />;
    case 'scalpel':
      return <Scalpel glow={glow} />;
    case 'board':
      return (
        <group>
          <Box p={[0, 0.008, 0]} s={[0.3, 0.016, 0.22]} m={mat.wood()} />
          <Box p={[0, 0.0165, 0]} s={[0.28, 0.002, 0.2]} m={mat.cabinet()} />
          <BlobShadow r={0.2} />
          {glow && <GlowRing r={0.2} />}
        </group>
      );
    case 'thermometer':
      return <Thermometer glow={glow} />;
    case 'burner':
      return <BunsenBurner glow={glow} />;
    case 'testTubes':
      return <TestTubeRack glow={glow} />;
  }
}
const SLOT: Record<ApparatusId, V3> = {
  lens: [-0.7, CUPBOARD_SHELVES[0]!, 0.06],
  ruler: [-0.2, CUPBOARD_SHELVES[0]! + 0.003, 0.08],
  forceps: [0.3, CUPBOARD_SHELVES[0]!, 0.08],
  scalpel: [0.62, CUPBOARD_SHELVES[0]!, 0.08],
  board: [-0.6, CUPBOARD_SHELVES[1]!, 0.02],
  thermometer: [0.0, CUPBOARD_SHELVES[1]!, 0.08],
  burner: [0.45, CUPBOARD_SHELVES[1]!, 0.04],
  testTubes: [-0.4, CUPBOARD_SHELVES[2]!, 0.02],
};

export function CupboardContents({ scene }: { scene: SceneState }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUP.x, 0, CUP.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Microscope and apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUP.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {/* the class's hand lenses and trays (spare stock) */}
      {[0.2, 0.5, 0.8].map((x) => (
        <group key={x} position={[x, CUPBOARD_SHELVES[2]!, 0]}>
          <Tray w={0.22} d={0.16} />
        </group>
      ))}
      {CUPBOARD.filter((id) => !scene.collected.has(id)).map((id) => (
        <Interactive key={id} id={`cup:${id}`} label={APPARATUS_LABEL[id]} labelY={0.2} position={SLOT[id]} drag={carry}>
          {(active) => (
            <group>
              <ApparatusModel id={id} glow={active} />
              <mesh position={[0, 0.03, 0]}>
                <boxGeometry args={id === 'ruler' ? [0.32, 0.05, 0.05] : [0.16, 0.08, 0.1]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          )}
        </Interactive>
      ))}
    </group>
  );
}

export function Station({ v, state, scene, interactive }: { v: BioSpecimensVariant; state: BioSpecimensState; scene: SceneState; interactive: boolean }) {
  const dk = (kind: string) => () => (interactive && useLabView.getState().mode !== 'walk' ? kind : null);
  const card = useMemo(() => bioTaskCardTexture('Biology', [`Specimens ${v.specimens.map((x) => x.letter).join(', ')}: ${v.info.title.toLowerCase()}.`, 'Name, classify, label, describe.', `Measure ${v.specimens[v.measured]!.letter}; compare ${v.specimens[v.compare[0]]!.letter} and ${v.specimens[v.compare[1]]!.letter}.`]), [v]);
  const book = useMemo(() => bioBookTexture('Answer sheet'), []);
  const has = (id: ApparatusId) => scene.collected.has(id);
  const n = v.specimens.length;
  const tools: ApparatusId[] = ['forceps', 'scalpel'];
  const extras: ApparatusId[] = ['board', 'thermometer', 'burner', 'testTubes'];
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {v.specimens.map((sp, i) => {
        const { size, mag } = benchDisplay(sp, v, i);
        return (
          <Interactive key={sp.letter} id={`spec:${sp.letter}`} label={`Specimen ${sp.letter}${state.examined.includes(sp.letter) ? ' (examined)' : ''}${mag > 1 ? ` — shown ×${mag}` : ''}`} bench position={trayAt(i, n)} labelY={mag > 1 ? STAND_H + 0.1 : holder(sp.id) === 'jar' ? size * 1.3 + 0.06 : 0.08}>
            {(active) => <BenchSpecimenModel sp={sp} size={size} glow={active} mag={mag} />}
          </Interactive>
        );
      })}
      {has('lens') && (
        <Interactive id="lens" label="Hand lens — drag it onto a specimen" bench position={at(SPOT.lens)} rotation={[0, -0.4, 0]} labelY={0.05} drag={dk('lensdrag')}>
          {(active) => <HandLens glow={active} />}
        </Interactive>
      )}
      {has('ruler') && (
        <Interactive id="ruler" label="30 cm ruler — drag it to the specimen to measure" bench position={at(SPOT.ruler)} labelY={0.04} drag={dk('rulerdrag')}>
          {(active) => <Ruler glow={active} />}
        </Interactive>
      )}
      <Interactive id="gloves" label={scene.gloves ? 'Box of gloves (you are wearing a pair)' : 'Box of disposable gloves'} bench position={at(SPOT.gloves)} rotation={[0, -0.5, 0]} labelY={0.12}>
        {(active) => <GlovesBox glow={active} open={scene.gloves} />}
      </Interactive>
      {tools.filter(has).map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.tools[0] + k * 0.17, 0, SPOT.tools[2]]} labelY={0.04}>
          {(active) => (
            <group>
              <ApparatusModel id={id} glow={active} />
              <mesh position={[0, 0.01, 0]}>
                <boxGeometry args={[0.14, 0.02, 0.035]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            </group>
          )}
        </Interactive>
      ))}
      {extras.filter(has).map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + (k % 2) * 0.2, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.2]} labelY={0.2}>
          {(active) => <ApparatusModel id={id} glow={active} />}
        </Interactive>
      ))}
      <Interactive id="card" label="Task card" bench position={at(SPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        {(active) => (
          <group>
            <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
              <planeGeometry args={[0.2, 0.14]} />
              <meshStandardMaterial map={card} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
              <planeGeometry args={[0.2, 0.14]} />
            </mesh>
            {active && <GlowRing r={0.12} />}
          </group>
        )}
      </Interactive>
      <Interactive id="book" label="Your answer sheet" bench position={at(SPOT.book)} rotation={[0, -0.25, 0]} labelY={0.08}>
        {(active) => (
          <group>
            <mesh position={[0, 0.006, 0]} material={mat.green()}>
              <boxGeometry args={[0.3, 0.008, 0.2]} />
            </mesh>
            <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.29, 0.19]} />
              <meshStandardMaterial map={book} roughness={0.85} />
            </mesh>
            {active && <GlowRing r={0.2} />}
          </group>
        )}
      </Interactive>
    </group>
  );
}

/** World position of specimen i (the close-up view looks at it). */
export const specimenWorld = (i: number, n: number): V3 => {
  const [x, , z] = trayAt(i, n);
  return [STATION[0] + x, STATION[1] + 0.03, STATION[2] + z];
};
