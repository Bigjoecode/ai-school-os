import { emptyGenPracticalState, genPracticalMissing, type GenPaper, type GenPracticalState, type GenRoom, type PracticalMode, type PracticalResult } from '@aischool/shared';
import { Send, NotebookPen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Interactive } from '../../../lab3d-kit/interact';
import { assistantProfile, setAssistant } from '../../../lab3d-kit/assistant-profile';
import { useDemoPlayer, type DemoStep } from '../../../lab3d-kit/demo-player';
import type { GuideStep } from '../../../lab3d-kit/guide';
import { ModeBar, type ObjectPanel } from '../../../lab3d-kit/hud';
import { BENCHES, DESK, HALF_D, STATION } from '../../../lab3d-kit/layout';
import { colourMaterial } from '../../../lab3d-kit/materials';
import { KitScene } from '../../../lab3d-kit/scene';
import { LabShell, useLabKit } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import type { SimulatorProps } from '../../types';
import { GEN_STAGES, stageDone, useGen, type GenHandle } from '../actions';
import { GenTask, ROOM_LABEL, useGuidedDemo } from '../index';
import { GenStage, GenWorkbook } from '../stages';
import { roomConfig } from './rooms';
import { Tool3d } from './tools3d';

/**
 * The Guided practical's 3D room: a workbench room dressed for the kind of work,
 * with a station for each stage. Same paper, same state and same marks as the 2D
 * view; 3D is the extra, and every action is also a button. Journey: Learn →
 * worked example → Try; exam mode and sittings are Try only (the shell enforces it).
 * There is no sandbox: with no physics to play with, it would only be Try again.
 */

