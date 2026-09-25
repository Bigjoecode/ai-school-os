/**
 * Timetable solver. Pure: no database, no AI.
 *
 * Hard constraints (never broken): a class, teacher or room is in one place
 * per period; teachers are never timetabled when unavailable; lessons that
 * need a room kind (LAB, ICT…) get a free room of that kind; doubles sit in
 * two consecutive lesson periods with no break between; locked entries stay
 * where they are.
 *
 * Soft goals (minimised): a subject repeated on the same day for a class,
 * core subjects in the last two periods, teachers with more than six lessons
 * in a day.
 *
 * Method: greedy placement, hardest lessons first, with bump-and-repair for
 * lessons that don't fit; then local search on the soft cost; repeated from
 * several seeds, keeping the best. Deterministic for a given seed.
 *
 * It yields to the event loop every few milliseconds, so a build running in
 * the API process never stalls other requests.
 */

const YIELD_EVERY_MS = 15;
function yielder() {
  let last = Date.now();
  return async () => {
    if (Date.now() - last >= YIELD_EVERY_MS) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      last = Date.now();
    }
  };
}

export interface SolverLesson {
  /** Stable id (the ClassSubject id). */
  key: string;
  classArmId: string;
  subjectId: string;
  teacherId: string | null;
  periodsPerWeek: number;
  roomKind: string | null;
  double: boolean;
  isCore: boolean;
  /** For reports: "JSS 1 A", "Mathematics", "Mrs Eze". */
  labels: { classArm: string; subject: string; teacher: string | null };
}

export interface SolverPlacement {
  classArmId: string;
  subjectId: string;
  teacherId: string | null;
  roomId: string | null;
  day: number;
  period: number;
  doubleGroup: string | null;
  locked: boolean;
}

export interface SolverInput {
  days: number[];
  /** Bell-schedule indices of lesson periods, in order. */
  lessonPeriods: number[];
  /** Lesson periods where a double may start (the next period is also a lesson). */
  doubleStarts: number[];
  lessons: SolverLesson[];
  rooms: { id: string; kind: string }[];
  /** teacherId → "day:period" keys they can't teach. */
  unavailable: Map<string, Set<string>>;
  /** Entries to keep exactly as they are. */
  locked: SolverPlacement[];
  seed?: number;
  restarts?: number;
  /** Stop starting new runs after this long. */
  timeBudgetMs?: number;
}

export interface SolverResult {
  placements: SolverPlacement[];
  required: number;
  placed: number;
  unplaced: { lesson: SolverLesson; missing: number; reason: string }[];
  quality: {
    sameDayRepeats: number;
    lateCoreLessons: number;
    teacherOverloadDays: number;
    doublesPlaced: number;
    doublesRequested: number;
  };
  warnings: string[];
  cost: number;
  durationMs: number;
}

const MAX_TEACHER_DAY = 6;
const COST = { sameDay: 10, lateCore: 2, overload: 5 };

interface Unit {
  id: number;
  lesson: SolverLesson;
  length: 1 | 2;
}

interface Placed {
  unit: Unit;
  day: number;
  start: number;
  roomId: string | null;
}

// ------------------------------------------------------------ randomness

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ one run

class Board {
  readonly classBusy = new Map<string, number>(); // "class|day|p" → unit id (-1 = locked)
  readonly teacherBusy = new Map<string, number>();
  readonly roomBusy = new Map<string, number>();
  readonly subjectDay = new Map<string, number>(); // "class|subject|day" → units that day
  readonly teacherDay = new Map<string, number>(); // "teacher|day" → periods that day
  readonly placed = new Map<number, Placed>();

  constructor(
    private readonly input: SolverInput,
    private readonly nextPeriod: Map<number, number>,
    private readonly latePeriods: Set<number>,
    private readonly roomsByKind: Map<string, string[]>,
  ) {}

  slots(start: number, length: number): number[] {
    return length === 1 ? [start] : [start, this.nextPeriod.get(start)!];
  }

