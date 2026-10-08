import { BadRequestException, Injectable } from '@nestjs/common';
import { CURATED_QUESTIONS, DAILY_CHALLENGE, preferYear, seededRandom, seededShuffle, seedOf, suitsYear, TRUE_FALSE_FACTS, yearTier, type GameLevel, type SyllabusMatchPack } from '@aischool/shared';
import { randomInt } from 'node:crypto';
import { subjectKey, MasteryService } from '../learning/mastery.service';
import { shuffle } from '../lesson-modules/modules.helpers';
import { PrismaService } from '../prisma/prisma.service';

/** A question held by the server for a round: the answer never leaves until the student answers. */
export interface RoundItem {
  /** Where it came from: q:<bank id>, x:<practice id>, c:<curated id>, t:<curated fact id>. */
  ref: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string | null;
  subject: string | null;
  topic: string | null;
  topicId: string | null;
  /** How well it fits the student's year: 0 the school's own or written for the year, 1 the whole stage, 2 another year (topping up). */
  tier?: number;
}

export interface Learner {
  level: GameLevel;
  /** School year within the stage (1–6); nursery classes are 1. Curated items written for other years only top up a thin round. */
  year: number;
  classLevelId: string | null;
  classArmId: string | null;
  /** The student's subjects: school subject ids and their syllabus keys. */
  subjectIds: string[];
  subjectKeys: string[];
}

type Kind = 'MCQ' | 'TF';

/**
 * Where game questions come from, best first: the school's own approved
 * question bank (its class level and subjects), reviewed Exam Academy practice
 * questions at the student's syllabus level, then the curated packs. Answers
 * are kept server-side in the round.
 */
