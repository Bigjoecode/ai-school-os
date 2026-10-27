import { TITRATION_INDICATORS, TITRATION_INDICATOR_INFO, type ChemTitrationState, type ChemTitrationVariant } from '@aischool/shared';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import { Vector3, type Group, type Mesh } from 'three';
import { flaskColour, type Titration } from '../actions';
import {
  Beaker,
  BlobShadow,
  BunsenBurner,
  BU,
  Burette,
  ConicalFlask,
  DropperBottle,
  Filler,
  Funnel,
  MeasuringCylinder,
  Pipette,
  ReagentBottle,
  RetortStand,
  TestTubeRack,
  Thermometer,
  WashBottle,
  WhiteTile,
  flaskLevel,
} from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { useLabView } from '../../../lab3d-kit/store';
import { bookTexture, taskCardTexture } from '../../../lab3d-kit/textures';
import { tapLevel, useBench } from './bench-store';
import { dragFor, flaskDrag } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { SPOT } from './spots';

type V3 = [number, number, number];
const at = (spot: readonly [number, number, number], dy = 0): V3 => [spot[0], spot[1] + dy, spot[2]];
/** Height of the clamp above the bench, and of the burette's jet tip. */
const CLAMP_Y = 0.6;
const TILE_TOP = 0.022;

/** Where each piece of apparatus sits in the cupboard (cupboard-local: x across, y shelf height, z depth) and how it lies. */
const CUPBOARD_SLOT: Record<ApparatusId, { p: V3; r?: V3 }> = {
  burette: { p: [-0.75, CUPBOARD_SHELVES[0]! + 0.008, 0.06], r: [0, 0, Math.PI / 2] },
  stand: { p: [0.35, CUPBOARD_SHELVES[0]!, -0.02], r: [0, 0, 0] },
  pipette: { p: [-0.75, CUPBOARD_SHELVES[0]! + 0.014, -0.1], r: [0, 0, Math.PI / 2] },
  thermometer: { p: [-0.28, CUPBOARD_SHELVES[0]!, 0.1] },
  flask: { p: [-0.85, CUPBOARD_SHELVES[1]!, 0.02] },
  beaker: { p: [-0.6, CUPBOARD_SHELVES[1]!, 0.04] },
  funnel: { p: [-0.38, CUPBOARD_SHELVES[1]! + 0.0, 0.04] },
  cylinder: { p: [-0.12, CUPBOARD_SHELVES[1]!, 0.02] },
  testTubes: { p: [0.3, CUPBOARD_SHELVES[1]!, 0.02] },
  tile: { p: [0.75, CUPBOARD_SHELVES[1]!, 0.02] },
  washBottle: { p: [-0.75, CUPBOARD_SHELVES[2]!, 0.02] },
  filler: { p: [-0.35, CUPBOARD_SHELVES[2]!, 0.04] },
  burner: { p: [0.2, CUPBOARD_SHELVES[2]!, 0.02] },
};
/** Invisible grip boxes (size, centre) for picking apparatus out of the cupboard. */
const GRIP: Partial<Record<ApparatusId, [[number, number, number], [number, number, number]]>> = {
  burette: [[0.05, 0.66, 0.05], [0, 0.33, 0]],
  pipette: [[0.05, 0.46, 0.05], [0, 0.23, 0]],
  stand: [[0.9, 0.06, 0.3], [0, 0.03, 0]],
  thermometer: [[0.3, 0.04, 0.04], [0, 0.01, 0]],
  tile: [[0.16, 0.16, 0.05], [0, 0.08, -0.04]],
};

/** How far the burette tap is open (the tap control, or the hold-to-run button). */
const tapOpen = () => {
  const b = useBench.getState();
  return Math.max(b.tap, b.streaming ? 1 : 0);
};

/** Distractors taken to the bench line up at its west end. */
const EXTRA_ORDER: ApparatusId[] = ['cylinder', 'testTubes', 'thermometer', 'burner'];

