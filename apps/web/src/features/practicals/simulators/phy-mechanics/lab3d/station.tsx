import {
  FORCES_PULLEY,
  forceConstruction,
  forceDotAt,
  forceEquilibrium,
  forceLine,
  frictionPull,
  frictionTilt,
  frictionWeight,
  inclineAccel,
  inclineReadings,
  inclineSin,
  inclineTime,
  viscReadings,
  type ForceThread,
  type MechTask,
  type PhyMechanicsState,
  type PhyMechanicsVariant,
} from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, DoubleSide, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, GlowRing } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CardAndBook, CupboardItems, Protractor, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { FONT, liveTex } from '../../phy-common/lab3d/tex';
import { boardSheet, clockShows } from '../actions';
import { runProgress, useBench } from './bench-store';
import { APPARATUS_LABEL, IN_CUPBOARD, NEEDED, PLACEABLE, type ApparatusId, type SceneState } from './scene-state';
import { BLOCK, BOARD, boardPt, CYL, GLY_AT, OIL_AT, PAPER_Y0, PLANK, PULLEY_R, RAMP, RAMP_LEN, SB, SPOT, SURFACE } from './views';

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 24);
const tube = new CylinderGeometry(1, 1, 1, 32, 1, true);
const sphere = new SphereGeometry(1, 20, 14);
const torus = new TorusGeometry(1, 0.18, 8, 28);
const iron = new MeshStandardMaterial({ color: '#8f969c', roughness: 0.35, metalness: 0.8 });
const brass = new MeshStandardMaterial({ color: '#b8893a', roughness: 0.3, metalness: 0.85 });
const threadMat = new MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 });
const bandMat = new MeshStandardMaterial({ color: '#c62828', roughness: 0.6 });
const sbBody = new MeshStandardMaterial({ color: '#cfd8dc', roughness: 0.4, metalness: 0.3 });
const scaleMat = new MeshStandardMaterial({ color: '#f7f3e6', roughness: 0.6 });
const dustMat = new MeshStandardMaterial({ color: '#efeae0', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false });
const clothMat = new MeshStandardMaterial({ color: '#4f83c2', roughness: 0.95 });
const grooveMat = new MeshStandardMaterial({ color: '#7a5a33', roughness: 0.7 });
const watchCase = new MeshStandardMaterial({ color: '#263238', roughness: 0.5 });
const paperMat = new MeshStandardMaterial({ color: '#fbfaf4', roughness: 0.9 });
const gly = liquidMaterial('#e8eef0', 0.42);
const oil = liquidMaterial('#e9b44c', 0.6);
const DEG = Math.PI / 180;

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
/** A thin rod (thread) between two points (station-local). */
const UP = new Vector3(0, 1, 0);
const DIR = new Vector3();
function Rod({ a, b, r = 0.0007, m = threadMat }: { a: V3; b: V3; r?: number; m?: Material }) {
  const ref = useRef<Mesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1e-6;
    mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    mesh.scale.set(r, len, r);
    mesh.quaternion.setFromUnitVectors(UP, DIR.set(dx / len, dy / len, dz / len));
  });
  return <mesh ref={ref} geometry={cyl} material={m} />;
}

/** The stop-clock with its live display: the time now (during a run it counts), else what it shows. */
function StopClockModel({ text }: { text: () => { t: number; running: boolean } }) {
  const live = useMemo(() => liveTex(256, 128), []);
  const last = useRef('');
  useEffect(() => () => live.texture.dispose(), [live]);
  useFrame(() => {
    const { t, running } = text();
    const label = `${t.toFixed(2).padStart(5, '0')}|${running}`;
    if (label === last.current) return;
    last.current = label;
    live.redraw((g, w, h) => {
      g.fillStyle = '#c9d7b8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#16200f';
      g.font = '700 64px ui-monospace, Menlo, Consolas, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t.toFixed(2).padStart(5, '0'), w / 2, h / 2 + 6);
      g.font = `600 18px ${FONT}`;
      g.textAlign = 'left';
      g.fillText(running ? '● RUN' : 'STOP', 10, 18);
    });
  });
  return (
    <group>
      <B p={[0, 0.025, 0]} s={[0.075, 0.05, 0.03]} m={watchCase} />
      <mesh position={[0, 0.03, 0.0152]}>
        <planeGeometry args={[0.062, 0.031]} />
        <meshBasicMaterial map={live.texture} toneMapped={false} />
      </mesh>
      <mesh geometry={cyl} material={mat.red()} position={[0.025, 0.054, 0]} scale={[0.006, 0.008, 0.006]} />
      <mesh geometry={cyl} material={mat.steel()} position={[-0.025, 0.054, 0]} scale={[0.006, 0.008, 0.006]} />
      <BlobShadow r={0.05} />
    </group>
  );
}

// ================================================================== FRICTION