  occupyLocked(p: SolverPlacement) {
    this.classBusy.set(`${p.classArmId}|${p.day}|${p.period}`, -1);
    if (p.teacherId) {
      this.teacherBusy.set(`${p.teacherId}|${p.day}|${p.period}`, -1);
      bump(this.teacherDay, `${p.teacherId}|${p.day}`, 1);
    }
    if (p.roomId) this.roomBusy.set(`${p.roomId}|${p.day}|${p.period}`, -1);
  }

  /** Units blocking a placement, or null if it is impossible regardless (unavailability, locked, no room of that kind). */
  blockers(unit: Unit, day: number, start: number): { units: Set<number>; roomId: string | null } | null {
    const l = unit.lesson;
    const periods = this.slots(start, unit.length);
    const units = new Set<number>();
    for (const p of periods) {
      const c = this.classBusy.get(`${l.classArmId}|${day}|${p}`);
      if (c === -1) return null;
      if (c !== undefined) units.add(c);
      if (l.teacherId) {
        if (this.input.unavailable.get(l.teacherId)?.has(`${day}:${p}`)) return null;
        const t = this.teacherBusy.get(`${l.teacherId}|${day}|${p}`);
        if (t === -1) return null;
        if (t !== undefined) units.add(t);
      }
    }
    let roomId: string | null = null;
    if (l.roomKind) {
      const rooms = this.roomsByKind.get(l.roomKind) ?? [];
      if (!rooms.length) return null;
      // Prefer a room that is free; otherwise the one with the fewest movable occupants.
      let best: { id: string; blockers: Set<number> } | null = null;
      for (const r of rooms) {
        const b = new Set<number>();
        let lockedHere = false;
        for (const p of periods) {
          const o = this.roomBusy.get(`${r}|${day}|${p}`);
          if (o === -1) lockedHere = true;
          else if (o !== undefined) b.add(o);
        }
        if (lockedHere) continue;
        if (!best || b.size < best.blockers.size) best = { id: r, blockers: b };
        if (b.size === 0) break;
      }
      if (!best) return null;
      roomId = best.id;
      for (const u of best.blockers) units.add(u);
    }
    return { units, roomId };
  }

  softCost(unit: Unit, day: number, start: number): number {
    const l = unit.lesson;
    let cost = COST.sameDay * (this.subjectDay.get(`${l.classArmId}|${l.subjectId}|${day}`) ?? 0);
    if (l.isCore && this.slots(start, unit.length).some((p) => this.latePeriods.has(p))) cost += COST.lateCore;
    if (l.teacherId) {
      const load = (this.teacherDay.get(`${l.teacherId}|${day}`) ?? 0) + unit.length;
      if (load > MAX_TEACHER_DAY) cost += COST.overload * (load - MAX_TEACHER_DAY);
    }
    return cost;
  }

  place(unit: Unit, day: number, start: number, roomId: string | null) {
    const l = unit.lesson;
    for (const p of this.slots(start, unit.length)) {
      this.classBusy.set(`${l.classArmId}|${day}|${p}`, unit.id);
      if (l.teacherId) this.teacherBusy.set(`${l.teacherId}|${day}|${p}`, unit.id);
      if (roomId) this.roomBusy.set(`${roomId}|${day}|${p}`, unit.id);
    }
    bump(this.subjectDay, `${l.classArmId}|${l.subjectId}|${day}`, 1);
    if (l.teacherId) bump(this.teacherDay, `${l.teacherId}|${day}`, unit.length);
    this.placed.set(unit.id, { unit, day, start, roomId });
  }

  remove(unitId: number): Placed | undefined {
    const pl = this.placed.get(unitId);
    if (!pl) return undefined;
    const l = pl.unit.lesson;
    for (const p of this.slots(pl.start, pl.unit.length)) {
      this.classBusy.delete(`${l.classArmId}|${pl.day}|${p}`);
      if (l.teacherId) this.teacherBusy.delete(`${l.teacherId}|${pl.day}|${p}`);
      if (pl.roomId) this.roomBusy.delete(`${pl.roomId}|${pl.day}|${p}`);
    }
    bump(this.subjectDay, `${l.classArmId}|${l.subjectId}|${pl.day}`, -1);
    if (l.teacherId) bump(this.teacherDay, `${l.teacherId}|${pl.day}`, -pl.unit.length);
    this.placed.delete(unitId);
    return pl;
  }