function ApparatusModel({ id, glow }: { id: ApparatusId; glow?: boolean }) {
  switch (id) {
    case 'burette':
      return <Burette level={null} bubble={false} detail={false} glow={glow} />;
    case 'stand':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.46, 0.012, 0]}>
          <RetortStand clampY={0.5} glow={glow} />
        </group>
      );
    case 'funnel':
      return <Funnel glow={glow} />;
    case 'pipette':
      return <Pipette filled={0} glow={glow} />;
    case 'filler':
      return <Filler glow={glow} />;
    case 'flask':
      return <ConicalFlask volume={0} colour={null} glow={glow} />;
    case 'tile':
      return (
        <group rotation={[-1.35, 0, 0]} position={[0, 0.075, -0.05]}>
          <WhiteTile glow={glow} />
        </group>
      );
    case 'beaker':
      return <Beaker glow={glow} />;
    case 'washBottle':
      return <WashBottle glow={glow} />;
    case 'cylinder':
      return <MeasuringCylinder glow={glow} />;
    case 'testTubes':
      return <TestTubeRack glow={glow} />;
    case 'thermometer':
      return <Thermometer glow={glow} />;
    case 'burner':
      return <BunsenBurner glow={glow} />;
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench). */
export function CupboardContents({ scene }: { scene: SceneState }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        {/* hit area at the back, so the apparatus in front is picked first */}
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {/* spare stock (not for taking: one of each is enough) */}
      {[0.5, 0.64, 0.78, 0.92, 1.06].map((x) => (
        <group key={x} position={[x, CUPBOARD_SHELVES[2]!, 0.02]}>
          <ConicalFlask volume={0} colour={null} />
        </group>
      ))}
      {[-1.05, -0.95].map((x) => (
        <group key={x} position={[x, CUPBOARD_SHELVES[1]!, 0.06]}>
          <Beaker />
        </group>
      ))}
      {(Object.keys(CUPBOARD_SLOT) as ApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => {
          const slot = CUPBOARD_SLOT[id];
          return (
            <Interactive key={id} id={`cup:${id}`} label={APPARATUS_LABEL[id]} labelY={0.25} position={slot.p} rotation={slot.r} drag={carry}>
              {(active) => (
                <group>
                  <ApparatusModel id={id} glow={active} />
                  {/* an easy-to-hit invisible grip around thin glassware */}
                  <mesh position={GRIP[id]?.[1] ?? [0, 0.07, 0]}>
                    <boxGeometry args={GRIP[id]?.[0] ?? [0.12, 0.15, 0.12]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                </group>
              )}
            </Interactive>
          );
        })}
    </group>
  );
}

/** Follows the camera: the object in the student's hands. */
function HeldItem({ id }: { id: ApparatusId }) {
  const ref = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const offset = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    offset.set(0.16, -0.2, -0.42).applyQuaternion(camera.quaternion);
    g.position.copy(camera.position).add(offset);
    g.quaternion.copy(camera.quaternion);
  });
  const tall = id === 'burette' || id === 'pipette';
  return (
    <group ref={ref}>
      <group rotation={[0.15, 0, -0.18]} position={[0, tall ? -0.15 : -0.02, 0]} scale={tall ? 0.7 : 1}>
        <ApparatusModel id={id} />
      </group>
    </group>
  );
}

/** Contents of the conical flask now: the open run, or the finished run still in it. */
function flaskContents(s: ChemTitrationState) {
  const open = s.runs.findIndex((r) => !r.done);
  if (open >= 0) return { index: open, run: s.runs[open]! };
  const last = [...s.log].reverse().find((e) => e.a === 'finish-titration' || e.a === 'rinse-flask:WATER' || e.a.startsWith('rinse-flask') || e.a === 'pour-away' || e.a.startsWith('pipette:'));
  if (last?.a === 'finish-titration' && s.runs.length) return { index: s.runs.length - 1, run: s.runs.at(-1)! };
  return null;
}

