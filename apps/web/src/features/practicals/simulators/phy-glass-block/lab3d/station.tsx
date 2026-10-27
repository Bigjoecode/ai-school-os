import { GLASS_BLOCK_LEFT, GLASS_BLOCK_RIGHT, glassImage, glassIncidentPoint, type GlassPoint, type GlassTrace, type PhyGlassState, type PhyGlassVariant } from '@aischool/shared';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, ConeGeometry, CylinderGeometry, DoubleSide, MeshStandardMaterial, SphereGeometry, type Group } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { useLabView } from '../../../lab3d-kit/store';
import { CardAndBook, CupboardItems, Protractor, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { liveTex } from '../../phy-common/lab3d/tex';
import { PIN_LABEL, type PinId } from '../actions';
import { useBench } from './bench-store';
import { drawPaper, PAPER_H, PAPER_W, type DrawProgress } from './paper';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { BLOCK_H, fromLocal, PAPER_Y, PIN_H, SHEET_CENTRE, SHEET_SIZE, SPOT, throughBlock, toLocal } from './views';

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 10);
const sphere = new SphereGeometry(1, 14, 10);
const steel = new MeshStandardMaterial({ color: '#c9d0d6', roughness: 0.25, metalness: 0.9 });
const HEADS: Record<PinId, MeshStandardMaterial> = {
  p1: new MeshStandardMaterial({ color: '#d62828', roughness: 0.35 }),
  p2: new MeshStandardMaterial({ color: '#e8820c', roughness: 0.35 }),
  p3: new MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.35 }),
  p4: new MeshStandardMaterial({ color: '#0f8a5f', roughness: 0.35 }),
};
const glassMat = new MeshStandardMaterial({ color: '#cfeff2', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide });
const edgeMat = new MeshStandardMaterial({ color: '#7fc8c9', roughness: 0.1, transparent: true, opacity: 0.6 });
const ANIM_MS = { normal: 1400, ray: 1600, join: 1600, pin: 500 };

/** An optical pin standing on the paper (origin at its point); `from`/`to`: the visible part (cm above the paper). */
function PinModel({ pin, from = 0, to = PIN_H, head = true, ghost = false }: { pin: PinId; from?: number; to?: number; head?: boolean; ghost?: boolean }) {
  const h = (to - from) / 100;
  return (
    <group>
      {h > 0 && <mesh geometry={cyl} material={ghost ? HEADS[pin] : steel} position={[0, (from + to) / 200, 0]} scale={[ghost ? 0.0007 : 0.0005, h, ghost ? 0.0007 : 0.0005]} />}
      {head && <mesh geometry={sphere} material={HEADS[pin]} position={[0, PIN_H / 100 + 0.0015, 0]} scale={0.0024} />}
    </group>
  );
}

/** A trace's pins as points on the sheet. */
export function pinPoints(t: GlassTrace): { id: PinId; p: GlassPoint }[] {
  const out: { id: PinId; p: GlassPoint }[] = [];
  if (t.p1 != null) out.push({ id: 'p1', p: glassIncidentPoint(t.i, t.p1) });
  if (t.p2 != null) out.push({ id: 'p2', p: glassIncidentPoint(t.i, t.p2) });
  if (t.p3) out.push({ id: 'p3', p: t.p3 });
  if (t.p4) out.push({ id: 'p4', p: t.p4 });
  return out;
}

/** The trace on the board: the one chosen in the HUD, else the one in progress, else the last. */
export function shownTrace(s: PhyGlassState, viewing: number | null) {
  const open = s.traces.findIndex((t) => !t.joined);
  const k = viewing !== null && viewing < s.traces.length ? viewing : open >= 0 ? open : s.traces.length - 1;
  return { k, t: k >= 0 ? s.traces[k]! : null, editable: open >= 0 && k === open };
}

