import type { GenPaper, GenRoom } from '@aischool/shared';
import type { ReactNode } from 'react';
import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { BENCH, BENCHES, HALF_D, HALF_W, ROOM } from '../../../lab3d-kit/layout';
import { colourMaterial } from '../../../lab3d-kit/materials';
import type { RoomConfig } from '../../../lab3d-kit/room';

/**
 * One reusable workbench room: the kit's room shell (so walking, collisions and
 * the bench views all still fit) with the chemistry fittings off and a dressing
 * for the kind of work. All procedural, nothing per lesson.
 */

const box = new BoxGeometry(1, 1, 1);
const cyl = new CylinderGeometry(1, 1, 1, 14);
const ball = new SphereGeometry(1, 12, 10);
const cone = new ConeGeometry(1, 1, 10);
type V3 = [number, number, number];
const B = ({ p, s, c, r }: { p: V3; s: V3; c: string; r?: V3 }) => <mesh geometry={box} material={colourMaterial(c)} position={p} scale={s} rotation={r} />;
const C = ({ p, s, c, r }: { p: V3; s: V3; c: string; r?: V3 }) => <mesh geometry={cyl} material={colourMaterial(c)} position={p} scale={s} rotation={r} />;

/** The floor, wall band and worktop of each room. */
const PALETTE: Record<GenRoom, { floor: string; band: string; top: string; poster: { title: string; band: string; lines: string[] } }> = {
  workshop: { floor: '#8c8378', band: '#6b5a44', top: '#c49a6c', poster: { title: 'Workshop rules', band: '#7a4a1f', lines: ['Sharp tools, sharp minds', 'Secure the work', 'Hands behind the edge', 'Sweep up as you go'] } },
  kitchen: { floor: '#d9d3c5', band: '#3f7f8c', top: '#cfd8dc', poster: { title: 'Food hygiene', band: '#2a7a6f', lines: ['Wash your hands', 'Raw and cooked apart', 'Clean as you go', 'Keep food covered'] } },
  studio: { floor: '#7a6a58', band: '#4a4470', top: '#5a5470', poster: { title: 'In the studio', band: '#4a4470', lines: ['Listen first', 'Sit up, breathe', 'Slow practice is fast', 'Respect the instruments'] } },
  field: { floor: '#6f9153', band: '#7fb0d6', top: '#a3b18a', poster: { title: 'In the field', band: '#3f6f3f', lines: ['Work in pairs', 'Record as you go', 'Leave it as you found it', 'Stay with your group'] } },
  drawing: { floor: '#b9bfc4', band: '#2f5f8a', top: '#dfe7ee', poster: { title: 'Drawing office', band: '#2f5f8a', lines: ['Sharp pencil, fine line', 'Measure twice', 'Dimension clearly', 'Title every sheet'] } },
  lab: { floor: '#c9ccc9', band: '#4f8a7a', top: '#55646e', poster: { title: 'Good practice', band: '#4f8a7a', lines: ['Plan before you start', 'Record as you go', 'Label everything', 'Clear up safely'] } },
};

function Workshop() {
  return (
    <group>
      {/* pegboard of tools on the north wall */}
      <B p={[-4.4, 1.75, -HALF_D + 0.03]} s={[3.2, 1.1, 0.03]} c="#b48a5a" />
      {[...Array(9).keys()].map((i) => (
        <B key={i} p={[-5.7 + i * 0.32, 1.72 + (i % 2) * 0.12, -HALF_D + 0.06]} s={[0.05, 0.42 + (i % 3) * 0.12, 0.02]} c={i % 2 ? '#3a4047' : '#a9744a'} />
      ))}
      {/* timber rack */}
      {[0, 1, 2, 3].map((i) => (
        <B key={i} p={[HALF_W - 0.45, 0.5 + i * 0.28, 3.2]} s={[0.3, 0.08, 2.6]} c="#c79a63" />
      ))}
      {/* vices on the front benches */}
      {BENCHES.slice(0, 3).map(([x, z]) => (
        <group key={x} position={[x + BENCH.w / 2 - 0.2, BENCH.h, z + BENCH.d / 2 + 0.02]}>
          <B p={[0, -0.03, 0]} s={[0.2, 0.08, 0.1]} c="#2f6fb0" />
          <C p={[0, -0.03, 0.09]} s={[0.012, 0.14, 0.012]} c="#b9c0c7" r={[Math.PI / 2, 0, 0]} />
        </group>
      ))}
      {/* shavings */}
      {[[-2.4, 0.9], [2.2, 3.1], [1.1, 0.6], [-5, 3.3]].map(([x, z]) => (
        <mesh key={x} geometry={ball} material={colourMaterial('#e3c79a')} position={[x!, 0.01, z!]} scale={[0.32, 0.015, 0.22]} />
      ))}
    </group>
  );
}

