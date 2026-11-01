import { DEPTH_BLOCKS, DEPTH_EYE_MAX, DISP_FILTERS, PINS_ANGLE, PINS_SPACING, mirrorConstruction, pinsAlignedPhi, pinsEye, pinsImage, pinsInLine, pinsMeet, pinsPrism, prismConstruction, prismInDir, type PhyPinsState, type PinsPoint, type PinsTask, type PinsTrace } from '@aischool/shared';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Eye, Lightbulb, MapPin, Sun, Triangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Step, TaskCard } from '../phy-common';
import type { SimulatorProps } from '../types';
import { CARD_ANGLES, PIN_LABEL, boardTask, firstAngle, gap12, gap34, nextAngle, pushCentre, usePins, type PinId, type Pins } from './actions';
import { Notebook } from './notebook';
import { BoardCanvas, DepthEye, DepthSide, DispScreen, DispTop, EyeView, ProtractorView } from './views2d';

/** The question paper for each task. */
export function PinsTaskText({ task }: { task: PinsTask }) {
  if (task === 'MIRROR')
    return (
      <>
        <p>You are provided with a plane mirror in a holder, a drawing board with paper, four optical pins and a protractor.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Draw a line MM′ and stand the reflecting surface of the mirror on it. Draw the normal at O and an incident ray AO at i = 20°. Fix P₁ and P₂ on AO, well apart.</li>
          <li>Looking into the mirror, fix P₃ and P₄ in line with the images of P₁ and P₂.</li>
          <li>Remove the mirror, join P₄P₃ to meet MM′ and measure the angle of reflection r.</li>
          <li>Repeat for i = 30°, 40°, 50° and 60°. Tabulate i and r and plot r against i.</li>
          <li>Find the slope, state your conclusion and two precautions.</li>
        </ol>
      </>
    );
  if (task === 'PRISM')
    return (
      <>
        <p>You are provided with an equilateral glass prism (A = 60°), a drawing board with paper, optical pins and a protractor.</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Trace the outline of the prism and draw the normal at O on one refracting face. Draw an incident ray at i = 35° and fix two pins on it.</li>
          <li>With the prism in place, fix two more pins in line with their images seen through the other face.</li>
          <li>Remove the prism, draw the emergent ray and produce the incident and emergent rays to meet. Measure the angle of deviation D.</li>
          <li>Repeat for i = 40°, 45°, 50°, 55°, 60° and 65°. Plot D against i.</li>
          <li>Read the minimum deviation Dₘ and calculate n = sin((A + Dₘ)/2) ÷ sin(A/2). State two precautions.</li>
        </ol>
      </>
    );
  if (task === 'DEPTH')
    return (
      <>
        <p>You are provided with four identical-glass rectangular blocks, a paper with a cross, an optical pin in a cork on a stand, and a vertical rule (0 at the bench).</p>
        <ol className="list-[lower-roman] space-y-0.5 pl-6">
          <li>Place one block on the cross. Read the height of its top face on the rule: this is the real depth of the cross.</li>
          <li>Looking vertically down, move the search pin up or down beside the block until it shows no parallax with the image of the cross (they move together as you move your eye from side to side). Read its height.</li>
          <li>Apparent depth = top-face reading − pin reading. Repeat with 2, 3 and 4 blocks.</li>
          <li>Plot real depth against apparent depth; the slope is the refractive index n. State two precautions.</li>
        </ol>
      </>
    );
  return (
    <>
      <p>You are provided with a ray box with a slit, a triangular glass prism (A = 60°) on a turntable, a white screen with a deviation scale and red, green and blue filters.</p>
      <ol className="list-[lower-roman] space-y-0.5 pl-6">
        <li>In a darkened room, direct a narrow beam of white light on to one face of the prism.</li>
        <li>Rotate the prism until the emergent light is spread out most clearly and catch it on the screen. Record the order of the colours and which colour is deviated most.</li>
        <li>At minimum deviation read the deviation of the red and the violet light on the scale. Work out the angular dispersion and n for red light.</li>
        <li>Place a red filter in the beam and record what you see. Draw a ray diagram showing the red and violet paths, and explain dispersion.</li>
      </ol>
      <p className="text-[12.5px] text-warning">Never look at the Sun through a prism.</p>
    </>
  );
}