/** The drawing board, its paper (a live drawing) and what stands on it. */
function Board({ v, state, scene, interactive, onPaper }: { v: PhyGlassVariant; state: PhyGlassState; scene: SceneState; interactive: boolean; onPaper: (p: GlassPoint) => void }) {
  const viewing = useBench((b) => b.viewing);
  const anim = useBench((b) => b.anim);
  const sight = useBench((b) => b.sight);
  const eyeX = useBench((b) => b.eyeX);
  const tool = useBench((b) => b.tool);
  const { t, editable } = shownTrace(state, viewing);
  const paper = useMemo(() => liveTex(PAPER_W, PAPER_H), []);
  const prog = useRef<DrawProgress>({ normal: 1, ray: 1, join: 1 });
  const key = JSON.stringify(t);
  const redraw = () => paper.redraw((g) => drawPaper(g, v, t, prog.current));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(redraw, [key, v]);
  useFrame(() => {
    const a = useBench.getState().anim;
    if (!a || a.kind === 'pin') return;
    const f = Math.min(1, (performance.now() - a.at) / ANIM_MS[a.kind]);
    const p = { ...prog.current, [a.kind]: f };
    if (p[a.kind] !== prog.current[a.kind]) {
      prog.current = p;
      redraw();
    }
    if (f >= 1) useBench.setState({ anim: null });
  });
  // A new animation starts its line from nothing.
  useEffect(() => {
    if (anim && anim.kind !== 'pin') prog.current = { ...prog.current, [anim.kind]: 0 };
    else if (!anim) prog.current = { normal: 1, ray: 1, join: 1 };
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim]);

  const hasPaper = scene.collected.has('paper');
  const c = toLocal(SHEET_CENTRE);
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!useBench.getState().tool || !interactive) return;
    e.stopPropagation();
    onPaper(fromLocal(e.point.x - STATION[0], e.point.z - STATION[2]));
  };
  const blockOn = !!t && !t.joined && editable;
  return (
    <group>
      <Interactive id="board" label={tool ? `Drawing board — tap where ${PIN_LABEL[tool]} goes` : 'Drawing board and paper'} bench position={[c[0], 0, c[2]]} labelY={0.06}>
        {(active) => (
          <group>
            <mesh geometry={box} material={mat.wood()} position={[0, 0.006, 0]} scale={[SHEET_SIZE.w / 100 + 0.07, 0.012, SHEET_SIZE.h / 100 + 0.06]} />
            {hasPaper && (
              <>
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, PAPER_Y + 0.0004, 0]} onClick={click}>
                  <planeGeometry args={[SHEET_SIZE.w / 100, SHEET_SIZE.h / 100]} />
                  <meshStandardMaterial map={paper.texture} roughness={0.85} />
                </mesh>
                {[-1, 1].flatMap((sx) =>
                  [-1, 1].map((sz) => <mesh key={`${sx}${sz}`} geometry={sphere} material={mat.red()} position={[(sx * SHEET_SIZE.w) / 200 - sx * 0.008, PAPER_Y + 0.001, (sz * SHEET_SIZE.h) / 200 - sz * 0.008]} scale={[0.004, 0.0015, 0.004]} />),
                )}
              </>
            )}
            <BlobShadow r={0.26} opacity={0.6} />
            {active && <GlowRing r={0.24} y={PAPER_Y + 0.002} />}
          </group>
        )}
      </Interactive>
      {/* the pins on this sheet; in the eye-level view the parts of P₁ and P₂ seen through the block are their images */}
      {t &&
        pinPoints(t).map(({ id, p }) => {
          const behind = (id === 'p1' || id === 'p2') && sight && blockOn;
          const img = behind ? glassImage(v, t.i, id === 'p1' ? t.p1! : t.p2!) : null;
          const seen = img && throughBlock(v, eyeX, img);
          const dk = (id === 'p3' || id === 'p4') && editable && interactive ? () => 'pin' : undefined;
          return (
            <group key={id}>
              <Interactive id={`pin:${id}`} label={`${PIN_LABEL[id]}${dk ? ' — drag to move it' : ''}`} bench position={toLocal(p)} labelY={0.05} drag={dk}>
                {(active) => (
                  <group>
                    <PinModel pin={id} from={behind ? BLOCK_H : 0} />
                    <mesh position={[0, 0.02, 0]}>
                      <cylinderGeometry args={[0.006, 0.006, 0.04, 6]} />
                      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                    </mesh>
                    {active && <GlowRing r={0.012} y={0.001} />}
                  </group>
                )}
              </Interactive>
              {img && seen && (
                <group position={toLocal(img)}>
                  <PinModel pin={id} from={0} to={BLOCK_H - 0.05} head={false} ghost />
                </group>
              )}
            </group>
          );
        })}
      {/* the glass block on its outline, or by the board */}
      {scene.collected.has('block') && <Block v={v} on={blockOn} />}
      <DrawingTools v={v} t={t} />
    </group>
  );
}