function Kitchen() {
  return (
    <group>
      {/* cookers and a worktop along the east wall */}
      {[-2.8, -1.8, 2.6, 3.6].map((z) => (
        <group key={z} position={[HALF_W - 0.42, 0, z]}>
          <B p={[0, 0.45, 0]} s={[0.66, 0.9, 0.84]} c="#e8edf0" />
          <B p={[-0.34, 0.42, 0]} s={[0.02, 0.5, 0.6]} c="#2a2f33" />
          {[-0.2, 0.2].map((k) => (
            <C key={k} p={[0, 0.91, k]} s={[0.12, 0.02, 0.12]} c="#2a2f33" />
          ))}
        </group>
      ))}
      {/* hanging pans */}
      <B p={[-1.8, 2.3, -HALF_D + 0.1]} s={[2.6, 0.03, 0.03]} c="#b9c0c7" />
      {[-2.8, -2.2, -1.5, -0.9].map((x, i) => (
        <group key={x} position={[x, 2.05, -HALF_D + 0.12]}>
          <C p={[0, 0, 0]} s={[0.13 + i * 0.015, 0.03, 0.13 + i * 0.015]} c="#3a4047" r={[Math.PI / 2, 0, 0]} />
          <B p={[0, 0.17, 0]} s={[0.02, 0.26, 0.02]} c="#3a4047" />
        </group>
      ))}
      {/* fridge */}
      <B p={[-HALF_W + 0.5, 0.95, 4.2]} s={[0.8, 1.9, 0.75]} c="#f2f4f5" />
      <B p={[-HALF_W + 0.93, 1.1, 3.95]} s={[0.04, 0.5, 0.04]} c="#8a9299" />
      {/* a bowl of fruit on the teacher's desk */}
      <mesh geometry={ball} material={colourMaterial('#e0a13a')} position={[-1.5, 0.84, -3.5]} scale={0.06} />
      <mesh geometry={ball} material={colourMaterial('#c8342b')} position={[-1.6, 0.84, -3.42]} scale={0.055} />
    </group>
  );
}

function Studio() {
  return (
    <group>
      {/* upright piano */}
      <group position={[-5.4, 0, 3.4]}>
        <B p={[0, 0.65, 0]} s={[1.5, 1.3, 0.5]} c="#2a2230" />
        <B p={[0, 0.72, 0.36]} s={[1.46, 0.08, 0.26]} c="#f4f1e8" />
        {[...Array(14).keys()].map((i) => (
          <B key={i} p={[-0.65 + i * 0.1, 0.78, 0.3]} s={[0.05, 0.03, 0.14]} c="#111" />
        ))}
      </group>
      {/* music stands */}
      {[[-2.2, 3.4], [-0.9, 3.5], [0.4, 3.4]].map(([x, z]) => (
        <group key={x} position={[x!, 0, z!]}>
          <C p={[0, 0.6, 0]} s={[0.012, 1.2, 0.012]} c="#222" />
          <B p={[0, 1.22, 0]} s={[0.46, 0.32, 0.015]} c="#222" r={[-0.4, 0, 0]} />
        </group>
      ))}
      {/* acoustic panels */}
      {[-5, -3.8, -2.6, 1.6, 2.8].map((x, i) => (
        <B key={x} p={[x, 2.1, -HALF_D + 0.05]} s={[1, 0.8, 0.06]} c={i % 2 ? '#6a5f95' : '#8a7fb5'} />
      ))}
      {/* a drum in the corner */}
      <C p={[HALF_W - 0.8, 0.3, 3.8]} s={[0.26, 0.6, 0.26]} c="#a9472f" />
      <C p={[HALF_W - 0.8, 0.61, 3.8]} s={[0.27, 0.02, 0.27]} c="#efe6d2" />
    </group>
  );
}

