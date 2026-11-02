import {
  PULSE_DURS,
  PULSE_EX_MINS,
  REACT_CONDS,
  REACT_COND_LABEL,
  REACT_COND_SHORT,
  SKIN_AREA_LABEL,
  SKIN_MAX_SEP,
  breathBulbShown,
  breathRoomShown,
  breathTotal,
  cobaltPink,
  limeTurbidity,
  pulseExEnd,
  type BioHumanState,
  type SkinArea,
} from '@aischool/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fmtMin, lastBreathCount, lastDrop, lastPulse, lastTouch, type Human } from './actions';
import { SkinTally } from './tally';
import { LimeTubesSvg, MirrorSvg, RulerSvg, SkinMapSvg, Stopwatch, ThermoSvg } from './visuals';

/** The bench controls of each task (the 2D lab's bench, and the 3D lab's close-up view): the same actions, with what the apparatus shows now. */

const Box = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-3 rounded-xl border border-border p-3">
    <p className="mb-2 text-[12.5px] font-semibold">{title}</p>
    {children}
  </div>
);
const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap gap-1.5">{children}</div>;
const Say = ({ children }: { children: React.ReactNode }) => <p className="mt-2 rounded-lg bg-muted px-2 py-1 text-[12.5px]">{children}</p>;

