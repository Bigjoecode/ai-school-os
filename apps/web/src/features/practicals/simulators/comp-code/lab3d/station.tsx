import { compFamily, crimpRun, htmlFacts, maintRun, type CompCodeState, type CompCodeVariant } from '@aischool/shared';
import { useMemo } from 'react';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { bookTexture, taskCardTexture } from '../../../lab3d-kit/textures';
import { CSPOT } from './bench';
import { Bottle, CableCoil, CableTester, Cloth, Crimper, DvdTray, Keyboard, Monitor, Mouse, SystemUnit, Ups, type ScreenPicture } from './models';
import { COMP_APPARATUS, COMP_APPARATUS_LABEL, type CompApparatusId, type CompScene } from './scene-state';

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];

function ApparatusModel({ id, glow }: { id: CompApparatusId; glow?: boolean }) {
  switch (id) {
    case 'cable':
      return <CableCoil glow={glow} />;
    case 'crimper':
      return <Crimper glow={glow} />;
    case 'tester':
      return <CableTester lights={null} glow={glow} />;
    case 'cloth':
      return <Cloth glow={glow} />;
    case 'alcohol':
      return <Bottle colour="#e2e8f0" glow={glow} />;
    case 'blower':
      return <Bottle colour="#334155" glow={glow} />;
    case 'brush':
      return <Bottle colour="#b45309" glow={glow} />;
    case 'lensDisc':
      return <Bottle colour="#a78bfa" glow={glow} />;
    case 'plugs':
      return <Bottle colour="#bae6fd" glow={glow} />;
    case 'pendrive':
      return <Cloth glow={glow} />;
  }
}