/** The next thing to do (practice hint). */
export function pinsHint(s: PhyPinsState, task: PinsTask, g: Pins, sight: boolean): string {
  if (task === 'MIRROR' || task === 'PRISM') {
    const t = g.open;
    const what = task === 'MIRROR' ? 'mirror' : 'prism';
    if (!t) return g.done >= CARD_ANGLES[task].length ? (task === 'MIRROR' ? 'Fill in the table, plot r against i and find the slope.' : 'Fill in the table, plot D against i with a smooth curve, mark the minimum and work out n.') : `Choose the angle of incidence and start a new trace (a fresh sheet).`;
    if (!t.normal) return 'Draw the normal at O first: every angle is measured from the normal.';
    if (t.p1 === null || t.p2 === null) return `Stick P₁ and P₂ on the incident ray, at least ${PINS_SPACING} cm apart.`;
    if (!sight && (!t.p3 || !t.p4)) return task === 'MIRROR' ? 'Look into the mirror at paper level from the other side of the normal.' : 'Look through the second face of the prism at paper level.';
    if (!t.p3 || !t.p4) return 'Move your eye until the image of P₂ hides the image of P₁, then push P₃ and P₄ in line with them.';
    return `Check all four line up, then remove the ${what} and join the points; measure ${task === 'MIRROR' ? 'r from the normal' : 'D between the produced rays'}.`;
  }
  if (task === 'DEPTH') {
    const d = s.depth;
    const used = new Set(d.readings.map((r) => r.blocks));
    if (d.blocks < 1) return 'Put a glass block on the cross.';
    if (!used.has(d.blocks)) return 'Move your eye from side to side: raise or lower the search pin until it moves with the image of the cross (no parallax), then take the reading.';
    if (used.size < 4) return `Change the number of blocks (${used.size} of 4 depths done).`;
    return 'Fill in the real and apparent depths, plot real against apparent and find the slope (n).';
  }
  const d = s.disp;
  if (!d.dark) return 'Darken the room first (lights off, curtains drawn).';
  if (d.slit !== 'narrow') return 'Use the narrow slit for a pure spectrum.';
  if (!d.looks.length) return 'Look at the screen, then rotate the prism slowly until the spectrum stops and turns back (minimum deviation).';
  if (!d.looks.some((l) => l.filter !== 'none')) return 'Put a red filter in the beam and look again.';
  return 'Record the order, the deviations at minimum deviation and your explanation in the notebook.';
}

/** While the screen is being looked at, each new setting is logged as a look (after a short pause). */
export function useLookLogger(g: Pins, looking: boolean, d: PhyPinsState['disp']) {
  const key = `${d.i}|${d.slit}|${d.dark}|${d.filter}|${d.dist}`;
  const first = useRef(true);
  useEffect(() => {
    if (!looking) {
      first.current = true;
      return;
    }
    const id = setTimeout(() => g.look(), first.current ? 0 : 900);
    first.current = false;
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looking, key]);
}

/** The angle the protractor shows for a joined trace (r from the normal, or D between the produced rays). */
export function measured(g: Pins, t: PinsTrace): number | null {
  if (g.bt === 'MIRROR') return mirrorConstruction(t)?.r ?? null;
  return prismConstruction(pinsPrism(g.v), t)?.D ?? null;
}
/** The point where the protractor is centred for a joined trace. */
export function measureAt(g: Pins, t: PinsTrace): PinsPoint | null {
  if (g.bt === 'MIRROR') return mirrorConstruction(t)?.at ?? null;
  const sh = pinsPrism(g.v);
  const c = prismConstruction(sh, t);
  return c ? (pinsMeet(sh.O, prismInDir(sh, t.i), c.at, c.dir)?.at ?? null) : null;
}
/** Push P₃ / P₄ in where they hide the image of P₂ from the eye at φ (realistic: stuck to 0.01 cm). */
export function inLinePoint(g: Pins, t: PinsTrace, phi: number, pin: 'p3' | 'p4'): PinsPoint | null {
  const I = pinsImage(g.v, g.bt, t.i, t.p2 ?? t.p1 ?? 3);
  if (!I) return null;
  const E = pinsEye(g.v, g.bt, phi);
  // Along the line of sight, 3 cm (P₃) and 10 cm (P₄) out from where it crosses the mirror line or the prism's face.
  const sh = pinsPrism(g.v);
  const dir = { x: E.x - I.x, y: E.y - I.y };
  const cross = g.bt === 'MIRROR' ? pinsMeet(I, dir, { x: 0, y: 0 }, { x: 1, y: 0 }) : pinsMeet(I, dir, sh.T, { x: sh.C.x - sh.T.x, y: sh.C.y - sh.T.y });
  const len = Math.hypot(dir.x, dir.y) || 1;
  const p = cross ? { x: cross.at.x + (dir.x / len) * (pin === 'p3' ? 3 : 10), y: cross.at.y + (dir.y / len) * (pin === 'p3' ? 3 : 10) } : pinsInLine(E, I, pushCentre(g.v, g.bt), pin === 'p3' ? 3 : 10);
  if (!p) return null;
  // A hand pushes a pin in to about half a millimetre either side of where the eye wants it.
  const n = Math.sin(t.i * 12.9898 + (pin === 'p3' ? 1 : 2) * 78.233 + g.ref.current.traces.length) * 43758.5453;
  const k = 0.05 * (2 * (n - Math.floor(n)) - 1);
  const d = Math.hypot(I.x - E.x, I.y - E.y) || 1;
  return { x: p.x - ((I.y - E.y) / d) * k, y: p.y + ((I.x - E.x) / d) * k };
}
export const defaultPhi = (g: Pins, i: number) => Math.round(((pinsAlignedPhi(g.v, g.bt, i) ?? i) + 4) * 10) / 10;