@Injectable()
export class GamesContent {
  /** level|subject|topic → syllabus topic id (curated and bank questions name their topic). */
  private readonly topicCache = new Map<string, string | null>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mastery: MasteryService,
  ) {}

  private async topicId(level: GameLevel, subject: string | null, topic: string | null) {
    if (!subject || !topic) return null;
    const key = `${level}|${subject}|${topic}`;
    if (this.topicCache.has(key)) return this.topicCache.get(key)!;
    const t = await this.mastery.findTopic(level, subject, topic).catch(() => null);
    if (this.topicCache.size > 5000) this.topicCache.clear();
    this.topicCache.set(key, t?.id ?? null);
    return t?.id ?? null;
  }

  /** Every question of a kind available to the learner (optionally one subject), without topic ids yet. */
  async pool(l: Learner, kind: Kind, subject: string | null): Promise<RoundItem[]> {
    const keys = subject ? [subjectKey(subject)] : l.subjectKeys;
    const out: RoundItem[] = [];

    // The school's own question bank: approved, this class level and these subjects.
    if (l.classLevelId && l.subjectIds.length) {
      const bank = await this.prisma.db.question.findMany({
        where: { status: 'APPROVED', type: kind === 'MCQ' ? 'MULTIPLE_CHOICE' : 'TRUE_FALSE', classLevelId: l.classLevelId, subjectId: { in: l.subjectIds } },
        include: { subject: { select: { name: true } } },
        take: 400,
      });
      for (const q of bank) {
        const key = subjectKey(q.subject.name);
        if (subject && key !== keys[0]) continue;
        const options = kind === 'TF' ? (q.options.length === 2 ? q.options : ['True', 'False']) : q.options;
        if (options.length < 2 || q.correctIndex === null || q.correctIndex < 0 || q.correctIndex >= options.length || !q.stem.trim()) continue;
        out.push({ ref: `q:${q.id}`, prompt: q.stem, options, answer: q.correctIndex, explanation: q.answer ?? null, subject: key, topic: q.topic || null, topicId: null });
      }
    }

    // Exam Academy practice questions a reviewer has approved, at the student's syllabus level.
    if (kind === 'MCQ' && keys.length) {
      const practice = await this.prisma.root.examQuestion.findMany({
        where: { status: 'PUBLISHED', reviewedAt: { not: null }, type: 'OBJECTIVE', subject: { in: keys }, topic: { level: l.level } },
        include: { topic: { select: { id: true, name: true } } },
        take: 400,
      });
      for (const q of practice) {
        const options = Array.isArray(q.options) ? (q.options as unknown[]).filter((o): o is string => typeof o === 'string') : [];
        if (options.length < 2 || q.answer < 0 || q.answer >= options.length) continue;
        out.push({ ref: `x:${q.id}`, prompt: q.stem, options, answer: q.answer, explanation: q.explanation, subject: q.subject, topic: q.topic?.name ?? null, topicId: q.topicId });
      }
    }

    // Curated packs for the level and the student's year.
    out.push(...this.curated(l.level, kind, keys, l.year));
    return out;
  }

  /**
   * Curated items of a level (optionally some subjects). With `year`, only
   * those that suit it; with `rankYear`, all of them, the ones for that year
   * first and then the nearest years (to top up a thin round).
   */
  curated(level: GameLevel, kind: Kind, keys: string[] | null, year: number | null = null, rankYear: number | null = null): RoundItem[] {
    const wanted = keys ? new Set(keys) : null;
    const byYear = <T extends { years?: number[] }>(xs: T[]) => (year ? xs.filter((x) => suitsYear(x, year)) : rankYear ? preferYear(xs, rankYear, Infinity) : xs);
    const fit = year ?? rankYear;
    if (kind === 'TF') {
      return byYear(TRUE_FALSE_FACTS.filter((f) => f.level === level && (!wanted || wanted.has(subjectKey(f.subject))))).map((f) => ({
        tier: yearTier(f, fit),
        ref: `t:${f.id}`,
        prompt: f.statement,
        options: ['True', 'False'],
        answer: f.answer ? 0 : 1,
        explanation: f.explain,
        subject: subjectKey(f.subject),
        topic: f.topic,
        topicId: null,
      }));
    }
    return byYear(CURATED_QUESTIONS.filter((q) => q.level === level && (!wanted || wanted.has(subjectKey(q.subject))))).map((q) => ({
      tier: yearTier(q, fit),
      ref: `c:${q.id}`,
      prompt: q.q,
      options: [q.a, ...q.w],
      answer: 0,
      explanation: q.explain ?? null,
      subject: subjectKey(q.subject),
      topic: q.topic,
      topicId: null,
    }));
  }

  /** Questions for a round: fresh ones first (not seen in the last few rounds), options mixed, topics resolved. */
  async pick(l: Learner, kind: Kind, subject: string | null, n: number, recent: Set<string>): Promise<RoundItem[]> {
    const pool = this.topUp(await this.pool(l, kind, subject), l, kind, subject, n);
    if (pool.length < Math.min(n, 5)) throw new BadRequestException(subject ? `There aren’t enough ${subject} questions for a round yet. Try all subjects.` : 'There aren’t enough questions for your class yet.');
    // Best fit for the year first (written for it, then the whole stage, then other years), fresh before recently seen.
    const byTier = (xs: RoundItem[]) => [0, 1, 2].flatMap((t) => shuffle(xs.filter((p) => (p.tier ?? 0) === t)));
    const fresh = byTier(pool.filter((p) => !recent.has(p.ref)));
    const seen = byTier(pool.filter((p) => recent.has(p.ref)));
    const chosen = shuffle([...fresh, ...seen].slice(0, n));
    return Promise.all(chosen.map((q) => this.finalise(l.level, q, kind === 'MCQ' ? () => randomInt(1_000_000) / 1_000_000 : null)));
  }

  /**
   * A thin pool (few questions for this year): top up with the stage's other
   * curated questions, the same subjects first, nearest years first, then
   * (for an all-subjects round) the level's other subjects. Only as many as needed.
   */
  private topUp(pool: RoundItem[], l: Learner, kind: Kind, subject: string | null, n: number): RoundItem[] {
    if (pool.length >= n) return pool;
    const keys = subject ? [subjectKey(subject)] : l.subjectKeys;
    const have = new Set(pool.map((p) => p.ref));
    const extra = [...this.curated(l.level, kind, keys, null, l.year), ...(subject ? [] : this.curated(l.level, kind, null, null, l.year))].filter((c) => !have.has(c.ref) && !!have.add(c.ref));
    return [...pool, ...extra.slice(0, n - pool.length)];
  }

  /** Mixes the options (multiple choice only; True stays before False) and finds the syllabus topic. */
  private async finalise(level: GameLevel, q: RoundItem, rand: (() => number) | null): Promise<RoundItem> {
    let { options, answer } = q;
    if (rand && options.length > 2) {
      const order = seededShuffle(
        options.map((_, i) => i),
        rand,
      );
      options = order.map((i) => q.options[i]!);
      answer = order.indexOf(q.answer);
    }
    return { ...q, options, answer, topicId: q.topicId ?? (await this.topicId(level, q.subject, q.topic)) };
  }

  /** The class's Daily Challenge: the same questions, in the same order, for everyone in the class that day. */
  async daily(l: Learner, date: string): Promise<RoundItem[]> {
    if (!l.classArmId) return [];
    // The class's year band: questions for the student's year, topped up from the stage if there are few.
    const mcq = this.topUp(await this.pool(l, 'MCQ', null), l, 'MCQ', null, DAILY_CHALLENGE.questions);
    const tf = this.topUp(await this.pool(l, 'TF', null), l, 'TF', null, 2);
    const rand = seededRandom(seedOf(`${date}|${l.classArmId}`));
    const byRef = (a: RoundItem, b: RoundItem) => a.ref.localeCompare(b.ref);
    // Best fit for the class's year first (written for it, then the whole stage, then other years).
    const ranked = (xs: RoundItem[]) => [0, 1, 2].flatMap((t) => seededShuffle(xs.filter((x) => (x.tier ?? 0) === t).sort(byRef), rand));
    // Mostly multiple choice, with a couple of quick true-or-false statements.
    const tfCount = Math.min(2, tf.length);
    const picked = [...ranked(mcq).slice(0, DAILY_CHALLENGE.questions - tfCount), ...ranked(tf).slice(0, tfCount)];
    const ordered = seededShuffle(picked, rand);
    return Promise.all(ordered.map((q) => this.finalise(l.level, q, q.options.length > 2 ? rand : null)));
  }

  /** How many quiz questions each of the student's subjects has (hub filter chips). */
  async subjectCounts(l: Learner): Promise<{ subject: string; questions: number }[]> {
    const counts = new Map<string, number>(l.subjectKeys.map((k) => [k, 0]));
    const add = (k: string, n: number) => counts.has(k) && counts.set(k, counts.get(k)! + n);
    if (l.classLevelId && l.subjectIds.length) {
      const [bank, subjects] = await Promise.all([
        this.prisma.db.question.groupBy({ by: ['subjectId'], where: { status: 'APPROVED', type: 'MULTIPLE_CHOICE', classLevelId: l.classLevelId, subjectId: { in: l.subjectIds } }, _count: { _all: true } }),
        this.prisma.db.subject.findMany({ where: { id: { in: l.subjectIds } }, select: { id: true, name: true } }),
      ]);
      for (const b of bank) {
        const s = subjects.find((x) => x.id === b.subjectId);
        if (s) add(subjectKey(s.name), b._count._all);
      }
    }
    if (l.subjectKeys.length) {
      const practice = await this.prisma.root.examQuestion.groupBy({ by: ['subject'], where: { status: 'PUBLISHED', reviewedAt: { not: null }, type: 'OBJECTIVE', subject: { in: l.subjectKeys }, topic: { level: l.level } }, _count: { _all: true } });
      for (const p of practice) add(p.subject, p._count._all);
    }
    for (const q of CURATED_QUESTIONS) if (q.level === l.level) add(subjectKey(q.subject), 1);
    return [...counts].map(([subject, questions]) => ({ subject, questions })).sort((a, b) => b.questions - a.questions || a.subject.localeCompare(b.subject));
  }

  // ---------------------------------------------------------- Match Up from the syllabus

  /** Sub-topics matched to their main topic, from the syllabus graph for a subject at the student's level. */
  async syllabusPack(level: GameLevel, subject: string, pairs: number): Promise<SyllabusMatchPack | null> {
    const key = subjectKey(subject);
    const parents = await this.prisma.root.syllabusTopic.findMany({
      where: { subject: key, level, parentId: null, children: { some: {} } },
      select: { id: true, name: true, children: { select: { id: true, name: true } } },
      take: 300,
    });
    const usable = parents
      .map((p) => ({ ...p, children: p.children.filter((c) => c.name.length <= 70 && c.name.toLowerCase() !== p.name.toLowerCase()) }))
      .filter((p) => p.name.length <= 60 && p.children.length);
    if (usable.length < 3) return null;
    const chosen = shuffle(usable).slice(0, pairs);
    const picked = chosen.map((p) => ({ parent: p, child: p.children[randomInt(p.children.length)]! }));
    return {
      id: `syl:${picked.map((x) => `${x.parent.id}>${x.child.id}`).join(',')}`,
      title: `${key}: which topic does it belong to?`,
      subject: key,
      leftLabel: 'Sub-topic',
      rightLabel: 'Topic',
      pairs: picked.map((x) => [x.child.name, x.parent.name]),
    };
  }

  /** Checks a syllabus pack id sent with a score: every pair really is a sub-topic and its topic. */
  async checkSyllabusPack(id: string, level: GameLevel): Promise<{ ok: boolean; subject: string | null; pairs: number }> {
    const pairs = id
      .slice(4)
      .split(',')
      .map((p) => p.split('>'))
      .filter((p) => p.length === 2 && p[0] && p[1]) as [string, string][];
    if (pairs.length < 2 || pairs.length > 12) return { ok: false, subject: null, pairs: 0 };
    const children = await this.prisma.root.syllabusTopic.findMany({ where: { id: { in: pairs.map((p) => p[1]) } }, select: { id: true, parentId: true, subject: true, level: true } });
    const ok = pairs.every(([parent, child]) => children.some((c) => c.id === child && c.parentId === parent && c.level === level));
    return { ok, subject: children[0]?.subject ?? null, pairs: pairs.length };
  }
}
