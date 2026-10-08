import { ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  DAILY_CHALLENGE,
  DAILY_XP_CAP,
  DAILY_XP_ROUNDS,
  GAME_BADGES,
  gamesOpenAt,
  gamesSettingsOf,
  levelOf as xpLevelOf,
  markLocalRound,
  MATCH_ROUND,
  MIN_ANSWER_MS,
  PLAYABLE_GAMES,
  QUIZ_RUSH,
  TF_BLITZ,
  WORD_ROUND,
  xpFor,
  type ChildGamesSummary,
  type ClassGamesActivity,
  type GameAnswerFeedback,
  type GameKind,
  type GameLevel,
  type GameProfileView,
  type GameRoundResult,
  type GameRoundView,
  type GamesAdminStatus,
  type GamesHub,
  type GamesLeaderboard,
  type GamesSettings,
  type LocalScoreInput,
  type RoundAnswerInput,
  type RoundStartInput,
  type SyllabusMatchPack,
} from '@aischool/shared';
import type { GameProfile, GameRound, Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { currentContext, currentTenantId } from '../common/request-context';
import { schoolNow } from '../common/school-time';
import { levelOf, MasteryService, subjectKey } from '../learning/mastery.service';
import { yearOf } from '../lesson-modules/modules.helpers';
import { PrismaService } from '../prisma/prisma.service';
import { GamesContent, type Learner, type RoundItem } from './games.content';

interface StoredAnswer {
  i: number;
  choice: number | null;
  correct: boolean;
  /** Milliseconds the server saw between the question and the answer. */
  ms: number;
  points: number;
  run: number;
  lives: number | null;
  tooFast: boolean;
  /** When the server received it (the next question's clock starts here). */
  at: number;
}

type Me = Awaited<ReturnType<GamesService['me']>>;

const DAY = 86_400_000;
/** Answers this late after a question (network on a slow phone included) count as "ran out of time". */
const LATE_GRACE_MS = 4000;
/** An open server round is abandoned after this long. */
const ROUND_TTL_MS = 30 * 60_000;
/** Scores played offline can be sent for this long. */
const OFFLINE_DAYS = 7;

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekdayOf = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
const mondayOf = (date: string) => addDays(date, 1 - weekdayOf(date));
/** Rounds that count (one closed because another was started doesn't). */
const COUNTED = { OR: [{ flagged: null }, { flagged: { not: 'Left unfinished' } }] };
const shortName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName.trim().charAt(0).toUpperCase()}${s.lastName.trim() ? '.' : ''}`;

/**
 * Streak from the days played: today counts if played (it isn't over yet, so
 * not playing today doesn't break anything); one missed day per week (Monday
 * to Sunday) is covered by that week's freeze.
 */
export function streakFrom(days: Set<string>, today: string): { streak: number; freezeUsedThisWeek: boolean } {
  let d = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  const frozen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    if (days.has(d)) {
      streak++;
      d = addDays(d, -1);
      continue;
    }
    const week = mondayOf(d);
    const before = addDays(d, -1);
    if (!frozen.has(week) && days.has(before)) {
      frozen.add(week);
      d = before;
      continue;
    }
    break;
  }
  return { streak, freezeUsedThisWeek: frozen.has(mondayOf(today)) && streak > 0 };
}

// ------------------------------------------------------------ rate limits (per student, not per IP: a whole school shares one)

const buckets = new Map<string, number[]>();
function limit(key: string, max: number, windowMs = 60_000) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) throw new HttpException({ statusCode: 429, code: 'GAMES_SLOW_DOWN', message: 'Slow down a little and try again in a minute.' }, 429);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 20_000) for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
}

/**
 * EduGames: rounds (server-marked quizzes, device-played rounds marked by
 * replay), XP, levels, streaks and badges, the class Daily Challenge, weekly
 * leaderboards, house points, and what teachers, parents and the school see.
 */
@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: GamesContent,
    private readonly mastery: MasteryService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.db;
  }

  // ---------------------------------------------------------- school settings

  async tenant(tenantId = currentTenantId()) {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, timezone: true, portalSettings: true } });
    const settings = gamesSettingsOf((t.portalSettings as { games?: unknown } | null)?.games);
    return { id: t.id, timezone: t.timezone, settings, now: schoolNow(t.timezone) };
  }

  private accessOf(t: Awaited<ReturnType<GamesService['tenant']>>, at?: Date) {
    const n = at ? schoolNow(t.timezone, at) : t.now;
    const a = gamesOpenAt(t.settings, n.weekday, n.time);
    const message = a.reason === 'OFF' ? 'Your school has turned games off for now.' : a.reason === 'QUIET_HOURS' ? `Games are closed during lessons. They open again at ${a.reopensAt}.` : null;
    return { ...a, message };
  }

  private mustBeOpen(t: Awaited<ReturnType<GamesService['tenant']>>, at?: Date) {
    const a = this.accessOf(t, at);
    if (!a.open) throw new ForbiddenException({ statusCode: 403, code: a.reason === 'OFF' ? 'GAMES_OFF' : 'GAMES_QUIET_HOURS', message: a.message });
  }

  async adminStatus(): Promise<GamesAdminStatus> {
    const t = await this.tenant();
    const weekStart = mondayOf(t.now.date);
    const [rounds, students] = await Promise.all([
      this.db.gameRound.findMany({ where: { playDate: { gte: weekStart }, endedAt: { not: null }, ...COUNTED }, select: { studentId: true, durationMs: true } }),
      this.db.student.count({ where: { status: 'ACTIVE' } }),
    ]);
    return {
      settings: t.settings,
      week: { players: new Set(rounds.map((r) => r.studentId)).size, rounds: rounds.length, minutes: Math.round(rounds.reduce((a, r) => a + (r.durationMs ?? 0), 0) / 60_000), students },
    };
  }

  async saveSettings(next: GamesSettings): Promise<GamesAdminStatus> {
    const tenantId = currentTenantId();
    const t = await this.prisma.root.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { portalSettings: true } });
    const portal = (t.portalSettings as Record<string, unknown> | null) ?? {};
    const prev = gamesSettingsOf(portal.games);
    // Read-modify-write: the portal's other settings stay as they are.
    await this.prisma.root.tenant.update({ where: { id: tenantId }, data: { portalSettings: { ...portal, games: next } as unknown as Prisma.InputJsonValue } });
    const changes = [
      prev.enabled !== next.enabled && (next.enabled ? 'games on' : 'games off'),
      JSON.stringify(prev.quietHours) !== JSON.stringify(next.quietHours) && (next.quietHours.enabled ? `closed ${next.quietHours.start}–${next.quietHours.end} on school days` : 'no quiet hours'),
      prev.leaderboards !== next.leaderboards && (next.leaderboards ? 'leaderboards on' : 'leaderboards off'),
      JSON.stringify(prev.housePoints) !== JSON.stringify(next.housePoints) && (next.housePoints.enabled ? `house points for the top ${next.housePoints.topPlayers} (${next.housePoints.points} each)` : 'no house points'),
    ].filter(Boolean);
    await this.audit.log({ action: 'games.settings_updated', entityType: 'Tenant', entityId: tenantId, summary: `Updated games settings${changes.length ? `: ${changes.join(', ')}` : ''}` });
    return this.adminStatus();
  }

  // ---------------------------------------------------------- the student

  async me() {
    const ctx = currentContext();
    if (!ctx.permissions.has('learning.use')) throw new ForbiddenException('Games are for students');
    const s = await this.db.student.findFirst({
      where: { userId: ctx.userId, status: 'ACTIVE' },
      include: { classArm: { include: { classLevel: true, subjects: { include: { subject: { select: { id: true, name: true } } } } } }, house: { select: { id: true, name: true, colour: true } } },
    });
    if (!s) throw new ForbiddenException('Your account isn’t linked to a student record');
    const level = levelOf(s.classArm?.classLevel.stage, s.classArm?.classLevel.name) as GameLevel;
    const subjects = s.classArm?.subjects.map((c) => c.subject) ?? [];
    const learner: Learner = {
      level,
      classLevelId: s.classArm?.classLevelId ?? null,
      classArmId: s.classArmId,
      subjectIds: subjects.map((x) => x.id),
      subjectKeys: [...new Set(subjects.map((x) => subjectKey(x.name)))],
    };
    return {
      s,
      level,
      year: Math.min(6, yearOf(s.classArm?.classLevel.name ?? '1')),
      learner,
      className: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}`.trim() : null,
    };
  }

  private async profileRow(m: Me): Promise<GameProfile> {
    return this.db.gameProfile.upsert({ where: { studentId: m.s.id }, update: {}, create: { studentId: m.s.id } as Prisma.GameProfileUncheckedCreateInput });
  }

  private async playDays(studentId: string, from: string) {
    const rows = await this.db.gameRound.findMany({ where: { studentId, playDate: { gte: from }, endedAt: { not: null }, flagged: null, total: { gt: 0 } }, select: { playDate: true }, distinct: ['playDate'] });
    return new Set(rows.map((r) => r.playDate));
  }

  private async xpToday(studentId: string, today: string) {
    const a = await this.db.gameRound.aggregate({ where: { studentId, playDate: today }, _sum: { xp: true } });
    return a._sum.xp ?? 0;
  }

  private view(p: GameProfile, today: string, days: Set<string>, xpToday: number): GameProfileView {
    const lv = xpLevelOf(p.xp);
    const st = streakFrom(days, today);
    return {
      xp: p.xp,
      level: lv.level,
      levelTitle: lv.title,
      levelInto: lv.into,
      levelSpan: lv.span,
      streak: st.streak,
      bestStreak: Math.max(p.bestStreak, st.streak),
      playedToday: days.has(today),
      freezeAvailable: !st.freezeUsedThisWeek,
      correct: p.correct,
      answered: p.answered,
      rounds: p.rounds,
      hidden: p.hidden,
      xpToday,
    };
  }

  async hub(): Promise<GamesHub> {
    const m = await this.me();
    const t = await this.tenant();
    const today = t.now.date;
    const weekStart = mondayOf(today);
    const dailyKey = m.s.classArmId ? `${today}:${m.s.classArmId}` : null;
    const [profile, days, xpToday, recent, week, mine, classDone, subjects] = await Promise.all([
      this.profileRow(m),
      this.playDays(m.s.id, addDays(today, -400)),
      this.xpToday(m.s.id, today),
      this.db.gameRound.findMany({ where: { studentId: m.s.id, endedAt: { not: null }, total: { gt: 0 }, ...COUNTED }, orderBy: { endedAt: 'desc' }, take: 5, select: { game: true, correct: true, total: true, xp: true, endedAt: true } }),
      this.db.gameRound.aggregate({ where: { studentId: m.s.id, playDate: { gte: weekStart }, endedAt: { not: null } }, _sum: { xp: true }, _count: { _all: true } }),
      dailyKey ? this.db.gameRound.findUnique({ where: { studentId_dailyKey: { studentId: m.s.id, dailyKey } } }) : null,
      dailyKey ? this.db.gameRound.count({ where: { dailyKey, endedAt: { not: null } } }) : 0,
      this.content.subjectCounts(m.learner),
    ]);
    // Keep the stored streak in step (leaderboards and parents read it).
    const v = this.view(profile, today, days, xpToday);
    if (v.streak !== profile.streak || v.bestStreak !== profile.bestStreak) await this.db.gameProfile.update({ where: { id: profile.id }, data: { streak: v.streak, bestStreak: v.bestStreak } });
    const earned = (profile.badges ?? {}) as Record<string, string>;
    const access = this.accessOf(t);
    return {
      student: { firstName: m.s.firstName, className: m.className, level: m.level, year: m.year, house: m.s.house ? { name: m.s.house.name, colour: m.s.house.colour } : null },
      access: { open: access.open, reason: access.reason, message: access.message },
      profile: v,
      badges: GAME_BADGES.map((b) => ({ key: b.key, label: b.label, description: b.description, earnedAt: earned[b.key] ?? null })),
      daily: {
        available: !!dailyKey,
        done: !!mine?.endedAt,
        inProgress: !!mine && !mine.endedAt,
        result: mine?.endedAt ? { correct: mine.correct, total: mine.total, xp: mine.xp } : null,
        questions: DAILY_CHALLENGE.questions,
        classDone,
        date: today,
      },
      subjects,
      week: { days: Array.from({ length: 7 }, (_, i) => days.has(addDays(weekStart, i))), xp: week._sum.xp ?? 0, rounds: week._count._all },
      recent: recent.map((r) => ({ game: r.game as GameKind, correct: r.correct, total: r.total, xp: r.xp, at: r.endedAt!.toISOString() })),
      leaderboards: t.settings.leaderboards,
      today,
    };
  }

  async setHidden(hidden: boolean) {
    const m = await this.me();
    const p = await this.profileRow(m);
    await this.db.gameProfile.update({ where: { id: p.id }, data: { hidden } });
    return { hidden };
  }

  // ---------------------------------------------------------- server rounds (Quiz Rush, True or False Blitz, Daily Challenge)

  private rules(game: GameKind) {
    if (game === 'QUIZ_RUSH') return { n: QUIZ_RUSH.questions, lives: QUIZ_RUSH.lives as number | null, seconds: QUIZ_RUSH.secondsPerQuestion };
    if (game === 'TF_BLITZ') return { n: TF_BLITZ.statements, lives: null, seconds: TF_BLITZ.secondsPerStatement };
    return { n: DAILY_CHALLENGE.questions, lives: null, seconds: DAILY_CHALLENGE.secondsPerQuestion };
  }

  private roundView(r: GameRound): GameRoundView {
    const items = r.items as unknown as RoundItem[];
    const answers = r.answers as unknown as StoredAnswer[];
    const rules = this.rules(r.game as GameKind);
    let score = 0;
    return {
      id: r.id,
      game: r.game as GameKind,
      subject: r.subject,
      questions: items.map((q, index) => ({ index, prompt: q.prompt, options: q.options, subject: q.subject, topic: q.topic })),
      answered: answers.map((a) => {
        score += a.points;
        return this.feedback(items[a.i]!, a, score, a.i === items.length - 1 || a.lives === 0);
      }),
      lives: rules.lives,
      secondsPerQuestion: rules.seconds,
      startedAt: r.startedAt.toISOString(),
      done: !!r.endedAt || answers.length >= items.length || answers.at(-1)?.lives === 0,
    };
  }

  private feedback(item: RoundItem, a: StoredAnswer, score: number, done: boolean): GameAnswerFeedback {
    return { index: a.i, correct: a.correct, correctIndex: item.answer, explanation: item.explanation, points: a.points, score, run: a.run, livesLeft: a.lives, done, ...(a.tooFast ? { tooFast: true } : {}) };
  }

  async start(input: Required<Pick<RoundStartInput, 'game'>> & { subject: string | null }): Promise<GameRoundView> {
    const m = await this.me();
    const t = await this.tenant();
    this.mustBeOpen(t);
    limit(`start:${m.s.id}`, 12);
    const today = t.now.date;
    const game = input.game as GameKind;

    if (game === 'DAILY') {
      if (!m.s.classArmId) throw new ForbiddenException('The Daily Challenge is for students in a class');
      const dailyKey = `${today}:${m.s.classArmId}`;
      const mine = await this.db.gameRound.findUnique({ where: { studentId_dailyKey: { studentId: m.s.id, dailyKey } } });
      if (mine?.endedAt) throw new ConflictException({ statusCode: 409, code: 'DAILY_DONE', message: 'You’ve done today’s Daily Challenge. A new one comes tomorrow.' });
      // A refresh or a lost connection: carry on where you were.
      if (mine) return this.roundView(mine);
      // Everyone in the class gets the same questions: copy them from whoever started first today.
      const first = await this.db.gameRound.findFirst({ where: { dailyKey }, select: { items: true } });
      const items = first ? (first.items as unknown as RoundItem[]) : await this.content.daily(m.learner, today);
      if (!items.length) throw new ForbiddenException('There’s no Daily Challenge for your class yet.');
      try {
        const r = await this.db.gameRound.create({
          data: { studentId: m.s.id, classArmId: m.s.classArmId, game, mode: 'SERVER', playDate: today, dailyKey, items: items as unknown as Prisma.InputJsonValue } as Prisma.GameRoundUncheckedCreateInput,
        });
        return this.roundView(r);
      } catch {
        // Started twice at once: the other request won.
        const again = await this.db.gameRound.findUnique({ where: { studentId_dailyKey: { studentId: m.s.id, dailyKey } } });
        if (!again) throw new ConflictException('Couldn’t start the Daily Challenge. Try again.');
        return this.roundView(again);
      }
    }

    // One open round at a time: an unfinished earlier one is closed without XP.
    await this.db.gameRound.updateMany({ where: { studentId: m.s.id, mode: 'SERVER', endedAt: null, dailyKey: null }, data: { endedAt: new Date(), flagged: 'Left unfinished' } });
    const recentRounds = await this.db.gameRound.findMany({ where: { studentId: m.s.id, mode: 'SERVER' }, orderBy: { startedAt: 'desc' }, take: 4, select: { items: true } });
    const recent = new Set(recentRounds.flatMap((r) => (r.items as unknown as RoundItem[]).map((i) => i.ref)));
    const rules = this.rules(game);
    const items = await this.content.pick(m.learner, game === 'TF_BLITZ' ? 'TF' : 'MCQ', input.subject, rules.n, recent);
    const r = await this.db.gameRound.create({
      data: { studentId: m.s.id, classArmId: m.s.classArmId, game, mode: 'SERVER', subject: input.subject, playDate: today, items: items as unknown as Prisma.InputJsonValue, lives: rules.lives } as Prisma.GameRoundUncheckedCreateInput,
    });
    return this.roundView(r);
  }

  private async mine(roundId: string, studentId: string) {
    const r = await this.db.gameRound.findFirst({ where: { id: roundId, studentId, mode: 'SERVER' } });
    if (!r) throw new NotFoundException('Round not found');
    return r;
  }

  async round(roundId: string): Promise<GameRoundView> {
    const m = await this.me();
    return this.roundView(await this.mine(roundId, m.s.id));
  }

  /** Marks one answer. The right answer is revealed only now, for this question. */
  async answer(roundId: string, input: RoundAnswerInput): Promise<GameAnswerFeedback> {
    const m = await this.me();
    const t = await this.tenant();
    this.mustBeOpen(t);
    limit(`answer:${m.s.id}`, 150);
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await this.mine(roundId, m.s.id);
      const items = r.items as unknown as RoundItem[];
      const answers = r.answers as unknown as StoredAnswer[];
      const game = r.game as GameKind;
      const rules = this.rules(game);
      let score = answers.reduce((a, x) => a + x.points, 0);
      // Sent twice (a retry on a bad connection): the same answer back.
      if (input.index < answers.length) {
        const prev = answers[input.index]!;
        const before = answers.slice(0, input.index + 1).reduce((a, x) => a + x.points, 0);
        return this.feedback(items[prev.i]!, prev, before, prev.i === items.length - 1 || prev.lives === 0);
      }
      if (r.endedAt) throw new ConflictException({ statusCode: 409, code: 'ROUND_OVER', message: 'This round is over.' });
      const last = answers.at(-1);
      if (last?.lives === 0 || answers.length >= items.length) throw new ConflictException({ statusCode: 409, code: 'ROUND_OVER', message: 'This round is over.' });
      if (input.index !== answers.length) throw new ConflictException('Answer the questions in order');
      if (Date.now() - r.startedAt.getTime() > ROUND_TTL_MS && game !== 'DAILY') throw new ConflictException({ statusCode: 409, code: 'ROUND_OVER', message: 'This round has timed out.' });
      const item = items[input.index]!;
      const now = Date.now();
      const askedAt = last?.at ?? r.startedAt.getTime();
      const ms = Math.max(0, now - askedAt);
      const limitMs = rules.seconds * 1000;
      // The Daily Challenge has no clock (it can be picked up again later); the others do.
      const timedOut = input.choice === null || (game !== 'DAILY' && ms > limitMs + LATE_GRACE_MS);
      if (input.choice !== null && (input.choice < 0 || input.choice >= item.options.length)) throw new ConflictException('That option isn’t in the question');
      const correct = !timedOut && input.choice === item.answer;
      const tooFast = !timedOut && ms < MIN_ANSWER_MS[game === 'TF_BLITZ' ? 'TF_BLITZ' : game === 'DAILY' ? 'DAILY' : 'QUIZ_RUSH'];
      const run = correct ? (last?.run ?? 0) + 1 : 0;
      const speed = Math.max(0, 1 - ms / limitMs);
      let points = 0;
      if (correct && !tooFast) {
        if (game === 'QUIZ_RUSH') points = 100 + Math.round(50 * speed) + Math.min(run - 1, 5) * 10;
        else if (game === 'TF_BLITZ') points = 50 + Math.round(25 * speed) + Math.min(run - 1, 5) * 5;
        else points = 100;
      }
      const lives = rules.lives === null ? null : (last?.lives ?? rules.lives) - (correct ? 0 : 1);
      const a: StoredAnswer = { i: input.index, choice: input.choice, correct, ms, points, run, lives, tooFast, at: now };
      // Guarded write: if another request answered this question first, go round again.
      const done = input.index === items.length - 1 || lives === 0;
      const saved = await this.db.gameRound.updateMany({
        where: { id: r.id, endedAt: null, total: answers.length },
        data: { answers: [...answers, a] as unknown as Prisma.InputJsonValue, total: answers.length + 1, correct: r.correct + (correct ? 1 : 0), score: score + points, lives },
      });
      if (!saved.count) continue;
      score += points;
      return this.feedback(item, a, score, done);
    }
    throw new ConflictException('That answer clashed with another. Try again.');
  }

  /** Ends a server round: marks what was answered, awards XP and badges, adds (low-weight) mastery evidence. */
  async finish(roundId: string): Promise<GameRoundResult> {
    const m = await this.me();
    const t = await this.tenant();
    limit(`finish:${m.s.id}`, 30);
    const r = await this.mine(roundId, m.s.id);
    const items = r.items as unknown as RoundItem[];
    const answers = r.answers as unknown as StoredAnswer[];
    const game = r.game as GameKind;
    const review = items.map((q, i) => {
      const a = answers.find((x) => x.i === i);
      return {
        prompt: q.prompt,
        yourAnswer: a && a.choice !== null ? (q.options[a.choice] ?? null) : null,
        correctAnswer: q.options[q.answer] ?? '',
        correct: !!a?.correct,
        explanation: q.explanation,
      };
    });
    if (r.endedAt) {
      if (r.flagged === 'Left unfinished') throw new ConflictException({ statusCode: 409, code: 'ROUND_OVER', message: 'This round was closed when you started another.' });
      // Already finished (a retry): the same result again.
      return { ...(await this.resultOf(m, t.now.date, r, null)), review, duplicate: true };
    }
    // Only questions that were shown count (Quiz Rush ends when the lives run out); the Daily Challenge counts all of them.
    const total = game === 'DAILY' ? items.length : Math.max(answers.length, 0);
    const correct = answers.filter((a) => a.correct).length;
    const fast = answers.filter((a) => a.tooFast).length;
    const flagged = fast >= 3 && fast / Math.max(1, answers.length) > 0.25 ? 'Answered faster than anyone can read the questions' : null;
    const finished = answers.length === items.length && answers.at(-1)?.lives !== 0;
    const base = total ? xpFor(game, correct, total, { finished, perfect: correct === items.length }) : 0;
    const subjects: Record<string, number> = {};
    const topics: Record<string, { topic: string; subject: string | null; correct: number; total: number }> = {};
    for (const a of answers) {
      const q = items[a.i]!;
      if (a.correct && q.subject) subjects[q.subject] = (subjects[q.subject] ?? 0) + 1;
      if (q.topicId) {
        const x = (topics[q.topicId] ??= { topic: q.topic ?? '', subject: q.subject, correct: 0, total: 0 });
        x.total++;
        if (a.correct) x.correct++;
      }
    }
    const bestRun = answers.reduce((b, a) => Math.max(b, a.run), 0);
    const ended = await this.db.gameRound.updateMany({
      where: { id: r.id, endedAt: null },
      data: { endedAt: new Date(), correct, total, durationMs: Math.min(ROUND_TTL_MS, Date.now() - r.startedAt.getTime()), topics: topics as Prisma.InputJsonValue, flagged, score: answers.reduce((a, x) => a + x.points, 0) },
    });
    if (!ended.count) return { ...(await this.resultOf(m, t.now.date, await this.mine(roundId, m.s.id), null)), review, duplicate: true };
    // Played on the day it started (a round that crossed midnight still counts for its own day).
    const award = await this.award(m, t, r.id, r.playDate, game, { correct, total, base, flagged, subjects, bestRun, perfect: total > 0 && correct === total });
    if (Object.keys(topics).length && !flagged) await this.addEvidence(m, t.id, r.playDate);
    return { ...(await this.resultOf(m, t.now.date, await this.mine(roundId, m.s.id), award)), review };
  }

  // ---------------------------------------------------------- device rounds (Maths Sprint, word games, Match Up, offline True or False)

  async submitLocal(input: LocalScoreInput): Promise<GameRoundResult> {
    const m = await this.me();
    const t = await this.tenant();
    limit(`score:${m.s.id}`, 20);
    const existing = await this.db.gameRound.findUnique({ where: { studentId_clientId: { studentId: m.s.id, clientId: input.clientId } } });
    if (existing) return { ...(await this.resultOf(m, t.now.date, existing, null)), review: [], duplicate: true };
    const playedAt = new Date(input.playedAt);
    if (playedAt.getTime() > Date.now() + 5 * 60_000) throw new UnprocessableEntityException({ statusCode: 422, code: 'IMPLAUSIBLE', message: 'That round is dated in the future.' });
    if (playedAt.getTime() < Date.now() - OFFLINE_DAYS * DAY) throw new UnprocessableEntityException({ statusCode: 422, code: 'TOO_OLD', message: `Rounds older than ${OFFLINE_DAYS} days can’t be counted.` });
    // Games off now, or closed when it was played (during lessons): not counted.
    this.mustBeOpen(t, playedAt);

    const mark = markLocalRound(input);
    let subject: string | null = null;
    let implausible = mark.implausible;
    if (input.game === 'MATHS_SPRINT' && input.level !== m.level) implausible ??= 'That Maths Sprint wasn’t for your level.';
    if (input.game === 'MATCH_UP' && input.packId.startsWith('syl:')) {
      const chk = await this.content.checkSyllabusPack(input.packId, m.level);
      if (!chk.ok || chk.pairs !== input.pairs.length || input.matched > chk.pairs) implausible ??= 'That match pack isn’t from your syllabus.';
      else if (input.matched > 0 && input.durationMs < input.matched * 2 * MIN_ANSWER_MS.MATCH_UP) implausible ??= 'Matched faster than cards can be turned.';
      subject = chk.subject;
      if (subject && input.matched) mark.subjects[subject] = input.matched;
    }
    if (implausible) throw new UnprocessableEntityException({ statusCode: 422, code: 'IMPLAUSIBLE', message: `That score can’t be counted: ${implausible}` });

    const playDate = schoolNow(t.timezone, playedAt).date;
    const { clientId, game, ...payload } = input;
    let r: GameRound;
    try {
      r = await this.db.gameRound.create({
        data: {
          studentId: m.s.id,
          classArmId: m.s.classArmId,
          game,
          mode: 'LOCAL',
          subject: subject ?? (game === 'MATHS_SPRINT' ? 'Mathematics' : (Object.keys(mark.subjects)[0] ?? null)),
          playDate,
          clientId,
          items: payload as unknown as Prisma.InputJsonValue,
          correct: mark.correct,
          total: mark.total,
          score: mark.correct * 10 + mark.bestRun * 2,
          durationMs: Math.min(input.durationMs, 10 * 60_000),
          startedAt: new Date(playedAt.getTime() - input.durationMs),
          endedAt: playedAt,
        } as Prisma.GameRoundUncheckedCreateInput,
      });
    } catch {
      const again = await this.db.gameRound.findUnique({ where: { studentId_clientId: { studentId: m.s.id, clientId } } });
      if (!again) throw new ConflictException('Couldn’t save that score. Try again.');
      return { ...(await this.resultOf(m, t.now.date, again, null)), review: [], duplicate: true };
    }
    const extra = input.game === 'MATCH_UP' ? { misses: input.misses, pairs: input.pairs.length } : {};
    const base = xpFor(game, mark.correct, mark.total, { ...extra, perfect: mark.total > 0 && mark.correct === mark.total });
    const award = await this.award(m, t, r.id, playDate, game, { correct: mark.correct, total: mark.total, base, flagged: null, subjects: mark.subjects, bestRun: mark.bestRun, perfect: mark.total > 0 && mark.correct === mark.total, ...extra });
    return { ...(await this.resultOf(m, t.now.date, await this.db.gameRound.findUniqueOrThrow({ where: { id: r.id } }), award)), review: [] };
  }

  async syllabusPack(subject: string): Promise<SyllabusMatchPack | null> {
    const m = await this.me();
    const t = await this.tenant();
    this.mustBeOpen(t);
    limit(`pack:${m.s.id}`, 20);
    return this.content.syllabusPack(m.level, subject, MATCH_ROUND.pairs);
  }

  // ---------------------------------------------------------- XP, streaks and badges (the server is the only authority)

  private async award(
    m: Me,
    t: Awaited<ReturnType<GamesService['tenant']>>,
    roundId: string,
    playDate: string,
    game: GameKind,
    x: { correct: number; total: number; base: number; flagged: string | null; subjects: Record<string, number>; bestRun: number; perfect: boolean; misses?: number; pairs?: number },
  ): Promise<{ newBadges: GameRoundResult['newBadges']; leveledUp: boolean; note: string | null }> {
    const studentId = m.s.id;
    const tenantId = t.id;
    return this.prisma.root.$transaction(async (tx) => {
      // One award per student at a time, so XP and badges never race.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`games:${studentId}`}))) l`;
      const [dayXp, dayRounds] = await Promise.all([
        tx.gameRound.aggregate({ where: { tenantId, studentId, playDate, id: { not: roundId } }, _sum: { xp: true } }),
        tx.gameRound.count({ where: { tenantId, studentId, playDate, xp: { gt: 0 }, id: { not: roundId } } }),
      ]);
      let xp = x.base;
      let note: string | null = null;
      if (x.flagged) {
        xp = 0;
        note = `No XP: ${x.flagged.toLowerCase()}.`;
      } else if (dayRounds >= DAILY_XP_ROUNDS) {
        xp = 0;
        note = `You’ve earned XP from ${DAILY_XP_ROUNDS} rounds today. Play on for fun; XP is back tomorrow.`;
      } else {
        const room = Math.max(0, DAILY_XP_CAP - (dayXp._sum.xp ?? 0));
        if (xp > room) {
          xp = room;
          note = room ? `You reached today’s ${DAILY_XP_CAP} XP limit.` : `You’ve reached today’s ${DAILY_XP_CAP} XP limit. Come back tomorrow for more.`;
        }
      }
      await tx.gameRound.update({ where: { id: roundId }, data: { xp } });

      const prev = await tx.gameProfile.upsert({ where: { studentId }, update: {}, create: { tenantId, studentId } });
      const stats = (prev.stats ?? {}) as { subjects?: Record<string, number>; games?: Record<string, number> };
      const subjects = { ...(stats.subjects ?? {}) };
      const games = { ...(stats.games ?? {}) };
      if (!x.flagged) {
        for (const [s, n] of Object.entries(x.subjects)) subjects[s] = (subjects[s] ?? 0) + n;
        games[game] = (games[game] ?? 0) + 1;
      }
      const days = await tx.gameRound.findMany({ where: { tenantId, studentId, playDate: { gte: addDays(t.now.date, -400) }, endedAt: { not: null }, flagged: null, total: { gt: 0 } }, select: { playDate: true }, distinct: ['playDate'] });
      const st = streakFrom(new Set(days.map((d) => d.playDate)), t.now.date);
      const counted = !x.flagged;
      const next = {
        xp: prev.xp + xp,
        correct: prev.correct + (counted ? x.correct : 0),
        answered: prev.answered + (counted ? x.total : 0),
        rounds: prev.rounds + (counted ? 1 : 0),
        streak: st.streak,
        bestStreak: Math.max(prev.bestStreak, st.streak),
        lastPlayDate: counted && (!prev.lastPlayDate || playDate > prev.lastPlayDate) ? playDate : prev.lastPlayDate,
      };
      const badges = { ...((prev.badges ?? {}) as Record<string, string>) };
      const earn: string[] = [];
      if (counted) {
        const lv = xpLevelOf(next.xp).level;
        const checks: Record<string, boolean> = {
          FIRST_GAME: next.rounds >= 1,
          DAILY_FIRST: game === 'DAILY',
          DAILY_PERFECT: game === 'DAILY' && x.perfect,
          STREAK_3: next.streak >= 3,
          STREAK_7: next.streak >= 7,
          STREAK_30: next.streak >= 30,
          CORRECT_100: next.correct >= 100,
          CORRECT_500: next.correct >= 500,
          HOT_STREAK: game === 'QUIZ_RUSH' && x.bestRun >= 10,
          MATHS_WHIZ: game === 'MATHS_SPRINT' && x.correct >= 25,
          SPELLING_STAR: game === 'SPELLING_BEE' && x.perfect && x.total >= WORD_ROUND.words,
          SHARP_MEMORY: game === 'MATCH_UP' && x.correct === (x.pairs ?? -1) && (x.misses ?? 99) <= 2,
          SUBJECT_MASTER: Object.values(subjects).some((n) => n >= 100),
          ALL_ROUNDER: PLAYABLE_GAMES.every((g) => (games[g] ?? 0) > 0),
          LEVEL_5: lv >= 5,
          LEVEL_10: lv >= 10,
        };
        for (const [k, ok] of Object.entries(checks)) {
          if (ok && !badges[k]) {
            badges[k] = new Date().toISOString();
            earn.push(k);
          }
        }
      }
      await tx.gameProfile.update({ where: { id: prev.id }, data: { ...next, badges, stats: { subjects, games } } });
      return {
        newBadges: GAME_BADGES.filter((b) => earn.includes(b.key)).map((b) => ({ key: b.key, label: b.label, description: b.description })),
        leveledUp: xpLevelOf(next.xp).level > xpLevelOf(prev.xp).level,
        note,
      };
    });
  }

  private async resultOf(m: Me, today: string, r: GameRound, award: { newBadges: GameRoundResult['newBadges']; leveledUp: boolean; note: string | null } | null): Promise<Omit<GameRoundResult, 'review'>> {
    const [p, days, xpToday] = await Promise.all([this.profileRow(m), this.playDays(m.s.id, addDays(today, -400)), this.xpToday(m.s.id, today)]);
    const note = award ? award.note : r.flagged && r.flagged !== 'Left unfinished' ? `No XP: ${r.flagged.toLowerCase()}.` : null;
    const newBadges = award?.newBadges ?? [];
    const leveledUp = award?.leveledUp ?? false;
    return { id: r.id, game: r.game as GameKind, correct: r.correct, total: r.total, score: r.score, xp: r.xp, xpNote: note, newBadges, profile: this.view(p, today, days, xpToday), leveledUp };
  }

  /**
   * Game answers with a known syllabus topic feed topic mastery as source GAME,
   * one evidence row per topic per day (replaced as the day goes on), each
   * capped at GAME_EVIDENCE_CAP questions' weight: games show what a student is
   * practising without being able to inflate mastery.
   */
  private async addEvidence(m: Me, tenantId: string, playDate: string) {
    try {
      const rounds = await this.db.gameRound.findMany({ where: { studentId: m.s.id, playDate, mode: 'SERVER', endedAt: { not: null }, flagged: null }, select: { topics: true } });
      const byTopic = new Map<string, { correct: number; total: number }>();
      for (const r of rounds) {
        for (const [topicId, v] of Object.entries((r.topics ?? {}) as Record<string, { correct: number; total: number }>)) {
          const x = byTopic.get(topicId) ?? { correct: 0, total: 0 };
          x.correct += v.correct;
          x.total += v.total;
          byTopic.set(topicId, x);
        }
      }
      await this.mastery.replaceEvidence(tenantId, m.s.id, 'GAME', `day:${playDate}`, [...byTopic].map(([topicId, v]) => ({ topicId, ...v })));
    } catch (err) {
      this.logger.warn(`Couldn't record game evidence for ${m.s.id}: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------- leaderboards (weekly; first name and initial; hidden students left out)

  async leaderboard(scope: 'class' | 'house'): Promise<GamesLeaderboard> {
    const m = await this.me();
    const t = await this.tenant();
    if (!t.settings.leaderboards) throw new ForbiddenException({ statusCode: 403, code: 'LEADERBOARDS_OFF', message: 'Your school has turned leaderboards off.' });
    limit(`board:${m.s.id}`, 30);
    await this.maybeAwardHousePoints(t).catch((err) => this.logger.warn(`House points: ${(err as Error).message}`));
    const weekStart = mondayOf(t.now.date);
    const sums = await this.db.gameRound.groupBy({ by: ['studentId'], where: { playDate: { gte: weekStart }, flagged: null, xp: { gt: 0 } }, _sum: { xp: true } });
    const xpOf = new Map(sums.map((s) => [s.studentId, s._sum.xp ?? 0]));
    const [students, hidden, houses] = await Promise.all([
      this.db.student.findMany({ where: { id: { in: [...xpOf.keys(), m.s.id] }, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true, classArmId: true, houseId: true } }),
      this.db.gameProfile.findMany({ where: { hidden: true }, select: { studentId: true } }),
      this.db.house.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, colour: true } }),
    ]);
    const hiddenIds = new Set(hidden.map((h) => h.studentId));
    const houseOf = new Map(houses.map((h) => [h.id, h]));
    const pool = scope === 'class' ? students.filter((s) => m.s.classArmId && s.classArmId === m.s.classArmId) : students.filter((s) => m.s.houseId && s.houseId === m.s.houseId);
    const ranked = pool
      .map((s) => ({ s, xp: xpOf.get(s.id) ?? 0 }))
      .filter((x) => x.xp > 0)
      .sort((a, b) => b.xp - a.xp || a.s.firstName.localeCompare(b.s.firstName));
    // Ranks count everyone (so a hidden student doesn't move others up), but hidden students aren't listed.
    let rank = 0;
    let prevXp = -1;
    const withRank = ranked.map((x, i) => {
      if (x.xp !== prevXp) rank = i + 1;
      prevXp = x.xp;
      return { ...x, rank };
    });
    const meRow = withRank.find((x) => x.s.id === m.s.id);
    const rows = withRank
      .filter((x) => !hiddenIds.has(x.s.id))
      .slice(0, 20)
      .map((x) => {
        const h = x.s.houseId ? houseOf.get(x.s.houseId) : null;
        return { rank: x.rank, name: shortName(x.s), xp: x.xp, me: x.s.id === m.s.id, house: h ? { name: h.name, colour: h.colour } : null };
      });
    const houseTable = houses
      .map((h) => {
        const members = students.filter((s) => s.houseId === h.id && (xpOf.get(s.id) ?? 0) > 0);
        return {
          id: h.id,
          name: h.name,
          colour: h.colour,
          xp: members.reduce((a, s) => a + (xpOf.get(s.id) ?? 0), 0),
          players: members.length,
          mine: h.id === m.s.houseId,
          top: members
            .filter((s) => !hiddenIds.has(s.id))
            .sort((a, b) => (xpOf.get(b.id) ?? 0) - (xpOf.get(a.id) ?? 0))
            .slice(0, 3)
            .map(shortName),
        };
      })
      .sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name));
    const myHouse = m.s.houseId ? houseOf.get(m.s.houseId) : null;
    return {
      scope,
      title: scope === 'class' ? (m.className ?? 'My class') : (myHouse?.name ?? 'My house'),
      weekStart,
      rows,
      me: { rank: meRow && !hiddenIds.has(m.s.id) ? meRow.rank : null, xp: xpOf.get(m.s.id) ?? 0, hidden: hiddenIds.has(m.s.id) },
      houses: houseTable,
      housePoints: t.settings.housePoints,
    };
  }

  /** Once a week (if the school turned it on): last week's top players each earn a few points for their house. */
  async maybeAwardHousePoints(t: Awaited<ReturnType<GamesService['tenant']>>) {
    const hp = t.settings.housePoints;
    if (!hp.enabled || !t.settings.enabled) return;
    const thisWeek = mondayOf(t.now.date);
    const from = addDays(thisWeek, -7);
    const to = addDays(thisWeek, -1);
    const prefix = `EduGames top player, week of ${from}`;
    await this.prisma.root.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${`games-house:${t.id}`}))) l`;
      if (await tx.housePointEntry.count({ where: { tenantId: t.id, category: 'ACADEMIC', reason: { startsWith: prefix } } })) return;
      const sums = await tx.gameRound.groupBy({ by: ['studentId'], where: { tenantId: t.id, playDate: { gte: from, lte: to }, flagged: null, xp: { gt: 0 } }, _sum: { xp: true }, orderBy: { _sum: { xp: 'desc' } }, take: hp.topPlayers * 4 });
      if (!sums.length) return;
      const students = await tx.student.findMany({ where: { tenantId: t.id, id: { in: sums.map((s) => s.studentId) }, status: 'ACTIVE', houseId: { not: null } }, select: { id: true, houseId: true } });
      const winners = sums.filter((s) => students.some((x) => x.id === s.studentId)).slice(0, hp.topPlayers);
      const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
      await tx.housePointEntry.createMany({
        data: winners.map((w, i) => ({
          tenantId: t.id,
          houseId: students.find((x) => x.id === w.studentId)!.houseId!,
          studentId: w.studentId,
          points: hp.points,
          reason: `${prefix} (${ord(i + 1)}, ${w._sum.xp ?? 0} XP)`,
          category: 'ACADEMIC',
          date: new Date(`${to}T00:00:00.000Z`),
        })),
      });
    });
  }

  // ---------------------------------------------------------- teachers, parents

  /** A class's game activity this week (teachers of the class, its class teacher, academic leaders). */
  async classActivity(classArmId: string): Promise<ClassGamesActivity> {
    const ctx = currentContext();
    const p = ctx.permissions;
    if (!p.has('academics.read') && !p.has('homework.manage')) throw new ForbiddenException('Class game activity is for teachers');
    const arm = await this.db.classArm.findUnique({ where: { id: classArmId }, include: { classLevel: true } });
    if (!arm) throw new NotFoundException('Class not found');
    if (!p.has('academics.manage') && !p.has('results.publish')) {
      const staff = await this.db.staff.findFirst({ where: { userId: ctx.userId }, select: { id: true } });
      const teaches = staff && (arm.classTeacherId === staff.id || (await this.db.classSubject.count({ where: { classArmId, teacherId: staff.id } })) > 0);
      if (!teaches) throw new ForbiddenException('You can only see classes you teach');
    }
    const t = await this.tenant();
    const weekStart = mondayOf(t.now.date);
    const students = await this.db.student.findMany({ where: { classArmId, status: 'ACTIVE' }, select: { id: true, firstName: true, lastName: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
    const ids = students.map((s) => s.id);
    const rounds = await this.db.gameRound.findMany({
      where: { studentId: { in: ids }, playDate: { gte: weekStart }, endedAt: { not: null }, total: { gt: 0 }, ...COUNTED },
      select: { studentId: true, game: true, correct: true, total: true, durationMs: true, playDate: true, topics: true, dailyKey: true, mode: true, endedAt: true },
    });
    const topics = new Map<string, { topic: string; subject: string; answered: number; correct: number }>();
    for (const r of rounds) {
      for (const [id, v] of Object.entries((r.topics ?? {}) as Record<string, { topic: string; subject: string | null; correct: number; total: number }>)) {
        const x = topics.get(id) ?? { topic: v.topic, subject: v.subject ?? '', answered: 0, correct: 0 };
        x.answered += v.total;
        x.correct += v.correct;
        topics.set(id, x);
      }
    }
    const byGame = new Map<string, number>();
    for (const r of rounds) byGame.set(r.game, (byGame.get(r.game) ?? 0) + 1);
    const questions = rounds.filter((r) => r.game !== 'MATCH_UP');
    const asked = questions.reduce((a, r) => a + r.total, 0);
    return {
      classArmId,
      label: `${arm.classLevel.name} ${arm.name}`.trim(),
      weekStart,
      students: students.length,
      players: new Set(rounds.map((r) => r.studentId)).size,
      rounds: rounds.length,
      minutes: Math.round(rounds.reduce((a, r) => a + (r.durationMs ?? 0), 0) / 60_000),
      questions: asked,
      percentCorrect: asked ? Math.round((100 * questions.reduce((a, r) => a + r.correct, 0)) / asked) : null,
      dailyToday: rounds.filter((r) => r.dailyKey === `${t.now.date}:${classArmId}`).length,
      topics: [...topics.values()]
        .sort((a, b) => b.answered - a.answered)
        .slice(0, 6)
        .map((x) => ({ topic: x.topic, subject: x.subject, answered: x.answered, percentCorrect: Math.round((100 * x.correct) / x.answered) })),
      byGame: [...byGame].map(([game, n]) => ({ game: game as GameKind, rounds: n })).sort((a, b) => b.rounds - a.rounds),
      rows: students
        .map((s) => {
          const mine = rounds.filter((r) => r.studentId === s.id);
          const last = mine.reduce<Date | null>((a, r) => (!a || r.endedAt! > a ? r.endedAt : a), null);
          return { studentId: s.id, name: `${s.firstName} ${s.lastName}`, rounds: mine.length, minutes: Math.round(mine.reduce((a, r) => a + (r.durationMs ?? 0), 0) / 60_000), days: new Set(mine.map((r) => r.playDate)).size, lastPlayed: last?.toISOString() ?? null };
        })
        .sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name)),
    };
  }

  /** "Played 5 days this week, 120 questions" for a parent (or the student). */
  async child(studentId: string): Promise<ChildGamesSummary> {
    const ctx = currentContext();
    const s = await this.db.student.findUnique({ where: { id: studentId }, select: { id: true, firstName: true, userId: true } });
    if (!s) throw new NotFoundException('Student not found');
    const isParent = ctx.permissions.has('family.manage') && (await this.db.studentGuardian.count({ where: { studentId, guardian: { userId: ctx.userId } } })) > 0;
    if (!isParent && s.userId !== ctx.userId) throw new ForbiddenException('You can only see your own children');
    const t = await this.tenant();
    const weekStart = mondayOf(t.now.date);
    const [rounds, profile, days] = await Promise.all([
      this.db.gameRound.findMany({ where: { studentId, playDate: { gte: weekStart }, endedAt: { not: null }, total: { gt: 0 }, flagged: null }, select: { playDate: true, total: true, correct: true, durationMs: true, game: true } }),
      this.db.gameProfile.findUnique({ where: { studentId } }),
      this.playDays(studentId, addDays(t.now.date, -400)),
    ]);
    const quiz = rounds.filter((r) => r.game !== 'MATCH_UP');
    return {
      studentId,
      firstName: s.firstName,
      daysThisWeek: new Set(rounds.map((r) => r.playDate)).size,
      questionsThisWeek: quiz.reduce((a, r) => a + r.total, 0),
      correctThisWeek: quiz.reduce((a, r) => a + r.correct, 0),
      rounds: rounds.length,
      streak: profile ? streakFrom(days, t.now.date).streak : 0,
      minutes: Math.round(rounds.reduce((a, r) => a + (r.durationMs ?? 0), 0) / 60_000),
    };
  }
}