function Block({ v, on }: { v: PhyGlassVariant; on: boolean }) {
  const ref = useRef<Group>(null);
  const w = (GLASS_BLOCK_RIGHT - GLASS_BLOCK_LEFT) / 100;
  const d = v.thickness / 100;
  const h = BLOCK_H / 100;
  const onAt = toLocal({ x: (GLASS_BLOCK_LEFT + GLASS_BLOCK_RIGHT) / 2, y: -v.thickness / 2 });
  const want: V3 = on ? [onAt[0], PAPER_Y, onAt[2]] : SPOT.blockHome;
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, dt * 6);
    g.position.x += (want[0] - g.position.x) * k;
    g.position.z += (want[2] - g.position.z) * k;
    const far = Math.hypot(want[0] - g.position.x, want[2] - g.position.z);
    g.position.y = want[1] + Math.min(0.05, far * 0.4);
  });
  return (
    <group ref={ref} position={want}>
      <Interactive id="block" label="Rectangular glass block" bench labelY={0.05}>
        {(active) => (
          <group>
            <mesh geometry={box} material={glassMat} position={[0, h / 2, 0]} scale={[w, h, d]} />
            {/* frosted ends and bright edges so the block reads as glass */}
            {[-1, 1].map((s) => (
              <mesh key={s} geometry={box} material={edgeMat} position={[(s * w) / 2, h / 2, 0]} scale={[0.0012, h, d]} />
            ))}
            {[-1, 1].map((s) => (
              <mesh key={`t${s}`} geometry={box} material={edgeMat} position={[0, h, (s * d) / 2]} scale={[w, 0.0012, 0.0012]} />
            ))}
            {!on && <BlobShadow r={0.08} />}
            {active && <GlowRing r={0.08} />}
          </group>
        )}
      </Interactive>
    </group>
  );
}

