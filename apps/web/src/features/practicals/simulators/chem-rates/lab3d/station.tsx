import { RATES_SYRINGE, type ChemRatesState } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Matrix4, MeshStandardMaterial, SphereGeometry, TubeGeometry, Vector3, type Group, type InstancedMesh, type Material, type Mesh } from 'three';
import { Beaker, BlobShadow, BunsenBurner, Burette, ConicalFlask, GlowRing, MeasuringCylinder, ReagentBottle, TestTubeRack, Thermometer, WashBottle } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { canvasTex, FONT, liveTex } from '../../phy-common/lab3d/tex';
import { crossFlaskFull, openCross, openMg, type Rates } from '../actions';
import { useBench } from './bench-store';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { BATH, FLASK, FLASK_TOP, plungerX, SPOT, STAND, SYR, THERMO, type V3 } from './views';

/**
 * The rates bench. Magnesium: the conical flask with its bung and delivery
 * tube, the gas syringe clamped on a retort stand (its plunger slides out
 * with the live volume, by the shared kinetics), the ribbon on a watch glass
 * (it shrinks as it reacts, with bubbles rising at the live rate), sandpaper,
 * the balance, the two acids and the measuring cylinder. Thiosulphate: the
 * flask on the paper cross, its liquid clouding with sulphur so the cross
 * fades from above, the thermometer in the mixture, the water bath, the
 * cylinders and bottles. Both: the stopwatch, the task card and the notebook.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 20);
const sphere = new SphereGeometry(1, 8, 6);
const rubber = new MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.8 });
const mgMat = new MeshStandardMaterial({ color: '#c9ced3', roughness: 0.25, metalness: 0.9 });
const mgDull = new MeshStandardMaterial({ color: '#7d8084', roughness: 0.7, metalness: 0.4 });
const sandMat = new MeshStandardMaterial({ color: '#b48a4e', roughness: 1 });
const watchCase = new MeshStandardMaterial({ color: '#1e2a36', roughness: 0.4 });
const redMat = new MeshStandardMaterial({ color: '#c62828', roughness: 0.4 });
const waterMat = new MeshStandardMaterial({ color: '#7fb6d8', roughness: 0.1, transparent: true, opacity: 0.75 });
const bubbleMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, transparent: true, opacity: 0.8 });
const lampOn = new MeshStandardMaterial({ color: '#ff5252', emissive: '#ff1744', emissiveIntensity: 1 });
const tubeMat = new MeshStandardMaterial({ color: '#d9e4ea', roughness: 0.2, transparent: true, opacity: 0.55, side: DoubleSide });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot }: { p: V3; r: number; h: number; m: Material; rot?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} />;
}

/** The syringe's scale, 0–100 cm³ (ticks every 1, numbers every 10), drawn along the barrel's front. */
const syringeScale = () =>
  canvasTex('rates-syringe-scale', 2048, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#111';
    g.strokeStyle = '#111';
    for (let c = 0; c <= RATES_SYRINGE; c++) {
      const x = 20 + (c / RATES_SYRINGE) * (w - 40);
      const len = c % 10 === 0 ? 70 : c % 5 === 0 ? 50 : 32;
      g.lineWidth = c % 10 === 0 ? 4 : 2;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, len);
      g.stroke();
      if (c % 10 === 0) {
        g.font = `700 40px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(String(c), x, 112);
      }
    }
  });
const crossTex = () =>
  canvasTex('rates-cross', 512, 512, (g, w, h) => {
    g.fillStyle = '#fbfbf6';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#111';
    // small enough to sit under the flask's base: it can only be seen through the liquid
    g.lineWidth = 30;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(196, 196);
    g.lineTo(316, 316);
    g.moveTo(316, 196);
    g.lineTo(196, 316);
    g.stroke();
  });

function StandModel() {
  return (
    <group>
      <B p={[0, 0.008, 0.02]} s={[0.18, 0.016, 0.24]} m={mat.darkMetal()} />
      <C p={[0, STAND.h / 2, -0.1]} r={0.006} h={STAND.h} m={mat.steel()} />
      <BlobShadow r={0.16} />
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
function WatchFace({ o }: { o: Rates }) {
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
      g.font = `700 60px ui-monospace, Menlo, Consolas, monospace`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
      g.font = `600 18px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(running ? '● RUN' : 'STOP', 10, 18);
    });
  useFrame(() => {
    const w = ref.current.watchRef.current;
    const e = ref.current.elapsed();
    const running = w.start !== null && w.stop === null;
    const text = e.toFixed(e >= 100 ? 1 : 2).padStart(5, '0');
    const key = `${text}|${running}`;
    if (key === last.current) return;
    last.current = key;
    draw(text, running);
  });
  if (!last.current) draw('00.00', false);
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

