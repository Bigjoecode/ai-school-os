import type { ChemEnergeticsState } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, Color, CylinderGeometry, DoubleSide, LatheGeometry, Matrix4, MeshStandardMaterial, SphereGeometry, Vector2, Vector3, type Group, type InstancedMesh, type Material, type Mesh } from 'three';
import { BlobShadow, Burette, BunsenBurner, GlowRing, MeasuringCylinder, ReagentBottle, RetortStand, WashBottle } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT, liveTex } from '../../phy-common/lab3d/tex';
import { openRun, openTube, type Energetics } from '../actions';
import { clockText } from '../parts';
import { useBench } from './bench-store';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { BATH, BULB, BURETTE, CUP, CUP_DIM, SPOT, THERMO, TUBE_RACK, type V3 } from './views';

/**
 * The energetics bench. Cup tasks: the polystyrene cup (white foam, its lid)
 * in its support beaker, the liquid tinted warm or cold with the live
 * temperature, the solid dissolving at the live rate, the thermometer (its
 * red column at the lagging reading) in the cup or the alkali's cylinder, the
 * two measuring cylinders, the bottles, the balance and a stopwatch counting
 * from the mixing. Solubility: the boiling tube in the rack or the water bath
 * (crystals appear, dissolve and reappear with the live temperature), the
 * thermometer in it, the burette on its stand, the balance and the KNO₃.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 24);
const sphere = new SphereGeometry(1, 8, 6);
const v2 = (x: number, y: number) => new Vector2(x, y);
const foam = new MeshStandardMaterial({ color: '#f5f2ea', roughness: 0.95 });
const lidMat = new MeshStandardMaterial({ color: '#ece6d6', roughness: 0.9, side: DoubleSide });
const redMat = new MeshStandardMaterial({ color: '#c62828', roughness: 0.4 });
const crystalMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0.05 });
const pelletMat = new MeshStandardMaterial({ color: '#f2f2ec', roughness: 0.5 });
const watchCase = new MeshStandardMaterial({ color: '#1e2a36', roughness: 0.4 });
const waterMat = new MeshStandardMaterial({ color: '#7fb6d8', roughness: 0.1, transparent: true, opacity: 0.6 });
const lampOn = new MeshStandardMaterial({ color: '#ff5252', emissive: '#ff1744', emissiveIntensity: 1 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}

// ------------------------------------------------------------------ the thermometer
const thermoScale = () =>
  canvasTex('en-thermo-scale', 64, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#111';
    g.strokeStyle = '#111';
    for (let c = -10; c <= 110; c++) {
      const y = h - ((THERMO.y0 + c * THERMO.perC) / THERMO.len) * h;
      g.lineWidth = c % 10 === 0 ? 4 : c % 5 === 0 ? 3 : 1.5;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(c % 10 === 0 ? 30 : c % 5 === 0 ? 22 : 13, y);
      g.stroke();
      if (c % 10 === 0) {
        g.font = `700 20px ${FONT}`;
        g.fillText(String(c), 33, y + 7);
      }
    }
  });
/** A thermometer standing with its bulb at the origin; the column follows `temp()` every frame. */
function ThermometerModel({ temp, glow, tilt = 0 }: { temp: () => number; glow?: boolean; tilt?: number }) {
  const col = useRef<Mesh>(null);
  const g = useRef<Group>(null);
  const scale = useMemo(() => thermoScale(), []);
  useFrame(() => {
    const h = Math.max(0.002, THERMO.y0 + Math.max(-10, temp()) * THERMO.perC);
    if (col.current) {
      col.current.scale.y = h;
      col.current.position.y = h / 2;
    }
    if (g.current) {
      const stir = useBench.getState().stirUntil - performance.now();
      g.current.rotation.z = tilt + (stir > 0 ? Math.sin(performance.now() / 90) * 0.06 : 0);
    }
  });
  return (
    <group ref={g} rotation={[0, 0, tilt]}>
      <C p={[0, THERMO.len / 2, 0]} r={0.0035} h={THERMO.len} m={mat.glass()} />
      <mesh ref={col} geometry={cyl} material={redMat} scale={[0.0011, 0.05, 0.0011]} />
      <mesh geometry={sphere} material={redMat} position={[0, 0.004, 0]} scale={0.0038} />
      <mesh position={[0.006, THERMO.len / 2, 0.0036]}>
        <planeGeometry args={[0.012, THERMO.len]} />
        <meshBasicMaterial map={scale} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {glow && <GlowRing r={0.02} />}
    </group>
  );
}

