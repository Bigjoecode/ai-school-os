import { SKIN_AREAS, SKIN_AREA_LABEL, breathRoomShown, breathBulbShown, cobaltPink, limeTurbidity, type BioHumanState, type BioHumanVariant, type HumanTask } from '@aischool/shared';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';
import { Thermometer } from '../../../lab3d-kit/apparatus';
import { Interactive } from '../../../lab3d-kit/interact';
import { BENCH, CUPBOARD, STATION } from '../../../lab3d-kit/layout';
import { mat } from '../../../lab3d-kit/materials';
import { CUPBOARD_SHELVES } from '../../../lab3d-kit/room';
import { HandLens, Ruler } from '../../bio-common/lab3d/apparatus';
import { bioBookTexture, bioTaskCardTexture } from '../../bio-common/lab3d/textures';
import { StopwatchModel } from '../../bio-food-tests/lab3d/models';
import { lastDrop, lastPulse } from '../actions';
import { FLOOR, HSPOT, PARTNER_AT, SKIN_POINT, recent, useHumanBench } from './bench';
import { AirApparatus, AreaDot, Fingertips, BlindfoldModel, CobaltPaper, Dividers, HangingRule, Limb, MirrorModel, PacketModel, Partner, SmallBottle, StepBox, type PartnerPose } from './models';
import { HUMAN_APPARATUS_LABEL, neededFor, type HumanApparatusId, type HumanScene } from './scene-state';

/**
 * The student's bench for each task with the partner — seated with a wrist on
 * the bench, stepping on the box, breathing through the apparatus, catching
 * the rule at the bench corner, blindfolded with the skin areas marked — and
 * the cupboard's apparatus. Everything is drawn from the attempt's state.
 */

type V3 = [number, number, number];
const at = (s: readonly [number, number, number], dy = 0): V3 => [s[0], s[1] + dy, s[2]];
const S0 = CUPBOARD_SHELVES[0]! + 0.01;
const S1 = CUPBOARD_SHELVES[1]!;
const S2 = CUPBOARD_SHELVES[2]!;
const CUPBOARD_SLOT: Record<HumanApparatusId, V3> = {
  step: [-0.6, S0, 0.04],
  apparatus: [0.2, S0, 0.04],
  clock: [0.65, S0, 0.04],
  limewater: [-0.8, S1, 0.05],
  mouthpiece: [-0.55, S1, 0.05],
  mirror: [-0.3, S1, 0.05],
  cobalt: [-0.05, S1, 0.05],
  thermometer: [0.25, S1, 0.08],
  rule: [0.0, S2 + 0.2, 0.08],
  dividers: [-0.8, S2, 0.05],
  mmrule: [-0.5, S2, 0.07],
  blindfold: [0.35, S2, 0.06],
  wipes: [0.6, S2, 0.06],
  lens: [0.82, S2, 0.06],
};

export function ApparatusModel({ id, glow }: { id: HumanApparatusId; glow?: boolean }) {
  switch (id) {
    case 'clock':
      return <StopwatchModel sec={null} glow={glow} />;
    case 'step':
      return (
        <group scale={0.35}>
          <StepBox glow={glow} />
        </group>
      );
    case 'apparatus':
      return <AirApparatus turbA={0} turbB={0} lime={null} mouthpiece={false} bubbling={null} glow={glow} />;
    case 'limewater':
      return <SmallBottle colour="#eef3f3" glow={glow} />;
    case 'mouthpiece':
      return <PacketModel colour="#7fb3d5" glow={glow} />;
    case 'mirror':
      return <MirrorModel misted={false} glow={glow} />;
    case 'cobalt':
      return <CobaltPaper pink={null} glow={glow} />;
    case 'thermometer':
      return <Thermometer glow={glow} />;
    case 'rule':
      return (
        <group rotation={[0, 0, Math.PI / 2]} position={[0.5, 0, 0]} scale={0.5}>
          <HangingRule drop={0} glow={glow} />
        </group>
      );
    case 'dividers':
      return <Dividers sep={20} glow={glow} />;
    case 'mmrule':
      return <Ruler glow={glow} />;
    case 'blindfold':
      return <BlindfoldModel glow={glow} />;
    case 'wipes':
      return <PacketModel colour="#e0e0e0" glow={glow} />;
    case 'lens':
      return <HandLens glow={glow} />;
  }
}