  totalCost(): number {
    let cost = 0;
    for (const n of this.subjectDay.values()) if (n > 1) cost += COST.sameDay * ((n * (n - 1)) / 2);
    for (const pl of this.placed.values()) {
      if (pl.unit.lesson.isCore && this.slots(pl.start, pl.unit.length).some((p) => this.latePeriods.has(p))) cost += COST.lateCore;
    }
    for (const n of this.teacherDay.values()) if (n > MAX_TEACHER_DAY) cost += COST.overload * (n - MAX_TEACHER_DAY);
    return cost;
  }
}

function bump(map: Map<string, number>, key: string, by: number) {
  const next = (map.get(key) ?? 0) + by;
  if (next <= 0) map.delete(key);
  else map.set(key, next);
}

async function runOnce(input: SolverInput, units: Unit[], seed: number, ctx: RunContext) {
  const rand = mulberry32(seed);
  const pause = yielder();
  const board = new Board(input, ctx.nextPeriod, ctx.latePeriods, ctx.roomsByKind);
  for (const p of input.locked) board.occupyLocked(p);

  const candidates = (u: Unit) => {
    const starts = u.length === 2 ? input.doubleStarts : input.lessonPeriods;
    const out: { day: number; start: number }[] = [];
    for (const day of input.days) for (const start of starts) out.push({ day, start });
    return out;
  };

  // Hardest first: doubles, room-bound, busiest teachers; random within ties.
  const order = [...units]
    .map((u) => ({ u, r: rand() }))
    .sort(
      (a, b) =>
        b.u.length - a.u.length ||
        Number(!!b.u.lesson.roomKind) - Number(!!a.u.lesson.roomKind) ||
        (ctx.teacherLoad.get(b.u.lesson.teacherId ?? '') ?? 0) - (ctx.teacherLoad.get(a.u.lesson.teacherId ?? '') ?? 0) ||
        a.r - b.r,
    )
    .map((x) => x.u);

  const queue = [...order];
  const bumps = new Map<number, number>();
  const unplaced: Unit[] = [];
  let budget = units.length * 30;

  while (queue.length && budget-- > 0) {
    await pause();
    const unit = queue.shift()!;
    let best: { day: number; start: number; roomId: string | null; cost: number } | null = null;
    let fallback: { day: number; start: number; roomId: string | null; evict: Set<number>; score: number } | null = null;

    for (const { day, start } of candidates(unit)) {
      const b = board.blockers(unit, day, start);
      if (!b) continue;
      if (b.units.size === 0) {
        const cost = board.softCost(unit, day, start) + rand() * 0.5;
        if (!best || cost < best.cost) best = { day, start, roomId: b.roomId, cost };
      } else if (b.units.size <= 2) {
        // Bump candidates: prefer evicting few, rarely-bumped units.
        const score = [...b.units].reduce((n, id) => n + 1 + (bumps.get(id) ?? 0) * 2, 0) + rand();
        if (!fallback || score < fallback.score) fallback = { day, start, roomId: b.roomId, evict: b.units, score };
      }
    }

    if (best) {
      board.place(unit, best.day, best.start, best.roomId);
    } else if (fallback && (bumps.get(unit.id) ?? 0) < 6) {
      for (const id of fallback.evict) {
        const out = board.remove(id);
        if (out) {
          bumps.set(id, (bumps.get(id) ?? 0) + 1);
          queue.push(out.unit);
        }
      }
      bumps.set(unit.id, (bumps.get(unit.id) ?? 0) + 1);
      board.place(unit, fallback.day, fallback.start, fallback.roomId);
    } else {
      unplaced.push(unit);
    }
  }
  unplaced.push(...queue);

  // Local search: move single units to cheaper free slots.
  const movable = () => [...board.placed.keys()];
  const iterations = Math.min(20000, units.length * 40);
  for (let i = 0; i < iterations; i++) {
    await pause();
    const ids = movable();
    if (!ids.length) break;
    const id = ids[Math.floor(rand() * ids.length)]!;
    const current = board.remove(id)!;
    const here = board.softCost(current.unit, current.day, current.start);
    let best = { day: current.day, start: current.start, roomId: current.roomId, cost: here };
    for (const { day, start } of candidates(current.unit)) {
      const b = board.blockers(current.unit, day, start);
      if (!b || b.units.size) continue;
      const cost = board.softCost(current.unit, day, start);
      if (cost < best.cost - 1e-9) best = { day, start, roomId: b.roomId, cost };
    }
    board.place(current.unit, best.day, best.start, best.roomId);
  }

  return { board, unplaced, cost: board.totalCost() };
}

