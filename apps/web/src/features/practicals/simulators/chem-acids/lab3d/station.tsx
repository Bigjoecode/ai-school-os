import { ACID_TUBES, HARD_LABEL, HARD_SAMPLES, IND_SOLS, IND_SOL_LABEL, PH_INFO, PH_LETTER, PH_SAMPLES, UI_CHART, hardOpenRun, indOpenRun, uiColour, type AcidTube, type ChemAcidsState, type QualVisual } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { BoxGeometry, CylinderGeometry, DoubleSide, LatheGeometry, MeshStandardMaterial, Vector2  , type Group, type Material } from 'three';
import { BU, BlobShadow, Burette, ConicalFlask, DropperBottle, Funnel, GlowRing, MeasuringCylinder, Pipette, ReagentBottle, RetortStand, WashBottle, WhiteTile } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, STATION } from '../../../lab3d-kit/layout';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { Burner, GasProbe, TestTube } from '../../chem-qualitative/lab3d/models';
import { CardAndBook, CupboardItems, type CupboardSlot } from '../../phy-common/lab3d/common';
import { FONT, canvasTex, liveTex } from '../../phy-common/lab3d/tex';
import { CU, CUCL2, CUO, HCL_LIQ, LIME_CLEAR, LIME_MILKY, MARBLE, MG, NAOH_LIQ, SOAP_LIQ, ZN, ZOBO_DRY, type Acids } from '../actions';
import { useBench } from './bench-store';
import { dragFor } from './drag';
import { labelOf } from './lab-actions';
import { APPARATUS_LABEL, type ApparatusId, type SceneState } from './scene-state';
import { SPOT, type V3 } from './views';

