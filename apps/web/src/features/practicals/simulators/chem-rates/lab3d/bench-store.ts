import { create } from 'zustand';

/**
 * The rates bench's own view state (not saved): the last syringe reading
 * held for writing down, animation timestamps (sanding the ribbon, the
 * airtight check, swirling), the plunger held by a drag, and the
 * thiosulphate / water volumes chosen in the dock.
 */
interface Bench {
  snap: { at: number; value: number } | null;
  rubUntil: number;
  checkUntil: number;
  swirlUntil: number;
  /** The plunger dragged to this reading (cm³), or null. */
  pull: number | null;
  thio: number;
  water: number;
  set: (patch: Partial<Omit<Bench, 'set'>>) => void;
}
export type BenchState = Omit<Bench, 'set'>;
export const BENCH_IDLE: BenchState = { snap: null, rubUntil: 0, checkUntil: 0, swirlUntil: 0, pull: null, thio: 50, water: 0 };
export const useBench = create<Bench>((set) => ({ ...BENCH_IDLE, set: (patch) => set(patch) }));
