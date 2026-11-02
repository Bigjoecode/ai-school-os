import { INCLINE_CARD, VISC_BALLS, forceNominal, type ForceThread, type PhyMechanicsState } from '@aischool/shared';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eye, Hand, Minus, Plus, RotateCcw, Ruler, Timer } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DragState } from '../../../lab3d-kit/store';
import { MicrometerSvg, SpringScaleSvg } from '../../phy-density/instruments';
import { dockButton, dockClass } from '../../phy-common/lab3d/common';
import { boardSheet, clockShows, lastPull, lastTilt, lastWeigh, type Mechanics } from '../actions';
import { AngleScale, BandRule, PaperSvg, PlankRule, StopClock } from '../instruments';
import { runProgress, useBench } from './bench-store';
import type { Ops } from './lab-actions';
import { APPARATUS_LABEL, PLACE_LABEL, type SceneState } from './scene-state';

/** The mechanics bench's HUD: the dock (what to do next), the eye-level reading panel and the drag feedback. */

const B = ({ children, onClick, blocked, brand, label, on }: { children: ReactNode; onClick: () => void; blocked?: string; brand?: boolean; label?: string; on?: boolean }) => (
  <Button size="sm" variant={(brand && !blocked) || on ? 'brand' : 'outline'} className={cn(!(brand && !blocked) && !on && dockButton, blocked && 'opacity-55')} aria-disabled={!!blocked} aria-pressed={on} title={blocked} aria-label={label} onClick={onClick}>
    {children}
  </Button>
);
const I = ({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) => (
  <Button size="icon-sm" variant="outline" className={dockButton} onClick={onClick} aria-label={label}>
    {children}
  </Button>
);
function PlusMinus({ name, label, d, value }: { name: string; label: string; d: (x: number) => void; value: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="text-[12px] text-white/80">
        {name} {value}
      </span>
      <I onClick={() => d(-1)} label={`${label}: less`}>
        <Minus />
      </I>
      <I onClick={() => d(1)} label={`${label}: more`}>
        <Plus />
      </I>
    </div>
  );
}

export function MechDock({ s, scene, ops, compact }: { s: PhyMechanicsState; scene: SceneState; ops: Ops; compact: boolean }) {
  useBench((b) => b.tick);
  const lapse = useBench((b) => b.lapse);
  const busy = runProgress(useBench.getState().run).busy;
  const task = s.task ?? 'FRICTION';
  if (!scene.set)
    return (
      <div className={dockClass} aria-label="Set up the apparatus">
        {scene.nextPlace && (
          <B brand onClick={ops.placeNext} blocked={ops.why.place}>
            {PLACE_LABEL[scene.nextPlace] ?? `Set out the ${APPARATUS_LABEL[scene.nextPlace].toLowerCase()}`}
          </B>
        )}
      </div>
    );
  const read = (
    <B onClick={ops.read} blocked={ops.why.bench} label="Read the instrument">
      <Eye /> {compact ? 'Read' : 'Read the instrument'}
    </B>
  );
  const wrap = (label: string, children: ReactNode) => (
    <div className={cn(dockClass, 'max-w-[min(720px,calc(100vw-1rem))]')} aria-label={label}>
      {children}
    </div>
  );
  if (task === 'FRICTION')
    return wrap(
      'The block and the plank',
      <>
        {!s.zeroed && (
          <B brand onClick={ops.zero}>
            Check the zero
          </B>
        )}
        {!s.wiped && (
          <B brand={s.zeroed} onClick={ops.wipe}>
            Wipe the plank
          </B>
        )}
        <PlusMinus name="Masses" label="Masses on the block" value={`${s.load} × 100 g`} d={ops.load} />
        {!s.tilt && (
          <B onClick={ops.weigh} blocked={ops.why.run} label="Weigh the block and its load">
            Weigh (R)
          </B>
        )}
        {!s.tilt ? (
          <>
            <B onClick={() => ops.jerk(!s.jerk)} on={false} label={s.jerk ? 'Pulling with a jerk: change to slowly' : 'Pulling slowly: change to a jerk'}>
              {s.jerk ? 'Jerk' : 'Slowly'}
            </B>
            <B brand onClick={ops.pull} blocked={ops.why.pull} label="Pull until it moves">
              <Hand /> {compact ? 'Pull' : 'Pull until it moves'} ({s.pulls.length})
            </B>
          </>
        ) : (
          <>
            <B onClick={() => ops.fast(!s.fast)} label={s.fast ? 'Raising quickly: change to slowly' : 'Raising slowly: change to quickly'}>
              {s.fast ? 'Quickly' : 'Slowly'}
            </B>
            <B brand onClick={ops.raise} blocked={ops.why.raise} label="Raise until it slips">
              {compact ? 'Raise' : 'Raise until it slips'} ({s.tilts.length})
            </B>
          </>
        )}
        <B onClick={() => ops.tilt(!s.tilt)} blocked={busy ? 'Wait for this one to finish.' : undefined}>
          {s.tilt ? 'Plank flat' : 'Tilt the plank'}
        </B>
        {read}
      </>,
    );
  if (task === 'VISCOSITY')
    return wrap(
      'The cylinders',
      <>
        <div className="flex items-center gap-1" role="group" aria-label="Choose the ball">
          <I onClick={() => ops.ball(Math.max(0, s.ball - 1))} label="Smaller ball">
            <ChevronLeft />
          </I>
          <span className="text-[12px] text-white/90">{VISC_BALLS[s.ball]!.toFixed(1)} mm</span>
          <I onClick={() => ops.ball(Math.min(VISC_BALLS.length - 1, s.ball + 1))} label="Larger ball">
            <ChevronRight />
          </I>
        </div>
        <B onClick={ops.measure} brand={!s.measured.includes(s.ball)} blocked={ops.why.bench} label="Measure the ball with the micrometer">
          <Ruler /> {compact ? 'Measure' : 'Micrometer'}
        </B>
        {(['top', 'bot'] as const).map((w) => (
          <div key={w} className="flex items-center gap-1" role="group" aria-label={`${w === 'top' ? 'Upper' : 'Lower'} band`}>
            <span className="text-[12px] text-white/80">
              {w === 'top' ? 'Upper' : 'Lower'} {s[w].toFixed(1)} cm
            </span>
            <I onClick={() => ops.band(w, -0.5)} label={`${w === 'top' ? 'Upper' : 'Lower'} band up 0.5 cm`}>
              <ChevronUp />
            </I>
            <I onClick={() => ops.band(w, 0.5)} label={`${w === 'top' ? 'Upper' : 'Lower'} band down 0.5 cm`}>
              <ChevronDown />
            </I>
          </div>
        ))}
        <B onClick={() => ops.liquid(s.liquid === 'oil' ? 'glycerine' : 'oil')} label={`Dropping into ${s.liquid === 'oil' ? 'palm oil' : 'glycerine'}: change`}>
          {s.liquid === 'oil' ? 'Palm oil' : 'Glycerine'}
        </B>
        <B onClick={() => ops.centre(!s.centre)} on={s.centre} label={s.centre ? 'Releasing at the centre: change to near the wall' : 'Releasing near the wall: change to the centre'}>
          {s.centre ? 'Centre' : 'Near wall'}
        </B>
        <B onClick={() => ops.eye(!s.eyeLevel)} on={s.eyeLevel} label={s.eyeLevel ? 'Eye level with each band: change' : 'Eye at one height: change to level with each band'}>
          {s.eyeLevel ? 'Eye at each band' : 'Eye fixed'}
        </B>
        <B onClick={ops.reset} brand={!s.reset} blocked={ops.why.run} label="Reset the stop-clock">
          <RotateCcw /> {compact ? 'Reset' : 'Reset clock'}
        </B>
        <B brand={s.reset} onClick={ops.drop} blocked={ops.why.run} label="Drop the ball and time it">
          <Timer /> {compact ? 'Drop' : 'Drop and time'} ({s.drops.length})
        </B>
        <B onClick={() => useBench.setState({ lapse: lapse > 1 ? 1 : 4 })} label={lapse > 1 ? 'Time-lapse ×4: change to real time' : 'Real time: change to time-lapse'}>
          {lapse > 1 ? '×4' : '×1'}
        </B>
        {read}
      </>,
    );
  if (task === 'INCLINE')
    return wrap(
      'The incline',
      <>
        <PlusMinus name="Blocks" label="Blocks under the end" value={String(s.blocks)} d={ops.blocks} />
        <div className="flex items-center gap-1" role="group" aria-label="Stopping block">
          <span className="text-[12px] text-white/80">Stop {(s.stop / 100).toFixed(2)} m</span>
          <I onClick={() => ops.stop(-1)} label="Stopping block 1 cm nearer">
            <ChevronLeft />
          </I>
          <I onClick={() => ops.stop(1)} label="Stopping block 1 cm further">
            <ChevronRight />
          </I>
        </div>
        {INCLINE_CARD.map((m) => (
            <B key={m} onClick={() => ops.stopAt(m)} on={s.stop === m} label={`Stopping block to ${(m / 100).toFixed(2)} m`}>
            {(m / 100).toFixed(2)}
          </B>
        ))}
        <B onClick={() => ops.push(!s.push)} label={s.push ? 'Pushing: change to from rest' : 'From rest: change to a push'}>
          {s.push ? 'Push' : 'From rest'}
        </B>
        <B onClick={ops.reset} brand={!s.reset} blocked={ops.why.run} label="Reset the stop-clock">
          <RotateCcw /> {compact ? 'Reset' : 'Reset clock'}
        </B>
        <B brand={s.reset} onClick={ops.roll} blocked={ops.why.run} label="Release the ball and time it">
          <Timer /> {compact ? 'Release' : 'Release and time'} ({s.runs.length})
        </B>
        {read}
      </>,
    );
  const sh = boardSheet(s);
  const off = s.sets.map((x, i) => (x.off ? i : -1)).filter((i) => i >= 0);
  const lastOff = off[off.length - 1];
  return wrap(
    'The force board',
    <>
      {(['P', 'Q', 'W'] as ForceThread[]).map((th) => (
        <PlusMinus key={th} name={th} label={`Load ${th}`} value={`${forceNominal(s.masses[th])} g`} d={(x) => ops.mass(th, x)} />
      ))}
      <B brand={!s.tapped} onClick={ops.tap}>
        Tap the board
      </B>
      {(['P', 'Q', 'W'] as ForceThread[]).map((th) => (
        <div key={th} className="flex items-center gap-1" role="group" aria-label={`Dots under ${th}`}>
          <B onClick={() => ops.dot(th, false)} label={`Dot under ${th}, near the knot`}>
            {th}·near
          </B>
          <B onClick={() => ops.dot(th, true)} label={`Dot under ${th}, far from the knot`}>
            {th}·far
          </B>
        </div>
      ))}
      <B brand={!!sh && sh.set.dots.length >= 6} onClick={ops.off} blocked={sh ? undefined : 'Mark the threads first.'}>
        Take the paper off
      </B>
      {lastOff !== undefined && (
        <B brand={!s.sets[lastOff]!.built} onClick={() => ops.build(lastOff)} blocked={ops.why.build}>
          Draw the parallelogram
        </B>
      )}
      {read}
    </>,
  );
}

/** The eye-level reading panel: the task's instrument close up, read as it really shows. */
export function MechReadingPanel({ o, s, onBack }: { o: Mechanics; s: PhyMechanicsState; onBack: () => void }) {
  useBench((b) => b.tick);
  const band = useBench((b) => b.band);
  const sheet = useBench((b) => b.sheet);
  const run = useBench((b) => b.run);
  const busy = runProgress(run).busy;
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const v = o.v;
  const task = s.task ?? 'FRICTION';
  let body: ReactNode = null;
  let title = 'Read the instrument';
  let tip = '';
  if (task === 'FRICTION') {
    title = s.tilt ? 'Read the protractor' : 'Read the spring balance';
    const pull = lastPull(v, s);
    const w = lastWeigh(v, s);
    const tilt = lastTilt(v, s);
    if (busy) body = <p className="text-[13px]">Watch the {run?.kind === 'tilt' ? 'block as the plank rises' : 'pointer'}…</p>;
    else if (s.tilt) body = tilt === null ? <p className="text-[13px]">Raise the plank first.</p> : <AngleScale angle={tilt} />;
    else if (run?.kind === 'weigh' && w) body = <SpringScaleSvg reading={w.reading} eye={0} />;
    else if (pull)
      body = (
        <div className="flex flex-wrap gap-3">
          <div>
            <p className="mb-1 text-[12px] font-medium">Just as it started to move</p>
            <SpringScaleSvg reading={pull.limit} eye={0} />
          </div>
          <div>
            <p className="mb-1 text-[12px] font-medium">While it slid</p>
            <SpringScaleSvg reading={pull.sliding} eye={0} />
          </div>
        </div>
      );
    else if (w) body = <SpringScaleSvg reading={w.reading} eye={0} />;
    else body = <SpringScaleSvg reading={s.zeroed ? 0 : v.sbZero} eye={0} />;
    tip = s.tilt ? 'Read where the plank crosses the scale, to 1°.' : 'Read the pointer to the nearest half division (0.05 N). The limiting friction is the reading just as the block starts to move.';
  } else if (task === 'VISCOSITY') {
    title = 'Read the micrometer, the rule and the stop-clock';
    body = (
      <div className="space-y-2">
        <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Which instrument">
          {(
            [
              ['a', 'Micrometer'],
              ['b', 'Bands'],
              ['c', 'Stop-clock'],
            ] as const
          ).map(([id, l]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('rounded-md px-2 py-1 text-[12px]', tab === id ? 'bg-foreground text-background' : 'text-muted-foreground')}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'a' && <MicrometerSvg reading={s.measured.includes(s.ball) ? v.balls[s.ball]! : 0} eye={0} closed={s.measured.includes(s.ball)} label={`${VISC_BALLS[s.ball]!.toFixed(1)} mm ball`} />}
        {tab === 'b' && (
          <>
            <div className="flex gap-1">
              {(['top', 'bot'] as const).map((b) => (
                <Button key={b} size="sm" variant={band === b ? 'brand' : 'outline'} onClick={() => useBench.setState({ band: b })}>
                  {b === 'top' ? 'Upper band' : 'Lower band'}
                </Button>
              ))}
            </div>
            <BandRule top={s.top} bot={s.bot} around={band} />
          </>
        )}
        {tab === 'c' && <StopClock seconds={busy ? 0 : clockShows(v, s)} running={busy} label={busy ? 'The ball is falling…' : 'Read it to 0.01 s.'} />}
      </div>
    );
  } else if (task === 'INCLINE') {
    title = 'Read the stop-clock and the plank';
    body = (
      <div className="flex flex-wrap items-start gap-3">
        <StopClock seconds={busy ? 0 : clockShows(v, s)} running={busy} label={busy ? 'Rolling…' : 'Read it to 0.01 s.'} />
        <PlankRule at={s.stop} />
      </div>
    );
  } else {
    title = 'Your drawing';
    const sh = boardSheet(s);
    const off = s.sets.map((x, i) => (x.off ? i : -1)).filter((i) => i >= 0);
    const show = sheet !== null && s.sets[sheet]?.off ? sheet : (off[off.length - 1] ?? null);
    body =
      show !== null && !sh ? (
        <>
          {off.length > 1 && (
            <div className="flex gap-1">
              {off.map((i) => (
                <Button key={i} size="sm" variant={show === i ? 'brand' : 'outline'} onClick={() => useBench.setState({ sheet: i })}>
                  Sheet {i + 1}
                </Button>
              ))}
            </div>
          )}
          <PaperSvg v={v} s={s} i={show} live={false} measure className="max-h-[44vh]" />
        </>
      ) : (
        <PaperSvg v={v} s={s} i={sh ? sh.i : null} live className="max-h-[44vh]" />
      );
    tip = 'With the parallelogram drawn, the rule lies along OC from O (read to 0.1 cm) and the protractor is centred on O with its zero along the line of W produced upwards.';
  }
  return (
    <section className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 mx-auto max-h-[70%] max-w-xl overflow-y-auto rounded-2xl border border-border bg-card/97 p-3 text-card-foreground shadow-2xl backdrop-blur sm:bottom-4" aria-label={title}>
      <p className="flex items-center gap-1.5 font-display text-[15px] font-semibold tracking-tight">
        <Eye className="size-4 text-muted-foreground" aria-hidden /> {title}
      </p>
      {tip && <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{tip}</p>}
      <div className="mt-2">{body}</div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={onBack}>
          Back to bench
        </Button>
      </div>
    </section>
  );
}

/** Feedback while dragging. */
export function MechDragFeedback({ drag }: { drag: DragState }) {
  const text: Record<string, string> = {
    pull: 'Drag right to pull — let go to stop. (Slowly: the “Pull” button pulls smoothly.)',
    'band-top': 'Sliding the upper band — let go to leave it there',
    'band-bot': 'Sliding the lower band — let go to leave it there',
    'slide-stop': 'Sliding the stopping block along the groove',
  };
  if (!text[drag.kind]) return null;
  return <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{text[drag.kind]}</span>;
}