const noop = () => undefined;
const SUPPLY = BENCHES[2]!;
const INSPECT = BENCHES[0]!;
const VIEWS = {
  overview: { target: [0, 0.08, 0.02] as [number, number, number], dist: 1.7, pitch: 0.82 },
  tools: { target: [SUPPLY[0] - STATION[0], 0.08, 0] as [number, number, number], dist: 1.7, pitch: 0.82 },
  faults: { target: [INSPECT[0] - STATION[0], 0.08, 0] as [number, number, number], dist: 1.5, pitch: 0.75 },
};
const VIEW_BUTTONS = [
  { id: 'overview', label: 'My bench' },
  { id: 'tools', label: 'Tool bench' },
  { id: 'faults', label: 'Inspection' },
];
const STATION_ID = ['st:safety', 'st:tools', 'st:procedure', 'st:results', 'st:faults', 'st:writeup'];
const WHY = ['A safe start comes first: choose before you touch anything.', 'Only what the job needs goes on your bench.', 'Each step depends on the one before it.', 'Results are recorded as you go, not from memory.', 'Examiners look for these faults.', 'Say what you did and why, in your own words.'];
const ASSISTANT: Record<GenRoom, { name: string; role: string; look: 'ada' | 'bayo'; pronoun: 'her' | 'his' }> = {
  workshop: { name: 'Mr Bayo', role: 'workshop instructor', look: 'bayo', pronoun: 'his' },
  kitchen: { name: 'Mrs Ada', role: 'catering instructor', look: 'ada', pronoun: 'her' },
  studio: { name: 'Mrs Ada', role: 'studio tutor', look: 'ada', pronoun: 'her' },
  field: { name: 'Mr Bayo', role: 'field instructor', look: 'bayo', pronoun: 'his' },
  drawing: { name: 'Mr Bayo', role: 'drawing instructor', look: 'bayo', pronoun: 'his' },
  lab: { name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' },
};
function useRoomAssistant(room: GenRoom) {
  const [before] = useState(() => ({ ...assistantProfile }));
  useEffect(() => {
    setAssistant(ASSISTANT[room]);
    return () => setAssistant(before);
  }, [before, room]);
}

/** Where a tool lies on the tool bench (world), or on the student's bench. */
function supplySpot(i: number): [number, number, number] {
  const col = i % 5;
  const row = Math.floor(i / 5);
  return [SUPPLY[0] - 1.0 + col * 0.5, STATION[1] + 0.008, SUPPLY[1] - 0.28 + row * 0.3];
}
function benchSpot(i: number): [number, number, number] {
  const col = i % 6;
  const row = Math.floor(i / 6);
  return [STATION[0] - 1.05 + col * 0.42, STATION[1] + 0.008, STATION[2] - 0.26 + row * 0.3];
}

function Station({ id, label, position, children, labelY = 0.25 }: { id: string; label: string; position: [number, number, number]; children: React.ReactNode; labelY?: number }) {
  return (
    <Interactive id={id} label={label} position={position} labelY={labelY}>
      {children}
    </Interactive>
  );
}

function Stations({ paper, state, interactive }: { paper: GenPaper; state: GenPracticalState; interactive: boolean }) {
  const taken = paper.tools.filter((t) => state.tools.includes(t.id));
  const left = paper.tools.filter((t) => !state.tools.includes(t.id));
  const page = colourMaterial('#fbfbf6');
  const dark = colourMaterial('#2f3a42');
  const cover = colourMaterial('#2f6fb0');
  return (
    <group>
      {/* safety board by the door */}
      <Station id="st:safety" label="Safety board" position={[1.5, 1.5, HALF_D - 0.06]} labelY={0.75}>
        <mesh material={colourMaterial('#e0a13a')} scale={[1, 1.2, 0.02]}>
          <boxGeometry />
        </mesh>
        <mesh material={page} position={[0, 0, -0.012]} scale={[0.88, 1.08, 0.004]}>
          <boxGeometry />
        </mesh>
      </Station>
      {/* the tool bench */}
      <Station id="st:tools" label="Tool bench sign" position={[SUPPLY[0] + 1.15, STATION[1], SUPPLY[1] + 0.34]}>
        <mesh material={dark} position={[0, 0.16, 0]} scale={[0.24, 0.32, 0.02]}>
          <boxGeometry />
        </mesh>
      </Station>
      {left.map((t, i) => (
        <Interactive key={t.id} id={`tool:${t.id}`} label={t.text} position={supplySpot(i)} labelY={0.2}>
          {(active) => <Tool3d shape={t.shape} glow={active && interactive} />}
        </Interactive>
      ))}
      {taken.map((t, i) => (
        <Interactive key={t.id} id={`tool:${t.id}`} label={t.text} position={benchSpot(i)} labelY={0.2}>
          {(active) => <Tool3d shape={t.shape} glow={active && interactive} />}
        </Interactive>
      ))}
      {/* worksheets on the student's bench */}
      <Station id="st:procedure" label="Procedure sheet" position={[STATION[0] - 0.75, STATION[1] + 0.01, STATION[2] + 0.3]}>
        <mesh material={colourMaterial('#8a5a2f')} scale={[0.26, 0.012, 0.36]}>
          <boxGeometry />
        </mesh>
        <mesh material={page} position={[0, 0.01, 0]} scale={[0.22, 0.004, 0.3]}>
          <boxGeometry />
        </mesh>
      </Station>
      <Station id="st:results" label="Results book" position={[STATION[0] - 0.1, STATION[1] + 0.012, STATION[2] + 0.3]}>
        <mesh material={cover} scale={[0.3, 0.02, 0.22]}>
          <boxGeometry />
        </mesh>
        <mesh material={page} position={[0, 0.012, 0]} scale={[0.28, 0.008, 0.2]}>
          <boxGeometry />
        </mesh>
      </Station>
      {/* the inspection bench: a finished job with faults in it */}
      <Station id="st:faults" label="Inspection bench" position={[INSPECT[0], STATION[1], INSPECT[1]]} labelY={0.4}>
        <mesh material={colourMaterial('#b98d54')} position={[0, 0.05, 0]} scale={[0.7, 0.1, 0.42]}>
          <boxGeometry />
        </mesh>
        <mesh material={colourMaterial('#c8342b')} position={[0.15, 0.13, 0.05]} scale={[0.12, 0.06, 0.12]}>
          <boxGeometry />
        </mesh>
      </Station>
      {/* the write-up at the teacher's desk */}
      <Station id="st:writeup" label="Write-up book" position={[DESK.x + 0.3, DESK.h + 0.02, DESK.z]}>
        <mesh material={colourMaterial('#178a43')} scale={[0.3, 0.03, 0.22]}>
          <boxGeometry />
        </mesh>
      </Station>
    </group>
  );
}

type DemoCtx = { apply: (patch: Partial<GenPracticalState>) => void };
const BENCH_VIEW = { mode: 'bench' as const, focus: 'overview' };

function useDemo(practicalId: string | undefined, active: boolean, onFinished: () => void, teach: boolean) {
  const q = useGuidedDemo(practicalId, teach);
  const [state, setState] = useState<GenPracticalState>(emptyGenPracticalState);
  const data = q.data;
  const steps = useMemo<DemoStep<DemoCtx>[]>(() => {
    const m = data?.model;
    const n = data?.notes ?? {};
    const say = (s: string) => () => s;
    if (!m || !data) return [{ id: 'wait', title: 'Getting ready', say: say('One moment: getting the bench ready.'), ms: 2500, view: BENCH_VIEW, beats: [] }];
    const dec = data.paper.decisions[0];
    const faults = data.paper.faults[0];
    return [
      { id: 'safety', title: 'Safety first', say: say('Before I touch anything, I choose my precautions. I leave out the bad habits on that list.'), ms: 6000, view: BENCH_VIEW, panel: 'stage:0', beats: [{ at: 1500, run: (c) => c.apply({ safety: m.safety }) }] },
      { id: 'tools', title: 'Set out the bench', say: say('Now I take only what this job needs. Everything else stays on the tool bench.'), ms: 6500, view: { mode: 'bench', focus: 'tools' }, panel: 'stage:1', beats: [{ at: 2000, run: (c) => c.apply({ tools: m.tools }) }] },
      { id: 'order', title: 'Plan the procedure', say: say('I put the steps in order: each one depends on what came before.'), ms: 7000, view: BENCH_VIEW, panel: 'stage:2', beats: [{ at: 1500, run: (c) => c.apply({ order: m.order }) }] },
      { id: 'decide', title: 'Decide at key steps', say: say(dec ? `At a key step I stop and think. ${n[dec.id] ?? ''}` : 'I check my work at each key step.'), ms: 8000, view: BENCH_VIEW, panel: 'stage:2', beats: [{ at: 1000, run: (c) => c.apply({ decisions: m.decisions }) }] },
      { id: 'observe', title: 'Observe and record', say: say('I record what I find as I go, with units on every number.'), ms: 6500, view: BENCH_VIEW, panel: 'stage:3', beats: [{ at: 1500, run: (c) => c.apply({ observations: m.observations, numerics: m.numerics }) }] },
      { id: 'faults', title: 'Spot the fault', say: say(faults ? `This job has faults in it. ${n[faults.id] ?? ''}` : 'Now I look over the finished work for faults.'), ms: 8000, view: { mode: 'bench', focus: 'faults' }, panel: 'stage:4', beats: [{ at: 1500, run: (c) => c.apply({ faults: m.faults }) }] },
      { id: 'write', title: 'Write it up', say: say('Last, my precautions and explanation, in my own words. Now it’s your turn, on your own paper.'), ms: 6500, view: BENCH_VIEW, panel: 'stage:5', beats: [{ at: 1500, run: (c) => c.apply({ written: m.written }) }] },
    ];
  }, [data]);
  const ref = useRef(state);
  ref.current = state;
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx: () => ({ apply: (patch) => setState((s) => ({ ...s, ...patch })) }),
    reset: () => setState(emptyGenPracticalState()),
    goggles: () => false,
    active,
    onFinished,
  });
  return { player, state, paper: data?.paper ?? null };
}

