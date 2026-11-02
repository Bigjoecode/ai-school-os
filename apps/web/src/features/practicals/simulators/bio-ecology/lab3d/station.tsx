import { SOIL_LAYERS, SOIL_TYPES, type BioEcologyState, type BioEcologyVariant, type SoilType } from '@aischool/shared';
import { useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, SphereGeometry, type Material } from 'three';
import { BunsenBurner, MeasuringCylinder, Thermometer } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { colourMaterial, liquidMaterial, mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { Ruler, Tray } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { StopwatchModel } from '../../bio-food-tests/lab3d/models';
import { BalanceModel } from '../../bio-osmosis/lab3d/models';
import { airNow, capTrays, crucibleShown, drainNow, jarNow } from '../readings';
import { ESPOT, FIELD, airSpot, bagSpot, crucibleSpot, funnelSpot, jarSpot } from './bench';
import { ECO_APPARATUS_LABEL, shedFor, type EcoApparatusId, type EcoScene } from './scene-state';

/**
 * The student's field table for each investigation (drawn from the attempt's
 * state: the catch on the tray, the jars settling, water dripping into the
 * cylinders, crucibles glowing on the tripods), the instruments set up at the
 * sites, and the apparatus still in the equipment shed.
 */

type V3 = [number, number, number];
const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 16);
const ball = new SphereGeometry(1, 12, 10);
function Box({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={box} material={m} position={p} scale={s} rotation={r} />;
}
function Rod({ p, s, m, r }: { p: V3; s: V3; m: Material; r?: V3 }) {
  return <mesh geometry={cyl} material={m} position={p} scale={s} rotation={r} />;
}
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];
const SOIL_COLOUR: Record<SoilType, string> = { SAND: '#d8bd7c', LOAM: '#5b4330', CLAY: '#9a7a62' };
const LAYER_COLOUR = { GRAVEL: '#8d8a80', SAND: '#d9bf7a', SILT: '#b08a5c', CLAY: '#8a6a55' } as const;