/** The ruler, protractor and pencil: lying by the board, or in use while a line is drawn and r is measured. */
function DrawingTools({ v, t }: { v: PhyGlassVariant; t: GlassTrace | null }) {
  const anim = useBench((b) => b.anim);
  const focus = useLabView((s) => s.focus);
  const pencil = useRef<Group>(null);
  const O = toLocal({ x: 0, y: 0 });
  // The line being drawn: the normal, the incident ray, or P₄P₃ produced to E.
  const drawing = anim && anim.kind !== 'pin' && t ? anim : null;
  let from: GlassPoint = { x: 0, y: 6 };
  let to: GlassPoint = { x: 0, y: -(v.thickness + 3) };
  if (drawing?.kind === 'ray' && t) {
    from = { x: 0, y: 0 };
    to = glassIncidentPoint(t.i, 14);
  } else if (drawing?.kind === 'join' && t?.p3 && t.p4) {
    from = Math.abs(t.p3.y) > Math.abs(t.p4.y) ? t.p3 : t.p4;
    to = { x: 0, y: 0 };
  }
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  // The ruler lies along the line, its edge on it (the ruler is 3 cm wide, centred on its own axis).
  const rulerAt = toLocal(from);
  const ux = Math.cos(ang);
  const uz = -Math.sin(ang);
  useFrame(() => {
    const p = pencil.current;
    const a = useBench.getState().anim;
    if (!p || !a || a.kind === 'pin') return;
    const f = Math.min(1, (performance.now() - a.at) / ANIM_MS[a.kind]);
    const q = toLocal({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }, 0.2);
    p.position.set(q[0], q[1], q[2]);
  });
  const measuring = !!t?.joined && focus === 'protractor';
  const protractorOn = measuring || drawing?.kind === 'ray';
  return (
    <group>
      {drawing ? (
        <group position={[rulerAt[0] - ux * 0.02 + Math.sin(ang) * 0.016, PAPER_Y, rulerAt[2] - uz * 0.02 + Math.cos(ang) * 0.016]} rotation={[0, ang, 0]}>
          <Rule cm={30} width={0.03} />
        </group>
      ) : (
        <Interactive id="ruler" label="30 cm ruler" bench position={SPOT.ruler} rotation={[0, 0.1, 0]} labelY={0.03}>
          {(active) => <Rule cm={30} width={0.03} glow={active} />}
        </Interactive>
      )}
      {protractorOn ? (
        <group position={[O[0], PAPER_Y + 0.0008, O[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <Protractor r={0.08} down />
        </group>
      ) : (
        <Interactive id="protractor" label="Protractor" bench position={SPOT.protractor} labelY={0.03}>
          {(active) => (
            <group rotation={[-Math.PI / 2, 0, 0.3]} position={[0, 0.001, 0]}>
              <Protractor r={0.07} down glow={active} />
            </group>
          )}
        </Interactive>
      )}
      {drawing ? (
        <group ref={pencil}>
          <group rotation={[0.5, 0, 0.25]}>
            <mesh geometry={cyl} material={mat.wood()} position={[0, 0.075, 0]} scale={[0.0035, 0.13, 0.0035]} />
            <mesh geometry={cone} material={mat.black()} position={[0, 0.004, 0]} scale={[0.0035, 0.009, 0.0035]} rotation={[Math.PI, 0, 0]} />
          </group>
        </group>
      ) : (
        <Interactive id="pencil" label="Sharp pencil" bench position={SPOT.pencil} rotation={[0, 0.6, 0]} labelY={0.03}>
          {(active) => (
            <group rotation={[0, 0, Math.PI / 2]} position={[0, 0.004, 0]}>
              <mesh geometry={cyl} material={mat.wood()} scale={[0.0035, 0.15, 0.0035]} />
              {active && <GlowRing r={0.08} />}
            </group>
          )}
        </Interactive>
      )}
    </group>
  );
}
const cone = new ConeGeometry(1, 1, 10);

/** The pin box: the pins not yet on the paper. */
function PinBox({ left }: { left: PinId[] }) {
  return (
    <Interactive id="pins" label="Optical pins" bench position={SPOT.pins} labelY={0.06}>
      {(active) => (
        <group>
          <mesh geometry={box} material={mat.cabinet()} position={[0, 0.008, 0]} scale={[0.07, 0.016, 0.05]} />
          <mesh geometry={box} material={mat.red()} position={[0, 0.0165, 0]} scale={[0.066, 0.001, 0.046]} />
          {left.map((id, k) => (
            <group key={id} position={[-0.024 + k * 0.016, 0.018, 0]} rotation={[0, 0, Math.PI / 2 - 0.05]}>
              <PinModel pin={id} />
            </group>
          ))}
          <BlobShadow r={0.06} />
          {active && <GlowRing r={0.06} />}
        </group>
      )}
    </Interactive>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  if (id === 'prism')
    return (
      <mesh material={glassMat} position={[0, 0.012, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.025, 3]} />
      </mesh>
    );
  if (id === 'lens')
    return (
      <group>
        <mesh material={glassMat} position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.25, 1]}>
          <sphereGeometry args={[0.03, 20, 12]} />
        </mesh>
        <mesh geometry={cyl} material={mat.darkMetal()} position={[0, 0.005, 0]} scale={[0.025, 0.01, 0.025]} />
        <mesh geometry={cyl} material={mat.darkMetal()} position={[0, 0.02, 0]} scale={[0.003, 0.03, 0.003]} />
      </group>
    );
  if (id === 'mirror')
    return (
      <group>
        <mesh geometry={box} material={mat.steel()} position={[0, 0.025, 0]} scale={[0.1, 0.05, 0.003]} />
        <mesh geometry={box} material={mat.wood()} position={[0, 0.004, 0.004]} scale={[0.1, 0.008, 0.02]} />
      </group>
    );
  return null;
}

/** Everything on the student's bench. */
export function Station({ v, state, scene, interactive, onPaper, task }: { v: PhyGlassVariant; state: PhyGlassState; scene: SceneState; interactive: boolean; onPaper: (p: GlassPoint) => void; task: string[] }) {
  const viewing = useBench((b) => b.viewing);
  const { t } = shownTrace(state, viewing);
  const used = t ? pinPoints(t).map((x) => x.id) : [];
  const left = (['p1', 'p2', 'p3', 'p4'] as PinId[]).filter((p) => !used.includes(p));
  const extras = (['prism', 'lens', 'mirror'] as ApparatusId[]).filter((id) => scene.collected.has(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title="Glass block" lines={task} bookTitle="Refraction — glass block" heads={['i/°', 'r/°', 'sin i', 'sin r']} />
      {scene.collected.has('board') && <Board v={v} state={state} scene={scene} interactive={interactive} onPaper={onPaper} />}
      {scene.collected.has('pins') && <PinBox left={left} />}
      {!scene.collected.has('board') && (scene.collected.has('ruler') || scene.collected.has('protractor')) && <LooseTools scene={scene} />}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + (k % 2) * 0.16, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.16]} labelY={0.08}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              <BlobShadow r={0.06} />
              {active && <GlowRing r={0.07} />}
            </group>
          )}
        </Interactive>
      ))}
    </group>
  );
}

