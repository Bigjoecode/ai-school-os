import { MICRO_MEDIA, MICRO_MEDIUM_LABELS, type BioMicroscopeState, type MicroMedium, type MicroSlide } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import { type Group, type Mesh } from 'three';
import { BlobShadow, BunsenBurner, DropperBottle, GlowRing, MeasuringCylinder, TestTubeRack, Thermometer, WhiteTile } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { useLabView } from '../../../lab3d-kit/store';
import { Brush, CottonBuds, DisinfectantBeaker, FilterPaper, Forceps, LensTissue, Leaf, MountedNeedle, OnionBulb, PondJar, Scalpel, SlideBox, StemInWater, TapeRoll, WatchGlass } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { MicroscopeModel, PreparedSlide, type ScopePart, type SlideLook } from './microscope';
import { APPARATUS_LABEL, cupboardItems, type ApparatusId, type SceneState } from './scene-state';
import { MS, SPOT, useBench } from './spots';

type V3 = [number, number, number];
const at = (spot: readonly [number, number, number], dy = 0): V3 => [spot[0], spot[1] + dy, spot[2]];

/** The mounting liquids on the bench: a dropper bottle each ('NONE' is mounting dry: no bottle). */
export const MEDIA_BOTTLES = MICRO_MEDIA.filter((m) => m !== 'NONE') as Exclude<MicroMedium, 'NONE'>[];
export const MEDIUM_BOTTLE: Record<Exclude<MicroMedium, 'NONE'>, { name: string; colour: string }> = {
  WATER: { name: 'Water', colour: '#cfe6f2' },
  IODINE: { name: 'Iodine', colour: '#a8741e' },
  METHYLENE_BLUE: { name: 'Meth. blue', colour: '#2d5fae' },
  SALT: { name: 'Salt soln', colour: '#e6edf0' },
  SAFRANIN: { name: 'Safranin', colour: '#b0124f' },
};
export const SOURCE_LABEL: Record<MicroSlide, string> = { ONION: 'Onion bulb', CHEEK: 'Sterile cotton buds', PLASMOLYSIS: 'Red onion', POND: 'Pond water sample', STEM: 'Young stem in water', LEAF: 'Fresh leaf' };

export function ApparatusModel({ id, glow }: { id: ApparatusId; glow?: boolean }) {
  switch (id) {
    case 'microscope':
      return <MicroscopeModel scope={() => ({ objective: 4, coarse: 10, fine: 0, diaphragm: 100, lamp: 0 })} slide={null} clipped={false} glow={glow} lampOn={false} />;
    case 'slides':
      return <SlideBox glow={glow} />;
    case 'needle':
      return <MountedNeedle glow={glow} />;
    case 'forceps':
      return <Forceps glow={glow} />;
    case 'scalpel':
      return <Scalpel glow={glow} />;
    case 'brush':
      return <Brush glow={glow} />;
    case 'watchGlass':
      return <WatchGlass glow={glow} />;
    case 'filter':
      return <FilterPaper glow={glow} />;
    case 'lensTissue':
      return <LensTissue glow={glow} />;
    case 'swabs':
      return <CottonBuds glow={glow} />;
    case 'disinfectant':
      return <DisinfectantBeaker glow={glow} />;
    case 'tape':
      return <TapeRoll glow={glow} />;
    case 'thermometer':
      return <Thermometer glow={glow} />;
    case 'burner':
      return <BunsenBurner glow={glow} />;
    case 'testTubes':
      return <TestTubeRack glow={glow} />;
    case 'cylinder':
      return <MeasuringCylinder glow={glow} />;
  }
}

/** Cupboard slots (cupboard-local: x across, y shelf, z depth). */
const SLOT: Record<ApparatusId, V3> = {
  microscope: [-0.75, CUPBOARD_SHELVES[0]!, 0.02],
  slides: [-0.3, CUPBOARD_SHELVES[0]!, 0.06],
  needle: [-0.05, CUPBOARD_SHELVES[0]!, 0.08],
  forceps: [0.22, CUPBOARD_SHELVES[0]!, 0.08],
  scalpel: [0.5, CUPBOARD_SHELVES[0]!, 0.08],
  brush: [0.8, CUPBOARD_SHELVES[0]!, 0.08],
  watchGlass: [-0.85, CUPBOARD_SHELVES[1]!, 0.04],
  filter: [-0.6, CUPBOARD_SHELVES[1]!, 0.04],
  lensTissue: [-0.35, CUPBOARD_SHELVES[1]!, 0.04],
  swabs: [-0.08, CUPBOARD_SHELVES[1]!, 0.04],
  disinfectant: [0.18, CUPBOARD_SHELVES[1]!, 0.04],
  tape: [0.42, CUPBOARD_SHELVES[1]!, 0.04],
  thermometer: [0.66, CUPBOARD_SHELVES[1]!, 0.08],
  burner: [-0.7, CUPBOARD_SHELVES[2]!, 0.04],
  testTubes: [-0.35, CUPBOARD_SHELVES[2]!, 0.02],
  cylinder: [-0.05, CUPBOARD_SHELVES[2]!, 0.02],
};
const GRIP: Partial<Record<ApparatusId, [V3, V3]>> = {
  microscope: [[0.16, 0.42, 0.22], [0, 0.21, 0]],
  needle: [[0.14, 0.03, 0.04], [0, 0.01, 0]],
  forceps: [[0.14, 0.03, 0.04], [0, 0.01, 0]],
  scalpel: [[0.14, 0.03, 0.04], [0, 0.01, 0]],
  brush: [[0.14, 0.03, 0.04], [0, 0.01, 0]],
  thermometer: [[0.3, 0.04, 0.04], [0, 0.01, 0]],
};