/**
 * The acids bench, built for the lesson's task. pH: nine labelled samples,
 * the rack of tubes taking on the indicator's colour, the white tile, the
 * printed colour chart. Indicator: the mortar of zobo calyces, the water bath,
 * the filter funnel with the red extract, the rack of test solutions, and the
 * titration set (burette of HCl over a flask on a white tile whose colour
 * follows the pH). Acids: the five reaction tubes fizzing, the burner and
 * splints, limewater, the balance with the flask of acid and marble losing
 * mass. Hardness: the soap burette over a stoppered flask that scums and
 * lathers, the five samples, the boiling set.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 20);
const cylOpen = new CylinderGeometry(1, 1, 1, 24, 1, true);
const glass = new MeshStandardMaterial({ color: '#dfeaf0', roughness: 0.05, transparent: true, opacity: 0.28, side: DoubleSide, depthWrite: false });
const paperMat = new MeshStandardMaterial({ color: '#f7f5ee', roughness: 0.9 });
const corkMat = new MeshStandardMaterial({ color: '#7a5032', roughness: 0.8 });
const cottonMat = new MeshStandardMaterial({ color: '#fbfbf7', roughness: 1 });
const ceramic = new MeshStandardMaterial({ color: '#efece4', roughness: 0.6 });
const frothMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, transparent: true, opacity: 0.92 });

function B({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function C({ p, r, h, m, rot, open }: { p: V3; r: number; h: number; m: Material; rot?: V3; open?: boolean }) {
  return <mesh geometry={open ? cylOpen : cyl} material={m} position={p} scale={[r, h, r]} rotation={rot} renderOrder={open ? 4 : 0} />;
}
const add = (p: V3, d: V3): V3 => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];

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
/** An invisible grip for a small part of a bigger model. */
function Grip({ id, label, at, size, labelY = 0.08, drag }: { id: string; label: string; at: V3; size: V3; labelY?: number; drag?: (id: string) => string | null }) {
  return (
    <Interactive id={id} label={label} bench position={at} labelY={labelY} drag={drag as never}>
      {() => (
        <mesh position={[0, size[1] / 2, 0]}>
          <boxGeometry args={size} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </Interactive>
  );
}
/** Wiggles its children while the bench store says this object is being shaken. */
function Shaker({ id, children }: { id: string; children: ReactNode }) {
  const g = useRef<Group>(null);
  useFrame(() => {
    const b = useBench.getState();
    const on = b.shakeId === id && b.shakeUntil > performance.now();
    if (g.current) g.current.rotation.z = on ? Math.sin(performance.now() / 45) * 0.18 : 0;
  });
  return <group ref={g}>{children}</group>;
}
const vis = (liquid: string | null, o: Partial<QualVisual> = {}): QualVisual => ({ liquid, ppt: null, solid: null, bubbles: false, fumes: null, ring: null, flame: null, deposit: null, droplets: false, sublimate: false, probes: [], ...o });

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
const uiChartTexture = () =>
  canvasTex('acids-ui-chart', 512, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16202a';
    g.font = `700 30px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('Universal indicator', w / 2, 40);
    const cw = (w - 30) / 15;
    UI_CHART.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(15 + i * cw + 2, 70, cw - 4, 110);
      g.fillStyle = '#16202a';
      g.font = `700 24px ${FONT}`;
      g.fillText(String(i), 15 + i * cw + cw / 2, 215);
    });
    g.font = `500 18px ${FONT}`;
    g.fillText('pH', w / 2, 246);
  });
function ChartCard() {
  const tex = useMemo(() => uiChartTexture(), []);
  return (
    <group rotation={[0, -0.35, 0]}>
      <mesh position={[0, 0.07, 0]} rotation={[-0.12, 0, 0]}>
        <planeGeometry args={[0.24, 0.12]} />
        <meshStandardMaterial map={tex} roughness={0.8} />
      </mesh>
      <B p={[0, 0.07, -0.012]} s={[0.24, 0.12, 0.004]} m={mat.white()} r={[-0.12, 0, 0]} />
      <B p={[0, 0.006, -0.03]} s={[0.12, 0.012, 0.05]} m={mat.darkMetal()} />
      <BlobShadow r={0.1} />
    </group>
  );
}
/** A wooden rack holding `n` tubes, 0.034 m apart; `tube(i)` draws each. */
function Rack({ n, tube }: { n: number; tube: (i: number) => ReactNode }) {
  const W = n * 0.034 + 0.03;
  return (
    <group>
      <BlobShadow r={W / 2 + 0.02} />
      <B p={[0, 0.05, 0]} s={[W, 0.012, 0.06]} m={mat.wood()} />
      <B p={[0, 0.006, 0]} s={[W, 0.012, 0.06]} m={mat.wood()} />
      {[-1, 1].map((s) => (
        <B key={s} p={[(s * (W - 0.01)) / 2, 0.028, 0]} s={[0.01, 0.045, 0.06]} m={mat.wood()} />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[(i - (n - 1) / 2) * 0.034, 0.012, 0]}>
          {tube(i)}
        </group>
      ))}
    </group>
  );
}
const rackX = (i: number, n: number) => (i - (n - 1) / 2) * 0.034;

function Tripod({ children }: { children?: ReactNode }) {
  return (
    <group>
      <Burner lit={false} />
      {[0, 1, 2].map((k) => {
        const a = (k / 3) * Math.PI * 2;
        return <C key={k} p={[Math.cos(a) * 0.05, 0.075, Math.sin(a) * 0.05]} r={0.0035} h={0.15} m={mat.darkMetal()} />;
      })}
      <B p={[0, 0.15, 0]} s={[0.13, 0.003, 0.13]} m={mat.metal()} />
      <group position={[0, 0.152, 0]}>{children}</group>
    </group>
  );
}
function HotBeaker({ liquid = '#e6f0f5' }: { liquid?: string }) {
  return (
    <group>
      <C p={[0, 0.025, 0]} r={0.028} h={0.05} m={liquidMaterial(liquid, 0.6)} />
      <C p={[0, 0.035, 0]} r={0.03} h={0.07} m={glass} open />
    </group>
  );
}
function MortarModel({ crushed }: { crushed: string | null }) {
  const bowl = useMemo(() => new LatheGeometry([new Vector2(0, 0), new Vector2(0.03, 0.002), new Vector2(0.042, 0.02), new Vector2(0.046, 0.045), new Vector2(0.042, 0.046), new Vector2(0.036, 0.022), new Vector2(0, 0.012)], 28), []);
  const pestle = useRef<Group>(null);
  useFrame(() => {
    const on = useBench.getState().crushUntil > performance.now();
    if (pestle.current) pestle.current.rotation.z = 0.5 + (on ? Math.sin(performance.now() / 70) * 0.25 : 0);
  });
  return (
    <group>
      <BlobShadow r={0.06} />
      <mesh geometry={bowl} material={ceramic} />
      {crushed ? <C p={[0, 0.018, 0]} r={0.03} h={0.008} m={liquidMaterial(crushed, 0.9)} /> : [0, 1, 2, 3, 4, 5].map((k) => <B key={k} p={[Math.cos(k * 1.1) * 0.016, 0.02 + (k % 2) * 0.004, Math.sin(k * 1.1) * 0.016]} s={[0.014, 0.004, 0.01]} r={[0.3 * k, k, 0.2]} m={colourMaterial(ZOBO_DRY)} />)}
      <group ref={pestle} position={[0.01, 0.02, 0]} rotation={[0, 0, 0.5]}>
        <C p={[0, 0.05, 0]} r={0.008} h={0.1} m={ceramic} />
      </group>
    </group>
  );
}
function FilterSet({ filtrate, residue }: { filtrate: string | null; residue: string | null }) {
  return (
    <group>
      <BlobShadow r={0.04} />
      {filtrate && <C p={[0, 0.02, 0]} r={0.025} h={0.036} m={liquidMaterial(filtrate, 0.9)} />}
      <C p={[0, 0.036, 0]} r={0.027} h={0.072} m={glass} open />
      <group position={[0, 0.07, 0]}>
        <Funnel />
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI, 0, 0]} material={paperMat}>
          <coneGeometry args={[0.03, 0.036, 16, 1, true]} />
        </mesh>
        {residue && <C p={[0, 0.05, 0]} r={0.012} h={0.006} m={colourMaterial(residue)} />}
      </group>
    </group>
  );
}
/** A burette clamped over the bench at SPOT.buretteAxis (the jet at SPOT.jetHeight). */
function BuretteSet({ level, liquid, children, drag }: { level: number | null; liquid: string; children?: ReactNode; drag?: (id: string) => string | null }) {
  return (
    <>
      <Obj id="stand" label="Retort stand and clamp" at={SPOT.standBase} labelY={0.95} r={0.13}>
        <RetortStand clampY={0.6} />
      </Obj>
      <group position={[SPOT.buretteAxis[0], SPOT.jetHeight, SPOT.buretteAxis[2]]}>
        <Interactive id="burette" label={level === null ? 'Burette (empty)' : `Burette — about ${level.toFixed(1)} cm³`} bench labelY={BU.top + 0.05}>
          {(active) => <Burette level={level} bubble={false} detail glow={active} liquid={{ colour: liquid, opacity: 0.5 }} />}
        </Interactive>
        <Interactive id="tap" label="Burette tap — drag sideways to let liquid out" bench position={[0, BU.tap, 0]} labelY={0.03} drag={drag as never}>
          <mesh position={[0.01, 0, 0]}>
            <boxGeometry args={[0.05, 0.03, 0.03]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </Interactive>
      </group>
      {children}
    </>
  );
}
function Stopper() {
  return <C p={[0, 0.146, 0]} r={0.019} h={0.02} m={corkMat} />;
}

// ------------------------------------------------------------------ cupboard and extras

function ExtraModel({ id }: { id: ApparatusId }) {
  switch (id) {
    case 'testTubes':
      return <Rack n={6} tube={() => <TestTube vis={null} small />} />;
    case 'uiBottle':
      return <DropperBottle name="Univ. ind." colour="#5aa845" />;
    case 'chart':
      return <ChartCard />;
    case 'tile':
      return <WhiteTile />;
    case 'washBottle':
      return <WashBottle />;
    case 'mortar':
      return <MortarModel crushed={null} />;
    case 'waterBath':
      return (
        <Tripod>
          <HotBeaker />
        </Tripod>
      );
    case 'funnel':
      return <FilterSet filtrate={null} residue={null} />;
    case 'burette':
      return <C p={[0, 0.006, 0]} r={0.006} h={0.6} rot={[0, 0, Math.PI / 2]} m={glass} />;
    case 'stand':
      return <RetortStand clampY={0.4} />;
    case 'pipette':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.23, 0.014, 0]}>
          <Pipette filled={0} />
        </group>
      );
    case 'flask':
      return <ConicalFlask volume={0} colour={null} />;
    case 'burner':
      return <Burner lit={false} />;
    case 'splints':
      return (
        <group>
          {[-0.01, 0, 0.01].map((z) => (
            <B key={z} p={[0, 0.002, z]} s={[0.15, 0.003, 0.004]} m={mat.wood()} />
          ))}
        </group>
      );
    case 'balance':
      return <BalanceModel shows="0.00" />;
    case 'cylinder':
      return <MeasuringCylinder />;
    case 'cotton':
      return <mesh position={[0, 0.012, 0]} material={cottonMat} scale={[1.3, 0.8, 1]}><sphereGeometry args={[0.016, 10, 8]} /></mesh>;
    case 'thermometer':
      return <C p={[0, 0.004, 0]} r={0.0035} h={0.23} rot={[0, 0, Math.PI / 2]} m={glass} />;
    case 'evapDish':
      return <C p={[0, 0.012, 0]} r={0.04} h={0.024} m={ceramic} />;
  }
}

// ------------------------------------------------------------------ the station

export function Station({ x, s, scene, interactive, card }: { x: Acids; s: ChemAcidsState; scene: SceneState; interactive: boolean; card: string[] }) {
  const task = scene.task;
  const has = (id: ApparatusId) => scene.collected.has(id);
  const drag = interactive ? dragFor : undefined;
  const extras = (Object.keys(APPARATUS_LABEL) as ApparatusId[]).filter((id) => has(id) && !USED[task].includes(id));
  const heads: Record<typeof task, string[]> = { PH: ['sample', 'colour', 'pH'], IND: ['run', 'final', 'initial'], ACID: ['test', 'gas', 'mass / g'], HARD: ['sample', 'soap / cm³', 'boiled'] };
  let bench: ReactNode = null;
  if (task === 'PH') {
    const p = s.ph;
    bench = (
      <>
        {PH_SAMPLES.map((k, i) => (
          <Obj key={k} id={`bottle:${k}`} label={`Sample ${PH_LETTER[k]}: ${PH_INFO[k].label}`} at={[SPOT.samples[0] + i * 0.135, 0, SPOT.samples[2]]} labelY={0.12} r={0.035}>
            <ReagentBottle name={PH_LETTER[k]} band={k === 'HCL' || k === 'ETH' || k === 'LIME' || k === 'COLA' ? '#c62828' : k === 'WATER' ? '#2a7fc9' : '#6a1b9a'} sub={PH_INFO[k].label.split(' ')[0]!.slice(0, 10)} liquid={PH_INFO[k].own} r={0.024} h={0.085} />
          </Obj>
        ))}
        {has('testTubes') && (
          <group position={SPOT.rack9}>
            <Interactive id="rack" label="Test tubes A–I in the rack" bench labelY={0.2}>
              {(active) => (
                <group>
                  <Rack
                    n={9}
                    tube={(i) => {
                      const k = PH_SAMPLES[i]!;
                      const c = x.look.phColour(k);
                      return (
                        <Shaker id={`tube:${k}`}>
                          <TestTube vis={c ? vis(c) : null} small />
                        </Shaker>
                      );
                    }}
                  />
                  {active && <GlowRing r={0.18} />}
                </group>
              )}
            </Interactive>
            {PH_SAMPLES.map((k, i) => (
              <Grip key={k} id={`tube:${k}`} label={`Tube ${PH_LETTER[k]}${p.tubes[k].vol ? '' : ' (empty)'}`} at={[rackX(i, 9), 0.01, 0.015]} size={[0.028, 0.14, 0.028]} labelY={0.17} drag={drag} />
            ))}
            {PH_SAMPLES.map((k, i) => (
              <mesh key={`l${k}`} position={[rackX(i, 9), 0.035, 0.032]}>
                <planeGeometry args={[0.018, 0.014]} />
                <meshBasicMaterial map={letterTex(PH_LETTER[k])} transparent />
              </mesh>
            ))}
          </group>
        )}
        {has('tile') && (p.tile ? (
          <Obj id="tile" label="White tile (behind the rack)" at={add(SPOT.rack9, [0, 0, -0.05])} labelY={0.2} r={0.17}>
            <B p={[0, 0.08, 0]} s={[0.36, 0.16, 0.008]} m={mat.tile()} />
          </Obj>
        ) : (
          <Obj id="tile" label="White tile" at={SPOT.tileFlat} labelY={0.05} r={0.1}>
            <WhiteTile />
          </Obj>
        ))}
        {has('chart') && (
          <Obj id="chart" label="Universal indicator colour chart" at={SPOT.chart} labelY={0.17} r={0.13}>
            <ChartCard />
          </Obj>
        )}
        {has('uiBottle') && (
          <Obj id="uiBottle" label="Universal indicator" at={SPOT.uiBottle} labelY={0.11} r={0.035}>
            <DropperBottle name="Univ. ind." colour="#5aa845" />
          </Obj>
        )}
      </>
    );
  } else if (task === 'IND') {
    const w = s.ind;
    const run = indOpenRun(w);
    const extract = w.solvent ? (w.heat === 'NONE' ? '#9a2342' : '#7d0f2c') : null;
    bench = (
      <>
        {IND_SOLS.map((k, i) => (
          <Obj key={k} id={`bottle:${k}`} label={IND_SOL_LABEL[k]} at={[SPOT.sols[0] + i * 0.12, 0, SPOT.sols[2]]} labelY={0.12} r={0.035}>
            <ReagentBottle name={k === 'SODA' ? 'NaHCO₃' : k === 'NAOH' ? 'NaOH' : k === 'HCL' ? 'HCl' : k === 'VINEGAR' ? 'Vinegar' : 'Water'} band={k === 'HCL' || k === 'VINEGAR' ? '#c62828' : k === 'WATER' ? '#2a7fc9' : '#6a1b9a'} sub={k === 'WATER' ? 'distilled' : 'dilute'} r={0.024} h={0.085} />
          </Obj>
        ))}
        <Obj id="titrant:hcl" label="Hydrochloric acid (for the burette)" at={SPOT.titrants} labelY={0.17}>
          <ReagentBottle name="HCl" band="#c62828" sub={`${x.v.ind.cAcid} M`} liquid={HCL_LIQ} />
        </Obj>
        <Obj id="titrant:naoh" label="Sodium hydroxide (for the pipette)" at={add(SPOT.titrants, [0.15, 0, 0])} labelY={0.17}>
          <ReagentBottle name="NaOH" band="#6a1b9a" sub={`${x.v.ind.cBase} M`} liquid={NAOH_LIQ} />
        </Obj>
        <Obj id="ind:MO" label="Methyl orange" at={SPOT.indicators} labelY={0.11} r={0.035}>
          <DropperBottle name="Methyl or." colour="#f08a24" />
        </Obj>
        <Obj id="ind:ZOBO" label={w.solvent ? 'Zobo extract (your indicator)' : 'Dropper bottle for the zobo extract (empty)'} at={add(SPOT.indicators, [0.07, 0, 0])} labelY={0.11} r={0.035}>
          <DropperBottle name="Zobo" colour={w.filtered ? '#7d0f2c' : '#e8e2dc'} />
        </Obj>
        {has('mortar') && (
          <Obj id="mortar" label={w.solvent ? 'Mortar: crushed zobo calyces' : 'Mortar and pestle with dried zobo calyces'} at={SPOT.mortar} labelY={0.13} r={0.06}>
            <MortarModel crushed={extract} />
          </Obj>
        )}
        {has('waterBath') && (
          <Obj id="waterBath" label="Water bath (burner off)" at={SPOT.bath} labelY={0.25} r={0.08}>
            <Tripod>
              <HotBeaker />
            </Tripod>
          </Obj>
        )}
        {has('funnel') && (
          <Obj id="funnel" label={w.filtered ? 'The zobo extract (filtrate)' : 'Filter funnel and beaker'} at={SPOT.extract} labelY={0.18} r={0.05}>
            <FilterSet filtrate={w.filtered ? extract : null} residue={w.filtered ? ZOBO_DRY : null} />
          </Obj>
        )}
        {has('testTubes') && (
          <group position={SPOT.rack10}>
            <Rack
              n={10}
              tube={(i) => {
                const k = IND_SOLS[Math.floor(i / 2)]!;
                const ext = i % 2 === 0;
                const t = w.tests[k];
                const c = ext ? (t.ext ? x.look.extract(k) : null) : t.ui ? uiColour(x.v.ind.pH[k]) : null;
                return <TestTube vis={c ? vis(c) : null} small />;
              }}
            />
            {IND_SOLS.map((k, i) => (
              <Grip key={k} id={`sol:${k}`} label={`${IND_SOL_LABEL[k]}: extract | universal indicator`} at={[(rackX(2 * i, 10) + rackX(2 * i + 1, 10)) / 2, 0.01, 0.015]} size={[0.06, 0.14, 0.03]} labelY={0.17} />
            ))}
          </group>
        )}
        {has('stand') && has('burette') && (
          <BuretteSet level={w.burette} liquid={HCL_LIQ} drag={drag}>
            {has('tile') && (
              <Obj id="tile" label="White tile" at={[SPOT.buretteAxis[0], 0, SPOT.buretteAxis[2]]} labelY={0.03} r={0.1}>
                <WhiteTile />
              </Obj>
            )}
            {has('flask') && (run || w.flask) && (
              <Obj id="flask" label={run ? `Flask: ${run.ind === 'MO' ? 'methyl orange' : 'zobo'}, ${run.added.toFixed(2)} cm³ in` : 'Flask: 25.0 cm³ NaOH'} at={[SPOT.buretteAxis[0], 0.008, SPOT.buretteAxis[2]]} labelY={0.17} r={0.06}>
                <Shaker id="flask">
                  <ConicalFlask volume={25 + (run?.added ?? 0)} colour={x.look.flask} />
                </Shaker>
              </Obj>
            )}
          </BuretteSet>
        )}
        {has('flask') && !run && !w.flask && (
          <Obj id="flask" label="Conical flask (clean)" at={SPOT.flaskHome} labelY={0.17}>
            <ConicalFlask volume={0} colour={null} />
          </Obj>
        )}
        {has('pipette') && (
          <Obj id="pipette" label="Pipette (25.0 cm³) and filler" at={SPOT.pipette} labelY={0.04} r={0.1}>
            <group rotation={[0, 0, Math.PI / 2]} position={[0.23, 0.014, 0]}>
              <Pipette filled={0} colour={NAOH_LIQ} />
            </group>
          </Obj>
        )}
        {has('uiBottle') && (
          <Obj id="uiBottle" label="Universal indicator" at={SPOT.uiBottle} labelY={0.11} r={0.035}>
            <DropperBottle name="Univ. ind." colour="#5aa845" />
          </Obj>
        )}
      </>
    );
  } else if (task === 'ACID') {
    const a = s.acid;
    const t = a.tubes;
    const onPan = a.flaskWeighed || a.added;
    const flaskAt: V3 = onPan ? add(SPOT.balance, [0, 0.058, -0.02]) : SPOT.acidFlask;
    const bubbling = a.added && x.look.extent < 0.99;
    const tubeVis = (k: AcidTube): QualVisual | null => {
      const w = t[k];
      if (!w.acid) return vis(null, { solid: k === 'MG' ? MG : k === 'ZN' ? ZN : k === 'CU' ? CU : k === 'CUO' ? CUO : MARBLE });
      if (k === 'CUO') return w.warmed ? vis(CUCL2) : vis(HCL_LIQ, { ppt: CUO });
      return vis(HCL_LIQ, { ppt: k === 'MG' ? MG : k === 'ZN' ? ZN : k === 'CU' ? CU : MARBLE, bubbles: k !== 'CU' });
    };
    const probe = x.look.test;
    bench = (
      <>
        <Obj id="bottle:hclA" label="Dilute hydrochloric acid" at={SPOT.reagents} labelY={0.17}>
          <ReagentBottle name="HCl" band="#c62828" sub={`${x.v.acid.conc.toFixed(2)} M`} liquid={HCL_LIQ} />
        </Obj>
        {(['Mg ribbon', 'Zn granules', 'Cu turnings', 'CuO', 'Marble'] as const).map((n, i) => (
          <group key={n} position={add(SPOT.reagents, [0.12 + i * 0.1, 0, 0])}>
            <ReagentBottle name={n} band="#455a64" sub="" liquid={[MG, ZN, CU, CUO, MARBLE][i]} r={0.028} h={0.07} />
          </group>
        ))}
        {has('testTubes') && (
          <group position={SPOT.rack5}>
            <Rack n={5} tube={(i) => <TestTube vis={tubeVis(ACID_TUBES[i]!)} hot={false} />} />
            {ACID_TUBES.map((k, i) => (
              <Grip key={k} id={`tube:${k}`} label={`Tube: ${labelOf(`tube:${k}`, x)?.replace('Tube: ', '') ?? k}`} at={[rackX(i, 5), 0.01, 0.015]} size={[0.028, 0.16, 0.028]} labelY={0.19} />
            ))}
            {probe && (
              <group position={[rackX(ACID_TUBES.indexOf(probe.tube), 5), 0.012, 0]}>
                <GasProbe test={probe.test === 'LIME' ? 'LIME_WATER' : probe.test === 'BURNING' ? 'BURNING_SPLINT' : 'GLOWING_SPLINT'} colour={probe.test === 'LIME' ? (probe.tube === 'CACO3' ? LIME_MILKY : LIME_CLEAR) : probe.test === 'BURNING' ? (probe.tube === 'MG' || probe.tube === 'ZN' ? '#ffd36b' : probe.tube === 'CACO3' ? '#3b3b3b' : '#ff9a3c') : '#8a3a1a'} k={0} />
              </group>
            )}
          </group>
        )}
        {has('burner') && (
          <Obj id="burner" label="Bunsen burner (lit)" at={SPOT.burner} labelY={0.25} r={0.07}>
            <Burner lit />
          </Obj>
        )}
        {has('splints') && (
          <Obj id="splints" label="Wooden splints" at={SPOT.splints} labelY={0.04} r={0.08}>
            <ExtraModel id="splints" />
          </Obj>
        )}
        <Obj id="limewater" label="Limewater" at={SPOT.limewater} labelY={0.17}>
          <ReagentBottle name="Limewater" band="#2a7fc9" sub="Ca(OH)₂" liquid={LIME_CLEAR} />
        </Obj>
        {has('balance') && (
          <Obj id="balance" label={`Top-pan balance — ${x.look.balance.value.toFixed(2)} g`} at={SPOT.balance} labelY={0.12} r={0.12}>
            <BalanceModel shows={x.look.balance.value.toFixed(2)} />
            {!onPan && a.chips > 0 && [0, 1, 2, 3, 4, 5, 6, 7].slice(0, Math.min(8, a.chips)).map((k) => <B key={k} p={[Math.cos(k * 2.1) * 0.02, 0.062, -0.02 + Math.sin(k * 2.1) * 0.02]} s={[0.012, 0.008, 0.01]} r={[0, k, 0]} m={colourMaterial(MARBLE)} />)}
          </Obj>
        )}
        {has('flask') && (
          <Obj id="acidFlask" label={a.added ? 'Flask: marble fizzing in the acid' : 'Conical flask'} at={flaskAt} labelY={0.18} r={0.06}>
            <ConicalFlask volume={a.acidVol ?? 0} colour={a.acidVol ? HCL_LIQ : null} />
            {a.added && [0, 1, 2, 3].map((k) => <B key={k} p={[Math.cos(k * 1.6) * 0.015, 0.008, Math.sin(k * 1.6) * 0.015]} s={[0.012, 0.009, 0.01]} r={[0, k, 0]} m={colourMaterial(MARBLE)} />)}
            {bubbling && <Bubbles />}
            {a.plug && <mesh position={[0, 0.136, 0]} material={cottonMat} scale={[1, 0.8, 1]}><sphereGeometry args={[0.0165, 10, 8]} /></mesh>}
          </Obj>
        )}
        {has('cylinder') && (
          <Obj id="cylinder" label="Measuring cylinder (50 cm³)" at={SPOT.cylinder} labelY={0.24}>
            <MeasuringCylinder />
          </Obj>
        )}
        {has('cotton') && !a.plug && (
          <Obj id="cotton" label="Cotton wool" at={SPOT.cotton} labelY={0.04} r={0.04}>
            <ExtraModel id="cotton" />
          </Obj>
        )}
      </>
    );
  } else {
    const h = s.hard;
    const run = hardOpenRun(h);
    const froth = x.look.lather === 'LASTING' ? 0.02 : x.look.lather === 'FROTH' ? 0.008 : 0;
    bench = (
      <>
        {HARD_SAMPLES.map((k, i) => (
          <Obj key={k} id={`sample:${k}`} label={`${HARD_LABEL[k]}${h.boiled[k] ? ' (boiled portion ready)' : ''}`} at={[SPOT.samples5[0] + i * 0.13, 0, SPOT.samples5[2]]} labelY={0.17} r={0.045}>
            <ReagentBottle name={k === 'DIST' ? 'Distilled' : k === 'RAIN' ? 'Rain' : k === 'TAP' ? 'Tap' : `Sample ${k}`} band={k === 'X' || k === 'Y' ? '#6d4c41' : '#2a7fc9'} sub="water" liquid="#e8f1f6" r={0.032} h={0.12} />
          </Obj>
        ))}
        <Obj id="titrant:soap" label="Standard soap solution" at={add(SPOT.titrants, [0.15, 0, 0])} labelY={0.17}>
          <ReagentBottle name="Soap" band="#00897b" sub="standard" liquid={SOAP_LIQ} />
        </Obj>
        {has('burner') && (
          <Obj id="boil" label="Burner, tripod and beaker: boil the samples here" at={SPOT.boil} labelY={0.26} r={0.08}>
            <Tripod>
              <HotBeaker liquid="#e6eef2" />
            </Tripod>
          </Obj>
        )}
        {has('funnel') && (
          <Obj id="funnel" label="Filter funnel (for the boiled samples)" at={SPOT.funnelH} labelY={0.18} r={0.05}>
            <FilterSet filtrate={Object.values(h.boiled).some(Boolean) ? '#e9f2f6' : null} residue={Object.values(h.boiled).some(Boolean) ? '#f4f2ea' : null} />
          </Obj>
        )}
        {has('stand') && has('burette') && (
          <BuretteSet level={h.burette} liquid={SOAP_LIQ} drag={drag}>
            {has('flask') && (
              <Obj id="flask" label={run ? `Flask: ${HARD_LABEL[run.sample]}${run.boiled ? ' (boiled)' : ''}, ${run.added.toFixed(1)} cm³ soap` : 'Conical flask with stopper'} at={[SPOT.buretteAxis[0], 0, SPOT.buretteAxis[2]]} labelY={0.18} r={0.06}>
                <Shaker id="flask">
                  <ConicalFlask volume={run ? run.vol + run.added : 0} colour={run ? (x.look.scum ? '#e6e8e4' : '#e3eef4') : null} />
                  {froth > 0 && <C p={[0, 0.034 + froth / 2, 0]} r={0.034} h={froth} m={frothMat} />}
                  {run && <Stopper />}
                </Shaker>
              </Obj>
            )}
          </BuretteSet>
        )}
        {has('cylinder') && (
          <Obj id="cylinder" label="Measuring cylinder (50 cm³)" at={SPOT.cylinder} labelY={0.24}>
            <MeasuringCylinder />
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
      {bench}
      {has('washBottle') && USED[task].includes('washBottle') && (
        <Obj id="washBottle" label="Wash bottle (distilled water)" at={SPOT.washBottle} labelY={0.22}>
          <WashBottle />
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
const TITLE = { PH: 'pH of solutions', IND: 'Zobo indicator', ACID: 'Reactions of acids', HARD: 'Hardness of water' } as const;
/** What each task's station draws itself (everything else collected goes to the end of the bench). */
const USED: Record<string, ApparatusId[]> = {
  PH: ['testTubes', 'uiBottle', 'chart', 'tile', 'washBottle'],
  IND: ['mortar', 'waterBath', 'funnel', 'testTubes', 'uiBottle', 'burette', 'stand', 'pipette', 'flask', 'tile'],
  ACID: ['testTubes', 'burner', 'splints', 'balance', 'flask', 'cylinder', 'cotton'],
  HARD: ['burette', 'stand', 'flask', 'cylinder', 'burner', 'funnel', 'washBottle'],
};

function Bubbles() {
  const g = useRef<Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const t = performance.now() / 500;
    g.current.children.forEach((c, i) => (c.position.y = 0.01 + ((t + i * 0.23) % 1) * 0.03));
  });
  return (
    <group ref={g}>
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <mesh key={k} geometry={cyl} material={glass} position={[Math.cos(k) * 0.012, 0.02, Math.sin(k) * 0.012]} scale={[0.0022, 0.0022, 0.0022]} />
      ))}
    </group>
  );
}
const letters = new Map<string, ReturnType<typeof canvasTex>>();
function letterTex(L: string) {
  const hit = letters.get(L);
  if (hit) return hit;
  const t = canvasTex(`acids-letter-${L}`, 64, 48, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#16202a';
    g.font = `800 36px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(L, w / 2, h / 2 + 2);
  });
  letters.set(L, t);
  return t;
}

