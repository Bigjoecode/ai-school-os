import { emptyGeoMapsState, type GeoMapsState, type GeoPanel, type GeoTask, type GeoTool, type GeoVariant } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useGeo, type Geo } from '../actions';
import { GeoDesk } from '../bench';
import { demoVariant, neededFor } from './bench';

/**
 * Mr Eze's demonstration on a sheet of his own (demoVariant: never the
 * student's), on its own in-memory state. Each step is the task's own model
 * step, so the demonstration and the mark scheme can never disagree.
 */

interface DemoCtx {
  g: Geo;
  v: GeoVariant;
}
type Step = KitDemoStep<DemoCtx>;
const bench = { mode: 'bench' as const, spot: null };

function script(v: GeoVariant): Step[] {
  const needed = neededFor(v);
  return [
    { id: 'intro', title: 'What we are doing', say: () => `Watch me on my own sheet: ${v.def.title.toLowerCase()}. Your sheet is different, so you will have to work yours out.`, ms: 5200, view: { ...bench, focus: 'bench' }, point: 'map', beats: [] },
    { id: 'apparatus', title: 'The instruments', say: () => 'From the cupboard: only what this exercise needs, and a sharp pencil.', ms: 4200, view: { ...bench, focus: 'bench' }, beats: needed.map((a, k) => ({ at: 300 + k * 200, run: (c: DemoCtx) => c.g.note(`collect:${a}`) })) },
    ...v.def.steps.map(
      (st): Step => ({
        id: st.id,
        title: st.label,
        say: () => st.say,
        ms: Math.max(4800, 2400 + st.say.length * 52),
        view: { ...bench, focus: 'map' },
        point: 'map',
        panel: `desk:${st.panel ?? ''}:${st.tool ?? ''}`,
        beats: [{ at: 900, run: (c) => c.g.doStep(st) }],
      }),
    ),
    { id: 'turn', title: 'Your turn!', say: () => 'Now it is your turn on your own sheet. Show your working: marks are given for method.', ms: 4600, view: { ...bench, focus: 'bench' }, beats: [] },
  ];
}

export function useGeoDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: GeoTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const variant = useMemo(() => demoVariant(studentSeed, task), [studentSeed, task]);
  const fresh = (): GeoMapsState => ({ ...emptyGeoMapsState(), task });
  const [state, setState] = useState<GeoMapsState>(fresh);
  const g = useGeo({ seed: variant.seed, state, onChange: setState, readOnly: false, startedAt, variant });
  const steps = useMemo(() => script(variant), [variant]);
  const player = useDemoPlayer<DemoCtx>({
    steps,
    ctx: () => ({ g, v: variant }),
    reset: () => {
      g.ref.current = fresh();
      setState(g.ref.current);
    },
    goggles: () => false,
    active,
    onFinished,
  });
  const panel = (id: string) => {
    if (!id.startsWith('desk:')) return null;
    const [, p, t] = id.split(':');
    return (
      <section className="pointer-events-none absolute left-2 right-2 top-24 z-10 max-h-[46dvh] overflow-hidden rounded-2xl bg-card p-2 text-card-foreground shadow-xl sm:left-auto sm:right-2 sm:top-32 sm:max-h-[calc(100%-16rem)] sm:w-[520px]" aria-label="Mr Eze’s sheet">
        <GeoDesk g={g} s={state} readOnly panel={(p || undefined) as GeoPanel | undefined} tool={(t || undefined) as GeoTool | undefined} compact />
      </section>
    );
  };
  return { player, state, g, panel, v: variant };
}