// ------------------------------------------------------------------ the cup
function PolyCup({ glow }: { glow?: boolean }) {
  const g = useMemo(() => new LatheGeometry([v2(0, 0), v2(CUP_DIM.r0, 0), v2(CUP_DIM.r0 + 0.001, 0.003), v2(CUP_DIM.r1, CUP_DIM.h), v2(CUP_DIM.r1 + 0.003, CUP_DIM.h + 0.002)], 32), []);
  return (
    <group>
      <mesh geometry={g} material={foam} />
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}
function GlassVessel({ glow }: { glow?: boolean }) {
  const g = useMemo(() => new LatheGeometry([v2(0, 0.001), v2(0.038, 0), v2(0.039, 0.003), v2(0.039, 0.095), v2(0.041, 0.098)], 32), []);
  return (
    <group>
      <mesh geometry={g} material={mat.glass()} renderOrder={4} />
      {glow && <GlowRing r={0.06} />}
    </group>
  );
}
function SupportBeaker() {
  const g = useMemo(() => new LatheGeometry([v2(0, 0.001), v2(0.052, 0), v2(0.053, 0.003), v2(0.053, 0.085), v2(0.056, 0.088)], 32), []);
  return (
    <group>
      <mesh geometry={g} material={mat.glass()} renderOrder={4} />
      <BlobShadow r={0.075} />
    </group>
  );
}
/** The liquid in the cup: height from the volume, tinted with the live temperature; the undissolved solid at the bottom. */
function CupContents({ o, vol, solid }: { o: Energetics; vol: number; solid: 'SALT' | 'NAOH' | null }) {
  const material = useMemo(() => new MeshStandardMaterial({ color: '#dcecf7', roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false }), []);
  const live = useRef(o);
  live.current = o;
  const base = useMemo(() => new Color('#dcecf7'), []);
  const warm = useMemo(() => new Color('#ffd2b0'), []);
  const cold = useMemo(() => new Color('#b5d3ff'), []);
  const inst = useRef<InstancedMesh>(null);
  const N = 24;
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({ a: (i * 2.399) % (Math.PI * 2), r: 0.004 + ((i * 37) % 19) / 1000 })), []);
  const m4 = useMemo(() => new Matrix4(), []);
  const p = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const d = (live.current.cupTemp() - live.current.v.room) / 6;
    material.color.copy(base).lerp(d > 0 ? warm : cold, Math.min(0.8, Math.abs(d)));
    const m = inst.current;
    if (!m) return;
    const left = solid ? 1 - live.current.cupDissolved() : 0;
    const n = Math.round(N * Math.min(1, left));
    const sc = solid === 'NAOH' ? 0.0042 : 0.0026;
    for (let i = 0; i < N; i++) {
      const s = seeds[i]!;
      p.set(Math.cos(s.a) * s.r, 0.003, Math.sin(s.a) * s.r);
      m4.makeScale(i < n ? sc : 0, i < n ? sc * 0.7 : 0, i < n ? sc : 0).setPosition(p);
      m.setMatrixAt(i, m4);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  const h = Math.min(CUP_DIM.h - 0.01, (vol / 100) * 0.062 + 0.004);
  const rTop = CUP_DIM.r0 + ((CUP_DIM.r1 - CUP_DIM.r0) * h) / CUP_DIM.h - 0.002;
  return (
    <group>
      {vol > 0 && (
        <mesh position={[0, h / 2 + 0.001, 0]} material={material} renderOrder={2}>
          <cylinderGeometry args={[rTop, CUP_DIM.r0 - 0.002, h, 28]} />
        </mesh>
      )}
      {solid && <instancedMesh ref={inst} args={[sphere, solid === 'NAOH' ? pelletMat : crystalMat, N]} />}
    </group>
  );
}
function Lid() {
  return (
    <mesh position={[0, CUP_DIM.h + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lidMat}>
      <ringGeometry args={[0.005, CUP_DIM.r1 + 0.005, 32]} />
    </mesh>
  );
}

/** A measuring cylinder with liquid in it (cm³, 0–50). */
function FilledCylinder({ vol, glow, colour = '#e3eff7' }: { vol: number; glow?: boolean; colour?: string }) {
  const h = (Math.min(100, vol) / 50) * 0.17;
  return (
    <group>
      <MeasuringCylinder glow={glow} />
      {vol > 0 && (
        <mesh position={[0, 0.013 + h / 2, 0]} material={liquidMaterial(colour, 0.5)}>
          <cylinderGeometry args={[0.0108, 0.0108, h, 16]} />
        </mesh>
      )}
    </group>
  );
}

function StopwatchModel({ face }: { face?: ReactNode }) {
  return (
    <group>
      <mesh geometry={cyl} material={watchCase} position={[0, 0.012, 0]} scale={[0.035, 0.024, 0.035]} />
      <C p={[0, 0.012, -0.047]} r={0.009} h={0.006} m={redMat} rot={[Math.PI / 2, 0, 0]} />
      {face}
      <BlobShadow r={0.05} />
    </group>
  );
}
function WatchFace({ o }: { o: Energetics }) {
  const live = useMemo(() => liveTex(256, 128), []);
  const last = useRef('');
  const ref = useRef(o);
  ref.current = o;
  useEffect(() => () => live.texture.dispose(), [live]);
  const draw = (text: string, running: boolean) =>
    live.redraw((g, w, h) => {
      g.fillStyle = '#c9d7b8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#16200f';
      g.font = `700 64px ui-monospace, Menlo, Consolas, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
      g.font = `600 18px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(running ? '● RUN' : 'STOP', 10, 18);
    });
  useFrame(() => {
    const running = ref.current.cupLive();
    const text = running ? clockText(ref.current.tMix()) : '0:00';
    const key = `${text}|${running}`;
    if (key === last.current) return;
    last.current = key;
    draw(text, running);
  });
  if (!last.current) draw('0:00', false);
  return (
    <mesh position={[0, 0.0245, 0.004]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[0.05, 0.025]} />
      <meshBasicMaterial map={live.texture} toneMapped={false} />
    </mesh>
  );
}

function BalanceModel({ shows }: { shows: string }) {
  const tex = useMemo(() => liveTex(256, 96), []);
  useEffect(() => {
    tex.redraw((g, w, h) => {
      g.fillStyle = '#9fc59a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#10200d';
      g.font = `700 54px ui-monospace, Menlo, monospace`;
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      g.fillText(shows, w - 14, h / 2 + 2);
    });
  }, [shows, tex]);
  return (
    <group>
      <B p={[0, 0.025, 0]} s={[0.16, 0.05, 0.2]} m={mat.white()} />
      <C p={[0, 0.054, -0.02]} r={0.06} h={0.006} m={mat.steel()} />
      <mesh position={[0, 0.03, 0.1005]}>
        <planeGeometry args={[0.07, 0.026]} />
        <meshBasicMaterial map={tex.texture} toneMapped={false} />
      </mesh>
      <BlobShadow r={0.13} />
    </group>
  );
}
function Spatula() {
  return (
    <group rotation={[0, 0.5, 0]}>
      <B p={[0, 0.002, 0]} s={[0.14, 0.002, 0.008]} m={mat.steel()} />
      <B p={[0.075, 0.002, 0]} s={[0.02, 0.002, 0.014]} m={mat.steel()} />
    </group>
  );
}

// ------------------------------------------------------------------ the tube
/** The boiling tube with its solution, the solid (undissolved or crystallised) and the thermometer standing in it. */
function TubeModel({ o, water, glow }: { o: Energetics; water: number; glow?: boolean }) {
  const inst = useRef<InstancedMesh>(null);
  const live = useRef(o);
  live.current = o;
  const N = 40;
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({ a: (i * 2.399) % (Math.PI * 2), r: ((i * 37) % 9) / 1000, y: ((i * 13) % 17) / 17 })), []);
  const m4 = useMemo(() => new Matrix4(), []);
  const p = useMemo(() => new Vector3(), []);
  const h = Math.min(0.12, 0.008 + water * 0.0085);
  useFrame(() => {
    const m = inst.current;
    if (!m) return;
    const mass = live.current.ref.current.soly.mass ?? 0;
    const frac = mass > 0 ? Math.min(1, live.current.solidLeft() / mass) : 0;
    const n = Math.round(N * frac);
    const floating = live.current.phase() === 'cool';
    for (let i = 0; i < N; i++) {
      const s = seeds[i]!;
      // fresh crystals form through the cooling liquid; undissolved ones lie at the bottom
      p.set(Math.cos(s.a) * s.r, 0.006 + (floating ? s.y * h * 0.8 : (i % 6) * 0.0015), Math.sin(s.a) * s.r);
      const sc = i < n ? 0.0016 : 0;
      m4.makeScale(sc, sc * 0.6, sc).setPosition(p);
      m.setMatrixAt(i, m4);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <C p={[0, 0.075, 0]} r={0.0125} h={0.15} m={mat.glass()} />
      {water > 0 && (
        <mesh position={[0, h / 2 + 0.003, 0]} material={liquidMaterial('#eaf3f9', 0.4)}>
          <cylinderGeometry args={[0.011, 0.011, h, 16]} />
        </mesh>
      )}
      <instancedMesh ref={inst} args={[sphere, crystalMat, N]} />
      <group position={[0.003, 0.004, 0]}>
        <ThermometerModel temp={() => live.current.tubeThermo()} />
      </group>
      {glow && <GlowRing r={0.025} />}
    </group>
  );
}
function RackModel() {
  return (
    <group>
      <B p={[0, 0.07, 0]} s={[0.16, 0.01, 0.05]} m={mat.wood()} />
      <B p={[0, 0.005, 0]} s={[0.16, 0.01, 0.05]} m={mat.wood()} />
      <B p={[-0.075, 0.037, 0]} s={[0.01, 0.065, 0.05]} m={mat.wood()} />
      <B p={[0.075, 0.037, 0]} s={[0.01, 0.065, 0.05]} m={mat.wood()} />
      <BlobShadow r={0.1} />
    </group>
  );
}
function BathModel({ on }: { on: boolean }) {
  const steam = useRef<Group>(null);
  useFrame(() => {
    const g = steam.current;
    if (g) g.position.y = 0.13 + ((performance.now() / 2500) % 1) * 0.03;
  });
  return (
    <group>
      <B p={[0, 0.06, 0]} s={[0.24, 0.12, 0.2]} m={mat.white()} />
      <mesh geometry={box} material={waterMat} position={[0, 0.115, 0]} scale={[0.22, 0.006, 0.18]} />
      <B p={[0.08, 0.06, 0.101]} s={[0.04, 0.03, 0.004]} m={mat.black()} />
      <mesh geometry={sphere} material={on ? lampOn : mat.black()} position={[-0.08, 0.06, 0.102]} scale={0.006} />
      {on && (
        <group ref={steam}>
          {[-0.05, 0.02, 0.06].map((x) => (
            <mesh key={x} position={[x, 0, 0]} geometry={sphere} scale={0.01}>
              <meshBasicMaterial color="#ffffff" transparent opacity={0.25} depthWrite={false} />
            </mesh>
          ))}
        </group>
      )}
      <BlobShadow r={0.17} />
    </group>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'cup':
      return <PolyCup />;
    case 'glassBeaker':
      return <GlassVessel />;
    case 'beaker':
      return <SupportBeaker />;
    case 'cylinder':
    case 'cylinder2':
      return <MeasuringCylinder />;
    case 'thermometer':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.13, 0.005, 0]}>
          <ThermometerModel temp={() => 25} />
        </group>
      );
    case 'stopwatch':
      return <StopwatchModel />;
    case 'balance':
      return <BalanceModel shows="0.00" />;
    case 'spatula':
      return <Spatula />;
    case 'tube':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.075, 0.013, 0]}>
          <C p={[0, 0.075, 0]} r={0.0125} h={0.15} m={mat.glass()} />
        </group>
      );
    case 'rack':
      return <RackModel />;
    case 'bath':
      return <BathModel on={false} />;
    case 'burette':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.3, 0.01, 0]}>
          <Burette level={null} bubble={false} detail={false} />
        </group>
      );
    case 'burner':
      return <BunsenBurner />;
    case 'washBottle':
      return <WashBottle />;
  }
}

