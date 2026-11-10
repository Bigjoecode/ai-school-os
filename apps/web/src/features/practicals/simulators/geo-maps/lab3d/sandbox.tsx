import { GEO_TASKS, GEO_TASK_TITLE, emptyGeoMapsState, geoMapsVariant, type GeoMapsState, type GeoTask } from '@aischool/shared';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGeo } from '../actions';

/**
 * The unmarked sandbox: any exercise on a fresh sheet or data set, with a
 * helper that shows the height and grid reference under the pointer, so the
 * student can check how the contours and grid really behave. Nothing is
 * graded, saved or sent.
 */

const SANDBOX_SEED = 717_171;
const blank = (task: GeoTask): GeoMapsState => ({ ...emptyGeoMapsState(), task, log: [] });

export function useGeoSandbox(lessonTask: GeoTask, startedAt: string) {
  const [task, setTask] = useState(lessonTask);
  const [round, setRound] = useState(0);
  const [state, setState] = useState<GeoMapsState>(() => blank(lessonTask));
  const variant = useMemo(() => geoMapsVariant(SANDBOX_SEED + round * 7, task), [task, round]);
  const g = useGeo({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const start = (t: GeoTask) => {
    setTask(t);
    setRound((r) => r + 1);
    g.ref.current = blank(t);
    setState(g.ref.current);
  };
  return { task, start, state, g, v: variant };
}
export type GeoSandbox = ReturnType<typeof useGeoSandbox>;

export function GeoSandboxForm({ sandbox, onStart }: { sandbox: GeoSandbox; onStart: (t: GeoTask) => void }) {
  const [t, setT] = useState(sandbox.task);
  return (
    <div className="space-y-3 text-[13.5px]">
      <p className="text-muted-foreground">A new sheet each time, and on the map the height and grid reference under your pointer are shown so you can check yourself. Try a wide divider span, or the wrong point. Nothing here is marked or saved.</p>
      <label className="block">
        <span className="font-medium">Exercise</span>
        <select value={t} onChange={(e) => setT(e.target.value as GeoTask)} className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-2 text-base sm:text-sm" aria-label="Exercise">
          {GEO_TASKS.map((x) => (
            <option key={x} value={x}>
              {GEO_TASK_TITLE[x]}
            </option>
          ))}
        </select>
      </label>
      <Button variant="brand" onClick={() => onStart(t)}>
        <FlaskConical /> Start the sandbox
      </Button>
    </div>
  );
}

export function GeoSandboxBadge({ sandbox }: { sandbox: GeoSandbox }) {
  const sh = sandbox.v.sheet;
  return (
    <section className="pointer-events-auto w-[min(300px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p>
      <p className="mt-0.5">{sh ? `${sh.name}: 1:${sh.denom.toLocaleString('en-GB')}, contours every ${sh.interval} m` : sandbox.v.def.title}</p>
    </section>
  );
}