const SLOTS: CupboardSlot[] = [
  { id: 'testTubes', label: APPARATUS_LABEL.testTubes, shelf: 1, x: -0.9, model: <ExtraModel id="testTubes" />, grip: [[0.24, 0.16, 0.06], [0, 0.08, 0]] },
  { id: 'mortar', label: APPARATUS_LABEL.mortar, shelf: 1, x: -0.62, model: <ExtraModel id="mortar" /> },
  { id: 'waterBath', label: APPARATUS_LABEL.waterBath, shelf: 1, x: -0.4, model: <ExtraModel id="waterBath" />, grip: [[0.14, 0.24, 0.14], [0, 0.12, 0]] },
  { id: 'funnel', label: APPARATUS_LABEL.funnel, shelf: 1, x: -0.18, model: <ExtraModel id="funnel" />, grip: [[0.08, 0.16, 0.08], [0, 0.08, 0]] },
  { id: 'flask', label: APPARATUS_LABEL.flask, shelf: 1, x: 0.02, model: <ExtraModel id="flask" />, grip: [[0.09, 0.15, 0.09], [0, 0.07, 0]] },
  { id: 'washBottle', label: APPARATUS_LABEL.washBottle, shelf: 1, x: 0.22, model: <ExtraModel id="washBottle" />, grip: [[0.08, 0.17, 0.08], [0, 0.08, 0]] },
  { id: 'cylinder', label: APPARATUS_LABEL.cylinder, shelf: 1, x: 0.4, model: <ExtraModel id="cylinder" />, grip: [[0.07, 0.22, 0.07], [0, 0.1, 0]] },
  { id: 'burner', label: APPARATUS_LABEL.burner, shelf: 1, x: 0.6, model: <ExtraModel id="burner" /> },
  { id: 'stand', label: APPARATUS_LABEL.stand, shelf: 1, x: 0.9, model: <ExtraModel id="stand" />, grip: [[0.22, 0.5, 0.3], [0, 0.25, 0]] },
  { id: 'balance', label: APPARATUS_LABEL.balance, shelf: 0, x: -0.85, model: <ExtraModel id="balance" />, grip: [[0.17, 0.08, 0.2], [0, 0.03, 0]] },
  { id: 'burette', label: APPARATUS_LABEL.burette, shelf: 0, x: -0.3, z: 0.12, model: <ExtraModel id="burette" />, grip: [[0.6, 0.03, 0.03], [0, 0.006, 0]] },
  { id: 'pipette', label: APPARATUS_LABEL.pipette, shelf: 0, x: 0.3, z: 0.1, model: <ExtraModel id="pipette" />, grip: [[0.48, 0.04, 0.04], [0.23, 0.014, 0]] },
  { id: 'evapDish', label: APPARATUS_LABEL.evapDish, shelf: 0, x: 0.8, model: <ExtraModel id="evapDish" /> },
  { id: 'uiBottle', label: APPARATUS_LABEL.uiBottle, shelf: 2, x: -0.9, model: <ExtraModel id="uiBottle" />, grip: [[0.05, 0.09, 0.05], [0, 0.04, 0]] },
  { id: 'chart', label: APPARATUS_LABEL.chart, shelf: 2, x: -0.66, model: <ExtraModel id="chart" />, grip: [[0.24, 0.14, 0.06], [0, 0.07, 0]] },
  { id: 'tile', label: APPARATUS_LABEL.tile, shelf: 2, x: -0.4, model: <ExtraModel id="tile" /> },
  { id: 'splints', label: APPARATUS_LABEL.splints, shelf: 2, x: -0.18, model: <ExtraModel id="splints" />, grip: [[0.16, 0.03, 0.05], [0, 0.01, 0]] },
  { id: 'cotton', label: APPARATUS_LABEL.cotton, shelf: 2, x: 0.02, model: <ExtraModel id="cotton" />, grip: [[0.05, 0.04, 0.05], [0, 0.012, 0]] },
  { id: 'thermometer', label: APPARATUS_LABEL.thermometer, shelf: 2, x: 0.3, z: 0.1, model: <ExtraModel id="thermometer" />, grip: [[0.24, 0.03, 0.04], [0, 0.01, 0]] },
];
export function AcidsCupboard({ scene }: { scene: SceneState }) {
  return <CupboardItems slots={SLOTS} collected={scene.collected} />;
}