export function Station({ o, state, scene, interactive, card }: { o: Energetics; state: ChemEnergeticsState; scene: SceneState; interactive: boolean; card: string[] }) {
  const task = scene.task;
  const soly = task === 'SOLY';
  const has = (id: ApparatusId) => scene.collected.has(id);
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const drag = interactive ? dragFor : undefined;
  const r = openRun(state);
  const last = r?.r ?? null;
  const where = o.thermoWhere();
  const live = useRef(o);
  live.current = o;
  const thermoT = () => live.current.thermoNow();
  const pourRef = useRef<Group>(null);
  useFrame(() => {
    const g = pourRef.current;
    if (!g) return;
    const left = useBench.getState().pourUntil - performance.now();
    g.rotation.z = left > 0 ? -Math.sin((left / 1100) * Math.PI) * 1.4 : 0;
  });
  const vessel = state.setup.vessel;
  const cupVol = last ? last.volA + (last.mixed ? last.volB : 0) : 0;
  const solid: 'SALT' | 'NAOH' | null = !soly && last?.mixed && task === 'SOLN' ? (last.kind === 'NAOH' ? 'NAOH' : 'SALT') : null;
  const t = openTube(state);
  const inBath = o.phase() === 'heat';
  const flame = inBath && t?.r.heat === 'FLAME';
  const tubeAt: V3 = inBath ? (flame ? [SPOT.burner[0], 0.17, SPOT.burner[2]] : [BATH[0], 0.06, BATH[2]]) : [TUBE_RACK[0], 0.012, TUBE_RACK[2]];
  const balanceShows = soly ? (state.soly.mass !== null && !state.soly.runs.length ? state.soly.mass.toFixed(2) : '0.00') : last && !last.mixed && last.solid > 0 ? last.solid.toFixed(2) : '0.00';
  const extras = (['glassBeaker', 'burner', 'washBottle', ...(soly ? (['cup', 'beaker', 'cylinder', 'cylinder2', 'stopwatch'] as ApparatusId[]) : (['tube', 'rack', 'bath', 'burette', ...(task === 'NEUT' ? (['balance', 'spatula'] as ApparatusId[]) : (['cylinder2'] as ApparatusId[]))] as ApparatusId[]))] as ApparatusId[]).filter((id) => has(id) && !(id === 'glassBeaker' && vessel === 'BEAKER'));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={task === 'NEUT' ? 'Heat of neutralisation' : task === 'SOLN' ? 'Heat of solution' : 'Solubility curve'} lines={card} bookTitle={task === 'SOLY' ? 'Solubility of KNO₃' : 'Energy changes'} heads={task === 'SOLY' ? ['water/cm³', 'θ/°C', 'S/g'] : task === 'NEUT' ? ['θ acid', 'θ alkali', 'θ max'] : ['θ initial', 'θ min', 'ΔT']} />

      {!soly ? (
        <>
          {/* the cup in its support beaker */}
          {(has('cup') || has('beaker')) && (
            <Interactive id="cup" label={vessel === 'BEAKER' ? 'Glass beaker (calorimeter)' : 'Polystyrene cup'} bench position={CUP} labelY={0.16} drag={drag}>
              {(active) => (
                <group>
                  {state.setup.support && has('beaker') && <SupportBeaker />}
                  <group position={[0, state.setup.support ? CUP_DIM.lift : 0, 0]}>
                    {vessel === 'BEAKER' ? <GlassVessel glow={active} /> : has('cup') ? <PolyCup glow={active} /> : null}
                    {vessel && <CupContents o={o} vol={cupVol} solid={solid} />}
                    {last?.mixed && last.lidAt !== null && <Lid />}
                  </group>
                  {!vessel && <BlobShadow r={0.05} />}
                </group>
              )}
            </Interactive>
          )}
          {has('beaker') && !state.setup.support && (
            <Interactive id="beaker" label="250 cm³ beaker (support)" bench position={[CUP[0] + 0.15, 0, CUP[2] - 0.12]} labelY={0.1}>
              {(active) => (
                <group>
                  <SupportBeaker />
                  {active && <GlowRing r={0.07} />}
                </group>
              )}
            </Interactive>
          )}
          {/* the thermometer: in the cup, in the alkali, or lying on the bench */}
          {has('thermometer') && (
            <Interactive id="thermometer" label="Thermometer" bench position={where === 'B' ? BULB.cylB : where === 'A' || where === 'CUP' ? [BULB.cup[0], BULB.cup[1] + (state.setup.support ? CUP_DIM.lift : 0), BULB.cup[2]] : SPOT.thermoRest} labelY={where ? 0.28 : 0.03}>
              {(active) => (where ? <ThermometerModel temp={thermoT} glow={active} tilt={where === 'B' ? 0 : -0.12} /> : <group rotation={[0, 0, Math.PI / 2]} position={[0.13, 0.005, 0]}><ThermometerModel temp={() => live.current.v.room} glow={active} /></group>)}
            </Interactive>
          )}
          {has('cylinder') && (
            <Interactive id="cylinder" label={task === 'NEUT' ? 'Measuring cylinder (acid)' : 'Measuring cylinder (water)'} bench position={SPOT.cylA} labelY={0.24}>
              {(active) => (
                <group ref={pourRef}>
                  <FilledCylinder vol={0} glow={active} />
                </group>
              )}
            </Interactive>
          )}
          {task === 'NEUT' && has('cylinder2') && (
            <Interactive id="cylinder2" label="Measuring cylinder (alkali)" bench position={SPOT.cylB} labelY={0.24}>
              {(active) => <FilledCylinder vol={last && !last.mixed ? last.volB : 0} glow={active} colour="#eef2f5" />}
            </Interactive>
          )}
          {task === 'NEUT' ? (
            <>
              <Interactive id="acid" label="HCl 1.00 mol dm⁻³ (A)" bench position={SPOT.acid} labelY={0.2}>
                {(active) => <ReagentBottle name="HCl" band="#c62828" sub="1.00 mol dm⁻³  A" glow={active} />}
              </Interactive>
              <Interactive id="alkali" label="NaOH 1.00 mol dm⁻³ (B)" bench position={SPOT.alkali} labelY={0.2}>
                {(active) => <ReagentBottle name="NaOH" band="#1f6fb2" sub="1.00 mol dm⁻³  B" glow={active} />}
              </Interactive>
            </>
          ) : (
            <>
              <Interactive id="salt" label="NH₄NO₃ (solid)" bench position={SPOT.salt} labelY={0.2}>
                {(active) => <ReagentBottle name="NH₄NO₃" band="#7a1f6b" sub="solid · oxidiser" liquid="#fbfbf8" glow={active} />}
              </Interactive>
              <Interactive id="naoh" label="NaOH pellets" bench position={SPOT.naoh} labelY={0.2}>
                {(active) => <ReagentBottle name="NaOH" band="#1f6fb2" sub="pellets · corrosive" liquid="#f4f4ee" glow={active} />}
              </Interactive>
            </>
          )}
          <Interactive id="water" label="Distilled water" bench position={SPOT.water} labelY={0.22}>
            {(active) => <WashBottle glow={active} />}
          </Interactive>
          {task === 'SOLN' && has('balance') && (
            <Interactive id="balance" label="Top-pan balance" bench position={SPOT.balance} labelY={0.1}>
              {(active) => (
                <group>
                  <BalanceModel shows={balanceShows} />
                  {active && <GlowRing r={0.13} />}
                </group>
              )}
            </Interactive>
          )}
          {task === 'SOLN' && has('spatula') && (
            <Interactive id="spatula" label="Spatula" bench position={SPOT.spatula} labelY={0.03}>
              {(active) => (
                <group>
                  <Spatula />
                  {active && <GlowRing r={0.06} />}
                </group>
              )}
            </Interactive>
          )}
          {has('stopwatch') && (
            <Interactive id="stopwatch" label="Stopwatch (time since mixing)" bench position={SPOT.stopwatch} rotation={[0, -0.3, 0]}>
              {(active) => (
                <group>
                  <StopwatchModel face={<WatchFace o={o} />} />
                  {active && <GlowRing r={0.06} />}
                </group>
              )}
            </Interactive>
          )}
        </>
      ) : (
        <>
          {has('rack') && (
            <Interactive id="rack" label="Test-tube rack" bench position={[TUBE_RACK[0] + 0.05, 0, TUBE_RACK[2]]} labelY={0.1}>
              {(active) => (
                <group>
                  <RackModel />
                  {active && <GlowRing r={0.1} />}
                </group>
              )}
            </Interactive>
          )}
          {has('tube') && (
            <Interactive id="tube" label="Boiling tube (KNO₃ solution)" bench position={tubeAt} labelY={0.2} drag={drag}>
              {(active) => <TubeModel o={o} water={t?.r.water ?? state.soly.water} glow={active} />}
            </Interactive>
          )}
          {has('bath') && (
            <Interactive id="bath" label="Water bath" bench position={[BATH[0], 0, BATH[2]]} labelY={0.2}>
              {(active) => (
                <group>
                  <BathModel on={placed('bath')} />
                  {active && <GlowRing r={0.17} />}
                </group>
              )}
            </Interactive>
          )}
          {has('burette') && (
            <Interactive id="burette" label="Burette (distilled water)" bench position={BURETTE} labelY={0.95}>
              {(active) => (
                <group>
                  <RetortStand clampY={0.55} glow={active} />
                  {placed('burette') && (
                    <group position={[0, 0.22, 0.04]}>
                      <Burette level={Math.min(50, 0.4 + state.soly.water)} bubble={false} detail={false} />
                    </group>
                  )}
                </group>
              )}
            </Interactive>
          )}
          {has('balance') && (
            <Interactive id="balance" label="Top-pan balance" bench position={SPOT.balance} labelY={0.1}>
              {(active) => (
                <group>
                  <BalanceModel shows={balanceShows} />
                  {active && <GlowRing r={0.13} />}
                </group>
              )}
            </Interactive>
          )}
          {has('spatula') && (
            <Interactive id="spatula" label="Spatula" bench position={SPOT.spatula} labelY={0.03}>
              {(active) => (
                <group>
                  <Spatula />
                  {active && <GlowRing r={0.06} />}
                </group>
              )}
            </Interactive>
          )}
          <Interactive id="kno3" label="KNO₃ (solid)" bench position={SPOT.kno3} labelY={0.2}>
            {(active) => <ReagentBottle name="KNO₃" band="#2e7d32" sub="solid" liquid="#fbfbf8" glow={active} />}
          </Interactive>
          {has('burner') && (
            <Interactive id="burner" label="Bunsen burner" bench position={SPOT.burner} labelY={0.18}>
              {(active) => (
                <group>
                  <BunsenBurner glow={active} />
                  {flame && (
                    <mesh position={[0, 0.18, 0]} scale={[0.012, 0.04, 0.012]} geometry={sphere}>
                      <meshBasicMaterial color="#4f7cff" transparent opacity={0.7} depthWrite={false} />
                    </mesh>
                  )}
                </group>
              )}
            </Interactive>
          )}
        </>
      )}
      {extras
        .filter((id) => !(soly && id === 'burner'))
        .map((id, k) => (
          <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.extras[0] + (k % 2) * 0.16, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.16]} labelY={0.12}>
            {(active) => (
              <group>
                <ExtraModel id={id} />
                {active && <GlowRing r={0.06} />}
              </group>
            )}
          </Interactive>
        ))}
    </group>
  );
}