function Field() {
  return (
    <group>
      {/* walls painted as open country */}
      <B p={[0, 1.1, -HALF_D + 0.02]} s={[ROOM.w, 0.7, 0.02]} c="#5e8a4c" />
      <B p={[HALF_W - 0.02, 1.1, 0]} s={[0.02, 0.7, ROOM.d]} c="#5e8a4c" />
      {[[-5.5, -3.8], [-3.6, 3.8], [5.8, -3.4], [2.4, 3.9], [-5.8, 1.2], [5.9, 0.4]].map(([x, z], i) => (
        <group key={i} position={[x!, 0, z!]}>
          <C p={[0, 0.5, 0]} s={[0.08, 1, 0.08]} c="#6b4a2f" />
          <mesh geometry={cone} material={colourMaterial('#3f7f3f')} position={[0, 1.5, 0]} scale={[0.6, 1.4, 0.6]} />
        </group>
      ))}
      {/* ranging poles */}
      {[[-2.2, 3.1], [-0.8, 3.1], [0.6, 3.1]].map(([x, z]) => (
        <C key={x} p={[x!, 0.75, z!]} s={[0.018, 1.5, 0.018]} c="#c8342b" />
      ))}
    </group>
  );
}

function DrawingOffice() {
  return (
    <group>
      {/* tilted boards on the benches that aren't in use */}
      {BENCHES.slice(3).map(([x, z]) => (
        <group key={x} position={[x, BENCH.h + 0.1, z]} rotation={[0.35, 0, 0]}>
          <B p={[0, 0, 0]} s={[1.1, 0.03, 0.75]} c="#f7f7f2" />
          <B p={[0, 0.02, 0.1]} s={[1.0, 0.012, 0.03]} c="#2f5f8a" />
          <B p={[-0.2, 0.018, -0.05]} s={[0.6, 0.004, 0.42]} c="#e9f1f7" />
        </group>
      ))}
      {/* plans on the wall */}
      {[-5.2, -3.9, -2.6].map((x) => (
        <B key={x} p={[x, 1.8, -HALF_D + 0.03]} s={[1.1, 0.8, 0.02]} c="#1f4f86" />
      ))}
      {/* rolls of paper */}
      {[0, 1, 2, 3].map((i) => (
        <C key={i} p={[HALF_W - 0.5, 0.45, 3.2 + i * 0.16]} s={[0.05, 0.9, 0.05]} c="#efe9d8" />
      ))}
    </group>
  );
}

const DRESSING: Record<GenRoom, () => ReactNode> = { workshop: Workshop, kitchen: Kitchen, studio: Studio, field: Field, drawing: DrawingOffice, lab: () => null };

export function roomConfig(paper: GenPaper): RoomConfig {
  const pal = PALETTE[paper.room];
  const D = DRESSING[paper.room];
  return {
    whiteboard: paper.board,
    whiteboardNote: 'Safety first!',
    frontPoster: pal.poster,
    doorPoster: pal.poster,
    sinks: paper.room === 'kitchen' || paper.room === 'lab',
    benchRacks: false,
    reagentShelf: paper.room === 'lab',
    fumeCupboard: false,
    periodicTable: false,
    extras: (
      <group>
        {/* the room's own floor and wall band over the kit's shell */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} material={colourMaterial(pal.floor)}>
          <planeGeometry args={[ROOM.w, ROOM.d]} />
        </mesh>
        <B p={[0, 2.95, -HALF_D + 0.015]} s={[ROOM.w, 0.08, 0.02]} c={pal.band} />
        {/* worktops */}
        {BENCHES.map(([x, z]) => (
          <B key={`${x}${z}`} p={[x, BENCH.h + 0.002, z]} s={[BENCH.w, 0.006, BENCH.d]} c={pal.top} />
        ))}
        <D />
      </group>
    ),
  };
}
