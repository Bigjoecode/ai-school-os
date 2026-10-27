# 3D lab kit

Everything a walk-in 3D virtual lab shares, extracted from the titration lab
(`simulators/chem-titration/lab3d`, the reference implementation). A new 3D lab
is a **front end only**: it edits the simulator's existing state through the
same `onChange` as the 2D lab, so grading, autosave, the timer, results and
teacher review keep working unchanged.

Rules: no downloaded assets (geometry is procedural, textures are canvas-drawn,
sounds are WebAudio), the attempt state and grader stay as they are, and a
timed (EXAM) practical shows only Try, without guidance, Ask, Learn, demo or
sandbox (the shell enforces this from `mode`).

## Files

| File | What it gives you |
| --- | --- |
| `shell.tsx` | `useLabKit(options)` (stage, guided, sheets, tour, speak, correct…), `<LabShell …/>` (canvas, top bar, journey, intro, tour, safety briefing, guide checklist, assistant strip, correction card, object menus, panels, pause menu, hand-in check, debrief, keyboard, lost-context fallback), `useNewLogEntries` |
| `scene.tsx` | `<KitScene>` inside the canvas: lights, procedural reflections, the room, the coat/goggle hooks, the assistant, the guide beacon, the camera rig, the frame-rate monitor |
| `room.tsx` | The chemistry lab room (`Room`, `SafetyCorner`, `CupboardBody`, `CUPBOARD_SHELVES`) and `RoomConfig` |
| `layout.ts` | Floor plan in metres: `STATION` (the student's bench-top centre), `BENCH`, `CUPBOARD`, `START`, `BENCH_STAND`, `collide` |
| `controls.tsx` | `CameraRig` (walk / bench / eye-level reading), `Joystick`, `BENCH_PRESET`, `CameraPresets` |
| `interact.tsx` | `<Interactive id label bench drag>`: hover name, click/tap selects, press starts a drag |
| `drag.ts` | `beginDrag`, `dragInit`, `endDrag`, `finishTimedDrag`, `justDragged`, `useCarryDrag` (cupboard → tray, used by the shell) |
| `store.ts` | `useLabView` (camera mode, focus, spot, eye, selected, held, drag, target, assistant, notice), `notify`, `Spot` |
| `apparatus.tsx` | Procedural apparatus library: `Burette`, `ConicalFlask`, `Pipette`, `Filler`, `Funnel`, `RetortStand`, `WhiteTile`, `Beaker`, `WashBottle`, `ReagentBottle`, `DropperBottle`, `MeasuringCylinder`, `TestTubeRack`, `Thermometer`, `BunsenBurner`, `BlobShadow`, `GlowRing` |
| `materials.ts`, `textures.ts` | Shared materials (`mat.*`, `liquidMaterial`, `colourMaterial`) and canvas textures (labels, posters, `customPosterTexture`, whiteboard, signs, task card, book…) |
| `hud.tsx` | `Panel`, `ContextMenu`, `HoldButton`, `DragOverlay`, `CupboardList`, `HelpContent`, `ModeBar`, `Notice`; types `LabAction`, `ObjectPanel` |
| `guide.ts`, `guide-hud.tsx` | `GuideStep`, `Correction`, `currentStep`; checklist, correction card, assistant strip, hand-in check, debrief |
| `assistant.tsx`, `assistant-profile.ts` | The lab assistant figure; `setAssistant({ name, role, look: 'ada' \| 'bayo', pronoun })`; `<KitScene assistantSpot={[x, z]}>` moves where they stand at the bench, so they don't block your apparatus |
| `learn.tsx` | Learn stage (cards from the lesson + 3-question check) and `LearnConfig` |
| `demo-player.tsx` | `useDemoPlayer<C>` engine and `<DemoPlayer>`; types `DemoStep<C>`, `DemoBeat<C>` |
| `ask.tsx` | Ask panel (POST `/learning/practicals/lessons/:id/ask`); `AskSuggestions` |
| `tour.tsx` | `Tour`, `defaultTourSteps(opts)`, `TourStep` |
| `safety.tsx`, `safety-content.tsx` | `SafetyBriefing`, `SafetyContent`, `HazardIcon`; `CHEM_SAFETY` |
| `explain.ts` | `Explainer`, `makeExplainer(table, alias)`, `lessonLines` |
| `journey.tsx`, `prefs.ts`, `sound.ts`, `voice.ts`, `targets.ts`, `beacon.tsx` | Journey bar, per-device prefs, sounds, speech, object positions by id, beacon + floor path |

## What a new lab must provide

Put the lab in `simulators/<sim-id>/lab3d/` and register it in
`simulators/registry.ts` as `component3d: lazy(() => import('./<sim-id>/lab3d'))`.
Its default export takes `SimulatorProps<'<sim-id>'>`.

### 1. State mapping (actions)

Reuse the 2D lab's state transitions so both views produce identical states
(the titration moved them into a shared hook: `chem-titration/actions.ts`).
Every change goes through `onChange(next)`. Steps that the 2D state has no
field for (wearing goggles, collecting apparatus, placing things) are written
to the state's own action log, with no marks; rebuild the bench from the log
(`chem-titration/lab3d/scene-state.ts`: `sceneFromState`). Then a reload, or
switching 2D ↔ 3D mid-attempt, keeps the bench as it was.

### 2. Room config

```ts
const ROOM: RoomConfig = {
  whiteboard: ['Physics — SS3 Practical', 'Simple pendulum', '…'],
  whiteboardNote: 'Time 20 oscillations!',
  frontPoster: { title: 'Pendulum', band: '#0f3d8c', lines: ['T = 2π√(l/g)', '…'] }, // or a built-in PosterKind
  shelfBottles: [...],   // optional (defaults to the chemistry stock)
  fumeBottle: null,      // null = an empty fume cupboard
};
```

The room's shape (benches, cupboard, coat hooks, safety corner, windows,
fans) is fixed. The student's bench is at `STATION`; place apparatus with
station-local coordinates (x along the bench, y up from the bench top, z
towards the student).