function SyringeModel({ value, glow }: { value: () => number; glow?: boolean }) {
  const plunger = useRef<Group>(null);
  const scale = useMemo(() => syringeScale(), []);
  useFrame(() => {
    const p = plunger.current;
    if (!p) return;
    const pull = useBench.getState().pull;
    const check = useBench.getState().checkUntil - performance.now();
    const v = pull ?? (check > 0 ? value() + 25 * Math.sin((check / 1200) * Math.PI) : value());
    p.position.x = plungerX(v) - SYR.x1;
  });
  const L = SYR.L;
  return (
    <group>
      {/* barrel */}
      <mesh geometry={cyl} material={mat.glass()} position={[L / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[SYR.r, L + 0.02, SYR.r]} renderOrder={4} />
      <mesh position={[L / 2, SYR.r * 0.6, SYR.r * 0.86]} rotation={[-0.6, 0, 0]}>
        <planeGeometry args={[L * 1.02, 0.012]} />
        <meshBasicMaterial map={scale} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {/* nozzle */}
      <C p={[-0.018, 0, 0]} r={0.004} h={0.03} m={mat.glass()} rot={[0, 0, Math.PI / 2]} />
      {/* plunger: its inner end (the reading) and rod out of the open end */}
      <group ref={plunger}>
        <C p={[0.002, 0, 0]} r={SYR.r * 0.92} h={0.006} m={mat.black()} rot={[0, 0, Math.PI / 2]} />
        <C p={[L / 2 + 0.01, 0, 0]} r={0.005} h={L + 0.01} m={mat.plastic()} rot={[0, 0, Math.PI / 2]} />
        <C p={[L + 0.02, 0, 0]} r={0.02} h={0.006} m={mat.plastic()} rot={[0, 0, Math.PI / 2]} />
      </group>
      {glow && <mesh position={[L / 2, 0, 0]} material={mat.highlight()} rotation={[0, 0, Math.PI / 2]} scale={[SYR.r * 1.4, L + 0.04, SYR.r * 1.4]} geometry={cyl} />}
    </group>
  );
}

/** Bubbles of hydrogen rising from the ribbon at the live rate, and the ribbon shrinking. */
function Fizz({ o, colour }: { o: Rates; colour: 'mg' | 'none' }) {
  const ref = useRef<InstancedMesh>(null);
  const rib = useRef<Mesh>(null);
  const live = useRef(o);
  live.current = o;
  const N = 40;
  const seeds = useMemo(() => Array.from({ length: N }, (_, i) => ({ a: (i * 2.399) % (Math.PI * 2), r: 0.006 + ((i * 37) % 17) / 1000, p: ((i * 13) % 29) / 29 })), []);
  const m4 = useMemo(() => new Vector3(), []);
  const dummy = useMemo(() => new Matrix4(), []);
  useFrame(() => {
    const inst = ref.current;
    const sp = live.current;
    const rate = sp.mgBubbling();
    const left = sp.mgLeft();
    if (rib.current) {
      rib.current.visible = colour === 'mg' && left > 0.001;
      rib.current.scale.set(0.05 * Math.cbrt(left), 0.0012 + 0.0012 * Math.cbrt(left), 0.006);
    }
    if (!inst) return;
    const n = Math.min(N, Math.round(rate * 30));
    const t = performance.now() / 1000;
    for (let i = 0; i < N; i++) {
      const s = seeds[i]!;
      const ph = (t * 0.8 + s.p) % 1;
      m4.set(Math.cos(s.a) * s.r, 0.004 + ph * 0.025, Math.sin(s.a) * s.r);
      dummy.makeScale(i < n ? 0.0018 : 0, i < n ? 0.0018 : 0, i < n ? 0.0018 : 0).setPosition(m4);
      inst.setMatrixAt(i, dummy);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh ref={rib} geometry={box} material={mgMat} position={[0, 0.0035, 0]} />
      <instancedMesh ref={ref} args={[sphere, bubbleMat, N]} />
    </group>
  );
}

/** The delivery tube from the bung up and across to the syringe nozzle. */
function DeliveryTube() {
  const geo = useMemo(() => {
    const pts = [new Vector3(FLASK[0], FLASK_TOP + 0.02, FLASK[2]), new Vector3(FLASK[0], SYR.y, FLASK[2] - 0.02), new Vector3(FLASK[0] + 0.02, SYR.y, SYR.z), new Vector3(SYR.x1 - 0.032, SYR.y, SYR.z)];
    return new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.003, 8, false);
  }, []);
  return <mesh geometry={geo} material={tubeMat} />;
}

/** The thiosulphate mixture: its liquid clouds with sulphur; a disc at the surface hides the cross from above. */
function CloudyLiquid({ o, full }: { o: Rates; full: boolean }) {
  const matRef = useMemo(() => new MeshStandardMaterial({ color: '#efe6b8', roughness: 0.4, transparent: true, opacity: 0.15, depthWrite: false }), []);
  const disc = useMemo(() => new MeshStandardMaterial({ color: '#f1e9c3', roughness: 0.6, transparent: true, opacity: 0, depthWrite: false }), []);
  const live = useRef(o);
  live.current = o;
  const pale = useMemo(() => new Color('#eef4f8'), []);
  const yellow = useMemo(() => new Color('#efe3a6'), []);
  useFrame(() => {
    // the eye still makes out a faint cross until it is fully gone: the cloud hides it as 1 − √visibility
    const vis = live.current.crossVisible();
    const cloud = 1 - Math.sqrt(vis);
    matRef.opacity = 0.12 + 0.5 * cloud;
    matRef.color.copy(pale).lerp(yellow, Math.min(1, cloud * 1.4));
    disc.opacity = Math.min(1, cloud);
  });
  if (!full) return null;
  return (
    <group>
      <mesh geometry={cyl} material={matRef} position={[0, 0.022, 0]} scale={[0.036, 0.04, 0.036]} renderOrder={2} />
      <mesh position={[0, 0.043, 0]} rotation={[-Math.PI / 2, 0, 0]} material={disc} renderOrder={3}>
        <circleGeometry args={[0.037, 32]} />
      </mesh>
    </group>
  );
}

/** The thermometer standing in the flask, its column at the live temperature. */
function StandingThermometer({ o, glow }: { o: Rates; glow?: boolean }) {
  const col = useRef<Mesh>(null);
  const live = useRef(o);
  live.current = o;
  useFrame(() => {
    const h = Math.max(0.002, THERMO.y0 + live.current.thermoNow() * THERMO.perC);
    if (col.current) {
      col.current.scale.y = h;
      col.current.position.y = h / 2;
    }
  });
  const scale = useMemo(
    () =>
      canvasTex('rates-thermo', 64, 1024, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#111';
        g.strokeStyle = '#111';
        // 0.21 m tall: the 0 mark at THERMO.y0, perC m per °C
        for (let c = 0; c <= 110; c++) {
          const y = h - ((THERMO.y0 + c * THERMO.perC) / 0.22) * h;
          g.lineWidth = c % 10 === 0 ? 4 : 2;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(c % 10 === 0 ? 34 : c % 5 === 0 ? 24 : 14, y);
          g.stroke();
          if (c % 10 === 0) {
            g.font = `700 22px ${FONT}`;
            g.fillText(String(c), 36, y + 8);
          }
        }
      }),
    [],
  );
  return (
    <group position={[THERMO.x, 0, THERMO.z]}>
      <C p={[0, 0.11, 0]} r={0.0035} h={0.22} m={mat.glass()} />
      <mesh ref={col} geometry={cyl} material={redMat} scale={[0.0011, 0.05, 0.0011]} />
      <mesh geometry={sphere} material={redMat} position={[0, 0.004, 0]} scale={0.0035} />
      <mesh position={[0.006, 0.11, 0.0036]}>
        <planeGeometry args={[0.012, 0.22]} />
        <meshBasicMaterial map={scale} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {glow && <GlowRing r={0.02} />}
    </group>
  );
}

function BathModel({ on }: { on: boolean }) {
  return (
    <group>
      <B p={[0, 0.06, 0]} s={[0.3, 0.12, 0.22]} m={mat.white()} />
      <mesh geometry={box} material={waterMat} position={[0, 0.115, 0]} scale={[0.27, 0.006, 0.19]} />
      <B p={[0.1, 0.06, 0.111]} s={[0.05, 0.03, 0.004]} m={mat.black()} />
      <mesh geometry={sphere} material={on ? lampOn : mat.black()} position={[-0.1, 0.06, 0.112]} scale={0.006} />
      <BlobShadow r={0.2} />
    </group>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'stand':
      return <StandModel />;
    case 'syringe':
      return (
        <group position={[-0.12, 0.02, 0]}>
          <SyringeModel value={() => 0} />
        </group>
      );
    case 'flask':
      return <ConicalFlask volume={0} colour={null} />;
    case 'stopwatch':
      return <StopwatchModel />;
    case 'cylinder':
    case 'smallCyl':
      return <group scale={id === 'smallCyl' ? 0.7 : 1}><MeasuringCylinder /></group>;
    case 'ribbon':
      return (
        <group>
          <C p={[0, 0.002, 0]} r={0.035} h={0.004} m={mat.glass()} />
          <B p={[0, 0.005, 0]} s={[0.05, 0.0012, 0.004]} m={mgDull} />
        </group>
      );
    case 'sandpaper':
      return <B p={[0, 0.001, 0]} s={[0.09, 0.002, 0.06]} m={sandMat} />;
    case 'balance':
      return <BalanceModel shows="0.000" />;
    case 'beaker':
      return <Beaker />;
    case 'paper':
      return (
        <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.16, 0.16]} />
          <meshStandardMaterial map={crossTex()} roughness={0.9} />
        </mesh>
      );
    case 'thermometer':
      return <Thermometer />;
    case 'bath':
      return <BathModel on={false} />;
    case 'washBottle':
      return <WashBottle />;
    case 'burette':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.3, 0.01, 0]}>
          <Burette level={null} bubble={false} detail={false} />
        </group>
      );
    case 'burner':
      return <BunsenBurner />;
    case 'testTubes':
      return <TestTubeRack />;
  }
}