export default function PhyPinsLab({ seed, mode, state, onChange, readOnly, startedAt, practicalId }: SimulatorProps<'phy-pins'>) {
  const g = usePins({ seed, state, onChange, readOnly, startedAt, practicalId });
  const task = g.task;
  return (
    <div className="space-y-4">
      <TaskCard icon={<Triangle className="size-4 text-muted-foreground" aria-hidden />}>
        <PinsTaskText task={task} />
      </TaskCard>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:items-start [&>*]:min-w-0">
        <div className="space-y-4">
          {boardTask(task) && <BoardPanel g={g} s={state} readOnly={readOnly} mode={mode} />}
          {task === 'DEPTH' && <DepthPanel g={g} s={state} readOnly={readOnly} mode={mode} />}
          {task === 'DISP' && <DispPanel g={g} s={state} readOnly={readOnly} mode={mode} />}
        </div>
        <Notebook task={task} state={state} readOnly={readOnly} update={g.update} removeTrace={g.removeTrace} removeDepth={g.removeDepth} />
      </div>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <p className="mb-3 flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[12.5px] text-info">
      <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {text}
    </p>
  );
}

function BoardPanel({ g, s, readOnly, mode }: { g: Pins; s: PhyPinsState; readOnly: boolean; mode: string }) {
  const task = g.bt;
  const [nextI, setNextI] = useState<number | null>(null);
  const [tool, setTool] = useState<PinId | null>(null);
  const [sight, setSight] = useState(false);
  const [phi, setPhi] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [nudgePin, setNudgePin] = useState<'p3' | 'p4'>('p3');
  const open = g.open;
  const shownIndex = viewing !== null && viewing < s.traces.length ? viewing : g.openIndex >= 0 ? g.openIndex : s.traces.length - 1;
  const shown = shownIndex >= 0 ? s.traces[shownIndex]! : null;
  const editable = !readOnly && !!open && shownIndex === g.openIndex;
  const i = nextI ?? (s.traces.length ? nextAngle(task, s.traces.at(-1)!.i) : firstAngle(task));
  const eyePhi = phi ?? (open ? defaultPhi(g, open.i) : 30);
  const lim = PINS_ANGLE[task];
  const what = task === 'MIRROR' ? 'mirror' : 'prism';
  const tap = (p: PinsPoint) => {
    if (!editable || !open || !tool) return;
    setMsg(null);
    const err = g.placePin(tool, p);
    if (err) return setMsg(err);
    setTool(tool === 'p1' && open.p2 === null ? 'p2' : tool === 'p3' && !open.p4 ? 'p4' : null);
  };
  const push = (pin: 'p3' | 'p4') => {
    if (!open) return;
    const p = inLinePoint(g, open, eyePhi, pin);
    const err = p ? g.placePin(pin, p) : 'You cannot see the images from here.';
    setMsg(err);
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight">
          <MapPin className="size-4 text-muted-foreground" aria-hidden /> Drawing board
        </h3>
        <Badge variant="outline">
          {g.done} trace{g.done === 1 ? '' : 's'} done{open ? ` · i = ${open.i}° in progress` : ''}
        </Badge>
      </div>
      {!readOnly && mode === 'LAB' && <Hint text={pinsHint(s, task, g, sight)} />}
      {s.traces.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1" role="tablist" aria-label="Traces">
          {s.traces.map((t, k) => (
            <Button key={k} size="sm" variant={k === shownIndex ? 'secondary' : 'ghost'} onClick={() => setViewing(k)} role="tab" aria-selected={k === shownIndex}>
              {t.i}°{!t.joined && ' …'}
            </Button>
          ))}
        </div>
      )}
      <BoardCanvas v={g.v} task={task} trace={shown} eye={editable && sight ? pinsEye(g.v, task, eyePhi) : null} onTap={tap} tool={!!(editable && tool)} />
      {msg && <p className="mt-2 text-[12.5px] text-warning">{msg}</p>}
      {!readOnly && (
        <div className="mt-4 space-y-3">
          {!open ? (
            <Step title="New trace">
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="text-muted-foreground">Angle of incidence i</span>
                <Button size="icon-sm" variant="outline" onClick={() => setNextI(Math.max(lim.min, i - 5))} aria-label="Decrease by 5°">
                  −
                </Button>
                <span className="w-10 text-center font-medium tabular">{i}°</span>
                <Button size="icon-sm" variant="outline" onClick={() => setNextI(Math.min(lim.max, i + 5))} aria-label="Increase by 5°">
                  +
                </Button>
                <Button
                  size="sm"
                  variant="brand"
                  onClick={() => {
                    g.newTrace(i);
                    setNextI(null);
                    setViewing(null);
                    setSight(false);
                    setPhi(null);
                  }}
                  disabled={s.traces.length >= 12}
                >
                  {task === 'MIRROR' ? 'New sheet: draw MM′, the mirror and the ray' : 'New sheet: trace the prism and draw the ray'}
                </Button>
              </div>
            </Step>
          ) : (
            <>
              <Step title={`1. On the paper (i = ${open.i}°)`}>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant={open.normal ? 'secondary' : 'outline'} onClick={g.drawNormal} disabled={open.normal}>
                    {open.normal ? 'Normal drawn' : 'Draw the normal at O'}
                  </Button>
                  {(['p1', 'p2'] as const).map((p) => (
                    <Button key={p} size="sm" variant={tool === p ? 'brand' : 'outline'} onClick={() => setTool(tool === p ? null : p)} aria-pressed={tool === p}>
                      {open[p] === null ? `Stick ${PIN_LABEL[p]} (tap the ray)` : `Move ${PIN_LABEL[p]}`}
                    </Button>
                  ))}
                </div>
                {open.p1 !== null && open.p2 !== null && <p className="text-[11.5px] text-muted-foreground">P₁P₂ = {gap12(open).toFixed(1)} cm apart.</p>}
              </Step>
              <Step title={task === 'MIRROR' ? '2. Look into the mirror' : '2. Look through the second face'}>
                <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                  <Button size="sm" variant={sight ? 'secondary' : 'outline'} onClick={() => setSight(!sight)} disabled={open.p1 === null || open.p2 === null}>
                    <Eye /> {sight ? 'Looking' : 'Put your eye down at paper level'}
                  </Button>
                  {sight && (
                    <label className="flex items-center gap-2">
                      <span className="text-muted-foreground">Move your eye</span>
                      <input type="range" min={task === 'MIRROR' ? 2 : 15} max={88} step={0.1} value={eyePhi} onChange={(e) => setPhi(Number(e.target.value))} className="w-44 accent-[var(--brand)]" aria-label="Eye position around the board" />
                    </label>
                  )}
                </div>
                {sight && <EyeView v={g.v} task={task} trace={open} phi={eyePhi} />}
                {sight && (
                  <div className="flex flex-wrap gap-1.5">
                    {(['p3', 'p4'] as const).map((p) => (
                      <Button key={p} size="sm" variant="outline" onClick={() => push(p)}>
                        {open[p] ? `Re-push ${PIN_LABEL[p]}` : `Push ${PIN_LABEL[p]}`} in line
                      </Button>
                    ))}
                    {(['p3', 'p4'] as const).map((p) => (
                      <Button key={`t${p}`} size="sm" variant={tool === p ? 'brand' : 'ghost'} onClick={() => setTool(tool === p ? null : p)} aria-pressed={tool === p}>
                        Tap to place {PIN_LABEL[p]}
                      </Button>
                    ))}
                  </div>
                )}
                {(open.p3 || open.p4) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className="text-muted-foreground">Nudge</span>
                    {(['p3', 'p4'] as const).map((p) => (
                      <Button key={p} size="sm" variant={nudgePin === p ? 'secondary' : 'ghost'} onClick={() => setNudgePin(p)} disabled={!open[p]} aria-pressed={nudgePin === p}>
                        {PIN_LABEL[p]}
                      </Button>
                    ))}
                    {(
                      [
                        [ArrowLeft, -0.05, 0, 'left'],
                        [ArrowRight, 0.05, 0, 'right'],
                        [ArrowUp, 0, 0.05, 'up'],
                        [ArrowDown, 0, -0.05, 'down'],
                      ] as const
                    ).map(([Icon, dx, dy, w]) => (
                      <Button key={w} size="icon-sm" variant="outline" onClick={() => g.nudge(nudgePin, dx, dy)} aria-label={`Nudge ${w}`}>
                        <Icon />
                      </Button>
                    ))}
                    {open.p3 && open.p4 && <span className="text-muted-foreground">P₃P₄ = {gap34(open).toFixed(1)} cm</span>}
                  </div>
                )}
              </Step>
              <Step title="3. Construct">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => {
                      g.join();
                      setSight(false);
                    }}
                    disabled={!open.p1 || !open.p2 || !open.p3 || !open.p4}
                  >
                    Remove the {what} and join the points
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => g.removeTrace(g.openIndex)}>
                    Discard this trace
                  </Button>
                </div>
              </Step>
            </>
          )}
        </div>
      )}
      {shown?.joined && (
        <div className="mt-4">
          <p className="mb-2 text-[12.5px] font-semibold">Protractor ({task === 'MIRROR' ? 'centred where P₄P₃ meets MM′' : 'centred where the produced rays meet'})</p>
          <ProtractorView angle={measured(g, shown)} refLabel={task === 'MIRROR' ? 'normal' : 'incident ray produced'} />
          <p className="mt-1 text-[11.5px] text-muted-foreground">{task === 'MIRROR' ? 'Read r from the normal to the reflected ray, to the nearest degree.' : 'Read D between the incident ray produced and the emergent ray, to 0.5°.'}</p>
        </div>
      )}
    </Card>
  );
}