/** The microscopes and small apparatus in the cupboard (each can be taken to the bench). */
export function CupboardContents({ scene, slide }: { scene: SceneState; slide: MicroSlide | null }) {
  const carry = () => 'carry' as const;
  const items = cupboardItems(slide);
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Microscope and apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {/* the class's other microscopes (spare stock) */}
      {[0.32, 0.62, 0.92].map((x) => (
        <group key={x} position={[x, CUPBOARD_SHELVES[2]!, 0.0]}>
          <ApparatusModel id="microscope" />
        </group>
      ))}
      {items
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={APPARATUS_LABEL[id]} labelY={id === 'microscope' ? 0.45 : 0.2} position={SLOT[id]} drag={carry}>
            {(active) => (
              <group>
                <ApparatusModel id={id} glow={active} />
                <mesh position={GRIP[id]?.[1] ?? [0, 0.05, 0]}>
                  <boxGeometry args={GRIP[id]?.[0] ?? [0.12, 0.1, 0.1]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            )}
          </Interactive>
        ))}
    </group>
  );
}

/** A drop falling from a dropper onto the slide on the tile (after `dropAt`). */
function FallingDrop({ colour }: { colour: string }) {
  const ref = useRef<Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = (performance.now() - useBench.getState().dropAt) / 320;
    m.visible = t >= 0 && t <= 1;
    if (m.visible) m.position.y = 0.07 - 0.065 * t * t;
  });
  return (
    <mesh ref={ref} visible={false} position={[0.004, 0.07, 0]} material={liquidMaterial(colour, 0.9)}>
      <sphereGeometry args={[0.0025, 10, 8]} />
    </mesh>
  );
}

/** The cover slip being lowered with the mounted needle (while "lowering" runs). */
function Lowering({ look }: { look: SlideLook }) {
  const lowering = useBench((b) => b.lowering);
  const needle = useRef<Group>(null);
  return (
    <group>
      <PreparedSlide look={{ ...look, coverslip: lowering > 0 || look.coverslip ? look.coverslip ?? 'ANGLE' : null }} lowering={look.coverslip ? 1 : lowering} />
      {lowering > 0 && !look.coverslip && (
        <group ref={needle} position={[0.004 + 0.012, 0.004 + (1 - lowering) * 0.012, 0.0]} rotation={[0, 0, 2.4 - lowering * 0.4]}>
          <group scale={0.6}>
            <MountedNeedle />
          </group>
        </group>
      )}
    </group>
  );
}