function DemoSheet({ paper, state, stage }: { paper: GenPaper; state: GenPracticalState; stage: number }) {
  const h = useGen({ paper, state, onChange: noop, readOnly: true, startedAt: new Date(0).toISOString() });
  return (
    <section className="pointer-events-none absolute inset-x-2 top-24 z-10 mx-auto max-h-[52%] max-w-md overflow-hidden rounded-2xl bg-card p-3 text-card-foreground shadow-xl sm:left-auto sm:right-3 sm:top-28 sm:mx-0 sm:w-[380px]" aria-label="Demonstration worksheet">
      <p className="mb-1 font-display text-[14px] font-semibold tracking-tight">{GEN_STAGES[stage]!.title}</p>
      <div className="origin-top scale-[0.96]">
        <GenStage h={h} stage={stage} />
      </div>
    </section>
  );
}

export default function GenPracticalRoom(props: SimulatorProps<'gen-practical'>) {
  if (!props.paper) return null;
  return <Room3d {...props} paper={props.paper} />;
}

function Room3d(props: { seed: number; mode: PracticalMode; state: GenPracticalState; onChange: (s: GenPracticalState) => void; readOnly: boolean; startedAt: string; practicalId?: string; endsAt?: string | null; onHandIn?: () => void; onUse2d?: () => void; attemptId?: string; result?: PracticalResult | null; paper: GenPaper }) {
  const { mode, state, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result, paper } = props;
  useRoomAssistant(paper.room);
  // The kit's rig fixes its distance for 'bench' at the built-in preset, so this wider room view has its own id.
  useEffect(() => {
    const wide = () => {
      if (useLabView.getState().focus === 'bench') useLabView.setState({ focus: 'overview' });
    };
    wide();
    return useLabView.subscribe(wide);
  }, []);
  const started = state.log.length > 0;
  const kit = useLabKit({ mode, readOnly, practicalId, result, started });
  const { stage: kitStage, work, guided, practice } = kit;
  const h0 = useGen({ paper, state, onChange, readOnly, startedAt, attemptId });
  // Feedback follows the kit's guided switch; the server still refuses it in exams and sittings.
  const h: GenHandle = useMemo(() => ({ ...h0, canCheck: h0.canCheck && guided }), [h0, guided]);
  const demo = useDemo(practicalId, kitStage === 'demo', () => kit.markJourney('demo'), kit.teach);
  const [view, setView] = useState(0);
  const stage = readOnly ? view : state.stage;
  const go = (i: number) => (readOnly ? setView(i) : h.setStage(i));
  const open = (i: number) => {
    useLabView.getState().set({ selected: null });
    go(i);
    kit.setSheet('notebook');
  };
  const shown = kitStage === 'demo' ? demo.state : state;
  const config = useMemo(() => roomConfig(paper), [paper]);

  const steps: GuideStep[] = useMemo(() => GEN_STAGES.map((g, i) => ({ id: g.key, label: g.title, target: STATION_ID[i]!, why: WHY[i]!, done: stageDone(state, paper, i) })), [state, paper]);
  const objectPanel = (id: string): ObjectPanel | null => {
    if (id.startsWith('tool:')) {
      const tool = paper.tools.find((t) => `tool:${t.id}` === id);
      if (!tool) return null;
      const on = state.tools.includes(tool.id);
      return {
        title: tool.text,
        info: on ? 'On your bench.' : 'On the tool bench.',
        actions: [
          {
            key: 'toggle',
            label: on ? 'Put it back' : 'Take it to my bench',
            tone: 'brand',
            run: () => {
              h.clearResult('tools');
              h.toggle('tools', tool.id);
              play('clink');
              useLabView.getState().set({ selected: null });
            },
          },
        ],
      };
    }
    const i = STATION_ID.indexOf(id);
    if (i < 0) return null;
    return { title: GEN_STAGES[i]!.title, info: WHY[i], actions: [{ key: 'open', label: 'Open the worksheet here', tone: 'brand', run: () => open(i) }] };
  };

  const shell = (
    <GenWorkbook
      h={h}
      stage={stage}
      onStage={go}
      end={
        !readOnly && onHandIn ? (
          <Button size="sm" variant="brand" onClick={() => kit.setSheet('handin')}>
            <Send /> Hand in
          </Button>
        ) : undefined
      }
    />
  );
  const items = paper.tools.map((t) => ({ id: t.id, label: t.text }));
  return (
    <LabShell
      kit={kit}
      kicker={`Guided practical · 3D ${ROOM_LABEL[paper.room].toLowerCase()}`}
      title={ROOM_LABEL[paper.room]}
      heading={paper.title}
      intro={{
        short: 'Six stages: safety, set out, procedure, results, faults, write-up. Marked out of 20.',
        steps: ['Read the safety board and choose your precautions.', 'Take what the job needs from the tool bench.', 'Put the procedure in order and take the key decisions.', 'Record your results, spot the fault, write it up, and hand in.'],
      }}
      scene={
        <KitScene room={config} coatOn={false} gogglesOn={false} presets={VIEWS} read={[0, 1.1, -0.8]} guided={guided} onSlow={kit.onSlow} assistantSpot={[-0.9, -1.5]}>
          <Stations paper={kitStage === 'demo' && demo.paper ? demo.paper : paper} state={shown} interactive={!readOnly && work} />
        </KitScene>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={guided ? steps : []}
      hint={practice && !guided ? (steps.find((x) => !x.done)?.label ?? null) : null}
      objectPanel={objectPanel}
      explain={() => null}
      task={<GenTask paper={paper} />}
      notebook={shell}
      cupboard={{
        blurb: 'Tap what the job needs. Things it does not need only get in the way.',
        items,
        has: (id) => state.tools.includes(id),
        onToggle: (id) => (h.clearResult('tools'), h.toggle('tools', id)),
        onCarry: (id) => {
          if (!state.tools.includes(id)) h.toggle('tools', id);
          notify('On your bench.', 'success', 1500);
        },
      }}
      dock={
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="brand" onClick={() => open(stage)} data-gen="worksheet">
            <NotebookPen /> {stage + 1}/6 {GEN_STAGES[stage]!.label}
          </Button>
          {stage === 1 && (
            <Button size="sm" variant="outline" className="border-white/20 bg-black/45 text-white backdrop-blur hover:bg-black/60" onClick={() => kit.setSheet('cupboard')}>
              Tool list
            </Button>
          )}
        </div>
      }
      modeBar={<ModeBar views={VIEW_BUTTONS} />}
      learn={{
        items: [{ match: /./, id: 'st:tools', spot: VIEWS.tools }],
        explain: () => null,
        procedure: [
          { spot: VIEWS.overview, point: 'st:procedure' },
          { spot: VIEWS.overview, point: 'st:results' },
        ],
        observe: { spot: VIEWS.overview, point: 'st:results' },
        observeTitle: 'What you should find',
        dataCard: { kicker: 'Results', title: 'Working it out', speech: 'Here is how the results are worked out.' },
      }}
      demo={demo.player}
      demoPanel={(id) => {
        if (!id.startsWith('stage:') || !demo.paper) return null;
        return <DemoSheet paper={demo.paper} state={demo.state} stage={Number(id.slice(6))} />;
      }}
      ask={{ suggestions: { LEARN: ['Why does this step come first?'], DEMO: ['Why was that the right decision?'], TRY: ['What does this tool do?'], SANDBOX: [] } as never }}
      tourSteps={defaultTourSteps({ focusId: 'st:results', focusLabel: 'Results book', readLabel: '', readText: '' })
        .filter((s) => !['read', 'cupboard'].includes(s.id))
        .map((s) => (s.id === 'welcome' ? { ...s, title: `Welcome to the ${ROOM_LABEL[paper.room].toLowerCase()}`, body: () => 'A one-minute tour shows you how to move and work. You can skip it and replay it any time from Help.' } : s))}
      safety={{ cards: [], questions: [] }}
      briefed
      onBriefing={noop}
      missing={genPracticalMissing(state, paper)}
      onResetStation={noop}
      debriefView={() => ({ mode: 'bench', notebook: true })}
    />
  );
}