/** The apparatus still in the cupboard (each can be taken to the bench, by tapping or dragging it to the tray). */
export function HumanCupboard({ scene }: { scene: HumanScene }) {
  const carry = () => 'carry' as const;
  return (
    <group position={[CUPBOARD.x, 0, CUPBOARD.z]} rotation={[0, -Math.PI / 2, 0]}>
      <Interactive id="cupboard" label="Apparatus cupboard" labelY={2.25}>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[CUPBOARD.w, 1.9, 0.02]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      {(Object.keys(CUPBOARD_SLOT) as HumanApparatusId[])
        .filter((id) => !scene.collected.has(id))
        .map((id) => (
          <Interactive key={id} id={`cup:${id}`} label={HUMAN_APPARATUS_LABEL[id]} labelY={0.3} position={CUPBOARD_SLOT[id]} drag={carry}>
            {(active) => (
              <group>
                <ApparatusModel id={id} glow={active} />
                <mesh position={[0, 0.07, 0]}>
                  <boxGeometry args={[0.18, 0.16, 0.12]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>
            )}
          </Interactive>
        ))}
    </group>
  );
}

/** The partner's pose for the task now. */
function partnerPose(task: HumanTask, state: BioHumanState, b: { exAt: number; breatheAt: number; kneeAt: number }): PartnerPose {
  const p = PARTNER_AT[task];
  const base: PartnerPose = { at: p.at, yaw: p.yaw, floor: FLOOR };
  if (task === 'PULSE') {
    if (recent(b.exAt, 4000)) return { at: [HSPOT.step[0], HSPOT.step[2] + 0.05], yaw: -0.3, floor: FLOOR + 0.22, standing: true, stepping: true };
    return { ...base, right: { elbow: [0.12, 0.04, -0.43], hand: [HSPOT.wrist[0], 0.04, HSPOT.wrist[2] + 0.02], palmUp: true }, left: { elbow: [0.5, 0.04, -0.45], hand: [0.42, 0.04, -0.3] } };
  }
  if (task === 'BREATH') {
    const lean = recent(b.breatheAt, 3000);
    return { ...base, mouth: lean ? [0, 0.36, -0.55] : null, right: { elbow: [-0.2, 0.04, -0.45], hand: lean ? [-0.04, 0.28, -0.32] : [-0.12, 0.04, -0.3] }, left: { elbow: [0.2, 0.04, -0.45], hand: [0.12, 0.04, -0.3] } };
  }
  if (task === 'REACTION') {
    const eyes = state.react.drops.at(-1)?.cond === 'EYES';
    return { ...base, crossed: true, kickAt: b.kneeAt, blind: eyes, right: { elbow: [1.28, 0.04, 0.18], hand: [HSPOT.rule[0] + 0.02, 0.04, HSPOT.rule[2] - 0.02] }, left: null };
  }
  return { ...base, blind: state.skin.blind, right: { elbow: [0.08, 0.04, -0.4], hand: [0.06, 0.045, -0.09], palmUp: true }, left: { elbow: [0.34, 0.04, -0.43], hand: [0.36, 0.05, -0.15], palmUp: false } };
}

export function HumanStation({ v, state, scene }: { v: BioHumanVariant; state: BioHumanState; scene: HumanScene }) {
  const task = state.task ?? 'PULSE';
  const has = (id: HumanApparatusId) => scene.collected.has(id);
  const bench = useHumanBench();
  const card = useMemo(
    () =>
      task === 'BREATH'
        ? bioTaskCardTexture('Inhaled and exhaled air', ['Clean mouthpiece; equal lime water.', 'Breathe gently ×10: which goes milky?', 'Dry mirror; cobalt chloride paper.', 'Room then breath temperature; count breaths.'])
        : task === 'REACTION'
          ? bioTaskCardTexture('Reaction time', ['Knee-jerk: side of the hand.', 'Forearm on bench edge; thumb at 0 cm.', 'Drop without warning ×10 (and other hand).', 't = √(2d ÷ g), d in metres.'])
          : task === 'SKIN'
            ? bioTaskCardTexture('Two-point discrimination', ['Clean points; blindfold the subject.', 'One or two points, at random.', 'Reduce the gap to find the threshold.', 'Five areas; rank them.'])
            : bioTaskCardTexture('Pulse and exercise', ['Ask about asthma, heart, sickle cell.', 'Rest 5 min; count 15 s ×3 (fingertips).', 'Step-ups 2 min; count at once.', 'Then every minute until back to rest.']),
    [task],
  );
  const book = useMemo(() => bioBookTexture('Practical notebook'), []);
  const extras = (['lens', 'clock', 'step', 'apparatus', 'limewater', 'mouthpiece', 'mirror', 'cobalt', 'thermometer', 'rule', 'dividers', 'mmrule', 'blindfold', 'wipes'] as HumanApparatusId[]).filter((id) => has(id) && !neededFor(task).some((a) => a.id === id));
  const pose = partnerPose(task, state, bench);
  return (
    <group position={STATION}>
      <Interactive id="mybench" label="Your bench" labelY={0.5}>
        <mesh position={[0, 0.005, 0]}>
          <boxGeometry args={[BENCH.w, 0.01, BENCH.d]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </Interactive>
      <Interactive id="partner" label={task === 'SKIN' ? (state.skin.blind ? 'Your partner (blindfolded)' : 'Your partner (the subject)') : 'Your partner'} labelY={0.75} position={[pose.at[0], 0, pose.at[1]]}>
        {(a) => (
          <group position={[-pose.at[0], 0, -pose.at[1]]}>
            <Partner pose={pose} glowOn={a} />
            <mesh position={[pose.at[0], 0.1, pose.at[1]]}>
              <boxGeometry args={[0.4, 0.8, 0.4]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        )}
      </Interactive>
      {task === 'PULSE' ? <PulseBench v={v} state={state} scene={scene} /> : task === 'BREATH' ? <BreathBench v={v} state={state} scene={scene} /> : task === 'REACTION' ? <ReactBench v={v} state={state} scene={scene} /> : <SkinBench state={state} scene={scene} />}
      {has('clock') && (task === 'PULSE' || task === 'BREATH') && <ClockOnBench v={v} state={state} task={task} />}
      {extras.map((id, k) => (
        <Interactive key={id} id={id} label={HUMAN_APPARATUS_LABEL[id]} bench position={[HSPOT.extras[0], 0.004, HSPOT.extras[2] - 0.13 * k]} labelY={0.08}>
          {(a) => (
            <group scale={0.5}>
              <ApparatusModel id={id} glow={a} />
            </group>
          )}
        </Interactive>
      ))}
      <Interactive id="card" label="Task card" bench position={at(HSPOT.card)} rotation={[0, 0.35, 0]} labelY={0.2}>
        <mesh position={[0, 0.065, 0.02]} rotation={[-0.32, 0, 0]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshStandardMaterial map={card} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.065, -0.02]} rotation={[0.32, 0, 0]} material={mat.white()}>
          <planeGeometry args={[0.2, 0.14]} />
        </mesh>
      </Interactive>
      <Interactive id="book" label="Your practical notebook" bench position={at(HSPOT.book)} rotation={[0, 0.25, 0]} labelY={0.08}>
        <mesh position={[0, 0.006, 0]} material={mat.red()}>
          <boxGeometry args={[0.3, 0.008, 0.2]} />
        </mesh>
        <mesh position={[0, 0.0105, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.29, 0.19]} />
          <meshStandardMaterial map={book} roughness={0.85} />
        </mesh>
      </Interactive>
    </group>
  );
}

function ClockOnBench({ v, state, task }: { v: BioHumanVariant; state: BioHumanState; task: HumanTask }) {
  const sec = task === 'PULSE' ? (lastPulse(v, state)?.c.dur ?? null) : state.breath.counts ? 60 : null;
  return (
    <Interactive id="clock" drag={task === 'PULSE' ? () => 'clockdrag' : undefined} label={task === 'PULSE' ? `Stopwatch (clock ${Math.floor(state.pulse.clock)} min)` : 'Stopwatch'} bench position={at(HSPOT.clock)} labelY={0.05}>
      {(a) => <StopwatchModel sec={sec} glow={a} />}
    </Interactive>
  );
}

function PulseBench({ v, state, scene }: { v: BioHumanVariant; state: BioHumanState; scene: HumanScene }) {
  const countAt = useHumanBench((b) => b.countAt);
  const last = lastPulse(v, state);
  return (
    <>
      <Interactive id="wrist" label={last ? `Partner’s wrist (last count ${last.beats} beats in ${last.c.dur} s)` : 'Partner’s wrist (radial pulse)'} bench position={at(HSPOT.wrist)} labelY={0.08}>
        {(a) => (
          <group>
            <mesh>
              <sphereGeometry args={[0.03, 10, 8]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={a ? 0.45 : 0.0} depthWrite={false} />
            </mesh>
            {recent(countAt, 2200) && <Fingertips />}
          </group>
        )}
      </Interactive>
      {scene.collected.has('step') && (
        <Interactive id="step" label={state.pulse.exercise ? `Step (step-ups done: ${state.pulse.exercise.min} min)` : 'Step for step-ups'} position={at(HSPOT.step)} labelY={0.4}>
          {(a) => <StepBox glow={a} />}
        </Interactive>
      )}
    </>
  );
}

function BreathBench({ v, state, scene }: { v: BioHumanVariant; state: BioHumanState; scene: HumanScene }) {
  const has = (id: HumanApparatusId) => scene.collected.has(id);
  const w = state.breath;
  const breatheAt = useHumanBench((b) => b.breatheAt);
  const ref = useRef<'A' | 'B'>('A');
  useFrame(() => {
    ref.current = Math.floor(performance.now() / 700) % 2 ? 'A' : 'B';
  });
  const bubbling = recent(breatheAt, 3000) ? ref.current : null;
  const room = breathRoomShown(v.breath, w);
  const bulb = breathBulbShown(v.breath, w);
  return (
    <>
      {has('apparatus') && (
        <Interactive id="apparatus" label={`Lime water apparatus${w.lime ? ` — A ${limeTurbidity(v.breath, w, 'A') >= 0.5 ? 'milky' : 'clear'}, B ${limeTurbidity(v.breath, w, 'B') >= 0.5 ? 'milky' : 'clear'}` : ' (empty)'}`} bench position={at(HSPOT.apparatus)} labelY={0.34}>
          {(a) => <AirApparatus turbA={limeTurbidity(v.breath, w, 'A')} turbB={limeTurbidity(v.breath, w, 'B')} lime={w.lime} mouthpiece={w.mouthpiece || w.breaths.length > 0} bubbling={bubbling} glow={a} />}
        </Interactive>
      )}
      {has('apparatus') && recent(breatheAt, 3000) && <Limb a={[0.006, 0.3, -0.12]} b={[0, 0.36, -0.55]} r={0.006} m={mat.rubber()} />}
      {has('limewater') && (
        <Interactive id="limewater" label="Lime water" bench position={at(HSPOT.limewater)} labelY={0.14}>
          {(a) => <SmallBottle colour="#eef3f3" glow={a} />}
        </Interactive>
      )}
      {has('mouthpiece') && (
        <Interactive id="mouthpiece" label={w.mouthpiece ? 'Mouthpieces (a clean one is fitted)' : 'Clean mouthpieces (sealed pack)'} bench position={at(HSPOT.mouthpiece)} labelY={0.05}>
          {(a) => <PacketModel colour="#7fb3d5" glow={a} />}
        </Interactive>
      )}
      {has('mirror') && (
        <Interactive id="mirror" label={w.breathed ? 'Mirror (misted)' : w.wiped ? 'Mirror (wiped dry)' : 'Mirror'} bench position={at(HSPOT.mirror)} labelY={0.14}>
          {(a) => <MirrorModel misted={w.breathed} glow={a} />}
        </Interactive>
      )}
      {has('cobalt') && (
        <Interactive id="cobalt" label={w.cobalt ? `Cobalt chloride paper (${cobaltPink(v.breath, w) ? 'pink' : 'blue'})` : 'Cobalt chloride paper (blue)'} bench position={at(HSPOT.cobalt)} labelY={0.05}>
          {(a) => <CobaltPaper pink={w.cobalt ? cobaltPink(v.breath, w) : null} glow={a} />}
        </Interactive>
      )}
      {has('thermometer') && (
        <Interactive id="thermometer" label={bulb !== null ? `Thermometer: ${bulb.toFixed(1)} °C (breath)` : room !== null ? `Thermometer: ${room.toFixed(1)} °C (room)` : 'Thermometer'} bench position={at(HSPOT.thermometer)} labelY={0.05}>
          {(a) => <Thermometer glow={a} />}
        </Interactive>
      )}
    </>
  );
}

/** The rule hanging at the bench corner: it falls under gravity to where it was caught. */
function ReactBench({ v, state, scene }: { v: BioHumanVariant; state: BioHumanState; scene: HumanScene }) {
  const g = useRef<Group>(null);
  const dropAt = useHumanBench((b) => b.dropAt);
  const last = lastDrop(v, state);
  const d = last ? last.cm / 100 : 0;
  useFrame(() => {
    if (!g.current) return;
    const t = dropAt ? (performance.now() - dropAt) / 1000 : 9;
    const fall = Math.min(d, 0.5 * 9.8 * t * t);
    g.current.position.y = -fall;
  });
  return (
    <>
      <Interactive id="knee" label="Partner’s knee (leg crossed)" bench position={[1.48, -0.42, 0.4]} labelY={0.15}>
        {(a) => (
          <mesh>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={a ? 0.35 : 0} depthWrite={false} />
          </mesh>
        )}
      </Interactive>
      {scene.collected.has('rule') && (
        <Interactive id="rule" drag={() => 'ruledrag'} label={last ? `Metre rule: caught at ${last.cm.toFixed(1)} cm` : 'Metre rule (hanging, 0 cm at the thumb)'} bench position={at(HSPOT.rule)} labelY={1.1}>
          {(a) => (
            <group>
              <group ref={g}>
                <HangingRule drop={0} glow={a} />
              </group>
              {!last && (
                <mesh position={[0, 1.02, 0.02]} material={mat.wood()}>
                  <sphereGeometry args={[0.035, 10, 8]} />
                </mesh>
              )}
            </group>
          )}
        </Interactive>
      )}
    </>
  );
}

function SkinBench({ state, scene }: { state: BioHumanState; scene: HumanScene }) {
  const has = (id: HumanApparatusId) => scene.collected.has(id);
  const { area, sep, touchAt } = useHumanBench();
  const touching = recent(touchAt, 1400);
  const last = state.skin.trials.at(-1);
  const tp = last ? SKIN_POINT[last.area] : null;
  return (
    <>
      {SKIN_AREAS.map((a) => (
        <Interactive key={a} id={`area:${a}`} label={`${SKIN_AREA_LABEL[a]} (${state.skin.trials.filter((t) => t.area === a).length} touches)`} bench position={SKIN_POINT[a]} labelY={0.05}>
          {() => <AreaDot on={area === a} done={state.skin.trials.some((t) => t.area === a)} />}
        </Interactive>
      ))}
      {has('dividers') && (
        <Interactive id="dividers" label={`Dividers: points ${sep} mm apart`} drag={() => 'dividersdrag'} bench position={touching && tp ? [tp[0], tp[1] + 0.005, tp[2]] : at(HSPOT.dividers)} rotation={touching ? [0, 0, 0] : [0, 0, Math.PI / 2]} labelY={0.12}>
          {(a) => <Dividers sep={touching && last && last.sep === 0 ? 0 : sep} glow={a} />}
        </Interactive>
      )}
      {has('mmrule') && (
        <Interactive id="mmrule" label="Ruler (mm)" bench position={at(HSPOT.mmrule)} labelY={0.04}>
          {(a) => <Ruler glow={a} />}
        </Interactive>
      )}
      {has('blindfold') && !state.skin.blind && (
        <Interactive id="blindfold" label="Blindfold" bench position={at(HSPOT.blindfold)} labelY={0.04}>
          {(a) => <BlindfoldModel glow={a} />}
        </Interactive>
      )}
      {has('wipes') && (
        <Interactive id="wipes" label={state.skin.cleaned ? 'Alcohol wipes (points cleaned)' : 'Alcohol wipes'} bench position={at(HSPOT.wipes)} labelY={0.04}>
          {(a) => <PacketModel colour="#e0e0e0" glow={a} />}
        </Interactive>
      )}
    </>
  );
}