function DepthPanel({ g, s, readOnly, mode }: { g: Pins; s: PhyPinsState; readOnly: boolean; mode: string }) {
  const d = s.depth;
  const [msg, setMsg] = useState<string | null>(null);
  const wiggle = useRef<number | null>(null);
  const startWiggle = () => {
    if (wiggle.current) return;
    let k = 0;
    wiggle.current = window.setInterval(() => {
      k++;
      g.setEye(DEPTH_EYE_MAX * Math.sin((k / 20) * Math.PI * 2) * (k <= 40 ? 1 : 0));
      if (k > 40 && wiggle.current) {
        clearInterval(wiggle.current);
        wiggle.current = null;
      }
    }, 60);
  };
  useEffect(() => () => void (wiggle.current && clearInterval(wiggle.current)), []);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">The stack and the search pin</h3>
      {!readOnly && mode === 'LAB' && <Hint text={pinsHint(s, 'DEPTH', g, false)} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <DepthSide v={g.v} blocks={d.blocks} h={d.h} eyeX={d.eyeX} />
        <DepthEye v={g.v} blocks={d.blocks} h={d.h} eyeX={d.eyeX} />
      </div>
      {!readOnly && (
        <div className="mt-4 space-y-3">
          <Step title="Blocks on the cross">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <Button size="icon-sm" variant="outline" onClick={() => g.setBlocks(d.blocks - 1)} aria-label="Take a block off">
                −
              </Button>
              <span className="w-16 text-center tabular">{d.blocks} block{d.blocks === 1 ? '' : 's'}</span>
              <Button size="icon-sm" variant="outline" onClick={() => g.setBlocks(d.blocks + 1)} disabled={d.blocks >= DEPTH_BLOCKS} aria-label="Add a block">
                +
              </Button>
            </div>
          </Step>
          <Step title="Search pin (height on the rule)">
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              {[-1, -0.1, -0.05].map((dh) => (
                <Button key={dh} size="sm" variant="outline" onClick={() => g.setPin(d.h + dh)} aria-label={`Lower the pin ${Math.abs(dh)} cm`}>
                  ↓ {Math.abs(dh)}
                </Button>
              ))}
              <span className="w-20 text-center tabular">{d.h.toFixed(2)} cm</span>
              {[0.05, 0.1, 1].map((dh) => (
                <Button key={dh} size="sm" variant="outline" onClick={() => g.setPin(d.h + dh)} aria-label={`Raise the pin ${dh} cm`}>
                  ↑ {dh}
                </Button>
              ))}
            </div>
          </Step>
          <Step title="Your eye, looking vertically down">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <input type="range" min={-DEPTH_EYE_MAX} max={DEPTH_EYE_MAX} step={0.1} value={d.eyeX} onChange={(e) => g.setEye(Number(e.target.value))} className="w-44 accent-[var(--brand)]" aria-label="Move your eye sideways" />
              <Button size="sm" variant="outline" onClick={startWiggle}>
                <Eye /> Move my eye side to side
              </Button>
            </div>
          </Step>
          <Button
            variant="brand"
            size="sm"
            onClick={() => setMsg(g.takeDepth())}
          >
            Take this reading
          </Button>
          {msg && <p className="text-[12.5px] text-warning">{msg}</p>}
        </div>
      )}
    </Card>
  );
}

