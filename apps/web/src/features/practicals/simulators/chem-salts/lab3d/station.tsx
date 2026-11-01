import { CHROM_DYE_INFO, CHROM_PAPER, PPT_INFO, chromAboveLine, chromFront, chromSpots, mpDissolved, type ChemSaltsState } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, DoubleSide, MeshStandardMaterial, type Group, type Material, type Mesh } from 'three';
import { BlobShadow, Burette, ConicalFlask, DropperBottle, Funnel, GlowRing, MeasuringCylinder, ReagentBottle, TestTubeRack, WashBottle } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { Burner, Spatula } from '../../chem-qualitative/lab3d/models';
import { CardAndBook, CupboardItems, Rule, type CupboardSlot } from '../../phy-common/lab3d/common';
import { liveTex } from '../../phy-common/lab3d/tex';
import { ANHYDROUS, CRYSTAL_BLUE, CUO_BLACK, mpBalance, pptBalance, solView, type Salts } from '../actions';
import { LANE_X, PAPER_W } from '../parts';
import { useBench } from './bench-store';
import { dragFor } from './drag';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { GAUZE_Y, PAPER, SPOT, TANK, type V3 } from './views';

/**
 * The salts bench, built for the lesson's task. Soluble salt: the beaker of
 * warm acid (turning blue as the CuO dissolves, the black excess at the
 * bottom), the evaporating dish (the solution shrinking, blue crystals
 * growing as it cools, or a white crust if it goes dry), the funnel and
 * flask, the balance. Insoluble salt: the beaker clouding with precipitate,
 * the funnel, the oven. Chromatography: the tank with its solvent and lid,
 * the paper strip (the front climbing it, the spots separating), pencil, pen,
 * ruler, capillaries and sample vials. Recrystallisation: the beaker on the
 * gauze, the kettle, funnel, ice bath and the oil bath with its thermometer
 * and capillary.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 20);
const cylOpen = new CylinderGeometry(1, 1, 1, 24, 1, true);
const glass = new MeshStandardMaterial({ color: '#dfeaf0', roughness: 0.05, transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false });
const oilMat = new MeshStandardMaterial({ color: '#e3c25a', roughness: 0.1, transparent: true, opacity: 0.7 });
const iceMat = new MeshStandardMaterial({ color: '#f2f8fb', roughness: 0.2, transparent: true, opacity: 0.85 });
const redMat = new MeshStandardMaterial({ color: '#c62828' });
const paperMat = new MeshStandardMaterial({ color: '#f7f5ee', roughness: 0.9 });
const ovenMat = new MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.6 });
const glowMat = new MeshStandardMaterial({ color: '#ffb54d', emissive: '#ff8a1f', emissiveIntensity: 0.8 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot, open }: { p: V3; r: number; h: number; m: Material; rot?: V3; open?: boolean }) {
  return <mesh geometry={open ? cylOpen : cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} renderOrder={open ? 4 : 0} />;
}

/** A tripod with a wire gauze on top. */
function TripodGauze() {
  return (
    <group>
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2;
        return <C key={k} p={[Math.cos(a) * 0.055, GAUZE_Y / 2, Math.sin(a) * 0.055]} rot={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]} r={0.0035} h={GAUZE_Y} m={mat.darkMetal()} />;
      })}
      <mesh position={[0, GAUZE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mat.metal()}>
        <planeGeometry args={[0.15, 0.15]} />
      </mesh>
      <mesh position={[0, GAUZE_Y + 0.0006, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.04, 24]} />
        <meshStandardMaterial color="#e8e2d8" roughness={0.9} />
      </mesh>
    </group>
  );
}
/** A 100 cm³ beaker: liquid (fill 0–1), a powder at the bottom, an optional white solid. */
function GlassBeaker({ colour, fill, powder = 0, solid, stir }: { colour: string | null; fill: number; powder?: number; solid?: string | null; stir?: boolean }) {
  const rod = useRef<Group>(null);
  useFrame(() => {
    if (!rod.current) return;
    const left = useBench.getState().stirUntil - performance.now();
    rod.current.visible = !!stir && left > 0;
    const a = performance.now() / 90;
    rod.current.position.set(Math.cos(a) * 0.012, 0, Math.sin(a) * 0.012);
  });
  const h = 0.085 * Math.max(0.02, fill);
  return (
    <group>
      <BlobShadow r={0.05} />
      {colour && fill > 0 && <mesh position={[0, 0.003 + h / 2, 0]} scale={[0.031, h, 0.031]} geometry={cyl} material={liquidMaterial(colour, 0.78)} renderOrder={2} />}
      {powder > 0.02 && <C p={[0, 0.004, 0]} r={Math.min(0.028, 0.012 + powder * 0.006)} h={0.004} m={colourMaterial(CUO_BLACK)} />}
      {solid && <C p={[0, 0.005, 0]} r={0.022} h={0.006} m={colourMaterial(solid)} />}
      <C p={[0, 0.045, 0]} r={0.033} h={0.09} m={glass} open />
      <group ref={rod} visible={false}>
        <C p={[0, 0.07, 0]} r={0.0025} h={0.14} m={glass} rot={[0.15, 0, 0.1]} />
      </group>
    </group>
  );
}
/** The evaporating dish: solution, blue crystals, or a white crust. */
function EvapDish({ colour, fill, crystals, dry }: { colour: string | null; fill: number; crystals: number; dry: boolean }) {
  const n = Math.min(18, Math.ceil(crystals * 18));
  return (
    <group>
      <BlobShadow r={0.05} />
      <mesh position={[0, 0.03, 0]} rotation={[Math.PI, 0, 0]} material={mat.white()}>
        <sphereGeometry args={[0.045, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
      </mesh>
      {colour && fill > 0.01 && (
        <mesh position={[0, 0.006 + 0.012 * fill, 0]} rotation={[-Math.PI / 2, 0, 0]} material={liquidMaterial(colour, 0.85)}>
          <circleGeometry args={[0.018 + 0.016 * fill, 24]} />
        </mesh>
      )}
      {Array.from({ length: n }, (_, k) => (
        <B key={k} p={[Math.cos(k * 2.3) * 0.012 * (1 + (k % 3)) * 0.6, 0.008, Math.sin(k * 2.3) * 0.012 * (1 + (k % 3)) * 0.6]} s={[0.006, 0.003, 0.004]} r={[0, k, 0]} m={colourMaterial(CRYSTAL_BLUE)} />
      ))}
      {dry && <C p={[0, 0.008, 0]} r={0.026} h={0.004} m={colourMaterial(ANHYDROUS)} />}
    </group>
  );
}
/** A filter funnel with its paper in a conical flask; residue on the paper, filtrate in the flask. */
function FunnelFlask({ residue, filtrate }: { residue: string | null; filtrate: string | null }) {
  return (
    <group>
      <ConicalFlask volume={filtrate ? 40 : 0} colour={filtrate} />
      <group position={[0, 0.15, 0]}>
        <Funnel />
        <mesh position={[0, 0.045, 0]} rotation={[Math.PI, 0, 0]} material={paperMat}>
          <coneGeometry args={[0.03, 0.036, 16, 1, true]} />
        </mesh>
        {residue && <C p={[0, 0.032, 0]} r={0.012} h={0.006} m={colourMaterial(residue)} />}
      </group>
    </group>
  );
}
function BalanceModel({ shows }: { shows: string }) {
  const tex = useMemo(() => liveTex(256, 96), []);
  useEffect(() => {
    tex.redraw((g, w, h) => {
      g.fillStyle = '#9fc59a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#10200d';
      g.font = '700 54px ui-monospace, Menlo, monospace';
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
function Oven({ on }: { on: boolean }) {
  return (
    <group>
      <B p={[0, 0.11, 0]} s={[0.3, 0.22, 0.26]} m={ovenMat} />
      <B p={[0, 0.12, 0.131]} s={[0.2, 0.12, 0.004]} m={on ? glowMat : mat.black()} />
      <C p={[0.12, 0.19, 0.133]} r={0.008} h={0.006} rot={[Math.PI / 2, 0, 0]} m={mat.black()} />
      <BlobShadow r={0.2} />
    </group>
  );
}
/** Small beaker of capillary tubes. */
function Capillaries() {
  return (
    <group>
      <C p={[0, 0.025, 0]} r={0.016} h={0.05} m={glass} open />
      {[-0.006, 0, 0.006].map((x, k) => (
        <C key={k} p={[x, 0.05, 0.002 * k]} r={0.0012} h={0.08} rot={[0, 0, x * 8]} m={glass} />
      ))}
      <BlobShadow r={0.025} />
    </group>
  );
}
function IceBath() {
  return (
    <group>
      <C p={[0, 0.035, 0]} r={0.065} h={0.07} m={mat.white()} open />
      <C p={[0, 0.003, 0]} r={0.065} h={0.006} m={mat.white()} />
      {Array.from({ length: 9 }, (_, k) => (
        <B key={k} p={[Math.cos(k * 1.9) * 0.035, 0.055 + (k % 2) * 0.006, Math.sin(k * 1.9) * 0.035]} s={[0.018, 0.016, 0.018]} r={[k, k * 0.5, 0]} m={iceMat} />
      ))}
      <BlobShadow r={0.08} />
    </group>
  );
}
function Kettle() {
  return (
    <group>
      <C p={[0, 0.06, 0]} r={0.045} h={0.12} m={mat.steel()} />
      <C p={[0.05, 0.08, 0]} r={0.006} h={0.06} rot={[0, 0, -0.8]} m={mat.steel()} />
      <B p={[-0.02, 0.13, 0]} s={[0.06, 0.012, 0.012]} m={mat.black()} />
      <BlobShadow r={0.06} />
    </group>
  );
}
/** The oil bath beaker with its thermometer (red column at the live temperature) and, while a run is open, the capillary fastened beside it. */
function OilBath({ x, capillary }: { x: Salts; capillary: boolean }) {
  const col = useRef<Mesh>(null);
  const sample = useRef<Mesh>(null);
  useFrame(() => {
    const T = x.bathT();
    const h = 0.02 + Math.max(0, Math.min(1, T / 200)) * 0.2;
    if (col.current) {
      col.current.scale.set(0.0011, h, 0.0011);
      col.current.position.y = 0.01 + h / 2;
    }
    const run = x.openRun();
    if (sample.current && run) {
      const f = x.meltFraction(run);
      (sample.current.material as MeshStandardMaterial).opacity = 1 - f * 0.7;
    }
  });
  return (
    <group>
      <BlobShadow r={0.05} />
      <C p={[0, 0.03, 0]} r={0.031} h={0.06} m={oilMat} />
      <C p={[0, 0.045, 0]} r={0.033} h={0.09} m={glass} open />
      <group position={[0, 0.01, 0]}>
        <C p={[0, 0.14, 0]} r={0.0035} h={0.28} m={glass} />
        <mesh ref={col} geometry={cyl} material={redMat} position={[0, 0.05, 0]} />
        {capillary && (
          <group position={[0.006, 0, 0.002]}>
            <C p={[0, 0.05, 0]} r={0.0012} h={0.08} m={glass} />
            <mesh ref={sample} geometry={cyl} position={[0, 0.012, 0]} scale={[0.0011, 0.004, 0.0011]}>
              <meshStandardMaterial color="#ffffff" transparent opacity={1} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

/** The paper strip as a live canvas texture (baseline, spots, wet region, front mark). */
function PaperStrip({ x, s, standing }: { x: Salts; s: ChemSaltsState; standing: boolean }) {
  const tex = useMemo(() => liveTex(120, 300), []);
  const last = useRef('');
  useFrame(() => {
    const w = s.chrom;
    const t = x.devSeconds();
    const run = w.inTank || w.developed !== null;
    const front = run ? chromFront(x.v, w, t) : 0;
    const key = `${JSON.stringify(w)}|${front.toFixed(2)}`;
    if (key === last.current) return;
    last.current = key;
    const px = 20;
    tex.redraw((g, W, H) => {
      const y = (cm: number) => H - cm * px;
      g.fillStyle = '#fbfaf4';
      g.fillRect(0, 0, W, H);
      if (run && !w.dried) {
        g.fillStyle = 'rgba(160,200,226,0.45)';
        g.fillRect(0, y(Math.min(front, CHROM_PAPER)), W, Math.min(front, CHROM_PAPER) * px);
      }
      if (w.line && w.lineAt !== null) {
        g.strokeStyle = w.line === 'PENCIL' ? '#8a8a8a' : '#1d1d2a';
        g.lineWidth = w.line === 'PENCIL' ? 1.5 : 2.5;
        g.beginPath();
        g.moveTo(4, y(w.lineAt));
        g.lineTo(W - 4, y(w.lineAt));
        g.stroke();
      }
      const blob = (cx: number, cy: number, r: number, c: string, a = 0.85) => {
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grd.addColorStop(0, c);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = a;
        g.fillStyle = grd;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      };
      if (!run && w.lineAt !== null)
        for (const p of w.spots.filter((q) => q.n > 0)) blob(LANE_X[p.lane] * px, y(w.lineAt), (0.18 + (p.wet ? 0.16 : 0)) * px, p.lane === 'INK' ? '#262330' : CHROM_DYE_INFO[x.v.chrom[p.lane]].hex);
      if (run && chromAboveLine(w) && w.depth !== null) blob(W / 2, y(w.depth + 0.3), 1.6 * px, '#4a3b52', 0.25);
      if (run) for (const p of chromSpots(x.v, w, t)) blob(LANE_X[p.lane] * px, y(w.lineAt! + p.dist), (p.r + 0.08) * px, CHROM_DYE_INFO[p.dye].hex);
      if (w.frontMarked) {
        g.strokeStyle = '#777';
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(2, y(front));
        g.lineTo(W - 2, y(front));
        g.stroke();
        g.setLineDash([]);
      }
    });
  });
  void PAPER_W;
  return (
    <mesh rotation={standing ? [0, 0, 0] : [-Math.PI / 2, 0, 0]} position={standing ? [0, PAPER.h / 2, 0] : [0, 0.0015, 0]}>
      <planeGeometry args={[PAPER.w, PAPER.h]} />
      <meshStandardMaterial map={tex.texture} roughness={0.9} side={DoubleSide} />
    </mesh>
  );
}
function Tank({ x, s }: { x: Salts; s: ChemSaltsState }) {
  const w = s.chrom;
  return (
    <group>
      <BlobShadow r={0.07} />
      {w.solvent && w.depth !== null && <C p={[0, (w.depth / 100) / 2 + 0.002, 0]} r={TANK.r - 0.003} h={w.depth / 100} m={liquidMaterial(w.solvent === 'WATER' ? '#b9d6ea' : '#e5eef4', 0.6)} />}
      <C p={[0, TANK.h / 2, 0]} r={TANK.r} h={TANK.h} m={glass} open />
      <C p={[0, 0.002, 0]} r={TANK.r} h={0.004} m={glass} />
      {w.covered && <C p={[0, TANK.h + 0.003, 0]} r={TANK.r + 0.006} h={0.006} m={glass} />}
      {w.inTank && (
        <group position={[0, 0.003, 0]}>
          <PaperStrip x={x} s={s} standing />
          <C p={[0, PAPER.h + 0.01, 0]} r={0.002} h={0.13} rot={[0, 0, Math.PI / 2]} m={mat.steel()} />
        </group>
      )}
    </group>
  );
}

function Pens() {
  return (
    <group>
      <C p={[0, 0.004, 0]} r={0.004} h={0.15} rot={[0, 0, Math.PI / 2]} m={colourMaterial('#e8b923')} />
      <C p={[0, 0.005, 0.035]} r={0.005} h={0.14} rot={[0, 0, Math.PI / 2]} m={colourMaterial('#1d3f8c')} />
    </group>
  );
}

function ExtraModel({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'beaker':
      return <GlassBeaker colour={null} fill={0} />;
    case 'cylinder':
      return <MeasuringCylinder />;
    case 'rod':
      return <C p={[0, 0.003, 0]} r={0.0025} h={0.18} rot={[0, 0, Math.PI / 2]} m={glass} />;
    case 'spatula':
      return <Spatula />;
    case 'funnel':
      return <FunnelFlask residue={null} filtrate={null} />;
    case 'dish':
      return <EvapDish colour={null} fill={0} crystals={0} dry={false} />;
    case 'filterPaper':
      return <C p={[0, 0.003, 0]} r={0.05} h={0.005} m={paperMat} />;
    case 'burner':
      return <Burner lit={false} />;
    case 'tripod':
      return <TripodGauze />;
    case 'balance':
      return <BalanceModel shows="0.00" />;
    case 'washBottle':
      return <WashBottle />;
    case 'oven':
      return (
        <group scale={0.6}>
          <Oven on={false} />
        </group>
      );
    case 'tank':
      return (
        <group>
          <C p={[0, TANK.h / 2, 0]} r={TANK.r} h={TANK.h} m={glass} open />
          <C p={[0, 0.002, 0]} r={TANK.r} h={0.004} m={glass} />
        </group>
      );
    case 'paper':
      return <B p={[0, 0.002, 0]} s={[PAPER.w, 0.002, PAPER.h]} m={paperMat} />;
    case 'ruler':
      return (
        <group scale={0.5}>
          <Rule cm={30} />
        </group>
      );
    case 'capillary':
      return <Capillaries />;
    case 'iceBath':
      return <IceBath />;
    case 'thermometer':
      return <C p={[0, 0.004, 0]} r={0.0035} h={0.28} rot={[0, 0, Math.PI / 2]} m={glass} />;
    case 'oilBath':
      return (
        <group>
          <C p={[0, 0.03, 0]} r={0.031} h={0.06} m={oilMat} />
          <C p={[0, 0.045, 0]} r={0.033} h={0.09} m={glass} open />
        </group>
      );
    case 'testTubes':
      return <TestTubeRack />;
    case 'burette':
      return (
        <group rotation={[0, 0, Math.PI / 2]}>
          <Burette level={null} bubble={false} detail={false} />
        </group>
      );
  }
}

/** Wraps an object on the bench: selectable, with a glow ring when hovered. */
function Obj({ id, label, at, labelY = 0.15, r = 0.06, drag, children }: { id: string; label: string; at: V3; labelY?: number; r?: number; drag?: (id: string) => string | null; children: ReactNode }) {
  return (
    <Interactive id={id} label={label} bench position={at} labelY={labelY} drag={drag as never}>
      {(active) => (
        <group>
          {children}
          {active && <GlowRing r={r} />}
        </group>
      )}
    </Interactive>
  );
}

export function Station({ x, s, scene, interactive, card }: { x: Salts; s: ChemSaltsState; scene: SceneState; interactive: boolean; card: string[] }) {
  const task = scene.task;
  const has = (id: ApparatusId) => scene.collected.has(id);
  const drag = interactive ? dragFor : undefined;
  const b = x.bench;
  const onGauze: V3 = [SPOT.tripod[0], GAUZE_Y, SPOT.tripod[2]];
  const lit = b.flame !== 'OFF' && has('burner');
  const extras = (['testTubes', 'burette', 'oven', 'dish', 'spatula', 'cylinder', 'iceBath', 'oilBath', 'thermometer', 'tank', 'paper', 'ruler', 'capillary', 'burner', 'tripod', 'filterPaper', 'beaker', 'funnel', 'balance', 'washBottle', 'rod'] as ApparatusId[]).filter((id) => has(id) && !USED[task].includes(id));
  const heads: Record<typeof task, string[]> = { SOL: ['V acid / cm³', 'mass / g', 'yield / %'], PPT: ['paper / g', 'paper+ppt / g', 'ppt / g'], CHROM: ['spot', 'd / cm', 'Rf'], MP: ['sample', 'start / °C', 'end / °C'] };
  // ---- task-specific
  let bench: ReactNode = null;
  if (task === 'SOL') {
    const sv = solView(x, s);
    const w = s.sol;
    const beaker = <GlassBeaker colour={sv.beakerColour} fill={w.acid ? Math.min(1, w.acid / 90) : 0} powder={sv.undissolved} stir />;
    const dish = <EvapDish colour={sv.dishColour} fill={sv.dishFill} crystals={w.filteredAt !== null ? 0 : sv.crystalFrac} dry={w.dry} />;
    bench = (
      <>
        <Obj id="bottle:acid" label={`Dilute H₂SO₄ (${x.v.sol.acidConc.toFixed(2)} mol dm⁻³)`} at={SPOT.bottle1} labelY={0.18}>
          <ReagentBottle name="H₂SO₄" band="#c62828" sub={`${x.v.sol.acidConc.toFixed(2)} M dilute`} />
        </Obj>
        <Obj id="jar:cuo" label="Copper(II) oxide — drag a spatula of it to the beaker" at={SPOT.jar} labelY={0.16} drag={drag}>
          <ReagentBottle name="CuO" band="#222" sub="black powder" liquid={CUO_BLACK} r={0.035} h={0.09} />
        </Obj>
        {has('beaker') && (
          <Obj id="beaker" label="Beaker — drag in circles to stir" at={b.gauze === 'beaker' && has('tripod') ? onGauze : SPOT.beaker} drag={drag}>
            {beaker}
          </Obj>
        )}
        {has('dish') && (
          <Obj id="dish" label="Evaporating dish" at={b.gauze === 'dish' && has('tripod') ? onGauze : SPOT.dish}>
            {dish}
          </Obj>
        )}
        {has('funnel') && (
          <Obj id="funnel" label="Filter funnel and flask" at={SPOT.funnel} labelY={0.25}>
            <FunnelFlask residue={w.filtered ? CUO_BLACK : null} filtrate={null} />
          </Obj>
        )}
        {has('cylinder') && (
          <Obj id="cylinder" label={APPARATUS_LABEL.cylinder} at={SPOT.cylinder} labelY={0.24}>
            <MeasuringCylinder />
          </Obj>
        )}
        {has('spatula') && (
          <Obj id="spatula" label="Spatula" at={SPOT.spatula} labelY={0.04}>
            <Spatula />
          </Obj>
        )}
        {has('filterPaper') && (
          <Obj id="filterPaper" label="Filter papers (drying)" at={SPOT.filterPaper} labelY={0.04}>
            <ExtraModel id="filterPaper" />
            {w.drying === 'PAPER' && <EvapDish colour={null} fill={0} crystals={sv.product.look === 'NONE' ? 0 : 0.6} dry={false} />}
          </Obj>
        )}
        {has('balance') && (
          <Obj id="balance" label="Top-pan balance" at={SPOT.balance} labelY={0.1} r={0.12}>
            <BalanceModel shows={w.weighed ? sv.product.mass.toFixed(2) : '0.00'} />
          </Obj>
        )}
      </>
    );
  } else if (task === 'PPT') {
    const w = s.ppt;
    const i = PPT_INFO[x.v.ppt.pair];
    const shows = pptBalance(x, s);
    bench = (
      <>
        <Obj id="bottle:cat" label={`${i.cation.formula} solution`} at={SPOT.bottle1} labelY={0.18}>
          <ReagentBottle name={i.cation.formula} band="#2e7d32" sub={`${x.v.ppt.catConc.toFixed(2)} M`} />
        </Obj>
        <Obj id="bottle:an" label={`${i.anion.formula} solution`} at={SPOT.bottle2} labelY={0.18}>
          <ReagentBottle name={i.anion.formula} band="#1565c0" sub={`${x.v.ppt.anConc.toFixed(2)} M`} />
        </Obj>
        {has('beaker') && (
          <Obj id="beaker" label="Beaker — drag in circles to stir" at={SPOT.beaker} drag={drag}>
            <GlassBeaker colour={w.filtered ? null : w.mixed ? i.product.colour : w.cat ? '#e9f0f4' : null} fill={w.filtered ? 0 : ((w.cat ?? 0) + (w.an ?? 0)) / 75} stir />
          </Obj>
        )}
        {has('funnel') && (
          <Obj id="funnel" label="Filter funnel, paper and flask" at={SPOT.funnel} labelY={0.25}>
            <FunnelFlask residue={w.filtered && !w.dried ? i.product.colour : null} filtrate={w.filtered ? '#eef3f6' : null} />
          </Obj>
        )}
        {has('cylinder') && (
          <Obj id="cylinder" label={APPARATUS_LABEL.cylinder} at={SPOT.cylinder} labelY={0.24}>
            <MeasuringCylinder />
          </Obj>
        )}
        {has('oven') && (
          <Obj id="oven" label="Drying oven (about 100 °C)" at={SPOT.oven} labelY={0.28} r={0.2}>
            <Oven on={w.dried > 0} />
          </Obj>
        )}
        {has('balance') && (
          <Obj id="balance" label="Top-pan balance" at={SPOT.balance} labelY={0.1} r={0.12}>
            <BalanceModel shows={(shows ?? (w.paper && !w.filtered ? x.v.ppt.paper : 0)).toFixed(2)} />
          </Obj>
        )}
      </>
    );
  } else if (task === 'CHROM') {
    const w = s.chrom;
    bench = (
      <>
        {(['INK', 'A', 'B'] as const).map((l, k) => (
          <Obj key={l} id={`vial:${l}`} label={l === 'INK' ? 'Black ink' : `Pure dye ${l}`} at={[SPOT.vials[0] + k * 0.07, 0, SPOT.vials[2]]} labelY={0.1} r={0.03}>
            <DropperBottle name={l === 'INK' ? 'Ink' : l} colour={l === 'INK' ? '#262330' : CHROM_DYE_INFO[x.v.chrom[l]].hex} />
          </Obj>
        ))}
        {(['WATER', 'ETHANOL'] as const).map((sv, k) => (
          <Obj key={sv} id={`solvent:${sv}`} label={sv === 'WATER' ? 'Distilled water (solvent)' : 'Ethanol (flammable)'} at={[SPOT.solvents[0] + k * 0.13, 0, SPOT.solvents[2]]} labelY={0.18}>
            <ReagentBottle name={sv === 'WATER' ? 'Water' : 'Ethanol'} band={sv === 'WATER' ? '#1565c0' : '#e65100'} sub={sv === 'WATER' ? 'distilled' : 'flammable'} />
          </Obj>
        ))}
        <Obj id="pencil" label="Pencil" at={SPOT.pens} labelY={0.04} r={0.04}>
          <C p={[0, 0.004, 0]} r={0.004} h={0.15} rot={[0, 0, Math.PI / 2]} m={colourMaterial('#e8b923')} />
        </Obj>
        <Obj id="pen" label="Ink pen" at={[SPOT.pens[0], 0, SPOT.pens[2] - 0.045]} labelY={0.04} r={0.04}>
          <C p={[0, 0.005, 0]} r={0.005} h={0.14} rot={[0, 0, Math.PI / 2]} m={colourMaterial('#1d3f8c')} />
        </Obj>
        {has('tank') && (
          <Obj id="tank" label="Chromatography tank" at={SPOT.tank} labelY={0.25} r={0.08}>
            <Tank x={x} s={s} />
          </Obj>
        )}
        {has('paper') && !w.inTank && (
          <Obj id="paper" label="Chromatography paper — drag it into the tank" at={SPOT.paper} labelY={0.05} r={0.09} drag={drag}>
            <PaperStrip x={x} s={s} standing={false} />
          </Obj>
        )}
        {has('ruler') && (
          <Obj id="ruler" label="30 cm ruler" at={SPOT.ruler} labelY={0.03} r={0.08}>
            <group position={[-0.15, 0, 0]}>
              <Rule cm={30} />
            </group>
          </Obj>
        )}
        {has('capillary') && (
          <Obj id="capillary" label="Capillary tubes (for spotting)" at={SPOT.capillary} labelY={0.1} r={0.03}>
            <Capillaries />
          </Obj>
        )}
      </>
    );
  } else {
    const w = s.mp;
    const open = x.openRun();
    const beaker = <GlassBeaker colour={w.water && !w.hotFiltered ? '#eaf1f5' : null} fill={Math.min(1, w.water / 110)} solid={!w.hotFiltered ? (mpDissolved(x.v, w) ? '#3b3734' : '#f4f2ec') : null} stir />;
    const shows = w.weighedPure ? mpBalance(x, s) : w.weighedImpure ? x.v.mp.impure : null;
    bench = (
      <>
        <Obj id="jar:benzoic" label="Impure benzoic acid" at={SPOT.jar} labelY={0.16}>
          <ReagentBottle name="Benzoic acid" band="#6d4c41" sub="impure" liquid="#efece4" r={0.035} h={0.09} />
        </Obj>
        <Obj id="hotWater" label="Kettle of boiling water" at={SPOT.hotWater} labelY={0.17}>
          <Kettle />
        </Obj>
        {has('beaker') && (
          <Obj id="beaker" label="Beaker" at={b.gauze === 'beaker' && has('tripod') ? onGauze : SPOT.beaker}>
            {beaker}
          </Obj>
        )}
        {has('funnel') && (
          <Obj id="funnel" label="Funnel and flask" at={SPOT.funnel} labelY={0.25}>
            <FunnelFlask residue={w.hotFiltered && !w.collected ? '#2b2826' : w.collected ? '#ffffff' : null} filtrate={w.hotFiltered && !w.collected ? (w.cooling ? '#f6f6f2' : '#eef3f6') : null} />
          </Obj>
        )}
        {has('iceBath') && (
          <Obj id="iceBath" label="Ice bath" at={SPOT.iceBath} labelY={0.1} r={0.09}>
            <IceBath />
          </Obj>
        )}
        {has('filterPaper') && (
          <Obj id="filterPaper" label="Filter papers (drying)" at={SPOT.filterPaper} labelY={0.04}>
            <ExtraModel id="filterPaper" />
            {w.collected && <C p={[0, 0.007, 0]} r={0.02} h={0.004} m={colourMaterial('#ffffff')} />}
          </Obj>
        )}
        {has('capillary') && (
          <Obj id="capillary" label="Capillary tubes" at={SPOT.capillary} labelY={0.1} r={0.03}>
            <Capillaries />
          </Obj>
        )}
        {has('oilBath') && has('thermometer') && (
          <Obj id="oilBath" label="Oil bath with thermometer" at={b.gauze === 'oil' && has('tripod') ? onGauze : SPOT.oil} labelY={0.32}>
            <OilBath x={x} capillary={!!open} />
          </Obj>
        )}
        {has('balance') && (
          <Obj id="balance" label="Top-pan balance" at={SPOT.balance} labelY={0.1} r={0.12}>
            <BalanceModel shows={(shows ?? 0).toFixed(2)} />
          </Obj>
        )}
      </>
    );
  }
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <CardAndBook cardAt={SPOT.card} bookAt={SPOT.book} title={TITLE[task]} lines={card} bookTitle={TITLE[task]} heads={heads[task]} />
      {(task === 'SOL' || task === 'MP') && has('tripod') && (
        <Obj id="burner" label={lit ? `Bunsen burner (${b.flame === 'HIGH' ? 'high' : 'low'} flame)` : 'Tripod, gauze and Bunsen burner'} at={SPOT.tripod} labelY={0.08} r={0.09}>
          <TripodGauze />
          {has('burner') && (
            <group scale={[1, b.flame === 'HIGH' ? 1.08 : 1, 1]}>
              <Burner lit={lit} />
            </group>
          )}
        </Obj>
      )}
      {bench}
      {has('washBottle') && USED[task].includes('washBottle') && (
        <Obj id="washBottle" label="Wash bottle (distilled water)" at={SPOT.washBottle} labelY={0.22}>
          <WashBottle />
        </Obj>
      )}
      {has('rod') && USED[task].includes('rod') && task !== 'SOL' && (
        <Obj id="rod" label="Glass rod" at={SPOT.rod} labelY={0.03}>
          <ExtraModel id="rod" />
        </Obj>
      )}
      {has('rod') && task === 'SOL' && (
        <Obj id="rod" label="Glass rod (cold) — for the crystallisation test" at={SPOT.rod} labelY={0.03}>
          <ExtraModel id="rod" />
        </Obj>
      )}
      {extras.map((id, k) => (
        <Obj key={id} id={id} label={APPARATUS_LABEL[id]} at={[SPOT.extras[0] + (k % 2) * 0.18, 0, SPOT.extras[2] - Math.floor(k / 2) * 0.18]} labelY={0.2}>
          <ExtraModel id={id} />
        </Obj>
      ))}
    </group>
  );
}
const TITLE = { SOL: 'CuSO₄·5H₂O crystals', PPT: 'Insoluble salt', CHROM: 'Chromatography', MP: 'Recrystallisation' } as const;
/** What each task's station draws itself (everything else collected goes to the end of the bench). */
const USED: Record<string, ApparatusId[]> = {
  SOL: ['beaker', 'cylinder', 'spatula', 'rod', 'burner', 'tripod', 'funnel', 'dish', 'filterPaper', 'balance', 'washBottle'],
  PPT: ['beaker', 'cylinder', 'rod', 'funnel', 'balance', 'washBottle', 'oven'],
  CHROM: ['tank', 'paper', 'ruler', 'capillary'],
  MP: ['beaker', 'burner', 'tripod', 'balance', 'funnel', 'rod', 'iceBath', 'filterPaper', 'capillary', 'thermometer', 'oilBath', 'washBottle'],
};

const SLOTS: CupboardSlot[] = [
  { id: 'beaker', label: APPARATUS_LABEL.beaker, shelf: 1, x: -0.95, model: <ExtraModel id="beaker" /> },
  { id: 'cylinder', label: APPARATUS_LABEL.cylinder, shelf: 1, x: -0.78, model: <ExtraModel id="cylinder" />, grip: [[0.07, 0.22, 0.07], [0, 0.1, 0]] },
  { id: 'funnel', label: APPARATUS_LABEL.funnel, shelf: 1, x: -0.58, model: <ExtraModel id="funnel" />, grip: [[0.1, 0.22, 0.1], [0, 0.1, 0]] },
  { id: 'dish', label: APPARATUS_LABEL.dish, shelf: 1, x: -0.38, model: <ExtraModel id="dish" /> },
  { id: 'washBottle', label: APPARATUS_LABEL.washBottle, shelf: 1, x: -0.2, model: <ExtraModel id="washBottle" />, grip: [[0.08, 0.17, 0.08], [0, 0.08, 0]] },
  { id: 'iceBath', label: APPARATUS_LABEL.iceBath, shelf: 1, x: 0.02, model: <ExtraModel id="iceBath" /> },
  { id: 'testTubes', label: APPARATUS_LABEL.testTubes, shelf: 1, x: 0.3, model: <ExtraModel id="testTubes" /> },
  { id: 'oilBath', label: APPARATUS_LABEL.oilBath, shelf: 1, x: 0.55, model: <ExtraModel id="oilBath" /> },
  { id: 'tank', label: APPARATUS_LABEL.tank, shelf: 1, x: 0.8, model: <ExtraModel id="tank" />, grip: [[0.12, 0.2, 0.12], [0, 0.1, 0]] },
  { id: 'burette', label: APPARATUS_LABEL.burette, shelf: 0, x: -0.6, model: <ExtraModel id="burette" />, grip: [[0.66, 0.05, 0.05], [0, 0.01, 0]] },
  { id: 'thermometer', label: APPARATUS_LABEL.thermometer, shelf: 0, x: -0.1, z: 0.1, model: <ExtraModel id="thermometer" />, grip: [[0.3, 0.04, 0.04], [0, 0.01, 0]] },
  { id: 'rod', label: APPARATUS_LABEL.rod, shelf: 0, x: 0.25, z: 0.1, model: <ExtraModel id="rod" />, grip: [[0.2, 0.03, 0.04], [0, 0.01, 0]] },
  { id: 'ruler', label: APPARATUS_LABEL.ruler, shelf: 0, x: 0.6, z: 0.06, model: <ExtraModel id="ruler" />, grip: [[0.16, 0.03, 0.04], [0.07, 0.01, 0]] },
  { id: 'oven', label: APPARATUS_LABEL.oven, shelf: 0, x: 0.95, model: <ExtraModel id="oven" />, grip: [[0.2, 0.14, 0.16], [0, 0.07, 0]] },
  { id: 'burner', label: APPARATUS_LABEL.burner, shelf: 2, x: -0.9, model: <ExtraModel id="burner" /> },
  { id: 'tripod', label: APPARATUS_LABEL.tripod, shelf: 2, x: -0.7, model: <ExtraModel id="tripod" />, grip: [[0.16, 0.18, 0.16], [0, 0.09, 0]] },
  { id: 'balance', label: APPARATUS_LABEL.balance, shelf: 2, x: -0.45, model: <ExtraModel id="balance" />, grip: [[0.17, 0.08, 0.2], [0, 0.03, 0]] },
  { id: 'spatula', label: APPARATUS_LABEL.spatula, shelf: 2, x: -0.22, model: <ExtraModel id="spatula" />, grip: [[0.15, 0.03, 0.04], [0, 0.01, 0]] },
  { id: 'filterPaper', label: APPARATUS_LABEL.filterPaper, shelf: 2, x: 0.0, model: <ExtraModel id="filterPaper" /> },
  { id: 'paper', label: APPARATUS_LABEL.paper, shelf: 2, x: 0.2, model: <ExtraModel id="paper" />, grip: [[0.08, 0.03, 0.16], [0, 0.01, 0]] },
  { id: 'capillary', label: APPARATUS_LABEL.capillary, shelf: 2, x: 0.4, model: <ExtraModel id="capillary" /> },
];
export function SaltsCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
void Pens;