const SLOTS: CupboardSlot[] = [
  { id: 'cup', label: APPARATUS_LABEL.cup, shelf: 1, x: -0.85, model: <ExtraModel id="cup" />, grip: [[0.09, 0.11, 0.09], [0, 0.05, 0]] },
  { id: 'glassBeaker', label: APPARATUS_LABEL.glassBeaker, shelf: 1, x: -0.7, model: <ExtraModel id="glassBeaker" />, grip: [[0.09, 0.1, 0.09], [0, 0.05, 0]] },
  { id: 'beaker', label: APPARATUS_LABEL.beaker, shelf: 1, x: -0.52, model: <ExtraModel id="beaker" />, grip: [[0.11, 0.09, 0.11], [0, 0.045, 0]] },
  { id: 'cylinder', label: APPARATUS_LABEL.cylinder, shelf: 1, x: -0.35, model: <ExtraModel id="cylinder" />, grip: [[0.07, 0.22, 0.07], [0, 0.1, 0]] },
  { id: 'cylinder2', label: APPARATUS_LABEL.cylinder2, shelf: 1, x: -0.22, model: <ExtraModel id="cylinder2" />, grip: [[0.07, 0.22, 0.07], [0, 0.1, 0]] },
  { id: 'washBottle', label: APPARATUS_LABEL.washBottle, shelf: 1, x: -0.06, model: <ExtraModel id="washBottle" />, grip: [[0.08, 0.17, 0.08], [0, 0.08, 0]] },
  { id: 'rack', label: APPARATUS_LABEL.rack, shelf: 1, x: 0.14, model: <ExtraModel id="rack" /> },
  { id: 'thermometer', label: APPARATUS_LABEL.thermometer, shelf: 0, x: -0.75, z: 0.1, model: <ExtraModel id="thermometer" />, grip: [[0.28, 0.04, 0.04], [0.13, 0.01, 0]] },
  { id: 'burette', label: APPARATUS_LABEL.burette, shelf: 0, x: -0.35, model: <ExtraModel id="burette" />, grip: [[0.66, 0.05, 0.05], [0.0, 0.01, 0]] },
  { id: 'bath', label: APPARATUS_LABEL.bath, shelf: 0, x: 0.55, model: <group scale={0.8}><ExtraModel id="bath" /></group>, grip: [[0.22, 0.12, 0.18], [0, 0.05, 0]] },
  { id: 'tube', label: APPARATUS_LABEL.tube, shelf: 2, x: -0.85, model: <ExtraModel id="tube" />, grip: [[0.16, 0.03, 0.03], [0.07, 0.01, 0]] },
  { id: 'stopwatch', label: APPARATUS_LABEL.stopwatch, shelf: 2, x: -0.62, model: <ExtraModel id="stopwatch" />, grip: [[0.1, 0.06, 0.1], [0, 0.02, 0]] },
  { id: 'spatula', label: APPARATUS_LABEL.spatula, shelf: 2, x: -0.45, model: <ExtraModel id="spatula" />, grip: [[0.14, 0.03, 0.05], [0, 0.01, 0]] },
  { id: 'balance', label: APPARATUS_LABEL.balance, shelf: 2, x: -0.22, model: <ExtraModel id="balance" />, grip: [[0.17, 0.08, 0.2], [0, 0.03, 0]] },
  { id: 'burner', label: APPARATUS_LABEL.burner, shelf: 2, x: 0.05, model: <ExtraModel id="burner" /> },
];
export function EnCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