### 3. Apparatus components

Build them from `apparatus.tsx`, or procedurally in the same style: lathe
glassware, primitives and shared `mat.*` materials; the origin is the point the
object stands on. Wrap each usable object in `<Interactive id label bench>`
(a function child `(active) => …` gets the hover/selected state for `glow`).
Cupboard items use the id `cup:<apparatusId>` and `drag={() => 'carry'}`; the
shell carries them to the bench and calls `cupboard.onCarry(id)`.

### 4. Camera presets

```ts
const VIEWS: CameraPresets = { pendulum: { target: [x, y, z], dist: 0.8, pitch: 0.2 } }; // 'bench' is built in
<KitScene presets={VIEWS} read={[wx, wy, wz]} …>  // `read`: world point the eye-level view reads
<ModeBar views={[{ id: 'bench', label: 'Whole bench' }, { id: 'pendulum', label: 'Pendulum' }]} read={{ label: 'Read the scale', can }} onRead={…} />
```

For Learn and the demo, a `Spot` (`{ target, dist, pitch, yaw? }`) moves the
camera with `useLabView.setState({ mode: 'bench', spot })`.

### 5. Object menus

`objectPanel(id): ObjectPanel | null` — a title, an info line and the
`LabAction`s (`run`; `blocked: 'why not now'`; `tone`; `hold` for press and
hold). Every action must be a button (drags are extras).

### 6. Guide steps and corrections

Compute `GuideStep[]` from the state when `kit.guided` (`target` = the id the
beacon points at, `why` = the teaching reason, `group` for repeated runs). For
mistakes, watch the log with `useNewLogEntries(state.log, kit.stage, fresh => …)`
and call `kit.correct({ title, why, focus })`. Pass a plain `hint` for
practice with guided mode off.

### 7. Learn

`LearnConfig` — `items` (`{ match: RegExp, id, spot }` for each lesson
apparatus line), `explain`, `procedure` (two spots + what to point at),
`observe`, `observeTitle`, and optionally `dataCard` (the lesson's data card
title when it is not a calculation, e.g. "Recording results"). The texts come from the practical's lesson; the
explain table gives purpose and use. Show a display bench (a fixed state) while
`kit.stage === 'learn'`.

### 8. Demo

Write `DemoStep<C>[]` (`say`, `ms`, `view`, `point`, `panel`, `beats`) that act
on a **separate demo state** with a **demo seed that differs from the
student's**, through the same actions. Use `useDemoPlayer({ steps, ctx, reset,
beatsFor, goggles, onEnter, active: kit.stage === 'demo', onFinished: () =>
kit.markJourney('demo') })` and pass `demo` / `demoPanel` to the shell. Beats
must be deterministic, because jumping replays them from `reset()`.

### 9. Explain entries, safety cards, tour, Ask

- `makeExplainer({ id: { name, purpose, how, mistake, keys } })` (`keys` find
  the lesson's matching safety and precaution lines).
- `SafetyContent` (`cards` + `questions`); `CHEM_SAFETY` exists for chemistry.
- `defaultTourSteps({ focusId, focusLabel, readLabel, readText })`.
- `AskSuggestions` per stage, plus an optional `extra` question.

### 10. Shell wiring

```tsx
const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange });
return <LabShell kit={kit} title="Physics lab" heading="Physics laboratory" intro={{ short, steps }} readingStatus="reading the scale" scene={…}
  steps hint objectPanel explain task notebook cupboard={{ blurb, items, has, onToggle, onCarry }} dock modeBar readingPanel canRead
  dragFeedback learn demo demoPanel sandbox? ask tourSteps safety briefed onBriefing
  missing helpRows onResetStation onKey debriefView endsAt onHandIn onUse2d attemptId />;
```

`briefed` and `onBriefing` record the door briefing in the attempt's log
(`safety-briefing:passed|skipped`). `missing` is the simulator's `missing()`.
`debriefView(criterion)` returns where the camera goes (`{ mode, focus?, eye?,
notebook? }`). Lab-specific view state (taps, animation timestamps) belongs in
the lab's own small zustand store, as in `chem-titration/lab3d/bench-store.ts`,
not in `useLabView`.

### Verify

Use the scratchpad scripts as models: a full run through the 3D buttons
handed in via the local API (the grader marks it the same as 2D), the tour on
a fresh profile, the Learn cards, a full demo playback, Ask with
`AI_FAKE_PROVIDER`, exam mode with no guidance, and 360×740 touch.