function QuadratFrame({ glow, size = 0.5 }: { glow?: boolean; size?: number }) {
  const m = glow ? mat.highlight() : mat.wood();
  return (
    <group>
      {[
        [0, -size / 2, size, 0.02],
        [0, size / 2, size, 0.02],
        [-size / 2, 0, 0.02, size],
        [size / 2, 0, 0.02, size],
      ].map(([x, z, sx, sz], k) => (
        <Box key={k} p={[x!, 0.01, z!]} s={[sx!, 0.02, sz!]} m={m} />
      ))}
      {Array.from({ length: 9 }, (_, k) => (
        <group key={k}>
          <Box p={[-size / 2 + ((k + 1) * size) / 10, 0.015, 0]} s={[0.002, 0.002, size]} m={mat.white()} />
          <Box p={[0, 0.015, -size / 2 + ((k + 1) * size) / 10]} s={[size, 0.002, 0.002]} m={mat.white()} />
        </group>
      ))}
    </group>
  );
}
function Card({ glow, colour = '#fdfcf6', w = 0.16, d = 0.11 }: { glow?: boolean; colour?: string; w?: number; d?: number }) {
  return <Box p={[0, 0.003, 0]} s={[w, 0.004, d]} m={glow ? mat.highlight() : colourMaterial(colour)} />;
}
function TapeReel({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.06, 0]} s={[0.06, 0.03, 0.06]} m={glow ? mat.highlight() : colourMaterial('#f5d33a')} r={[Math.PI / 2, 0, 0]} />
      <Box p={[0.06, 0.02, 0]} s={[0.05, 0.004, 0.015]} m={colourMaterial('#f5d33a')} />
    </group>
  );
}
function Pegs({ glow }: { glow?: boolean }) {
  return (
    <group>
      {[0, 1, 2, 3].map((k) => (
        <Box key={k} p={[k * 0.025, 0.008, 0]} s={[0.012, 0.012, 0.14]} m={glow ? mat.highlight() : colourMaterial('#8a5a2b')} />
      ))}
    </group>
  );
}
function SweepNet({ glow }: { glow?: boolean }) {
  return (
    <group rotation={[0, 0, 0.35]}>
      <Rod p={[0, 0.5, 0]} s={[0.012, 1.0, 0.012]} m={glow ? mat.highlight() : mat.woodDark()} />
      <mesh position={[0, 1.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.16, 0.008, 6, 20]} />
        <meshStandardMaterial color="#9e9e9e" />
      </mesh>
      <mesh position={[0, 1.08, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.16, 0.3, 14, 1, true]} />
        <meshStandardMaterial color="#f2f2ea" transparent opacity={0.7} side={2} />
      </mesh>
    </group>
  );
}
function PaintPot({ colour, glow }: { colour: string; glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.025, 0]} s={[0.025, 0.05, 0.025]} m={glow ? mat.highlight() : mat.white()} />
      <Rod p={[0, 0.051, 0]} s={[0.022, 0.003, 0.022]} m={colourMaterial(colour)} />
      <Rod p={[0.04, 0.03, 0]} s={[0.003, 0.09, 0.003]} m={mat.woodDark()} r={[0, 0, 0.6]} />
    </group>
  );
}
function Meter({ colour, glow }: { colour: string; glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.015, 0]} s={[0.07, 0.03, 0.12]} m={glow ? mat.highlight() : colourMaterial(colour)} />
      <Box p={[0, 0.031, -0.02]} s={[0.05, 0.002, 0.04]} m={colourMaterial('#1d2a22')} />
    </group>
  );
}
function Hygrometer({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.005, 0]} s={[0.12, 0.01, 0.06]} m={glow ? mat.highlight() : mat.wood()} />
      {[-0.025, 0.025].map((x) => (
        <Box key={x} p={[x, 0.11, 0]} s={[0.01, 0.2, 0.01]} m={mat.white()} />
      ))}
      <Box p={[0, 0.11, -0.025]} s={[0.1, 0.22, 0.008]} m={mat.wood()} />
      <Rod p={[0.025, 0.02, 0.01]} s={[0.012, 0.03, 0.012]} m={colourMaterial('#bcd7ea')} />
    </group>
  );
}
function Secchi({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.005, 0]} s={[0.1, 0.008, 0.1]} m={glow ? mat.highlight() : mat.white()} />
      {[0, 1].map((k) => (
        <mesh key={k} position={[0, 0.0095, 0]} rotation={[-Math.PI / 2, 0, k * Math.PI]}>
          <circleGeometry args={[0.1, 16, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
      <mesh position={[0.13, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.04, 0.01, 6, 14]} />
        <meshStandardMaterial color="#d8c9a3" />
      </mesh>
    </group>
  );
}
function Jar({ layers, cloudy, glow }: { layers: Record<(typeof SOIL_LAYERS)[number], number> | null; cloudy: number; glow?: boolean }) {
  let y = 0.004;
  return (
    <group>
      <Rod p={[0, 0.07, 0]} s={[0.035, 0.14, 0.035]} m={glow ? mat.highlight() : mat.glass()} />
      {layers &&
        SOIL_LAYERS.map((l) => {
          const h = layers[l] / 1000;
          const yy = y + h / 2;
          y += h;
          return h > 0.0005 ? <Rod key={l} p={[0, yy, 0]} s={[0.033, h, 0.033]} m={colourMaterial(LAYER_COLOUR[l])} /> : null;
        })}
      <Rod p={[0, (y + 0.12) / 2, 0]} s={[0.033, Math.max(0.001, 0.12 - y), 0.033]} m={liquidMaterial(cloudy > 0.15 ? '#8b6b4a' : '#cfe6f1', 0.25 + 0.5 * cloudy)} />
      <Rod p={[0, 0.145, 0]} s={[0.037, 0.012, 0.037]} m={colourMaterial('#c62828')} />
    </group>
  );
}
function FunnelOverCylinder({ soil, volume, muddy, glow }: { soil: SoilType; volume: number; muddy: boolean; glow?: boolean }) {
  const h = 0.22;
  return (
    <group>
      <Rod p={[0, h / 2, 0]} s={[0.022, h, 0.022]} m={glow ? mat.highlight() : mat.glass()} />
      <Rod p={[0, (volume / 100) * h * 0.45, 0]} s={[0.02, Math.max(0.001, (volume / 100) * h * 0.9), 0.02]} m={liquidMaterial(muddy ? '#a1887f' : '#90caf9', 0.6)} />
      <mesh position={[0, h + 0.06, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.05, 0.07, 16, 1, true]} />
        <meshStandardMaterial color="#e8f1f4" transparent opacity={0.5} side={2} />
      </mesh>
      <Rod p={[0, h + 0.075, 0]} s={[0.035, 0.03, 0.035]} m={colourMaterial(SOIL_COLOUR[soil])} />
    </group>
  );
}
function Crucible({ hot, soilIn, soil, glow }: { hot: boolean; soilIn: boolean; soil: SoilType; glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.11, 0]} s={[0.002, 0.22, 0.002]} m={mat.darkMetal()} />
      {[0, 2.1, 4.2].map((r) => (
        <Rod key={r} p={[Math.cos(r) * 0.045, 0.11, Math.sin(r) * 0.045]} s={[0.004, 0.22, 0.004]} m={mat.darkMetal()} />
      ))}
      <Rod p={[0, 0.235, 0]} s={[0.03, 0.03, 0.03]} m={glow ? mat.highlight() : hot ? colourMaterial('#ff7043') : colourMaterial('#f2efe6')} />
      {soilIn && <Rod p={[0, 0.25, 0]} s={[0.026, 0.003, 0.026]} m={colourMaterial(hot ? '#3e2723' : SOIL_COLOUR[soil])} />}
      {hot && (
        <mesh position={[0, 0.17, 0]} geometry={ball} scale={[0.02, 0.05, 0.02]}>
          <meshBasicMaterial color="#5c8dff" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}
function Bag({ soil, glow }: { soil: SoilType; glow?: boolean }) {
  return (
    <group>
      <Box p={[0, 0.06, 0]} s={[0.1, 0.12, 0.07]} m={glow ? mat.highlight() : colourMaterial('#e9e2cf')} />
      <Box p={[0, 0.121, 0]} s={[0.09, 0.004, 0.06]} m={colourMaterial(SOIL_COLOUR[soil])} />
    </group>
  );
}
function Desiccator({ glow }: { glow?: boolean }) {
  return (
    <group>
      <Rod p={[0, 0.05, 0]} s={[0.07, 0.1, 0.07]} m={glow ? mat.highlight() : mat.glass()} />
      <mesh position={[0, 0.1, 0]} geometry={ball} scale={[0.072, 0.03, 0.072]} material={mat.glass()} />
      <Rod p={[0, 0.02, 0]} s={[0.065, 0.03, 0.065]} m={colourMaterial('#4fc3f7')} />
    </group>
  );
}

export function ApparatusModel({ id, glow }: { id: EcoApparatusId; glow?: boolean }) {
  switch (id) {
    case 'quadrat':
      return <QuadratFrame glow={glow} size={0.3} />;
    case 'tapes':
      return <TapeReel glow={glow} />;
    case 'pegs':
      return <Pegs glow={glow} />;
    case 'randtable':
      return <Card glow={glow} />;
    case 'guide':
      return <Card glow={glow} colour="#2e7d32" w={0.14} d={0.19} />;
    case 'net':
      return (
        <group scale={0.35}>
          <SweepNet glow={glow} />
        </group>
      );
    case 'box':
      return <Box p={[0, 0.05, 0]} s={[0.14, 0.1, 0.1]} m={glow ? mat.highlight() : mat.glass()} />;
    case 'tray':
      return <Tray w={0.24} d={0.16} glow={glow} />;
    case 'paint':
      return <PaintPot colour="#ffffff" glow={glow} />;
    case 'redpaint':
      return <PaintPot colour="#e53935" glow={glow} />;
    case 'scissors':
      return <Box p={[0, 0.005, 0]} s={[0.1, 0.008, 0.03]} m={glow ? mat.highlight() : mat.steel()} />;
    case 'watch':
      return <StopwatchModel sec={null} glow={glow} />;
    case 'thermo':
    case 'soilthermo':
      return <Thermometer glow={glow} />;
    case 'hygro':
      return <Hygrometer glow={glow} />;
    case 'lightmeter':
      return <Meter colour="#ffb300" glow={glow} />;
    case 'anemo':
      return <Meter colour="#1e88e5" glow={glow} />;
    case 'phkit':
      return (
        <group>
          <Card glow={glow} colour="#fafafa" w={0.12} d={0.08} />
          <Rod p={[0.03, 0.05, 0]} s={[0.008, 0.1, 0.008]} m={mat.glass()} />
        </group>
      );
    case 'secchi':
      return <Secchi glow={glow} />;
    case 'jars':
      return <Jar layers={null} cloudy={0} glow={glow} />;
    case 'funnels':
      return <FunnelOverCylinder soil="LOAM" volume={0} muddy={false} glow={glow} />;
    case 'cylinders':
      return <MeasuringCylinder glow={glow} />;
    case 'rod':
      return <Rod p={[0, 0.005, 0]} s={[0.004, 0.2, 0.004]} m={glow ? mat.highlight() : mat.glass()} r={[0, 0, Math.PI / 2]} />;
    case 'crucibles':
      return <Rod p={[0, 0.015, 0]} s={[0.03, 0.03, 0.03]} m={glow ? mat.highlight() : colourMaterial('#f2efe6')} />;
    case 'burner':
      return <BunsenBurner glow={glow} />;
    case 'tongs':
      return <Box p={[0, 0.006, 0]} s={[0.16, 0.008, 0.02]} m={glow ? mat.highlight() : mat.steel()} />;
    case 'desiccator':
      return <Desiccator glow={glow} />;
    case 'balance':
      return (
        <group scale={0.7}>
          <BalanceModel mass={null} glow={glow} />
        </group>
      );
    case 'ruler':
      return (
        <group scale={0.6}>
          <Ruler glow={glow} />
        </group>
      );
  }
}

/** The apparatus still in the equipment shed (tap, or drag to the tray, to take it to the table). */
export function EcoShed({ scene, task }: { scene: EcoScene; task: BioEcologyState['task'] }) {
  const items = shedFor(task ?? 'QUADRAT');
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Field equipment shed" labelY={2.4}>
        <mesh position={[0, 1.0, -0.15]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {items
        .filter((a) => !scene.collected.has(a.id))
        .map((a, k) => (
          <Interactive key={a.id} id={`cup:${a.id}`} label={a.label} labelY={0.3} position={[-0.95 + (k % 5) * 0.47, CUPBOARD_SHELVES[2 - Math.floor(k / 5)] ?? CUPBOARD_SHELVES[0]!, 0.05]} drag={carry}>
            {(active) => (
              <group>
                <ApparatusModel id={a.id} glow={active} />
                <mesh position={[0, 0.07, 0]}>
                  <boxGeometry args={[0.2, 0.16, 0.14]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            )}
          </Interactive>
        ))}
    </group>
  );
}

/** A thing on the table, by its apparatus id, if collected. */
function Item({ id, has, p, label, rot, children, drag }: { drag?: string; id: string; has: boolean; p: readonly [number, number, number]; label: string; rot?: V3; children?: (a: boolean) => React.ReactNode }) {
  if (!has) return null;
  return (
    <Interactive id={id} label={label} bench position={at(p)} rotation={rot} labelY={0.12} drag={drag ? () => drag : undefined}>
      {(a) => (children ? children(a) : <ApparatusModel id={id as EcoApparatusId} glow={a} />)}
    </Interactive>
  );
}

export function EcoStation({ v, state, scene }: { v: BioEcologyVariant; state: BioEcologyState; scene: EcoScene }) {
  const task = state.task ?? 'QUADRAT';
  const has = (id: EcoApparatusId) => scene.collected.has(id);
  const card = useMemo(
    () =>
      task === 'CAPTURE'
        ? bioTaskCardTexture('Capture–recapture', ['Sweep a fixed time; count n₁.', 'Small harmless mark; release.', 'Wait a day; sweep the same way.', 'n₂ and m; N = n₁ × n₂ ÷ m.'])
        : task === 'FACTORS'
          ? bioTaskCardTexture('Ecological factors', ['9 am: Six’s, rain gauge, vane.', 'Open field and canopy, same time.', 'Shade the thermometers.', 'Three days; means; compare.'])
          : task === 'SOIL'
            ? bioTaskCardTexture('Soil properties', ['Jar: shake, settle a day, layers.', 'Funnels: 100 g, 100 cm³, 30 min.', 'Air: 50 + 50 cm³, stir.', 'Humus: heat to constant mass.'])
            : bioTaskCardTexture('Quadrat sampling', ['Peg out the 20 m × 20 m plot.', 'Random coordinates: 10+ quadrats.', 'Count each herb; grass cover.', 'Density, frequency, population.']),
    [task],
  );
  const book = useMemo(() => bioBookTexture('Field notebook'), []);
  const extras = (['redpaint', 'scissors', 'net', 'balance', 'thermo'] as EcoApparatusId[]).filter((id) => has(id) && !shedFor(task).some((a) => a.id === id && a.for.includes(task)));
  return (
    <>
      <group position={STATION}>
        {/* the trestle table itself */}
        <Box p={[0, -0.025, 0]} s={[BENCH.w, 0.05, BENCH.d]} m={colourMaterial('#d9cfb8')} />
        {[-1, 1].map((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} p={[sx * (BENCH.w / 2 - 0.1), -BENCH.h / 2, sz * (BENCH.d / 2 - 0.08)]} s={[0.04, BENCH.h, 0.04]} m={mat.metal()} />))}
        <Interactive id="mybench" label="Your field table" labelY={0.5}>
          <mesh position={[0, 0.005, 0]}>
            <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </Interactive>
        {task === 'QUADRAT' && (
          <>
            <Item id="quadrat" has={has('quadrat')} p={ESPOT.quadrat} label="1 m quadrat (string grid)" drag="quaddrag" />
            <Item id="tapes" has={has('tapes')} p={ESPOT.tapes} label="Measuring tapes" />
            <Item id="pegs" has={has('pegs')} p={ESPOT.pegs} label="Pegs and string" />
            <Item id="randtable" has={has('randtable')} p={ESPOT.table} label="Random-number table" />
            <Item id="guide" has={has('guide')} p={ESPOT.guide} label="Identification guide" />
          </>
        )}
        {task === 'CAPTURE' && <CaptureTable v={v} state={state} has={has} />}
        {task === 'FACTORS' && (
          <>
            {(['thermo', 'soilthermo', 'hygro', 'lightmeter', 'anemo', 'phkit', 'secchi'] as EcoApparatusId[]).map((id) => (
              <Item key={id} id={id} has={has(id)} p={ESPOT[id as 'thermo']} label={ECO_APPARATUS_LABEL[id]} rot={id === 'thermo' || id === 'soilthermo' ? [0, 0.4, 0] : undefined} />
            ))}
          </>
        )}
        {task === 'SOIL' && <SoilTable v={v} state={state} has={has} />}
        {extras.map((id, k) => (
          <Item key={id} id={id} has p={[ESPOT.extras[0], 0.004, ESPOT.extras[2] - 0.15 * k]} label={ECO_APPARATUS_LABEL[id]} />
        ))}
        <Interactive id="card" label="Task card" bench position={at(ESPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
          <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
            <planeGeometry args={[0.2, 0.14]} />
            <meshStandardMaterial map={card} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
            <planeGeometry args={[0.2, 0.14]} />
          </mesh>
        </Interactive>
        <Interactive id="book" label="Your field notebook" bench position={at(ESPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
          <mesh position={[0, 0.006, 0]} material={mat.green()}>
            <boxGeometry args={[0.3, 0.008, 0.2]} />
          </mesh>
          <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.29, 0.19]} />
            <meshStandardMaterial map={book} roughness={0.85} />
          </mesh>
        </Interactive>
      </group>
      {task === 'FACTORS' && <SiteStakes state={state} />}
    </>
  );
}

function CaptureTable({ v, state, has }: { v: BioEcologyVariant; state: BioEcologyState; has: (id: EcoApparatusId) => boolean }) {
  const w = state.cap;
  const t = capTrays(v, state);
  const items = w.second ? t.second : w.counted1 ? t.first : [];
  const showBright = w.mark === 'BRIGHT';
  return (
    <>
      <Item id="net" has={has('net')} p={[ESPOT.net[0], -0.9, ESPOT.net[2]]} label="Sweep net">
        {(a) => <SweepNet glow={a} />}
      </Item>
      <Item id="box" has={has('box')} p={ESPOT.box} label={w.first && !w.counted1 ? 'Collecting box (the catch inside)' : 'Collecting box'} />
      <Item id="tray" has={has('tray')} p={ESPOT.tray} label="White tray">
        {(a) => (
          <group>
            <Tray w={0.3} d={0.2} glow={a} />
            {items.slice(0, 80).map((it, i) => (
              <group key={i} position={[-0.14 + it.x * 0.28, 0.014, -0.09 + it.y * 0.18]} rotation={[0, it.a, 0]}>
                <Box p={[0, 0, 0]} s={[0.022 * it.s, 0.006, 0.006]} m={colourMaterial('#7fa23a')} />
                {it.marked && showBright && <Box p={[0, 0.0035, 0]} s={[0.008, 0.002, 0.006]} m={colourMaterial('#e53935')} />}
                {it.marked && w.mark === 'DOT' && w.examined && <Box p={[0.003, 0.0035, 0]} s={[0.003, 0.002, 0.003]} m={mat.white()} />}
              </group>
            ))}
          </group>
        )}
      </Item>
      <Item id="paint" has={has('paint')} p={ESPOT.paint} label="Non-toxic paint and brush" />
      <Item id="redpaint" has={has('redpaint')} p={ESPOT.redpaint} label="Red gloss paint" />
      <Item id="scissors" has={has('scissors')} p={ESPOT.scissors} label="Scissors" />
      <Item id="watch" has={has('watch')} p={ESPOT.watch} label="Stopwatch" />
    </>
  );
}

function SoilTable({ v, state, has }: { v: BioEcologyVariant; state: BioEcologyState; has: (id: EcoApparatusId) => boolean }) {
  const w = state.soil;
  return (
    <>
      {SOIL_TYPES.map((t, k) => (
        <Interactive key={t} id={`bag:${t}`} label={`${t === 'SAND' ? 'Sandy' : t === 'LOAM' ? 'Loamy' : 'Clay'} soil (oven-dried and damp)`} bench position={at(bagSpot(k))} labelY={0.18} drag={() => "bagdrag"}>
          {(a) => <Bag soil={t} glow={a} />}
        </Interactive>
      ))}
      {has('jars') &&
        (w.jars.length ? w.jars : [null]).map((j, i) => {
          const n = j ? jarNow(v, state, i) : null;
          return (
            <Interactive key={i} id={j ? `jar:${i}` : 'jars'} label={j ? `Jar ${i + 1}: ${j.soil.toLowerCase()} and water` : 'Screw-top jar'} bench position={at(jarSpot(i))} labelY={0.2}>
              {(a) => <Jar layers={n && j?.shakenAt !== null ? n.layers : null} cloudy={n?.cloudy ?? 0} glow={a} />}
            </Interactive>
          );
        })}
      {has('funnels') &&
        (w.funnels.length ? w.funnels : [null]).map((f, i) => {
          const d = f ? drainNow(v, state, i) : null;
          return (
            <Interactive key={i} id={f ? `funnel:${i}` : 'funnels'} label={f ? `Funnel ${i + 1}: ${f.mass} g of ${f.soil.toLowerCase()}${f.cotton ? '' : ' (no cotton wool)'}` : 'Funnels and stand'} bench position={at(funnelSpot(i))} labelY={0.38}>
              {(a) => <FunnelOverCylinder soil={f?.soil ?? 'LOAM'} volume={d?.volume ?? 0} muddy={!!d?.muddy} glow={a} />}
            </Interactive>
          );
        })}
      {has('cylinders') &&
        (w.airs.length ? w.airs : [null]).map((x, i) => {
          const n = x ? airNow(v, state, i) : null;
          return (
            <Interactive key={i} id={x ? `aircyl:${i}` : 'cylinders'} label={x ? `Cylinder ${i + 1}: 50 cm³ water${x.added ? ` + ${x.soil.toLowerCase()}` : ''}` : 'Measuring cylinders'} bench position={at(airSpot(i))} labelY={0.25}>
              {(a) => (
                <group>
                  <Rod p={[0, 0.1, 0]} s={[0.018, 0.2, 0.018]} m={a ? mat.highlight() : mat.glass()} />
                  {x && <Rod p={[0, ((n?.final ?? 50) / 100) * 0.09, 0]} s={[0.016, Math.max(0.001, ((n?.final ?? 50) / 100) * 0.18), 0.016]} m={liquidMaterial(x.added ? '#8d6e4a' : '#90caf9', 0.6)} />}
                </group>
              )}
            </Interactive>
          );
        })}
      {has('rod') && (
        <Item id="rod" has p={[ESPOT.aircyl[0] + 0.22, 0, ESPOT.aircyl[2]]} label="Glass rod" />
      )}
      {has('burner') &&
        (w.crucibles.length ? w.crucibles : [null]).map((c, i) => (
          <Interactive key={i} id={c ? `crucible:${i}` : 'burner'} label={c ? `Crucible ${i + 1}: ${c.soil.toLowerCase()}${c.hot ? ' (hot)' : ''}` : 'Burner, tripod and pipe-clay triangle'} bench position={at(crucibleSpot(i))} labelY={0.34}>
            {(a) => (
              <group>
                {c ? <Crucible hot={c.hot} soilIn={c.soilIn} soil={c.soil} glow={a} /> : <BunsenBurner glow={a} />}
                {c?.hot && (
                  <group scale={0.8}>
                    <BunsenBurner />
                  </group>
                )}
              </group>
            )}
          </Interactive>
        ))}
      <Item id="tongs" has={has('tongs')} p={[ESPOT.burner[0], 0, ESPOT.burner[2] + 0.12]} label="Crucible tongs" />
      <Item id="desiccator" has={has('desiccator')} p={ESPOT.desiccator} label="Desiccator" />
      {has('balance') && (
        <Interactive id="balance" label="Electronic balance" bench position={at(ESPOT.balance)} labelY={0.14}>
          {(a) => <BalanceModel mass={w.weighs.length ? crucibleShown(v, state, w.weighs.at(-1)!.c) : null} glow={a} />}
        </Interactive>
      )}
      <Item id="ruler" has={has('ruler')} p={ESPOT.ruler} label="Ruler (mm)" />
      <Item id="watch" has={has('watch')} p={[ESPOT.rack[0] + 0.28, 0, ESPOT.rack[2]]} label="Stopwatch" />
    </>
  );
}

/** Instruments left at the sites once read (a stake with the thermometer in the shade of its card). */
function SiteStakes({ state }: { state: BioEcologyState }) {
  const w = state.fac;
  return (
    <>
      {(['OPEN', 'SHADE'] as const).map((site) => {
        const p = site === 'OPEN' ? FIELD.open : FIELD.shade;
        const used = w.reads.some((r) => r.site === site);
        return (
          <Interactive key={site} id={`site:${site}`} label={site === 'OPEN' ? 'Open-field site' : 'Canopy site'} labelY={1.4} position={p}>
            {(a) => (
              <group>
                <Rod p={[0, 0.5, 0]} s={[0.025, 1.0, 0.025]} m={a ? mat.highlight() : mat.woodDark()} />
                <Box p={[0, 1.02, 0]} s={[0.3, 0.2, 0.01]} m={colourMaterial(site === 'OPEN' ? '#fbc02d' : '#43a047')} />
                {used && (
                  <group position={[0.06, 0.9, 0.04]}>
                    <Box p={[0, 0, 0]} s={[0.01, 0.22, 0.01]} m={mat.white()} />
                    <Box p={[0, 0, 0.05]} s={[0.12, 0.16, 0.005]} m={mat.white()} />
                  </group>
                )}
              </group>
            )}
          </Interactive>
        );
      })}
    </>
  );
}