function DispPanel({ g, s, readOnly, mode }: { g: Pins; s: PhyPinsState; readOnly: boolean; mode: string }) {
  const d = s.disp;
  const [looking, setLooking] = useState(false);
  useLookLogger(g, looking && !readOnly, d);
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="mb-3 font-display text-[15px] font-semibold tracking-tight">Ray box, prism and screen</h3>
      {!readOnly && mode === 'LAB' && <Hint text={pinsHint(s, 'DISP', g, false)} />}
      <DispTop v={g.v} d={d} />
      {looking && (
        <div className="mt-3">
          <DispScreen v={g.v} d={d} />
        </div>
      )}
      {!readOnly && (
        <div className="mt-4 space-y-3">
          <Step title="Set up">
            <div className="flex flex-wrap gap-1.5 text-[12.5px]">
              <Button size="sm" variant={d.dark ? 'secondary' : 'outline'} onClick={() => g.setDark(!d.dark)}>
                <Sun /> {d.dark ? 'Room darkened (lights on again)' : 'Darken the room'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => g.setSlit(d.slit === 'narrow' ? 'wide' : 'narrow')}>
                Slit: {d.slit} (change)
              </Button>
              <select value={d.filter} onChange={(e) => g.setFilter(e.target.value as (typeof DISP_FILTERS)[number])} className="h-8 rounded-lg border border-input bg-card px-2 text-sm" aria-label="Filter in the beam">
                {DISP_FILTERS.map((f) => (
                  <option key={f} value={f}>
                    {f === 'none' ? 'No filter' : `${f} filter`}
                  </option>
                ))}
              </select>
            </div>
          </Step>
          <Step title="Turntable and screen">
            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
              <span className="text-muted-foreground">Rotate the prism</span>
              {[-5, -0.5].map((x) => (
                <Button key={x} size="sm" variant="outline" onClick={() => g.setI(d.i + x)}>
                  ⟲ {Math.abs(x)}°
                </Button>
              ))}
              {[0.5, 5].map((x) => (
                <Button key={x} size="sm" variant="outline" onClick={() => g.setI(d.i + x)}>
                  ⟳ {x}°
                </Button>
              ))}
              <span className="text-muted-foreground">Screen</span>
              <input type="range" min={20} max={120} step={5} value={d.dist} onChange={(e) => g.setDist(Number(e.target.value))} className="w-32 accent-[var(--brand)]" aria-label="Screen distance" />
              <span className="tabular">{d.dist} cm</span>
            </div>
          </Step>
          <Button size="sm" variant={looking ? 'secondary' : 'brand'} onClick={() => setLooking(!looking)}>
            <Eye /> {looking ? 'Stop looking at the screen' : 'Look at the screen'}
          </Button>
        </div>
      )}
    </Card>
  );
}