interface RunContext {
  nextPeriod: Map<number, number>;
  latePeriods: Set<number>;
  roomsByKind: Map<string, string[]>;
  teacherLoad: Map<string, number>;
}

// ------------------------------------------------------------ entry point

export async function solve(input: SolverInput): Promise<SolverResult> {
  const started = Date.now();
  const warnings: string[] = [];

  const nextPeriod = new Map<number, number>();
  input.lessonPeriods.forEach((p, i) => {
    const next = input.lessonPeriods[i + 1];
    if (next !== undefined) nextPeriod.set(p, next);
  });
  const doubleStarts = input.doubleStarts.filter((p) => nextPeriod.has(p));
  const latePeriods = new Set(input.lessonPeriods.slice(-2));
  const roomsByKind = new Map<string, string[]>();
  for (const r of input.rooms) roomsByKind.set(r.kind, [...(roomsByKind.get(r.kind) ?? []), r.id]);

  // Locked entries already count towards each lesson's weekly total.
  const lockedCount = new Map<string, number>();
  const lockedDoubles = new Set<string>();
  for (const p of input.locked) {
    const k = `${p.classArmId}|${p.subjectId}`;
    bump(lockedCount, k, 1);
    if (p.doubleGroup) lockedDoubles.add(k);
  }

  const units: Unit[] = [];
  let doublesRequested = 0;
  for (const lesson of input.lessons) {
    const k = `${lesson.classArmId}|${lesson.subjectId}`;
    let remaining = lesson.periodsPerWeek - (lockedCount.get(k) ?? 0);
    if (remaining <= 0) continue;
    if (lesson.double && lesson.periodsPerWeek >= 2) {
      doublesRequested++;
      if (!lockedDoubles.has(k) && remaining >= 2 && doubleStarts.length) {
        units.push({ id: units.length, lesson, length: 2 });
        remaining -= 2;
      }
    }
    for (let i = 0; i < remaining; i++) units.push({ id: units.length, lesson, length: 1 });
  }

  // Capacity warnings that explain failures before the solver even runs.
  const weekSlots = input.days.length * input.lessonPeriods.length;
  const classLoad = new Map<string, { label: string; n: number }>();
  const teacherLoad = new Map<string, number>();
  const teacherLabel = new Map<string, string>();
  for (const l of input.lessons) {
    const c = classLoad.get(l.classArmId) ?? { label: l.labels.classArm, n: 0 };
    c.n += l.periodsPerWeek;
    classLoad.set(l.classArmId, c);
    if (l.teacherId) {
      bump(teacherLoad, l.teacherId, l.periodsPerWeek);
      teacherLabel.set(l.teacherId, l.labels.teacher ?? 'A teacher');
    }
  }
  for (const c of classLoad.values()) {
    if (c.n > weekSlots) warnings.push(`${c.label} has ${c.n} lessons a week but only ${weekSlots} lesson periods.`);
  }
  for (const [t, n] of teacherLoad) {
    const free = weekSlots - (input.unavailable.get(t)?.size ?? 0);
    if (n > free) warnings.push(`${teacherLabel.get(t)} is assigned ${n} lessons a week but is available for only ${free}.`);
  }
  const unassigned = input.lessons.filter((l) => !l.teacherId && l.periodsPerWeek > 0);
  if (unassigned.length) {
    warnings.push(`${unassigned.length} class subject${unassigned.length === 1 ? ' has' : 's have'} no teacher assigned; they are timetabled without one.`);
  }
  for (const kind of new Set(input.lessons.filter((l) => l.roomKind && l.periodsPerWeek).map((l) => l.roomKind!))) {
    if (!roomsByKind.get(kind)?.length) warnings.push(`Lessons need a ${kind} room but there isn't one set up.`);
  }

  const ctx: RunContext = { nextPeriod, latePeriods, roomsByKind, teacherLoad };
  const restarts = input.restarts ?? 6;
  const budget = input.timeBudgetMs ?? 8000;
  let best: Awaited<ReturnType<typeof runOnce>> | null = null;
  for (let r = 0; r < restarts; r++) {
    if (best && Date.now() - started > budget) break;
    const run = await runOnce(input, units, (input.seed ?? 20260924) + r * 7919, ctx);
    if (!best || run.unplaced.length < best.unplaced.length || (run.unplaced.length === best.unplaced.length && run.cost < best.cost)) {
      best = run;
    }
    if (best.unplaced.length === 0 && best.cost === 0) break;
  }
  const { board, unplaced } = best!;

  // Output: every period of every placed unit, plus the locked entries.
  const placements: SolverPlacement[] = [...input.locked];
  let doublesPlaced = [...new Set(input.locked.filter((p) => p.doubleGroup).map((p) => p.doubleGroup))].length;
  for (const pl of board.placed.values()) {
    const l = pl.unit.lesson;
    const group = pl.unit.length === 2 ? `d${pl.unit.id}` : null;
    if (group) doublesPlaced++;
    for (const period of board.slots(pl.start, pl.unit.length)) {
      placements.push({
        classArmId: l.classArmId,
        subjectId: l.subjectId,
        teacherId: l.teacherId,
        roomId: pl.roomId,
        day: pl.day,
        period,
        doubleGroup: group,
        locked: false,
      });
    }
  }

  // Why each missing lesson couldn't go in.
  const missing = new Map<string, { lesson: SolverLesson; missing: number }>();
  for (const u of unplaced) {
    const m = missing.get(u.lesson.key) ?? { lesson: u.lesson, missing: 0 };
    m.missing += u.length;
    missing.set(u.lesson.key, m);
  }
  const unplacedReport = [...missing.values()].map(({ lesson, missing }) => ({
    lesson,
    missing,
    reason: diagnose(lesson, board, input, weekSlots, roomsByKind),
  }));

  let sameDayRepeats = 0;
  for (const n of board.subjectDay.values()) if (n > 1) sameDayRepeats += n - 1;
  let lateCoreLessons = 0;
  for (const pl of board.placed.values()) {
    if (pl.unit.lesson.isCore && board.slots(pl.start, pl.unit.length).some((p) => latePeriods.has(p))) lateCoreLessons++;
  }
  let teacherOverloadDays = 0;
  for (const n of board.teacherDay.values()) if (n > MAX_TEACHER_DAY) teacherOverloadDays++;

  const required = input.lessons.reduce((n, l) => n + l.periodsPerWeek, 0);
  return {
    placements,
    required,
    placed: placements.length,
    unplaced: unplacedReport,
    quality: { sameDayRepeats, lateCoreLessons, teacherOverloadDays, doublesPlaced, doublesRequested },
    warnings,
    cost: board.totalCost(),
    durationMs: Date.now() - started,
  };
}

function diagnose(
  lesson: SolverLesson,
  board: Board,
  input: SolverInput,
  weekSlots: number,
  roomsByKind: Map<string, string[]>,
): string {
  const classUsed = [...board.classBusy.keys()].filter((k) => k.startsWith(`${lesson.classArmId}|`)).length;
  if (classUsed >= weekSlots) return `${lesson.labels.classArm} has no free periods left.`;
  if (lesson.roomKind && !roomsByKind.get(lesson.roomKind)?.length) return `There is no ${lesson.roomKind} room.`;
  if (lesson.teacherId) {
    const off = input.unavailable.get(lesson.teacherId)?.size ?? 0;
    const busy = [...board.teacherBusy.keys()].filter((k) => k.startsWith(`${lesson.teacherId}|`)).length;
    if (busy + off >= weekSlots) return `${lesson.labels.teacher ?? 'The teacher'} has no free periods left.`;
    return `${lesson.labels.teacher ?? 'The teacher'} and ${lesson.labels.classArm} are never free at the same time${lesson.roomKind ? ` with a ${lesson.roomKind} room available` : ''}.`;
  }
  return `No period is free for ${lesson.labels.classArm}${lesson.roomKind ? ` with a ${lesson.roomKind} room` : ''}.`;
}