/** The spring balance lying along +x: hook at the origin; the pointer shows `force` (N). */
function SpringBalanceModel({ force, vertical }: { force: () => number; vertical?: boolean }) {
  const ptr = useRef<Mesh>(null);
  useFrame(() => {
    if (ptr.current) ptr.current.position.x = 0.03 + Math.min(10, Math.max(-0.5, force())) * 0.013;
  });
  return (
    <group rotation={vertical ? [0, 0, Math.PI / 2] : undefined}>
      <mesh geometry={cyl} material={iron} position={[0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.0015, 0.024, 0.0015]} />
      <mesh geometry={cyl} material={sbBody} position={[0.024 + SB.len / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.012, SB.len, 0.012]} />
      <B p={[0.024 + 0.03 + 0.065, 0.0125, 0]} s={[0.14, 0.001, 0.012]} m={scaleMat} />
      <mesh ref={ptr} geometry={box} material={mat.red()} position={[0.03, 0.014, 0]} scale={[0.002, 0.002, 0.014]} />
      <mesh geometry={torus} material={iron} position={[0.03 + SB.len, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.008} />
    </group>
  );
}
function BlockModel({ load, glow }: { load: number; glow?: boolean }) {
  return (
    <group>
      <B p={[BLOCK.l / 2, BLOCK.h / 2, 0]} s={[BLOCK.l, BLOCK.h, BLOCK.w]} m={mat.woodDark()} />
      <mesh geometry={torus} material={iron} position={[BLOCK.l + 0.006, BLOCK.h / 2, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.006} />
      {Array.from({ length: load }, (_, k) => (
        <mesh key={k} geometry={cyl} material={iron} position={[BLOCK.l / 2, BLOCK.h + 0.005 + k * 0.011, 0]} scale={[0.026, 0.01, 0.026]} />
      ))}
      {glow && <GlowRing r={0.08} />}
    </group>
  );
}

function FrictionRig({ v, s, scene, interactive }: { v: PhyMechanicsVariant; s: PhyMechanicsState; scene: SceneState; interactive: boolean }) {
  const plank = useRef<Group>(null);
  const block = useRef<Group>(null);
  const sbal = useRef<Group>(null);
  const force = useRef(0);
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const lastTiltAngle = s.tilts.length ? frictionTilt(v, s.tilts.length - 1, s.tilts[s.tilts.length - 1]!) : 0;
  useFrame(() => {
    const run = useBench.getState().run;
    const { p, busy } = runProgress(run);
    let angle = 0;
    let slide = 0;
    let lift = 0;
    let F = 0;
    if (run && busy && run.kind === 'pull') {
      const pl = s.pulls[run.k];
      if (pl) {
        const r = frictionPull(v, run.k, pl);
        F = p < 0.72 ? (p / 0.72) * r.limit : r.sliding;
        slide = p < 0.72 ? 0 : (p - 0.72) * 0.4;
      }
    } else if (run && busy && run.kind === 'tilt') {
      const t = s.tilts[run.k];
      const th = t ? frictionTilt(v, run.k, t) : 0;
      angle = p < 0.75 ? (p / 0.75) * th : th;
      slide = p < 0.75 ? 0 : -(((p - 0.75) / 0.25) ** 2) * BLOCK.at;
    } else if (run && busy && run.kind === 'weigh') {
      lift = Math.sin(p * Math.PI) * 0.12;
      F = frictionWeight(v, s.load) * Math.min(1, p * 3) + (s.zeroed ? 0 : v.sbZero);
    } else if (s.tilt && s.tilts.length) {
      angle = lastTiltAngle;
      slide = -BLOCK.at;
    }
    if (!busy || run?.kind !== 'weigh') F = F || (s.zeroed ? 0 : v.sbZero);
    force.current = F;
    if (plank.current) plank.current.rotation.z = angle * DEG;
    if (block.current) block.current.position.set(BLOCK.at + slide, PLANK.t + lift, 0);
    if (sbal.current) {
      sbal.current.visible = !s.tilt;
      sbal.current.position.set(BLOCK.at + slide + BLOCK.l + SB.gap + (F > 0 ? F * 0.0025 : 0), PLANK.t + BLOCK.h / 2 + lift, 0);
    }
  });
  const sel = (id: string) => (interactive ? id : id);
  return (
    <group>
      {placed('plank') && (
        <group position={[PLANK.x0, 0, PLANK.z]}>
          <group ref={plank}>
            <Interactive id={sel('plank')} label="Smooth wooden plank" bench labelY={0.06}>
              {(active) => (
                <group>
                  <B p={[PLANK.len / 2, PLANK.t / 2, 0]} s={[PLANK.len, PLANK.t, PLANK.w]} m={mat.wood()} />
                  {!s.wiped && <B p={[PLANK.len / 2, PLANK.t + 0.0006, 0]} s={[PLANK.len * 0.9, 0.0008, PLANK.w * 0.9]} m={dustMat} />}
                  {active && <GlowRing r={0.4} />}
                </group>
              )}
            </Interactive>
            {placed('block') && (
              <group ref={block} position={[BLOCK.at, PLANK.t, 0]}>
                <Interactive id="block" label={`Wooden block (${s.load} × 100 g on it)`} bench labelY={0.12}>
                  {(active) => <BlockModel load={s.load} glow={active} />}
                </Interactive>
              </group>
            )}
            {placed('sbalance') && (
              <group ref={sbal}>
                <Rod a={[-SB.gap, 0, 0]} b={[0, 0, 0]} />
                <Interactive id="sbalance" label={interactive ? 'Spring balance — drag it to the right to pull' : 'Spring balance'} bench labelY={0.06} drag={interactive ? () => 'pull' : undefined}>
                  {(active) => (
                    <group>
                      <SpringBalanceModel force={() => force.current} />
                      <mesh geometry={box} position={[0.12, 0, 0]} scale={[0.26, 0.04, 0.05]}>
                        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                      </mesh>
                      {active && <GlowRing r={0.12} y={-0.012} />}
                    </group>
                  )}
                </Interactive>
              </group>
            )}
          </group>
          {placed('plank') && s.tilt && (
            <B p={[PLANK.len, 0.004, 0]} s={[0.05, 0.008, PLANK.w + 0.04]} m={mat.darkMetal()} />
          )}
        </group>
      )}
      {scene.collected.has('protractor') && (
        <group position={[PLANK.x0 + 0.003, 0.001, PLANK.z + PLANK.w / 2 + 0.012]}>
          <Interactive id="protractor" label="Protractor (at the hinge end)" bench labelY={0.1}>
            {(active) => <Protractor r={0.08} down={false} glow={active} />}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ================================================================== VISCOSITY

function CylinderModel({ liquid, glow }: { liquid: 'glycerine' | 'oil'; glow?: boolean }) {
  return (
    <group>
      <mesh geometry={cyl} material={mat.glass()} position={[0, CYL.base / 2, 0]} scale={[CYL.r + 0.012, CYL.base, CYL.r + 0.012]} />
      <mesh geometry={tube} material={mat.glass()} position={[0, CYL.base + CYL.h / 2, 0]} scale={[CYL.r, CYL.h, CYL.r]} />
      <mesh geometry={cyl} material={liquid === 'oil' ? oil : gly} position={[0, CYL.base + CYL.liquid / 2, 0]} scale={[CYL.r - 0.001, CYL.liquid, CYL.r - 0.001]} />
      <BlobShadow r={0.06} />
      {glow && <GlowRing r={0.07} />}
    </group>
  );
}

function ViscRig({ v, s, scene, interactive }: { v: PhyMechanicsVariant; s: PhyMechanicsState; scene: SceneState; interactive: boolean }) {
  const ball = useRef<Mesh>(null);
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const readings = useMemo(() => viscReadings(v, s.drops), [v, s.drops]);
  useFrame(() => {
    const run = useBench.getState().run;
    const { p, busy } = runProgress(run);
    const m = ball.current;
    if (!m) return;
    if (run && busy && run.kind === 'drop') {
      const d = s.drops[run.k];
      if (!d) return;
      const at = d.liquid === 'oil' ? OIL_AT : GLY_AT;
      const depth = p * Math.min(36, d.bot + 2);
      const rad = v.balls[d.ball]! / 2000;
      m.visible = true;
      m.scale.setScalar(Math.max(rad * 2.5, 0.004));
      m.position.set(at[0] + (d.centre ? 0 : CYL.r - 0.012), SURFACE - depth / 100, at[2]);
    } else m.visible = false;
  });
  const clock = () => {
    const run = useBench.getState().run;
    const { p, busy } = runProgress(run);
    if (run && busy && run.kind === 'drop') {
      const d = s.drops[run.k];
      if (d) {
        const prev = d.reset ? 0 : (readings[run.k - 1] ?? 0);
        const fin = readings[run.k]!;
        const depth = p * Math.min(36, d.bot + 2);
        const f = Math.max(0, Math.min(1, (depth - d.top) / Math.max(0.5, d.bot - d.top)));
        return { t: prev + (fin - prev) * f, running: f > 0 && f < 1 };
      }
    }
    return { t: clockShows(v, s), running: false };
  };
  const bandDrag = (w: 'top' | 'bot') => (interactive ? () => `band-${w}` : undefined);
  return (
    <group>
      {placed('cylinder') && (
        <group position={GLY_AT}>
          <Interactive id="cylinder" label="Glycerine in a tall cylinder" bench labelY={0.5}>
            {(active) => <CylinderModel liquid="glycerine" glow={active} />}
          </Interactive>
          {placed('bands') &&
            (['top', 'bot'] as const).map((w) => (
              <group key={w} position={[0, SURFACE - s[w] / 100, 0]}>
                <Interactive id={`band-${w}`} label={`${w === 'top' ? 'Upper' : 'Lower'} rubber band (${s[w].toFixed(1)} cm down)${interactive ? ' — drag it up or down' : ''}`} bench labelY={0.04} drag={bandDrag(w)}>
                  {(active) => (
                    <group>
                      <mesh geometry={torus} material={bandMat} rotation={[Math.PI / 2, 0, 0]} scale={[CYL.r + 0.0015, CYL.r + 0.0015, 0.012]} />
                      <mesh geometry={cyl} position={[0, 0, 0]} scale={[CYL.r + 0.01, 0.02, CYL.r + 0.01]}>
                        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                      </mesh>
                      {active && <GlowRing r={0.05} />}
                    </group>
                  )}
                </Interactive>
              </group>
            ))}
        </group>
      )}
      {placed('rule') && (
        <group position={[GLY_AT[0] - CYL.r - 0.028, SURFACE, GLY_AT[2] + 0.012]}>
          <Interactive id="rule" label="Metre rule (its zero level with the surface)" bench labelY={0.04}>
            {(active) => <Rule cm={37} vertical glow={active} />}
          </Interactive>
        </group>
      )}
      {placed('oilcyl') && (
        <group position={OIL_AT}>
          <Interactive id="oilcyl" label="Palm oil in a tall cylinder" bench labelY={0.5}>
            {(active) => (
              <group>
                <CylinderModel liquid="oil" glow={active} />
                {placed('bands') &&
                  (['top', 'bot'] as const).map((w) => <mesh key={w} geometry={torus} material={bandMat} position={[0, SURFACE - s[w] / 100, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[CYL.r + 0.0015, CYL.r + 0.0015, 0.012]} />)}
              </group>
            )}
          </Interactive>
        </group>
      )}
      <mesh ref={ball} geometry={sphere} material={mat.steel()} visible={false} />
      {scene.collected.has('stopclock') && (
        <group position={[0.36, 0, 0.12]} rotation={[0, -0.35, 0]}>
          <Interactive id="stopclock" label="Stop-clock" bench labelY={0.1}>
            {(active) => (
              <group>
                <StopClockModel text={clock} />
                {active && <GlowRing r={0.06} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ================================================================== INCLINE

function InclineRig({ v, s, scene, interactive }: { v: PhyMechanicsVariant; s: PhyMechanicsState; scene: SceneState; interactive: boolean }) {
  const ball = useRef<Group>(null);
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const sinT = placed('woodblocks') ? inclineSin(v, s.blocks) : 0;
  const th = Math.asin(sinT);
  const readings = useMemo(() => inclineReadings(v, s.runs), [v, s.runs]);
  const R = 0.0125;
  const along = (d: number): V3 => [RAMP.x0 + RAMP_LEN - (RAMP_LEN - d) * Math.cos(th), (RAMP_LEN - d) * Math.sin(th) + RAMP.t, RAMP.z];
  useFrame(() => {
    const run = useBench.getState().run;
    const { busy } = runProgress(run);
    const g = ball.current;
    if (!g) return;
    let d = 0;
    if (run && busy && run.kind === 'roll') {
      const r = s.runs[run.k];
      if (r) {
        const tt = inclineTime(v, r);
        const t = (performance.now() - run.at) / 1000;
        const u = r.push ? v.push : 0;
        d = t >= tt ? r.stop / 100 - R : Math.min(r.stop / 100 - R, u * t + 0.5 * inclineAccel(v, r.blocks) * t * t);
      }
    } else if (s.runs.length) d = s.runs[s.runs.length - 1]!.stop / 100 - R;
    const p = along(d + R);
    g.position.set(p[0], p[1] + R, p[2]);
    g.rotation.z = -d / R;
  });
  const clock = () => {
    const run = useBench.getState().run;
    const { busy } = runProgress(run);
    if (run && busy && run.kind === 'roll') {
      const r = s.runs[run.k];
      if (r) {
        const prev = r.reset ? 0 : (readings[run.k - 1] ?? 0);
        const fin = readings[run.k]!;
        const t = (performance.now() - run.at) / 1000;
        return { t: Math.min(fin, prev + t), running: prev + t < fin };
      }
    }
    return { t: clockShows(v, s), running: false };
  };
  const stopP = along(s.stop / 100);
  return (
    <group>
      {placed('ramp') && (
        <group position={[RAMP.x0 + RAMP_LEN, 0, RAMP.z]} rotation={[0, 0, -th]}>
          <Interactive id="ramp" label="Grooved plank (2.00 m)" bench labelY={0.06}>
            {(active) => (
              <group>
                <B p={[-RAMP_LEN / 2, RAMP.t / 2, 0]} s={[RAMP_LEN, RAMP.t, RAMP.w]} m={mat.wood()} />
                <B p={[-RAMP_LEN / 2, RAMP.t + 0.0004, 0]} s={[RAMP_LEN, 0.001, 0.012]} m={grooveMat} />
                {[0, 40, 80, 120, 160].map((m) => (
                  <B key={m} p={[-RAMP_LEN + m / 100, RAMP.t + 0.0008, 0.024]} s={[0.003, 0.001, 0.026]} m={m ? mat.tickBlack() : mat.red()} />
                ))}
                {active && <GlowRing r={0.5} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('woodblocks') && (
        <group position={[RAMP.x0 + 0.04, 0, RAMP.z]}>
          <Interactive id="woodblocks" label={`Wooden blocks (${s.blocks})`} bench labelY={0.2}>
            {(active) => (
              <group>
                {Array.from({ length: s.blocks }, (_, k) => (
                  <B key={k} p={[0, (k + 0.5) * (v.blockH / 100), 0]} s={[0.07, v.blockH / 100 - 0.002, 0.1]} m={k % 2 ? mat.wood() : mat.woodDark()} />
                ))}
                {s.blocks === 0 && <B p={[0, 0.01, 0]} s={[0.07, 0.02, 0.1]} m={mat.woodDark()} />}
                {active && <GlowRing r={0.08} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {placed('stopblock') && (
        <group position={[stopP[0], stopP[1], stopP[2]]} rotation={[0, 0, -th]}>
          <Interactive id="stopblock" label={`Stopping block (${(s.stop / 100).toFixed(2)} m)${interactive ? ' — drag it along' : ''}`} bench labelY={0.08} drag={interactive ? () => 'slide-stop' : undefined}>
            {(active) => (
              <group>
                <B p={[0.015, 0.02, 0]} s={[0.03, 0.04, 0.07]} m={mat.darkMetal()} />
                {active && <GlowRing r={0.05} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {scene.collected.has('steelball') && (
        <group ref={ball} position={along(R)}>
          <Interactive id="steelball" label="Steel ball" bench labelY={0.05}>
            {(active) => (
              <group>
                <mesh geometry={sphere} material={mat.steel()} scale={R} />
                {active && <GlowRing r={0.03} y={-R} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
      {scene.collected.has('stopclock') && (
        <group position={[0.15, 0, 0.12]} rotation={[0, -0.2, 0]}>
          <Interactive id="stopclock" label="Stop-clock" bench labelY={0.1}>
            {(active) => (
              <group>
                <StopClockModel text={clock} />
                {active && <GlowRing r={0.06} />}
              </group>
            )}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ================================================================== FORCES

/** The sheet drawn on a canvas (dots; lines and the construction once it is off). */
function drawSheet(g: CanvasRenderingContext2D, w: number, h: number, v: PhyMechanicsVariant, s: PhyMechanicsState, i: number | null) {
  const k = w / 46;
  const X = (x: number) => (x + 23) * k;
  const Y = (y: number) => h - y * k;
  g.fillStyle = '#fbfaf4';
  g.fillRect(0, 0, w, h);
  const set = i === null ? null : s.sets[i];
  if (!set) return;
  g.fillStyle = '#111';
  set.dots.forEach((d, j) => {
    const p = forceDotAt(v, set, i!, d, j);
    g.beginPath();
    g.arc(X(p.x), Y(p.y), 3, 0, Math.PI * 2);
    g.fill();
  });
  if (set.off) {
    g.strokeStyle = '#33363a';
    g.lineWidth = 1.5;
    for (const th of ['P', 'Q', 'W'] as ForceThread[]) {
      const l = forceLine(v, set, i!, th);
      if (!l) continue;
      g.beginPath();
      g.moveTo(X(l.p.x - l.u.x * 8), Y(l.p.y - l.u.y * 8));
      g.lineTo(X(l.p.x + l.u.x * 30), Y(l.p.y + l.u.y * 30));
      g.stroke();
    }
    const row = s.rows.find((r) => r.key === i);
    const con = set.built ? forceConstruction(v, set, i!, Number(row?.c.OA) || null, Number(row?.c.OB) || null) : null;
    if (con) {
      const seg = (a: { x: number; y: number }, b: { x: number; y: number }, c: string, lw: number, dash: number[] = []) => {
        g.strokeStyle = c;
        g.lineWidth = lw;
        g.setLineDash(dash);
        g.beginPath();
        g.moveTo(X(a.x), Y(a.y));
        g.lineTo(X(b.x), Y(b.y));
        g.stroke();
        g.setLineDash([]);
      };
      seg(con.O, con.A, '#1d4ed8', 3);
      seg(con.O, con.B, '#1d4ed8', 3);
      seg(con.A, con.C, '#1d4ed8', 1.5, [8, 6]);
      seg(con.B, con.C, '#1d4ed8', 1.5, [8, 6]);
      seg(con.O, con.C, '#b91c1c', 3);
      g.fillStyle = '#1d4ed8';
      g.font = `700 22px ${FONT}`;
      for (const [n, p] of [
        ['O', con.O],
        ['A', con.A],
        ['B', con.B],
        ['C', con.C],
      ] as const)
        g.fillText(n, X(p.x) + 6, Y(p.y) - 6);
    }
  }
}
function SheetModel({ v, s, i, w, h }: { v: PhyMechanicsVariant; s: PhyMechanicsState; i: number | null; w: number; h: number }) {
  const live = useMemo(() => liveTex(920, 720), []);
  useEffect(() => () => live.texture.dispose(), [live]);
  useEffect(() => {
    live.redraw((g, cw, ch) => drawSheet(g, cw, ch, v, s, i));
  }, [live, v, s, i]);
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={live.texture} roughness={0.9} side={DoubleSide} />
    </mesh>
  );
}
function HangerModel({ n }: { n: number }) {
  return (
    <group>
      <mesh geometry={cyl} material={iron} position={[0, -0.03, 0]} scale={[0.0015, 0.06, 0.0015]} />
      <mesh geometry={cyl} material={iron} position={[0, -0.062, 0]} scale={[0.014, 0.004, 0.014]} />
      {Array.from({ length: n }, (_, k) => (
        <mesh key={k} geometry={cyl} material={k % 2 ? brass : iron} position={[0, -0.058 + (k + 0.5) * 0.0055, 0]} scale={[0.012, 0.005, 0.012]} />
      ))}
    </group>
  );
}

function ForcesRig({ v, s, scene }: { v: PhyMechanicsVariant; s: PhyMechanicsState; scene: SceneState }) {
  const placed = (id: ApparatusId) => scene.placed.has(id);
  const sh = boardSheet(s);
  const eq = forceEquilibrium(v, s.masses, s.tapped, sh ? sh.i : s.sets.length);
  const knot = eq.ok ? eq.knot : { x: 0, y: 3 };
  const K = boardPt(knot.x, knot.y);
  const pul = [-1, 1].map((side) => boardPt(side * FORCES_PULLEY.x, FORCES_PULLEY.y));
  const offIdx = s.sets.map((x, j) => (x.off ? j : -1)).filter((j) => j >= 0);
  const lastOff = offIdx[offIdx.length - 1] ?? null;
  const sheetShown = useBench((b) => b.sheet);
  const benchSheet = sheetShown !== null && s.sets[sheetShown]?.off ? sheetShown : lastOff;
  const loads: Record<ForceThread, number> = s.masses;
  const strung = placed('thread');
  const hung = placed('hangers');
  const hangerTop: Record<ForceThread, V3> = {
    P: [pul[0]![0] - PULLEY_R, Math.max(0.12, pul[0]![1] - 0.28), pul[0]![2]],
    Q: [pul[1]![0] + PULLEY_R, Math.max(0.12, pul[1]![1] - 0.32), pul[1]![2]],
    W: [K[0], Math.max(0.08, K[1] - 0.08), K[2] + 0.004],
  };
  return (
    <group>
      {placed('board') && (
        <group>
          <Interactive id="board" label="Drawing board with two pulleys" bench labelY={BOARD.h + 0.12}>
            {(active) => (
              <group>
                <B p={[0, BOARD.y0 + BOARD.h / 2, BOARD.z]} s={[BOARD.w, BOARD.h, BOARD.t]} m={mat.wood()} />
                {[-1, 1].map((x) => (
                  <B key={x} p={[x * (BOARD.w / 2 - 0.04), 0.015, BOARD.z]} s={[0.05, 0.03, 0.22]} m={mat.woodDark()} />
                ))}
                {[-1, 1].map((x) => (
                  <B key={`l${x}`} p={[x * (BOARD.w / 2 - 0.04), BOARD.y0 / 2 + 0.015, BOARD.z]} s={[0.03, BOARD.y0, 0.03]} m={mat.woodDark()} />
                ))}
                {active && <GlowRing r={0.3} />}
              </group>
            )}
          </Interactive>
          {pul.map((p, k) => (
            <group key={k} position={p}>
              <mesh geometry={cyl} material={brass} position={[0, -PULLEY_R, 0.012]} rotation={[Math.PI / 2, 0, 0]} scale={[PULLEY_R, 0.012, PULLEY_R]} />
              <B p={[k ? 0.02 : -0.02, -PULLEY_R, -0.002]} s={[0.05, 0.012, 0.008]} m={mat.darkMetal()} />
            </group>
          ))}
        </group>
      )}
      {placed('paper') && (
        <group position={[0, PAPER_Y0 + 0.18, BOARD.z + BOARD.t / 2 + 0.002]}>
          <Interactive id="paper" label="Drawing paper" bench labelY={0.25}>
            {() => <SheetModel v={v} s={s} i={sh ? sh.i : null} w={0.46} h={0.36} />}
          </Interactive>
        </group>
      )}
      {strung && placed('board') && (
        <group>
          <>
              <Rod a={K} b={[pul[0]![0], pul[0]![1], pul[0]![2] + 0.012]} />
              <Rod a={K} b={[pul[1]![0], pul[1]![1], pul[1]![2] + 0.012]} />
              {hung && (
                <>
                  <Rod a={[pul[0]![0] - PULLEY_R, pul[0]![1] - PULLEY_R, pul[0]![2] + 0.012]} b={[hangerTop.P[0], hangerTop.P[1], hangerTop.P[2] + 0.012]} />
                  <Rod a={[pul[1]![0] + PULLEY_R, pul[1]![1] - PULLEY_R, pul[1]![2] + 0.012]} b={[hangerTop.Q[0], hangerTop.Q[1], hangerTop.Q[2] + 0.012]} />
                  <Rod a={K} b={hangerTop.W} />
                </>
              )}
          </>
          <group position={K}>
            <Interactive id="knot" label={eq.ok ? 'The knot' : `The knot — ${eq.why}`} bench labelY={0.04}>
              {(active) => (
                <group>
                  <mesh geometry={torus} material={brass} scale={0.006} />
                  <mesh geometry={sphere} scale={0.02}>
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                  {active && <GlowRing r={0.03} />}
                </group>
              )}
            </Interactive>
          </group>
        </group>
      )}
      {strung &&
        hung &&
        (['P', 'Q', 'W'] as ForceThread[]).map((th) => (
          <group key={th} position={[hangerTop[th][0], hangerTop[th][1], hangerTop[th][2] + 0.012]}>
            <Interactive id={`hanger-${th}`} label={`Hanger ${th} (${50 * (loads[th] + 1)} g)`} bench labelY={0.04}>
              {(active) => (
                <group>
                  <HangerModel n={loads[th]} />
                  <mesh geometry={box} position={[0, -0.04, 0]} scale={[0.04, 0.08, 0.04]}>
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                  </mesh>
                  {active && <GlowRing r={0.025} y={-0.065} />}
                </group>
              )}
            </Interactive>
          </group>
        ))}
      {benchSheet !== null && (
        <group position={[0.42, 0.002, 0.12]} rotation={[-Math.PI / 2, 0, 0.1]}>
          <Interactive id="paper" label={`Your drawing (sheet ${benchSheet + 1})`} bench labelY={0.02}>
            {() => (
              <group>
                <SheetModel v={v} s={s} i={benchSheet} w={0.3} h={0.235} />
                <mesh material={paperMat} position={[0, 0, -0.001]}>
                  <planeGeometry args={[0.305, 0.24]} />
                </mesh>
              </group>
            )}
          </Interactive>
        </group>
      )}
    </group>
  );
}

// ================================================================== the bench

function ExtraModel({ id }: { id: ApparatusId }): ReactNode {
  switch (id) {
    case 'slotted':
      return (
        <group>
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k} geometry={cyl} material={iron} position={[0, 0.005 + k * 0.011, 0]} scale={[0.026, 0.01, 0.026]} />
          ))}
        </group>
      );
    case 'cloth':
      return <B p={[0, 0.006, 0]} s={[0.12, 0.012, 0.09]} m={clothMat} />;
    case 'balls':
      return (
        <group>
          <mesh geometry={cyl} material={mat.glass()} position={[0, 0.006, 0]} scale={[0.045, 0.012, 0.045]} />
          {[0, 1, 2, 3, 4].map((b) => (
            <mesh key={b} geometry={sphere} material={mat.steel()} position={[-0.026 + b * 0.013, 0.004, 0]} scale={0.001 + b * 0.00025} />
          ))}
        </group>
      );
    case 'micrometer':
      return (
        <group>
          <B p={[0, 0.03, 0]} s={[0.006, 0.05, 0.012]} m={mat.darkMetal()} />
          <B p={[0.025, 0.006, 0]} s={[0.05, 0.008, 0.012]} m={mat.darkMetal()} />
          <mesh geometry={cyl} material={mat.steel()} position={[0.035, 0.05, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.008, 0.06, 0.008]} />
        </group>
      );
    case 'magnet':
      return <B p={[0, 0.01, 0]} s={[0.06, 0.02, 0.02]} m={mat.red()} />;
    case 'stopclock':
      return <StopClockModel text={() => ({ t: 0, running: false })} />;
    case 'pencil':
      return (
        <group>
          <mesh geometry={cyl} material={mat.green()} position={[0, 0.004, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.004, 0.16, 0.004]} />
          <B p={[0, 0.002, 0.04]} s={[0.3, 0.003, 0.03]} m={mat.plastic()} />
        </group>
      );
    case 'spring':
      return (
        <group>
          {Array.from({ length: 10 }, (_, k) => (
            <mesh key={k} geometry={torus} material={mat.steel()} position={[0, 0.006 + k * 0.005, 0]} rotation={[Math.PI / 2, 0, 0]} scale={0.011} />
          ))}
        </group>
      );
    case 'pendulum':
    case 'steelball':
      return <mesh geometry={sphere} material={id === 'pendulum' ? brass : mat.steel()} position={[0, 0.0125, 0]} scale={0.0125} />;
    case 'pulleys':
      return <mesh geometry={cyl} material={brass} position={[0, 0.006, 0]} scale={[0.022, 0.012, 0.022]} />;
    case 'hangers':
      return (
        <group position={[0, 0.07, 0]}>
          <HangerModel n={3} />
        </group>
      );
    case 'thread':
      return <mesh geometry={cyl} material={threadMat} position={[0, 0.012, 0]} scale={[0.012, 0.024, 0.012]} />;
    case 'paper':
      return <B p={[0, 0.002, 0]} s={[0.21, 0.004, 0.297]} m={paperMat} />;
    case 'block':
      return <BlockModel load={0} />;
    case 'sbalance':
      return (
        <group position={[-0.1, 0.012, 0]}>
          <SpringBalanceModel force={() => 0} />
        </group>
      );
    case 'protractor':
      return (
        <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
          <Protractor r={0.06} down={false} />
        </group>
      );
    case 'rule':
      return (
        <group position={[-0.2, 0, 0]} scale={[0.4, 1, 1]}>
          <Rule cm={100} />
        </group>
      );
    case 'bands':
      return <mesh geometry={torus} material={bandMat} position={[0, 0.004, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.03, 0.03, 0.01]} />;
    case 'stopblock':
      return <B p={[0, 0.02, 0]} s={[0.03, 0.04, 0.07]} m={mat.darkMetal()} />;
    case 'woodblocks':
      return <B p={[0, 0.025, 0]} s={[0.07, 0.05, 0.1]} m={mat.woodDark()} />;
    default:
      return <B p={[0, 0.02, 0]} s={[0.12, 0.04, 0.08]} m={mat.wood()} />;
  }
}
/** The long things wait at the back of the bench, everything else at the front. */
const LONG: Partial<Record<ApparatusId, V3>> = {
  plank: [0, 0, -0.33],
  ramp: [0, 0, -0.38],
  cylinder: [-0.5, 0, -0.32],
  oilcyl: [-0.38, 0, -0.32],
  board: [0, 0, -0.36],
};
function WaitingLong({ id }: { id: ApparatusId }) {
  if (id === 'plank') return <B p={[0, 0.01, 0]} s={[PLANK.len, PLANK.t, PLANK.w]} m={mat.wood()} />;
  if (id === 'ramp') return <B p={[0, 0.011, 0]} s={[RAMP_LEN, RAMP.t, RAMP.w]} m={mat.wood()} />;
  if (id === 'board') return <B p={[0, 0.01, 0]} s={[BOARD.w, 0.018, 0.2]} m={mat.wood()} />;
  return <CylinderModel liquid={id === 'oilcyl' ? 'oil' : 'glycerine'} />;
}

/** Everything on the student's bench. */
export function Station({ v, state, scene, interactive, card }: { v: PhyMechanicsVariant; state: PhyMechanicsState; scene: SceneState; interactive: boolean; card: string[] }) {
  const t: MechTask = state.task ?? 'FRICTION';
  const rig = new Set<ApparatusId>([...PLACEABLE[t], ...(t === 'FRICTION' ? (['protractor'] as ApparatusId[]) : []), ...(t === 'VISCOSITY' || t === 'INCLINE' ? (['stopclock'] as ApparatusId[]) : []), ...(t === 'INCLINE' ? (['steelball'] as ApparatusId[]) : [])]);
  const loose = [...scene.collected].filter((id) => !(rig.has(id) && (scene.placed.has(id) || !PLACEABLE[t].includes(id))));
  const smalls = loose.filter((id) => !LONG[id]);
  const longs = loose.filter((id) => LONG[id]);
  const heads: Record<MechTask, string[]> = { FRICTION: ['R/N', 'F₁/N', 'F₂/N', 'F/N'], VISCOSITY: ['d/mm', 'r²/mm²', 't/s', 'v/cm s⁻¹'], INCLINE: ['s/m', 't/s', 't²/s²'], FORCES: ['P', 'Q', 'W', 'OC', 'R'] };
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={t === 'FRICTION' ? 'Static friction' : t === 'VISCOSITY' ? 'Terminal velocity' : t === 'INCLINE' ? 'Uniform acceleration' : 'Parallelogram of forces'} lines={card} bookTitle={t === 'FORCES' ? 'Forces' : 'Readings'} heads={heads[t]} />
      {t === 'FRICTION' && <FrictionRig v={v} s={state} scene={scene} interactive={interactive} />}
      {t === 'VISCOSITY' && <ViscRig v={v} s={state} scene={scene} interactive={interactive} />}
      {t === 'INCLINE' && <InclineRig v={v} s={state} scene={scene} interactive={interactive} />}
      {t === 'FORCES' && <ForcesRig v={v} s={state} scene={scene} />}
      {longs.map((id) => (
        <group key={id} position={LONG[id]}>
          <Interactive id={id} label={APPARATUS_LABEL[id]} bench labelY={0.12}>
            {(active) => (
              <group>
                <WaitingLong id={id} />
                {active && <GlowRing r={0.2} />}
              </group>
            )}
          </Interactive>
        </group>
      ))}
      {smalls.map((id, k) => (
        <Interactive key={id} id={id} label={APPARATUS_LABEL[id]} bench position={[SPOT.waiting[0] + (k % 5) * 0.15 + (NEEDED[t].includes(id) ? 0 : 0.9), 0, SPOT.waiting[2] + Math.floor(k / 5) * 0.12]} labelY={0.1}>
          {(active) => (
            <group>
              <ExtraModel id={id} />
              <BlobShadow r={0.05} />
              {active && <GlowRing r={0.06} />}
            </group>
          )}
        </Interactive>
      ))}
    </group>
  );
}

/** The cupboard's shelves: what is still there. */
const SHELF_OF: Partial<Record<ApparatusId, 0 | 1 | 2>> = { plank: 0, ramp: 0, board: 0, cylinder: 0, oilcyl: 0, rule: 0 };
export function MechCupboard({ scene }: { scene: SceneState }) {
  const slots = useMemo<CupboardSlot[]>(() => {
    const ids = IN_CUPBOARD[scene.task];
    const rows: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    return ids.map((id) => {
      const shelf = SHELF_OF[id] ?? (rows[1]! <= rows[2]! ? 1 : 2);
      const x = -0.9 + rows[shelf]! * (shelf === 0 ? 0.42 : 0.24);
      rows[shelf]!++;
      const big = id === 'cylinder' || id === 'oilcyl';
      const model =
        id === 'plank' || id === 'ramp' || id === 'rule' ? (
          <B p={[0, 0.01, 0]} s={[0.38, 0.02, 0.1]} m={mat.wood()} />
        ) : id === 'board' ? (
          <B p={[0, 0.15, -0.05]} s={[0.36, 0.3, 0.018]} m={mat.wood()} />
        ) : big ? (
          <group scale={0.7}>
            <CylinderModel liquid={id === 'oilcyl' ? 'oil' : 'glycerine'} />
          </group>
        ) : (
          <ExtraModel id={id} />
        );
      return { id, label: APPARATUS_LABEL[id], shelf, x, model, grip: [[big ? 0.08 : 0.2, big ? 0.32 : 0.08, 0.1], [0, big ? 0.15 : 0.03, 0]] as [V3, V3] };
    });
  }, [scene.task]);
  return <CupboardItems slots={slots} collected={scene.collected} />;
}
