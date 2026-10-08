import { BadRequestException, Injectable } from '@nestjs/common';
import { CURATED_QUESTIONS, DAILY_CHALLENGE, seededRandom, seededShuffle, seedOf, TRUE_FALSE_FACTS, type GameLevel, type SyllabusMatchPack } from '@aischool/shared';
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
}

export interface Learner {
  level: GameLevel;
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

    // Curated packs for the level.
    out.push(...this.curated(l.level, kind, keys));
    return out;
  }

  curated(level: GameLevel, kind: Kind, keys: string[] | null): RoundItem[] {
    const wanted = keys ? new Set(keys) : null;
    if (kind === 'TF') {
      return TRUE_FALSE_FACTS.filter((f) => f.level === level && (!wanted || wanted.has(subjectKey(f.subject)))).map((f) => ({
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
    return CURATED_QUESTIONS.filter((q) => q.level === level && (!wanted || wanted.has(subjectKey(q.subject)))).map((q) => ({
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
    let pool = await this.pool(l, kind, subject);
    // A thin pool for the student's subjects: top up with the level's other curated questions.
    if (!subject && pool.length < n) {
      const have = new Set(pool.map((p) => p.ref));
      pool = [...pool, ...this.curated(l.level, kind, null).filter((c) => !have.has(c.ref))];
    }
    if (pool.length < Math.min(n, 5)) throw new BadRequestException(subject ? `There aren’t enough ${subject} questions for a round yet. Try all subjects.` : 'There aren’t enough questions for your class yet.');
    const fresh = shuffle(pool.filter((p) => !recent.has(p.ref)));
    const seen = shuffle(pool.filter((p) => recent.has(p.ref)));
    const chosen = [...fresh, ...seen].slice(0, n);
    return Promise.all(chosen.map((q) => this.finalise(l.level, q, kind === 'MCQ' ? () => randomInt(1_000_000) / 1_000_000 : null)));
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
    const mcq = await this.pool(l, 'MCQ', null);
    const tf = await this.pool(l, 'TF', null);
    const rand = seededRandom(seedOf(`${date}|${l.classArmId}`));
    const byRef = (a: RoundItem, b: RoundItem) => a.ref.localeCompare(b.ref);
    // Mostly multiple choice, with a couple of quick true-or-false statements.
    const tfCount = Math.min(2, tf.length);
    const picked = [...seededShuffle([...mcq].sort(byRef), rand).slice(0, DAILY_CHALLENGE.questions - tfCount), ...seededShuffle([...tf].sort(byRef), rand).slice(0, tfCount)];
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