export function Station({ state, scene, look, detail, part, interactive }: { state: BioMicroscopeState; scene: SceneState; look: SlideLook; detail: boolean; part: (p: ScopePart, node: ReactNode) => ReactNode; interactive: boolean }) {
  const held = useLabView((s) => s.held);
  const has = (id: ApparatusId) => scene.collected.has(id) && held !== id;
  const slide = state.slide;
  const card = useMemo(() => bioTaskCardTexture('Biology', ['Light microscope practical.', slide ? `Slide: ${slide.toLowerCase()}.` : 'Choose a slide.', 'Prepare, focus, capture, label, measure.']), [slide]);
  const book = useMemo(() => bioBookTexture('Microscope record'), []);
  const scopeRef = useRef(state.scope);
  scopeRef.current = state.scope;
  const medium = state.prep.medium;
  const tools: ApparatusId[] = ['needle', 'forceps', 'scalpel', 'brush'];
  const extras: ApparatusId[] = ['thermometer', 'burner', 'testTubes', 'cylinder', 'tape'];

  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>

      {/* the microscope: its usable parts are Interactives of their own */}
      {has('microscope') && (
        <group position={at(SPOT.scope)}>
          <Interactive id="scope" label="Microscope" bench labelY={0.46}>
            {(active) => <MicroscopeModel scope={() => scopeRef.current} slide={scene.slide === 'stage' ? look : null} clipped={state.prep.clipped} part={detail ? part : undefined} glow={active} />}
          </Interactive>
        </group>
      )}

      {/* white tile where the slide is made */}
      <Interactive id="tile" label="White tile (slide preparation)" bench position={at(SPOT.tile)} labelY={0.05}>
        {(active) => (
          <group>
            <WhiteTile glow={active} />
            {scene.slide === 'tile' && (
              <Interactive id="slide" label="Your slide" bench position={[0, 0.008, 0]} labelY={0.03} drag={() => (!interactive || useLabView.getState().mode === 'walk' ? null : 'slide')}>
                {(a2) => (
                  <group>
                    <Lowering look={look} />
                    {medium && medium !== 'NONE' && <FallingDrop colour={MEDIUM_BOTTLE[medium].colour} />}
                    {a2 && <GlowRing r={0.045} />}
                  </group>
                )}
              </Interactive>
            )}
          </group>
        )}
      </Interactive>

      {/* mounting liquids and stains in dropper bottles */}
      {MEDIA_BOTTLES.map((m, k) => (
        <Interactive key={m} id={`stain:${m}`} label={MICRO_MEDIUM_LABELS[m]} bench position={[SPOT.stains[0] + k * 0.055, 0, SPOT.stains[2] + (k % 2) * 0.03]} labelY={0.1} drag={() => (interactive && scene.slide === 'tile' && useLabView.getState().mode !== 'walk' ? 'drop' : null)}>
          {(active) => <DropperBottle name={MEDIUM_BOTTLE[m].name} colour={MEDIUM_BOTTLE[m].colour} glow={active} />}
        </Interactive>
      ))}

      {/* the specimen's raw material */}
      {slide && slide !== 'CHEEK' && (
        <Interactive id="source" label={SOURCE_LABEL[slide]} bench position={at(SPOT.source)} labelY={0.12}>
          {(active) =>
            slide === 'ONION' || slide === 'PLASMOLYSIS' ? (
              <OnionBulb red={slide === 'PLASMOLYSIS'} glow={active} />
            ) : slide === 'POND' ? (
              <PondJar glow={active} />
            ) : slide === 'STEM' ? (
              <StemInWater glow={active} />
            ) : (
              <Leaf glow={active} />
            )
          }
        </Interactive>
      )}

      {has('slides') && (
        <Interactive id="slides" label="Slides and cover slips" bench position={at(SPOT.slideBox)} labelY={0.06}>
          {(active) => <SlideBox glow={active} />}
        </Interactive>
      )}
      {tools.filter(has).map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.tools[0] + (k % 2) * 0.16, 0, SPOT.tools[2] - 0.04 + Math.floor(k / 2) * 0.05]} labelY={0.04}>
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
      {has('watchGlass') && (
        <Interactive id="watchGlass" label="Watch glass" bench position={at(SPOT.watchGlass)} labelY={0.05}>
          {(active) => <WatchGlass glow={active} />}
        </Interactive>
      )}
      {has('filter') && (
        <Interactive id="filter" label="Filter (blotting) paper" bench position={at(SPOT.filter)} labelY={0.04}>
          {(active) => <FilterPaper glow={active} />}
        </Interactive>
      )}
      {has('lensTissue') && (
        <Interactive id="lensTissue" label="Lens tissue" bench position={at(SPOT.lensTissue)} labelY={0.05}>
          {(active) => <LensTissue glow={active} />}
        </Interactive>
      )}
      {has('swabs') && (
        <Interactive id="swabs" label="Sterile cotton buds" bench position={at(SPOT.swabs)} labelY={0.05}>
          {(active) => <CottonBuds glow={active} />}
        </Interactive>
      )}
      {/* the disinfectant beaker (swabs) and the sharps / discard jar (used slides) */}
      {has('disinfectant') && (
        <Interactive id="disinfectant" label="Beaker of disinfectant" bench position={[SPOT.bin[0] - 0.12, 0, SPOT.bin[2] + 0.02]} labelY={0.11}>
          {(active) => <DisinfectantBeaker glow={active} used={scene.swabDisposed} />}
        </Interactive>
      )}
      <Interactive id="bin" label="Sharps and discard jar" bench position={at(SPOT.bin)} labelY={0.16}>
        {(active) => (
          <group>
            <mesh position={[0, 0.06, 0]} material={mat.plastic()}>
              <cylinderGeometry args={[0.04, 0.044, 0.12, 18]} />
            </mesh>
            <mesh position={[0, 0.122, 0]} material={mat.red()}>
              <cylinderGeometry args={[0.042, 0.042, 0.008, 18]} />
            </mesh>
            {scene.slide === 'bin' && (
              <group position={[0, 0.05, 0]} rotation={[0, 0, 1.2]}>
                <PreparedSlide look={look} />
              </group>
            )}
            <BlobShadow r={0.05} />
            {active && <GlowRing r={0.055} />}
          </group>
        )}
      </Interactive>

      {extras.filter(has).map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + (k % 2) * 0.18, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.17]} labelY={0.2}>
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
      <Interactive id="book" label="Your practical notebook" bench position={at(SPOT.book)} rotation={[0, -0.25, 0]} labelY={0.08}>
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

/** The scope's world position of the eyepiece (the eyepiece view reads it). */
export const eyepieceWorld = (): V3 => [STATION[0] + SPOT.scope[0] + MS.eyepiece[0], STATION[1] + MS.eyepiece[1], STATION[2] + SPOT.scope[2] + MS.eyepiece[2]];