/** The ruler and protractor before the board arrives. */
function LooseTools({ scene }: { scene: SceneState }) {
  return (
    <>
      {scene.collected.has('ruler') && (
        <Interactive id="ruler" label="30 cm ruler" bench position={SPOT.ruler} rotation={[0, 0.1, 0]} labelY={0.03}>
          {(active) => <Rule cm={30} width={0.03} glow={active} />}
        </Interactive>
      )}
      {scene.collected.has('protractor') && (
        <Interactive id="protractor" label="Protractor" bench position={SPOT.protractor} labelY={0.03}>
          {(active) => (
            <group rotation={[-Math.PI / 2, 0, 0.3]} position={[0, 0.001, 0]}>
              <Protractor r={0.07} down glow={active} />
            </group>
          )}
        </Interactive>
      )}
    </>
  );
}

/** The cupboard's shelves: what is still there. */
const SLOTS: CupboardSlot[] = [
  { id: 'board', label: APPARATUS_LABEL.board, shelf: 0, x: -0.7, z: 0.02, model: <mesh geometry={box} material={mat.wood()} position={[0, 0.19, -0.1]} rotation={[0.08, 0, 0]} scale={[0.34, 0.38, 0.014]} /> },
  { id: 'paper', label: APPARATUS_LABEL.paper, shelf: 0, x: -0.25, model: <mesh geometry={box} material={mat.white()} position={[0, 0.02, 0]} scale={[0.22, 0.04, 0.3]} /> },
  { id: 'block', label: APPARATUS_LABEL.block, shelf: 1, x: -0.75, model: <mesh geometry={box} material={glassMat} position={[0, 0.0125, 0]} scale={[0.11, 0.025, 0.065]} />, grip: [[0.12, 0.04, 0.08], [0, 0.02, 0]] },
  { id: 'pins', label: APPARATUS_LABEL.pins, shelf: 1, x: -0.45, model: <mesh geometry={box} material={mat.red()} position={[0, 0.01, 0]} scale={[0.07, 0.02, 0.05]} />, grip: [[0.09, 0.05, 0.07], [0, 0.02, 0]] },
  { id: 'protractor', label: APPARATUS_LABEL.protractor, shelf: 1, x: -0.15, model: <group position={[0, 0.0, 0]}><Protractor r={0.07} down={false} /></group>, grip: [[0.15, 0.08, 0.03], [0, 0.04, 0]] },
  { id: 'ruler', label: APPARATUS_LABEL.ruler, shelf: 2, x: -0.6, model: <Rule cm={30} width={0.03} />, grip: [[0.32, 0.03, 0.05], [0.15, 0.01, 0]] },
  { id: 'pencil', label: APPARATUS_LABEL.pencil, shelf: 2, x: -0.15, model: <mesh geometry={cyl} material={mat.wood()} rotation={[0, 0, Math.PI / 2]} position={[0, 0.004, 0]} scale={[0.004, 0.15, 0.004]} />, grip: [[0.16, 0.03, 0.04], [0, 0.01, 0]] },
  { id: 'prism', label: APPARATUS_LABEL.prism, shelf: 1, x: 0.3, model: <ExtraModel id="prism" />, grip: [[0.08, 0.05, 0.08], [0, 0.02, 0]] },
  { id: 'lens', label: APPARATUS_LABEL.lens, shelf: 1, x: 0.6, model: <ExtraModel id="lens" />, grip: [[0.07, 0.09, 0.05], [0, 0.04, 0]] },
  { id: 'mirror', label: APPARATUS_LABEL.mirror, shelf: 2, x: 0.4, model: <ExtraModel id="mirror" />, grip: [[0.12, 0.07, 0.04], [0, 0.03, 0]] },
];
export function GlassCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