export function Station({ o, state, scene, interactive, card }: { o: Rates; state: ChemRatesState; scene: SceneState; interactive: boolean; card: string[] }) {
  const mg = scene.task === 'MG';
  const has = (id: ApparatusId) => scene.collected.has(id);
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const m = openMg(state);
  const lastMg = m ?? [...state.mgRuns].reverse().find(Boolean) ?? null;
  const c = openCross(state);
  const full = crossFlaskFull(state);
  const drag = interactive ? dragFor : undefined;
  const swirlRef = useRef<Group>(null);
  useFrame(() => {
    const g = swirlRef.current;
    if (!g) return;
    const left = useBench.getState().swirlUntil - performance.now();
    const a = performance.now() / 70;
    if (left > 0) g.position.set(Math.cos(a) * 0.006, 0, Math.sin(a) * 0.006);
    else g.position.set(0, 0, 0);
  });
  const balanceShows = m?.r.weighed ? o.v.mgMass.toFixed(3) : '0.000';
  const waiting = (mg ? (['stand', 'syringe'] as ApparatusId[]) : (['paper', 'bath'] as ApparatusId[])).filter((id) => has(id) && !placed(id));
  const extras = (['burette', 'burner', 'testTubes', ...(mg ? (['paper', 'thermometer', 'bath', 'smallCyl', 'washBottle'] as ApparatusId[]) : (['syringe', 'stand', 'ribbon', 'sandpaper', 'balance', 'beaker'] as ApparatusId[]))] as ApparatusId[]).filter((id) => has(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={mg ? 'Mg + HCl' : 'Disappearing cross'} lines={card} bookTitle={mg ? 'Rate: Mg + HCl' : 'Disappearing cross'} heads={mg ? ['t/s', 'V₁/cm³', 'V₂/cm³'] : ['V/cm³', 't/s', '1/t / s⁻¹']} />

      {/* the flask (both tasks) */}
      {has('flask') && (
        <Interactive id="flask" label={mg ? 'Conical flask' : 'Conical flask (on the cross)'} bench position={FLASK} labelY={0.2} drag={mg ? undefined : drag}>
          {(active) => (
            <group ref={swirlRef}>
              <ConicalFlask volume={mg ? (m ? 50 : 0) : 0} colour={mg && m ? '#dcecf7' : null} glow={active} />
              {mg && m?.r.dropped && <Fizz o={o} colour="mg" />}
              {!mg && <CloudyLiquid o={o} full={full} />}
              {mg && placed('syringe') && (
                <group>
                  {(!m?.r.dropped || m.r.bungLag !== null) && <C p={[0, FLASK_TOP + 0.008, 0]} r={0.019} h={0.02} m={rubber} />}
                </group>
              )}
            </group>
          )}
        </Interactive>
      )}

      {mg ? (
        <>
          {placed('stand') && (
            <Interactive id="stand" label="Retort stand and clamp" bench position={STAND.base}>
              {(active) => (
                <group>
                  <StandModel />
                  {active && <GlowRing r={0.15} />}
                </group>
              )}
            </Interactive>
          )}
          {placed('syringe') && (
            <>
              <DeliveryTube />
              {/* the clamp arm from the rod to the barrel */}
              <B p={[STAND.rod[0], SYR.y, (STAND.rod[2] + SYR.z) / 2]} s={[0.012, 0.012, SYR.z - STAND.rod[2]]} m={mat.darkMetal()} />
              <B p={[STAND.rod[0], SYR.y, SYR.z]} s={[0.03, 0.03, 0.04]} m={mat.darkMetal()} />
              <Interactive id="syringe" label="Gas syringe — drag the plunger" bench position={[SYR.x1, SYR.y, SYR.z]} labelY={0.05} drag={drag}>
                {(active) => (
                  <group>
                    <SyringeModel value={() => o.syringeNow()} glow={active} />
                    <mesh position={[SYR.L / 2, 0, 0]}>
                      <boxGeometry args={[SYR.L + 0.05, 0.05, 0.05]} />
                      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                    </mesh>
                  </group>
                )}
              </Interactive>
            </>
          )}
          {has('ribbon') && !(lastMg && m?.r.dropped) && (
            <Interactive id="ribbon" label="Magnesium ribbon" bench position={SPOT.ribbon} labelY={0.05}>
              {(active) => (
                <group>
                  <C p={[0, 0.002, 0]} r={0.035} h={0.004} m={mat.glass()} />
                  <Rubbing>
                    <B p={[0, 0.005, 0]} s={[0.05, 0.0012, 0.004]} m={m?.r.cleaned ? mgMat : mgDull} />
                  </Rubbing>
                  {active && <GlowRing r={0.045} />}
                </group>
              )}
            </Interactive>
          )}
          {has('sandpaper') && (
            <Interactive id="sandpaper" label="Sandpaper" bench position={SPOT.sandpaper} labelY={0.04}>
              {(active) => (
                <group>
                  <B p={[0, 0.001, 0]} s={[0.09, 0.002, 0.06]} m={sandMat} />
                  {active && <GlowRing r={0.06} />}
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
          <Interactive id="acid1" label="HCl 1.0 mol dm⁻³" bench position={SPOT.acid1} labelY={0.2}>
            {(active) => <ReagentBottle name="HCl" band="#c62828" sub="1.0 mol dm⁻³" glow={active} />}
          </Interactive>
          <Interactive id="acid2" label="HCl 0.50 mol dm⁻³" bench position={SPOT.acid2} labelY={0.2}>
            {(active) => <ReagentBottle name="HCl" band="#e57373" sub="0.50 mol dm⁻³" glow={active} />}
          </Interactive>
          {has('cylinder') && (
            <Interactive id="cylinder" label="50 cm³ measuring cylinder" bench position={SPOT.cylinder} labelY={0.24}>
              {(active) => <MeasuringCylinder glow={active} />}
            </Interactive>
          )}
          {has('beaker') && (
            <Interactive id="beaker" label="Beaker (waste)" bench position={SPOT.beaker} labelY={0.1}>
              {(active) => <Beaker glow={active} liquid={state.mgRuns.some((r) => r?.done) ? 0.01 : 0} />}
            </Interactive>
          )}
          {has('stopwatch') && (
            <Interactive id="stopwatch" label="Stopwatch (tap: start / stop)" bench position={SPOT.stopwatch} rotation={[0, 0.3, 0]}>
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
          {placed('paper') && (
            <Interactive id="paper" label="Paper with a bold cross" bench position={[FLASK[0], 0, FLASK[2]]} labelY={0.02}>
              {(active) => (
                <group>
                  <mesh position={[0, 0.0008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[0.16, 0.16]} />
                    <meshStandardMaterial map={crossTex()} roughness={0.9} />
                  </mesh>
                  {active && <GlowRing r={0.11} />}
                </group>
              )}
            </Interactive>
          )}
          {has('thermometer') && full && (
            <Interactive id="thermometer" label="Thermometer (in the mixture)" bench position={[0, 0, 0]} labelY={0.25}>
              {(active) => <StandingThermometer o={o} glow={active} />}
            </Interactive>
          )}
          {has('thermometer') && !full && (
            <Interactive id="thermometer" label="Thermometer" bench position={[0.12, 0, 0.3]} labelY={0.05}>
              {(active) => <Thermometer glow={active} />}
            </Interactive>
          )}
          {placed('bath') && (
            <Interactive id="bath" label="Water bath" bench position={BATH} labelY={0.2}>
              {(active) => (
                <group>
                  <BathModel on={!!c?.r.bath} />
                  {active && <GlowRing r={0.2} />}
                </group>
              )}
            </Interactive>
          )}
          <Interactive id="thio" label="Na₂S₂O₃ 0.15 mol dm⁻³" bench position={SPOT.thio} labelY={0.2}>
            {(active) => <ReagentBottle name="Na₂S₂O₃" band="#2a7fc9" sub="0.15 mol dm⁻³" glow={active} />}
          </Interactive>
          <Interactive id="hcl2" label="HCl 2.0 mol dm⁻³" bench position={SPOT.hcl2} labelY={0.2}>
            {(active) => <ReagentBottle name="HCl" band="#c62828" sub="2.0 mol dm⁻³" glow={active} />}
          </Interactive>
          {has('washBottle') && (
            <Interactive id="washBottle" label="Wash bottle (distilled water)" bench position={SPOT.washBottle} labelY={0.22}>
              {(active) => <WashBottle glow={active} />}
            </Interactive>
          )}
          {has('cylinder') && (
            <Interactive id="cylinder" label="50 cm³ measuring cylinder" bench position={SPOT.cylinderX} labelY={0.24}>
              {(active) => <MeasuringCylinder glow={active} />}
            </Interactive>
          )}
          {has('smallCyl') && (
            <Interactive id="smallCyl" label="10 cm³ measuring cylinder" bench position={SPOT.smallCyl} labelY={0.18}>
              {(active) => (
                <group scale={0.7}>
                  <MeasuringCylinder glow={active} />
                </group>
              )}
            </Interactive>
          )}
          {has('stopwatch') && (
            <Interactive id="stopwatch" label="Stopwatch (tap: start / stop)" bench position={SPOT.stopwatchX} rotation={[0, -0.3, 0]}>
              {(active) => (
                <group>
                  <StopwatchModel face={<WatchFace o={o} />} />
                  {active && <GlowRing r={0.06} />}
                </group>
              )}
            </Interactive>
          )}
        </>
      )}
      {waiting.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.waiting[0] + k * 0.2, 0, SPOT.waiting[2]]} labelY={0.12}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              {active && <GlowRing r={0.09} />}
            </group>
          )}
        </Interactive>
      ))}
      {extras.map((id, k) => (
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

/** The ribbon jiggles while it is rubbed with sandpaper. */
function Rubbing({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const left = useBench.getState().rubUntil - performance.now();
    g.position.x = left > 0 ? Math.sin(performance.now() / 30) * 0.006 : 0;
  });
  return <group ref={ref}>{children}</group>;
}

const SLOTS: CupboardSlot[] = [
  { id: 'flask', label: APPARATUS_LABEL.flask, shelf: 1, x: -0.85, model: <ExtraModel id="flask" />, grip: [[0.1, 0.15, 0.1], [0, 0.07, 0]] },
  { id: 'cylinder', label: APPARATUS_LABEL.cylinder, shelf: 1, x: -0.65, model: <ExtraModel id="cylinder" />, grip: [[0.07, 0.22, 0.07], [0, 0.1, 0]] },
  { id: 'smallCyl', label: APPARATUS_LABEL.smallCyl, shelf: 1, x: -0.5, model: <ExtraModel id="smallCyl" />, grip: [[0.06, 0.16, 0.06], [0, 0.07, 0]] },
  { id: 'beaker', label: APPARATUS_LABEL.beaker, shelf: 1, x: -0.35, model: <ExtraModel id="beaker" /> },
  { id: 'washBottle', label: APPARATUS_LABEL.washBottle, shelf: 1, x: -0.18, model: <ExtraModel id="washBottle" />, grip: [[0.08, 0.17, 0.08], [0, 0.08, 0]] },
  { id: 'testTubes', label: APPARATUS_LABEL.testTubes, shelf: 1, x: 0.1, model: <ExtraModel id="testTubes" /> },
  { id: 'stand', label: APPARATUS_LABEL.stand, shelf: 0, x: -0.75, model: <group scale={0.8}><StandModel /></group>, grip: [[0.16, 0.45, 0.2], [0, 0.22, 0]] },
  { id: 'syringe', label: APPARATUS_LABEL.syringe, shelf: 0, x: -0.45, model: <ExtraModel id="syringe" />, grip: [[0.34, 0.05, 0.05], [0.02, 0.02, 0]] },
  { id: 'thermometer', label: APPARATUS_LABEL.thermometer, shelf: 0, x: -0.05, z: 0.1, model: <ExtraModel id="thermometer" />, grip: [[0.3, 0.04, 0.04], [0.14, 0.01, 0]] },
  { id: 'burette', label: APPARATUS_LABEL.burette, shelf: 0, x: 0.3, model: <ExtraModel id="burette" />, grip: [[0.66, 0.05, 0.05], [0.0, 0.01, 0]] },
  { id: 'ribbon', label: APPARATUS_LABEL.ribbon, shelf: 2, x: -0.85, model: <ExtraModel id="ribbon" /> },
  { id: 'sandpaper', label: APPARATUS_LABEL.sandpaper, shelf: 2, x: -0.7, model: <ExtraModel id="sandpaper" /> },
  { id: 'stopwatch', label: APPARATUS_LABEL.stopwatch, shelf: 2, x: -0.55, model: <ExtraModel id="stopwatch" />, grip: [[0.1, 0.06, 0.1], [0, 0.02, 0]] },
  { id: 'paper', label: APPARATUS_LABEL.paper, shelf: 2, x: -0.35, model: <ExtraModel id="paper" />, grip: [[0.16, 0.03, 0.16], [0, 0.01, 0]] },
  { id: 'balance', label: APPARATUS_LABEL.balance, shelf: 2, x: -0.12, model: <ExtraModel id="balance" />, grip: [[0.17, 0.08, 0.2], [0, 0.03, 0]] },
  { id: 'burner', label: APPARATUS_LABEL.burner, shelf: 2, x: 0.12, model: <ExtraModel id="burner" /> },
  { id: 'bath', label: APPARATUS_LABEL.bath, shelf: 0, x: 0.75, model: <group scale={0.8}><ExtraModel id="bath" /></group>, grip: [[0.26, 0.12, 0.2], [0, 0.05, 0]] },
];
export function RatesCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