/** The falling stream / drop from the burette jet into the flask. */
function Delivery({ from, to }: { from: number; to: number }) {
  const streaming = useBench((s) => s.streaming);
  const drop = useRef<Mesh>(null);
  const stream = useRef<Mesh>(null);
  useFrame(() => {
    const now = performance.now();
    const { dropAt } = useBench.getState();
    const d = drop.current;
    if (d) {
      const t = (now - dropAt) / 260;
      d.visible = t >= 0 && t <= 1;
      if (d.visible) d.position.y = from - (from - to) * t * t;
    }
    if (stream.current) stream.current.visible = streaming || tapLevel(useBench.getState().tap) === 'stream';
  });
  return (
    <group>
      <mesh ref={drop} visible={false} material={liquidMaterial('#d5e9f7', 0.85)}>
        <sphereGeometry args={[0.0022, 10, 8]} />
      </mesh>
      <mesh ref={stream} visible={false} position={[0, (from + to) / 2, 0]} material={liquidMaterial('#d5e9f7', 0.7)}>
        <cylinderGeometry args={[0.0009, 0.0009, from - to, 6]} />
      </mesh>
    </group>
  );
}

/** Follows the pointer while the flask is being dragged across the bench. */
function FlaskMover({ home, children }: { home: V3; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const d = useLabView.getState().drag;
    if (d?.kind === 'flask' && flaskDrag.active) g.position.set(flaskDrag.x - home[0], 0.012, flaskDrag.z - home[2]);
    else g.position.set(0, 0, 0);
  });
  return <group ref={ref}>{children}</group>;
}

/** Bottle A lifted over the funnel and tilted while it is being poured (drag up to tilt). */
function PourMotion({ from, children }: { from: V3; children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const d = useLabView.getState().drag;
    const pouring = d?.kind === 'pour';
    const tx = pouring ? SPOT.buretteAxis[0] - from[0] - 0.07 : 0;
    const ty = pouring ? SPOT.jetHeight + BU.top + 0.06 : 0;
    const tz = pouring ? SPOT.buretteAxis[2] - from[2] : 0;
    const k = Math.min(1, dt * 8);
    g.position.x += (tx - g.position.x) * k;
    g.position.y += (ty - g.position.y) * k;
    g.position.z += (tz - g.position.z) * k;
    const tilt = pouring ? -d!.value * 1.9 : 0;
    g.rotation.z += (tilt - g.rotation.z) * k;
  });
  return <group ref={ref}>{children}</group>;
}

/** Small swirling motion while "Swirl" runs. */
function Swirler({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const left = useBench.getState().swirlUntil - performance.now();
    if (left > 0) {
      const a = performance.now() / 70;
      g.position.set(Math.cos(a) * 0.006, 0, Math.sin(a) * 0.006);
      g.rotation.set(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05);
    } else {
      g.position.set(0, 0, 0);
      g.rotation.set(0, 0, 0);
    }
  });
  return <group ref={ref}>{children}</group>;
}

