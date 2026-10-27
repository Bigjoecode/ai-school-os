import { MICRO_SLIDES, MICRO_SLIDE_INFO, bioMicroscopeAnswers, emptyBioMicroscopeState, microBrightness, type BioMicroscopeState, type MicroSlide } from '@aischool/shared';
import { Microscope as MicroscopeIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMicroscope } from '../actions';
import { calcLines } from './demo';
import { NEEDED } from './scene-state';

/**
 * The unmarked sandbox: any slide, a fresh specimen each time, the bench
 * already set out. The student can try every stain, the wrong cover slip,
 * the coarse focus at ×40 … and see the true values for this specimen.
 * Nothing is graded, saved or sent: it lives in this page only.
 */
const SANDBOX_SEED = 515_151;
const setUp = (slide: MicroSlide): BioMicroscopeState => ({
  ...emptyBioMicroscopeState(),
  slide,
  log: [{ t: 0, a: 'safety:coat' }, ...NEEDED[slide].map((a) => ({ t: 0, a: `collect:${a}` })), { t: 0, a: 'take-slide' }],
});

export function useSandbox(startedAt: string, initial: MicroSlide) {
  const [round, setRound] = useState(1);
  const [slide, setSlide] = useState<MicroSlide>(initial);
  const [state, setState] = useState<BioMicroscopeState>(() => setUp(initial));
  const m = useMicroscope({ seed: SANDBOX_SEED + round, state, onChange: setState, readOnly: false, startedAt });
  const start = (sl: MicroSlide) => {
    setSlide(sl);
    setRound((r) => r + 1);
    m.ref.current = setUp(sl);
    setState(m.ref.current);
  };
  return { slide, start, state, m };
}
export type Sandbox = ReturnType<typeof useSandbox>;

export function SandboxSetupForm({ initial, onStart }: { initial: MicroSlide; onStart: (s: MicroSlide) => void }) {
  const [sl, setSl] = useState<MicroSlide>(initial);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">Pick any slide and practise as often as you like: a new specimen each time. Try the wrong stain, a dropped cover slip or the coarse focus at ×40 and see what happens. Nothing here is marked or saved.</p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {MICRO_SLIDES.map((x) => (
          <Button key={x} variant={sl === x ? 'brand' : 'outline'} className="h-auto justify-start whitespace-normal py-2 text-left" aria-pressed={sl === x} onClick={() => setSl(x)}>
            {MICRO_SLIDE_INFO[x].title}
          </Button>
        ))}
      </div>
      <Button variant="brand" onClick={() => onStart(sl)}>
        <MicroscopeIcon /> Start the sandbox
      </Button>
    </div>
  );
}

/** The sandbox specimen's true values (shown: the sandbox is unmarked) once a view is captured. */
export function SandboxResults({ sandbox }: { sandbox: Sandbox }) {
  const { m, state } = sandbox;
  const v = m.v;
  const [open, setOpen] = useState(false);
  if (!v) return null;
  const sc = state.scope;
  const b = microBrightness(sc.lamp, sc.diaphragm, sc.objective);
  const a = bioMicroscopeAnswers(v);
  return (
    <section className="pointer-events-auto w-[min(320px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox values">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked) · {MICRO_SLIDE_INFO[v.slide].title}</p>
      <p className="mt-1">
        Stage height {(sc.coarse + sc.fine).toFixed(2)} · sharp at {v.focus[sc.objective].toFixed(2)} (×{sc.objective}) · light {b.toFixed(2)} <span className="text-white/60">(0.30–0.75)</span>
      </p>
      {state.captures.length > 0 && (
        <>
          <button type="button" className="mt-1 font-semibold text-amber-300 underline" onClick={() => setOpen((x) => !x)}>
            {open ? 'Hide' : 'Show'} the true values for this specimen
          </button>
          {open && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-white/85">
              {calcLines(v).map((l) => (
                <li key={l}>{l}</li>
              ))}
              <li>True reading {a.reading}.</li>
            </ul>
          )}
        </>
      )}
    </section>
  );
}