export function PulseBench({ h, state, readOnly }: { h: Human; state: BioHumanState; readOnly: boolean }) {
  const w = state.pulse;
  const a = h.pulse;
  const end = pulseExEnd(w);
  const last = lastPulse(h.v, state);
  const clockText = end !== null && w.clock >= end - 1e-9 ? `${fmtMin(w.clock - end)} after the exercise` : `${fmtMin(w.clock)} sitting quietly`;
  return (
    <div>
      <Box title={`Your partner — ${clockText}`}>
        <div className="mb-2 flex items-center gap-2 text-[12.5px]">
          <Stopwatch sec={last ? last.c.dur : null} label={last ? `Stopwatch: counted for ${last.c.dur} seconds` : "Stopwatch at 0"} /> {last ? `Last count: ${last.beats} beats in ${last.c.dur} s` : 'No count yet.'}
        </div>
        {!readOnly && (
          <>
            <Row>
              <Button size="sm" className="h-auto min-h-8 whitespace-normal py-1 text-left" variant={w.screened ? "secondary" : "brand"} disabled={w.screened} onClick={a.screen}>
                {w.screened ? 'Asked: no asthma, heart or sickle-cell problems' : 'Ask about asthma, heart, sickle cell'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => a.wait(1)}>
                Wait 1 min
              </Button>
              <Button size="sm" variant="outline" onClick={a.nextMinute}>
                Wait to the next minute
              </Button>
            </Row>
            <p className="mb-1 mt-2 text-[12px] text-muted-foreground">Feel the radial pulse at the wrist and count:</p>
            <Row>
              {PULSE_DURS.map((d) => (
                <Button key={d} size="sm" variant={d === 15 ? 'brand' : 'outline'} onClick={() => a.count(d)}>
                  Two fingertips, {d} s
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => a.count(15, true)}>
                With the thumb, 15 s
              </Button>
            </Row>
            <p className="mb-1 mt-2 text-[12px] text-muted-foreground">Step-ups on the box:</p>
            <Row>
              {PULSE_EX_MINS.map((m) => (
                <Button key={m} size="sm" variant={m === 2 ? 'brand' : 'outline'} disabled={!!w.exercise} onClick={() => a.exercise(m)}>
                  Step-ups for {m} min
                </Button>
              ))}
            </Row>
          </>
        )}
      </Box>
    </div>
  );
}

export function BreathBench({ h, state, readOnly }: { h: Human; state: BioHumanState; readOnly: boolean }) {
  const w = state.breath;
  const a = h.breath;
  const bv = h.v.breath;
  const room = breathRoomShown(bv, w);
  const bulb = breathBulbShown(bv, w);
  const last = lastBreathCount(h.v, state);
  return (
    <div>
      <Box title={`Lime water apparatus — ${breathTotal(w)} breaths`}>
        <LimeTubesSvg turbA={limeTurbidity(bv, w, 'A')} turbB={limeTurbidity(bv, w, 'B')} lime={w.lime} label="Tubes A and B of lime water" className="mx-auto mb-2" />
        {!readOnly && (
          <Row>
            <Button size="sm" variant="brand" disabled={w.mouthpiece} onClick={a.mouthpiece}>
              Fit a clean mouthpiece
            </Button>
            <Button size="sm" variant="brand" disabled={!!w.lime} onClick={() => a.lime('EQUAL')}>
              Equal volumes of lime water
            </Button>
            <Button size="sm" variant="outline" disabled={!!w.lime} onClick={() => a.lime('UNEQUAL')}>
              Pour lime water roughly
            </Button>
            <Button size="sm" variant="brand" disabled={!w.lime} onClick={() => a.breathe(false)}>
              Partner breathes gently ×5
            </Button>
            <Button size="sm" variant="ghost" disabled={!w.lime} onClick={() => a.breathe(true)}>
              Breathes hard ×5
            </Button>
          </Row>
        )}
      </Box>
      <Box title="Mirror, cobalt chloride paper and thermometer">
        <div className="flex flex-wrap items-center gap-3">
          <MirrorSvg misted={w.breathed} cobalt={w.cobalt} pink={cobaltPink(bv, w)} />
          <ThermoSvg t={bulb ?? room} />
          <p className="text-[12.5px]">
            Room: {room === null ? '—' : `${room.toFixed(1)} °C`}
            <br />
            Breath: {bulb === null ? '—' : `${bulb.toFixed(1)} °C`}
          </p>
        </div>
        {!readOnly && (
          <Row>
            <Button size="sm" variant="outline" disabled={w.wiped || w.breathed} onClick={a.wipe}>
              Wipe the mirror dry
            </Button>
            <Button size="sm" variant="brand" disabled={w.breathed} onClick={a.mirror}>
              Partner breathes on the mirror
            </Button>
            <Button size="sm" variant="outline" disabled={w.cobalt} onClick={a.cobalt}>
              Cobalt chloride paper on it
            </Button>
            <Button size="sm" variant="outline" disabled={!!w.troom} onClick={a.room}>
              Read the room temperature
            </Button>
            <Button size="sm" variant="outline" disabled={w.tbreath} onClick={a.bulb}>
              Breathe on the bulb; read it
            </Button>
          </Row>
        )}
      </Box>
      <Box title="Breathing rate at rest">
        <p className="text-[12.5px]">{last ? `Count ${last.n + 1}: ${last.breaths} breaths in one minute.` : 'No count yet.'}</p>
        {!readOnly && (
          <Button size="sm" variant="brand" className="mt-2" onClick={() => a.count()}>
            Count breaths for 1 min
          </Button>
        )}
      </Box>
    </div>
  );
}

export function ReactBench({ h, state, readOnly }: { h: Human; state: BioHumanState; readOnly: boolean }) {
  const w = state.react;
  const a = h.react;
  const last = lastDrop(h.v, state);
  return (
    <div>
      <Box title="Knee-jerk">
        {w.knee ? <Say>{w.knee === 'HAND' ? 'You tap gently below the kneecap: the lower leg kicks forward at once.' : 'The hard object hurt a little — the leg kicked, but always use the side of your hand.'}</Say> : <p className="text-[12.5px] text-muted-foreground">Your partner sits with one leg crossed loosely over the other.</p>}
        {!readOnly && !w.knee && (
          <Row>
            <Button size="sm" variant="brand" onClick={() => a.knee('HAND')}>
              Tap below the kneecap with the side of the hand
            </Button>
            <Button size="sm" variant="ghost" onClick={() => a.knee('HARD')}>
              Tap with the metre rule
            </Button>
          </Row>
        )}
      </Box>
      <Box title={`Ruler drop — ${w.drops.length} drops`}>
        <div className="flex flex-wrap items-start gap-3">
          <RulerSvg cm={last?.cm ?? null} />
          <div className="space-y-2 text-[12.5px]">
            {last && (
              <p>
                Drop {last.n + 1} ({REACT_COND_SHORT[last.d.cond].toLowerCase()}): caught at <span className="font-mono text-[15px] font-semibold">{last.cm.toFixed(1)}</span> cm
              </p>
            )}
            {!readOnly && (
              <>
                <Row>
                  <Button size="sm" variant={w.arm ? 'secondary' : 'outline'} aria-pressed={w.arm} onClick={() => a.arm(!w.arm)}>
                    {w.arm ? 'Forearm on the bench edge' : 'Rest the forearm on the bench edge'}
                  </Button>
                  <Button size="sm" variant={w.zero ? 'secondary' : 'outline'} aria-pressed={w.zero} onClick={() => a.zero(!w.zero)}>
                    {w.zero ? 'Thumb level with 0 cm' : 'Line the thumb up with 0 cm'}
                  </Button>
                </Row>
                {REACT_CONDS.map((c) => (
                  <Row key={c}>
                    <Button size="sm" variant={c === 'DOM' ? 'brand' : 'outline'} onClick={() => a.drop(c)} title={REACT_COND_LABEL[c]}>
                      Drop: {REACT_COND_SHORT[c].toLowerCase()} ({w.drops.filter((d) => d.cond === c).length})
                    </Button>
                    {c === 'DOM' && (
                      <Button size="sm" variant="ghost" onClick={() => a.drop(c, true)}>
                        Drop after “ready… go”
                      </Button>
                    )}
                  </Row>
                ))}
              </>
            )}
          </div>
        </div>
      </Box>
    </div>
  );
}

export function SkinBench({ h, state, readOnly, pick }: { h: Human; state: BioHumanState; readOnly: boolean; pick?: { area: SkinArea; setArea: (a: SkinArea) => void; sep: number; setSep: (x: number | ((x: number) => number)) => void } }) {
  const w = state.skin;
  const a = h.skin;
  const [area0, setArea0] = useState<SkinArea>('FINGERTIP');
  const [sep0, setSep0] = useState(10);
  const area = pick?.area ?? area0;
  const setArea = pick?.setArea ?? setArea0;
  const sep = pick?.sep ?? sep0;
  const setSep = pick?.setSep ?? setSep0;
  const last = lastTouch(h.v, state);
  const done = Object.fromEntries(w.trials.map((t) => [t.area, true]));
  return (
    <div>
      <Box title="Your partner (the subject)">
        {!readOnly && (
          <Row>
            <Button size="sm" variant={w.cleaned ? 'secondary' : 'outline'} disabled={w.cleaned} onClick={a.clean}>
              {w.cleaned ? 'Points cleaned with alcohol' : 'Clean the points with alcohol'}
            </Button>
            <Button size="sm" variant={w.blind ? 'secondary' : 'brand'} aria-pressed={w.blind} onClick={() => a.blind(!w.blind)}>
              {w.blind ? 'Blindfolded' : 'Blindfold the subject'}
            </Button>
            <Button size="sm" variant={w.together ? 'secondary' : 'outline'} aria-pressed={w.together} onClick={() => a.together(!w.together)}>
              {w.together ? 'Both points together' : 'One point after the other'}
            </Button>
          </Row>
        )}
      </Box>
      <Box title={`Touch: ${SKIN_AREA_LABEL[area]}`}>
        <SkinMapSvg sel={area} onPick={readOnly ? undefined : setArea} done={done} className="mx-auto mb-2" />
        {!readOnly && (
          <>
            <label className="flex items-center gap-2 text-[12.5px]">
              Separation
              <input type="range" min={1} max={SKIN_MAX_SEP} value={sep} onChange={(e) => setSep(Number(e.target.value))} aria-label="Separation of the points (mm)" className="flex-1" />
              <span className="w-12 font-mono">{sep} mm</span>
            </label>
            <Row>
              <Button size="sm" variant="outline" onClick={() => setSep((x) => Math.max(1, x - 1))}>
                −1 mm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSep((x) => Math.min(SKIN_MAX_SEP, x + 1))}>
                +1 mm
              </Button>
              <Button size="sm" variant="brand" onClick={() => a.touch(area, sep)}>
                Touch with two points
              </Button>
              <Button size="sm" variant="outline" onClick={() => a.touch(area, 0)}>
                Touch with one point
              </Button>
            </Row>
          </>
        )}
        {last && (
          <Say>
            Touch {last.n + 1} ({SKIN_AREA_LABEL[last.t.area].toLowerCase()}, {last.t.sep ? `two points ${last.t.sep} mm apart` : 'one point'}): “{last.said === 'TWO' ? 'Two' : 'One'}.”
          </Say>
        )}
        <SkinTally v={h.v} state={state} area={area} />
      </Box>
    </div>
  );
}