export function Station({ state, scene, t, v, detail }: { state: ChemTitrationState; scene: SceneState; t: Titration; v: ChemTitrationVariant; detail: boolean }) {
  const dk = (id: string) => dragFor(id, state, scene, t);
  const held = useLabView((s) => s.held);
  const pip = useBench((s) => s.pip);
  const has = (id: ApparatusId) => scene.collected.has(id) && held !== id;
  const card = useMemo(() => taskCardTexture([v.given.A, v.given.B.replace(' of unknown concentration', ' (unknown concentration)'), `Titrate A against 25.0 cm³ of B. Indicator: your choice.`]), [v]);
  const book = useMemo(() => bookTexture(), []);
  const contents = flaskContents(state);
  const volume = contents ? 25 + (contents.run.initial !== null ? (contents.run.final ?? state.burette ?? contents.run.initial) - contents.run.initial : 0) + (contents.run.indicator ? 0.15 : 0) : 0;
  const shownColour = contents ? flaskColour(contents.run, v, contents.index, state.burette, t.flash && contents.run === t.open) : null;
  const flash = t.flash && t.open?.indicator ? TITRATION_INDICATOR_INFO[t.open.indicator].end : null;
  const flaskPos: V3 = scene.flaskUnder && scene.collected.has('tile') ? [SPOT.buretteAxis[0], TILE_TOP, SPOT.buretteAxis[2]] : at(SPOT.flaskHome);
  const jet = SPOT.jetHeight;

  return (
    <group position={STATION}>
      {/* bench-top hit area: selects the bench while walking */}
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>

      {/* reagents A and B, indicators, task card and notebook are always on the bench */}
      <Interactive id="bottleA" label={`Solution A — ${v.acid.formula}`} bench position={at(SPOT.bottleA)} labelY={0.2} drag={dk}>
        {(active) => (
          <PourMotion from={at(SPOT.bottleA)}>
            <ReagentBottle name="A" band="#c62828" sub={v.acid.formula} glow={active} />
          </PourMotion>
        )}
      </Interactive>
      <Interactive id="bottleB" label={`Solution B — ${v.base.formula}`} bench position={at(SPOT.bottleB)} labelY={0.2}>
        {(active) => <ReagentBottle name="B" band="#2a7fc9" sub={v.base.formula} glow={active} />}
      </Interactive>
      {TITRATION_INDICATORS.map((i, k) => (
        <Interactive key={i} id={`ind:${i}`} label={`${TITRATION_INDICATOR_INFO[i].label} indicator`} bench position={[SPOT.indicators[0] + k * 0.06, 0, SPOT.indicators[2] + (k % 2) * 0.03]} labelY={0.11}>
          {(active) => <DropperBottle name={TITRATION_INDICATOR_INFO[i].label.split(' ')[0]!} colour={TITRATION_INDICATOR_INFO[i].base} glow={active} />}
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
            {active && <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.highlight()}><ringGeometry args={[0.11, 0.125, 32]} /></mesh>}
          </group>
        )}
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(SPOT.book)} rotation={[0, -0.25, 0]} labelY={0.08}>
        {(active) => (
          <group>
            <mesh position={[0, 0.006, 0]} material={mat.red()}>
              <boxGeometry args={[0.3, 0.008, 0.2]} />
            </mesh>
            <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[0.29, 0.19]} />
              <meshStandardMaterial map={book} roughness={0.85} />
            </mesh>
            <mesh position={[0.05, 0.013, 0.02]} rotation={[0, 0.5, Math.PI / 2]} material={mat.black()}>
              <cylinderGeometry args={[0.0035, 0.0035, 0.14, 8]} />
            </mesh>
            {active && <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.highlight()}><ringGeometry args={[0.18, 0.2, 32]} /></mesh>}
          </group>
        )}
      </Interactive>

      {/* retort stand, tile and burette */}
      {has('stand') && (
        <Interactive id="stand" label="Retort stand and clamp" bench position={at(SPOT.standBase)} labelY={0.95}>
          {(active) => <RetortStand clampY={CLAMP_Y} glow={active} />}
        </Interactive>
      )}
      {has('tile') && (
        <Interactive id="tile" label="White tile" bench position={has('stand') ? [SPOT.buretteAxis[0], 0.014, SPOT.buretteAxis[2]] : at(SPOT.flaskHome, 0)} labelY={0.05}>
          {(active) => <WhiteTile glow={active} />}
        </Interactive>
      )}
      {has('burette') && scene.clamped && has('stand') ? (
        <group position={[SPOT.buretteAxis[0], jet, SPOT.buretteAxis[2]]}>
          <Interactive id="burette" label="Burette" bench labelY={BU.top + 0.05}>
            {(active) => <Burette level={state.burette} bubble={scene.bubble} tapOpen={tapOpen} detail={detail} glow={active} />}
          </Interactive>
          <Interactive id="tap" label="Burette tap — drag sideways to turn" bench position={[0, BU.tap, 0]} labelY={0.03} drag={dk}>
            <mesh position={[0.01, 0, 0]}>
              <boxGeometry args={[0.05, 0.03, 0.03]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </Interactive>
          {state.funnelIn && (
            <Interactive id="funnel" label="Filter funnel (in the burette)" bench position={[0, BU.top - 0.03, 0]} labelY={0.1}>
              {(active) => <Funnel glow={active} />}
            </Interactive>
          )}
          <Delivery from={-0.002} to={(scene.flaskUnder ? TILE_TOP - jet : -jet) + Math.max(0.006, flaskLevel(volume || 25))} />
        </group>
      ) : (
        has('burette') && (
          <Interactive id="burette" label="Burette" bench position={at(SPOT.buretteLying, BU.rOut + 0.001)} rotation={[0, 0, Math.PI / 2]} labelY={0.05}>
            {(active) => <Burette level={null} bubble={false} detail={false} glow={active} />}
          </Interactive>
        )
      )}
      {has('funnel') && !(state.funnelIn && scene.clamped) && (
        <Interactive id="funnel" label="Filter funnel" bench position={at(SPOT.funnelHome)} labelY={0.12}>
          {(active) => (
            <group>
              {/* stood upside down on its rim */}
              <group position={[0, 0.078, 0]} rotation={[Math.PI, 0, 0]}>
                <Funnel glow={active} />
              </group>
              <BlobShadow r={0.04} />
            </group>
          )}
        </Interactive>
      )}

      {/* conical flask */}
      {has('flask') && (
        <Interactive id="flask" label={contents ? 'Conical flask (with B)' : 'Conical flask'} bench position={flaskPos} labelY={0.18} drag={dk}>
          {(active) => (
            <FlaskMover home={flaskPos}>
              <Swirler>
                <ConicalFlask volume={volume} colour={shownColour} flash={flash} glow={active} />
              </Swirler>
            </FlaskMover>
          )}
        </Interactive>
      )}

      {/* pipette (lying, or upright over the flask while pipetting) and filler */}
      {has('pipette') &&
        (pip === 'idle' ? (
          <Interactive key="pipette-lying" id="pipette" label="25.0 cm³ pipette" bench position={at(SPOT.pipette, 0.013)} rotation={[0, 0, Math.PI / 2]} labelY={0.04} drag={dk}>
            {(active) => (
              <group position={[0, -0.23, 0]}>
                <Pipette filled={0} glow={active} />
                {/* a thicker invisible grip: the stem is only 7 mm across */}
                <mesh position={[0, 0.23, 0]}>
                  <cylinderGeometry args={[0.02, 0.02, 0.46, 8]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
                {scene.fillerOn && has('filler') && (
                  <group position={[0, 0.46, 0]}>
                    <Filler />
                  </group>
                )}
              </group>
            )}
          </Interactive>
        ) : (
          <Interactive key="pipette-upright" id="pipette" label="25.0 cm³ pipette" bench position={[flaskPos[0], 0.03, flaskPos[2]]} rotation={[0, 0, 0]} labelY={0.6}>
            {(active) => (
              <group>
                <Pipette filled={pip === 'filled' ? 1 : 0} glow={active} />
                {scene.fillerOn && (
                  <group position={[0, 0.46, 0]}>
                    <Filler />
                  </group>
                )}
              </group>
            )}
          </Interactive>
        ))}
      {has('filler') && !scene.fillerOn && (
        <Interactive id="filler" label="Pipette filler" bench position={at(SPOT.filler)} labelY={0.1} drag={dk}>
          {(active) => <Filler glow={active} />}
        </Interactive>
      )}
      {has('beaker') && (
        <Interactive id="beaker" label="Beaker (waste)" bench position={at(SPOT.beaker)} labelY={0.1}>
          {(active) => <Beaker liquid={state.fills > 0 ? 0.008 : 0} glow={active} />}
        </Interactive>
      )}
      {has('washBottle') && (
        <Interactive id="washBottle" label="Wash bottle (distilled water)" bench position={at(SPOT.washBottle)} labelY={0.22}>
          {(active) => <WashBottle glow={active} />}
        </Interactive>
      )}
      {EXTRA_ORDER.filter((id) => has(id)).map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + (k % 2) * 0.2, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.2]} labelY={0.2}>
          {(active) => <ApparatusModel id={id} glow={active} />}
        </Interactive>
      ))}
    </group>
  );
}

/** The object in the student's hands (drawn in world space, in front of the camera). */
export function Held() {
  const held = useLabView((s) => s.held);
  return held ? <HeldItem id={held as ApparatusId} /> : null;
}