export function CompCupboard({ scene }: { scene: CompScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Equipment cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {COMP_APPARATUS.filter((a) => !scene.collected.has(a.id)).map((a, i) => (
        <Interactive key={a.id} id={`cup:${a.id}`} label={a.label} labelY={0.28} position={[-0.9 + (i % 5) * 0.42, CUPBOARD_SHELVES[1 + (i > 4 ? 1 : 0)]!, 0.05]} drag={carry}>
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

const CARD = (v: CompCodeVariant): string[] => (compFamily(v.task) === 'BENCH' ? [v.task === 'CRIMP' ? `Cut ${v.crimp.run} m. T568B at both ends.` : 'Shut down, clean, test the UPS.', v.task === 'CRIMP' ? 'Strip, untwist, trim, crimp, test.' : 'Restart, Disk Cleanup, update, back up.', 'Record your results in the notebook.'] : v.programs.slice(0, 3).map((p) => p.title));

/** What the monitor shows for the work in hand. */
export function screenPicture(v: CompCodeVariant, s: CompCodeState, scene: CompScene, tab: number): ScreenPicture {
  const fam = compFamily(v.task);
  if (v.task === 'MAINT') return maintRun(s.events).on ? { kind: 'desktop', lines: [] } : { kind: 'off', lines: [] };
  if (!scene.power) return { kind: fam === 'BENCH' ? 'desktop' : 'off', lines: [] };
  const p = v.programs[Math.min(tab, v.programs.length - 1)];
  if (fam === 'BASIC' && p) {
    const src = s.programs[p.id] ?? '';
    return src.trim() ? { kind: 'code', lines: src.split('\n').slice(-14), title: s.names[p.id] || `PROGRAM ${p.id}` } : { kind: 'desktop', lines: [] };
  }
  if (fam === 'HTML') {
    const src = s.programs.page ?? '';
    return src.trim() ? { kind: 'page', lines: src.split('\n').slice(-13), title: htmlFacts(src).title } : { kind: 'desktop', lines: [] };
  }
  if (fam === 'FLOW' && p) {
    const n = s.charts[p.id]?.nodes ?? [];
    return n.length ? { kind: 'code', lines: n.map((x) => x.text).slice(-14), title: `FLOWCHART ${p.id}` } : { kind: 'desktop', lines: [] };
  }
  return { kind: 'desktop', lines: [] };
}

export function CompStation({ v, state, scene, tab }: { v: CompCodeVariant; state: CompCodeState; scene: CompScene; tab: number }) {
  const card = useMemo(() => taskCardTexture(CARD(v)), [v]);
  const book = useMemo(() => bookTexture(), []);
  const task = state.task ?? v.task;
  const picture = screenPicture(v, state, scene, tab);
  const mOn = task === 'MAINT' ? maintRun(state.events).on : scene.power || task === 'CRIMP';
  const pins = task === 'CRIMP' ? crimpRun(state.events) : null;
  const items = (['cloth', 'brush', 'alcohol', 'blower', 'lensDisc', 'plugs', 'pendrive'] as const).filter((id) => scene.collected.has(id));
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <Interactive id="monitor" label="Monitor" bench position={at(CSPOT.monitor)} labelY={0.52}>
        {(a) => <Monitor picture={picture} glow={a} />}
      </Interactive>
      <Interactive id="sysunit" label="System unit" bench position={at(CSPOT.sysunit)} labelY={0.46}>
        {(a) => <SystemUnit on={mOn} glow={a} />}
      </Interactive>
      <Interactive id="dvd" label="DVD drive" bench position={[CSPOT.sysunit[0], 0.34, CSPOT.sysunit[2] + 0.216]} labelY={0.05}>
        {(a) => <DvdTray glow={a} />}
      </Interactive>
      <Interactive id="keyboard" label="Keyboard" bench position={at(CSPOT.keyboard)} labelY={0.08}>
        {(a) => <Keyboard glow={a} />}
      </Interactive>
      <Interactive id="mouse" label="Mouse" bench position={at(CSPOT.mouse)} labelY={0.06}>
        {(a) => <Mouse glow={a} />}
      </Interactive>
      <Interactive id="ups" label="UPS" bench position={at(CSPOT.ups)} labelY={0.24}>
        {(a) => <Ups on={mOn} glow={a} />}
      </Interactive>
      <Interactive id="card" label="Task card" bench position={at(CSPOT.card)} rotation={[0, 0.3, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(CSPOT.book)} rotation={[0, 0.2, 0]} labelY={0.08}>
        <mesh position={[0, 0.006, 0]} material={mat.red()}>
          <boxGeometry args={[0.3, 0.008, 0.2]} />
        </mesh>
        <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.29, 0.19]} />
          <meshStandardMaterial map={book} roughness={0.85} />
        </mesh>
      </Interactive>
      {scene.collected.has('crimper') && (
        <Interactive id="crimper" label={COMP_APPARATUS_LABEL.crimper} bench position={at(CSPOT.crimper)} labelY={0.08}>
          {(a) => <Crimper glow={a} />}
        </Interactive>
      )}
      {scene.collected.has('cable') && (
        <Interactive id="cable" label={pins?.cut ? `Cable: ${pins.cut} m cut` : COMP_APPARATUS_LABEL.cable} bench position={[CSPOT.crimper[0] + 0.28, 0, CSPOT.crimper[2]]} labelY={0.1}>
          {(a) => <CableCoil glow={a} />}
        </Interactive>
      )}
      {scene.collected.has('tester') && (
        <Interactive id="tester" label={pins?.tested ? 'Cable tester (tested)' : COMP_APPARATUS_LABEL.tester} bench position={at(CSPOT.tester)} labelY={0.08}>
          {(a) => <CableTester lights={pins?.tested ? pins.pins : null} glow={a} />}
        </Interactive>
      )}
      {items.map((id, k) => (
        <Interactive key={id} id={id} label={COMP_APPARATUS_LABEL[id]} bench position={[CSPOT.kit[0] - (k % 4) * 0.13, 0.002, CSPOT.kit[2] + Math.floor(k / 4) * 0.12]} labelY={0.16}>
          {(a) => <ApparatusModel id={id} glow={a} />}
        </Interactive>
      ))}
    </group>
  );
}
