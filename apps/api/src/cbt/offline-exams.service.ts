import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CBT_GRACE_SECONDS,
  OFFLINE_CODE_ALPHABET,
  OFFLINE_CODE_LENGTH,
  OFFLINE_KDF_ITERATIONS,
  OFFLINE_PACK_FORMAT,
  OFFLINE_PIN_LENGTH,
  OFFLINE_SEAT_KDF_ITERATIONS,
  normaliseStartCode,
  offlinePayloadSchema,
  type OfflineExamStatus,
  type OfflineFlag,
  type OfflineInvigilatorSheet,
  type OfflinePack,
  type OfflinePackContent,
  type OfflineSeatEntry,
  type OfflineSeatRow,
  type OfflineSeatSecret,
  type OfflineSeatStatus,
  type OfflineSignedPayload,
  type OfflineSyncInput,
  type OfflineSyncResult,
} from '@aischool/shared';
import { createCipheriv, createHash, createHmac, pbkdf2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { OfflineExamSeat, OnlineExam, Prisma } from '../generated/prisma/client';
import { decryptSecret, encryptSecret } from '../common/crypto-box';
import { fullName } from '../common/format';
import { currentContext, currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CbtService, isObjective, layoutOf, paperInclude, type Layout, type PaperRow, type StaffScope } from './cbt.service';

const pbkdf2Async = promisify(pbkdf2);
const b64 = (b: Buffer) => b.toString('base64url');

/** A fresh start code: 10 characters from a 32-letter alphabet (50 bits), e.g. "K7QM2-XH9PA" when read out. */
export function newStartCode() {
  let s = '';
  for (let i = 0; i < OFFLINE_CODE_LENGTH; i++) s += OFFLINE_CODE_ALPHABET[randomInt(OFFLINE_CODE_ALPHABET.length)];
  return s;
}

/** Start codes, PINs and signing keys are encrypted at rest (older plain values still read). */
const hide = (plain: string) => encryptSecret(plain);
const reveal = <T extends string | null | undefined>(stored: T): T => (stored && stored.startsWith('v1:') ? (decryptSecret(stored) as T) : stored);

const newPin = () => String(randomInt(10 ** OFFLINE_PIN_LENGTH)).padStart(OFFLINE_PIN_LENGTH, '0');

/** AES-256-GCM with the tag appended, as WebCrypto expects. */
function seal(key: Buffer, plain: string, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()]);
  return { iv: b64(iv), ciphertext: b64(data) };
}

/** Derived content keys, so 40 downloads in a row don't each spend half a second on PBKDF2. */
const keyCache = new Map<string, Buffer>();
async function contentKey(exam: Pick<OnlineExam, 'id' | 'offlineVersion' | 'offlineCode' | 'offlineSalt'>) {
  const code = normaliseStartCode(reveal(exam.offlineCode) ?? '');
  const id = `${exam.id}:${exam.offlineVersion}:${createHash('sha256').update(`${code}|${exam.offlineSalt}`).digest('hex')}`;
  const hit = keyCache.get(id);
  if (hit) return hit;
  const key = await pbkdf2Async(code, Buffer.from(exam.offlineSalt ?? '', 'base64url'), OFFLINE_KDF_ITERATIONS, 32, 'sha256');
  if (keyCache.size > 200) keyCache.delete(keyCache.keys().next().value!);
  keyCache.set(id, key);
  return key;
}

type SeatWithStudent = OfflineExamSeat & { student: { id: string; firstName: string; lastName: string; admissionNumber: string; classArm: string | null } };

/**
 * Offline exam packs: settings, the encrypted pack, the hand-in sync and the
 * staff view. Marking goes through CbtService.finalize, so an offline sitting
 * ends up as an ordinary OnlineExamAttempt (results, mastery, analytics).
 */
@Injectable()
export class OfflineExamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cbt: CbtService,
  ) {}

  // ---------------------------------------------------------- seats

  private async students(ids: string[]) {
    const rows = await this.prisma.db.student.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true, classArm: { select: { name: true, classLevel: { select: { name: true } } } } },
    });
    return new Map(rows.map((s) => [s.id, { id: s.id, firstName: s.firstName, lastName: s.lastName, admissionNumber: s.admissionNumber, classArm: s.classArm ? `${s.classArm.classLevel.name} ${s.classArm.name}` : null }]));
  }

  /** Seats for these students (made on first need: their own question order, PIN and signing key). */
  async ensureSeats(exam: OnlineExam, paper: PaperRow, studentIds: string[]): Promise<SeatWithStudent[]> {
    const db = this.prisma.db;
    const existing = await db.offlineExamSeat.findMany({ where: { examId: exam.id, studentId: { in: studentIds } }, select: { studentId: true } });
    const have = new Set(existing.map((s) => s.studentId));
    const missing = studentIds.filter((id) => !have.has(id));
    if (missing.length) {
      await db.offlineExamSeat.createMany({
        data: missing.map((studentId) => ({
          tenantId: currentTenantId(),
          examId: exam.id,
          studentId,
          pin: hide(newPin()),
          hmacKey: hide(b64(randomBytes(32))),
          layout: this.cbt.buildLayout(exam, paper) as unknown as Prisma.InputJsonValue,
        })),
        skipDuplicates: true,
      });
    }
    const seats = await db.offlineExamSeat.findMany({ where: { examId: exam.id, studentId: { in: studentIds } } });
    const students = await this.students(studentIds);
    return seats.flatMap((s) => {
      const st = students.get(s.studentId);
      return st ? [{ ...s, student: st }] : [];
    });
  }

  async enrolled(exam: OnlineExam, armIds = exam.classArmIds) {
    const rows = await this.prisma.db.student.findMany({ where: { classArmId: { in: armIds.filter((a) => exam.classArmIds.includes(a)) }, status: 'ACTIVE' }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  // ---------------------------------------------------------- settings

  async saveSettings(exam: OnlineExam, body: { enabled: boolean; availableFrom?: string | null; syncBy?: string | null }) {
    const from = body.availableFrom ? new Date(body.availableFrom) : exam.offlineFrom;
    const syncBy = body.syncBy ? new Date(body.syncBy) : exam.offlineSyncBy;
    if (body.enabled) {
      if (exam.status === 'CLOSED') throw new BadRequestException('This exam has closed');
      if (!from || !syncBy) throw new BadRequestException('Set when offline sittings may start and when they must be synced by');
      if (syncBy <= from) throw new BadRequestException('The sync-by time must be after the start time');
      if (syncBy.getTime() - from.getTime() < exam.durationMinutes * 60_000) throw new BadRequestException(`The offline window must be at least ${exam.durationMinutes} minutes long`);
      if (syncBy <= new Date()) throw new BadRequestException('The sync-by time has already passed');
    }
    // The first time it is turned on: a start code and a salt (the pack key depends on both).
    const first = body.enabled && !exam.offlineCode;
    return this.prisma.db.onlineExam.update({
      where: { id: exam.id },
      data: {
        offlineEnabled: body.enabled,
        offlineFrom: from,
        offlineSyncBy: syncBy,
        ...(first ? { offlineCode: hide(newStartCode()), offlineSalt: b64(randomBytes(16)), offlineVersion: exam.offlineVersion + 1 } : {}),
      },
    });
  }

  /** A new start code (and salt): packs downloaded before can't be opened with it and must be downloaded again. */
  rotate(exam: OnlineExam) {
    if (!exam.offlineCode) throw new BadRequestException('Turn on offline sitting first');
    return this.prisma.db.onlineExam.update({ where: { id: exam.id }, data: { offlineCode: hide(newStartCode()), offlineSalt: b64(randomBytes(16)), offlineVersion: exam.offlineVersion + 1 } });
  }

  // ---------------------------------------------------------- the pack

  checkDownloadable(exam: OnlineExam, now = new Date()) {
    if (!exam.offlineEnabled || !exam.offlineCode || !exam.offlineSalt) throw new BadRequestException('This exam is not available offline');
    if (exam.status !== 'SCHEDULED') throw new BadRequestException(exam.status === 'DRAFT' ? 'This exam has not been scheduled yet' : 'This exam has closed');
    if (exam.offlineSyncBy && exam.offlineSyncBy <= now) throw new BadRequestException('The offline window for this exam has ended');
  }

  async buildPack(exam: OnlineExam, paper: PaperRow, seats: SeatWithStudent[], mode: 'PERSONAL' | 'DEVICE'): Promise<OfflinePack> {
    if (!seats.length) throw new BadRequestException('There is nobody left to download this exam for');
    const ctx = currentContext();
    const db = this.prisma.db;
    const [tenant, user] = await Promise.all([
      db.tenant.findUnique({ where: { id: currentTenantId() }, select: { name: true } }),
      db.user.findUnique({ where: { id: ctx.userId! }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const key = await contentKey(exam);
    const code = normaliseStartCode(reveal(exam.offlineCode)!);
    const packId = `${exam.id}.v${exam.offlineVersion}`;

    const entries: OfflineSeatEntry[] = await Promise.all(
      seats.map(async (s) => {
        const layout = layoutOf(s);
        // The key (`correct`) stays on the server: only the order goes to the device.
        const secret: OfflineSeatSecret = { seatId: s.id, studentId: s.studentId, hmacKey: reveal(s.hmacKey), items: layout.items.map((i) => ({ id: i.id, order: i.order })) };
        let wrapKey = key;
        let salt: string | null = null;
        if (mode === 'DEVICE') {
          const raw = randomBytes(16);
          salt = b64(raw);
          wrapKey = await pbkdf2Async(`${code}:${reveal(s.pin)}`, raw, OFFLINE_SEAT_KDF_ITERATIONS, 32, 'sha256');
        }
        const box = seal(wrapKey, JSON.stringify(secret), `seat:${s.id}`);
        return { seatId: s.id, studentId: s.studentId, name: fullName(s.student), admissionNumber: s.student.admissionNumber, classArm: s.student.classArm, salt, ...box };
      }),
    );

    const content: OfflinePackContent = {
      instructions: paper.instructions,
      questions: paper.items.map(({ question: q }) => ({ id: q.id, type: q.type, objective: isObjective(q.type), stem: q.stem, options: isObjective(q.type) ? q.options : [], marks: q.marks })),
      seats: entries,
    };
    const box = seal(key, JSON.stringify(content), packId);
    const now = new Date();
    await db.offlineExamSeat.updateMany({
      where: { id: { in: seats.map((s) => s.id) } },
      data: { downloads: { increment: 1 }, downloadedAt: now, downloadMode: mode, downloadedById: ctx.userId ?? null, packVersion: exam.offlineVersion },
    });
    const only = mode === 'PERSONAL' ? seats[0]! : null;
    return {
      format: OFFLINE_PACK_FORMAT,
      packId,
      examId: exam.id,
      version: exam.offlineVersion,
      mode,
      title: exam.title,
      subject: paper.subject.name,
      classLevel: paper.classLevel.name,
      durationMinutes: exam.durationMinutes,
      questionCount: paper.items.length,
      totalMarks: paper.items.reduce((n, i) => n + i.question.marks, 0),
      availableFrom: exam.offlineFrom?.toISOString() ?? null,
      syncBy: exam.offlineSyncBy?.toISOString() ?? null,
      graceSeconds: CBT_GRACE_SECONDS,
      schoolName: tenant?.name ?? '',
      downloadedAt: now.toISOString(),
      downloadedBy: { userId: user?.id ?? '', name: user ? fullName(user) : '' },
      student: only ? { id: only.studentId, name: fullName(only.student) } : null,
      seatCount: seats.length,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: OFFLINE_KDF_ITERATIONS, salt: exam.offlineSalt! },
      seatKdf: mode === 'DEVICE' ? { iterations: OFFLINE_SEAT_KDF_ITERATIONS } : null,
      ...box,
    };
  }

  async paper(exam: OnlineExam) {
    const paper = await this.prisma.db.examPaper.findUnique({ where: { id: exam.paperId }, include: paperInclude });
    if (!paper || !paper.items.length) throw new BadRequestException('This exam has no questions');
    return paper;
  }

  // ---------------------------------------------------------- sync

  private verify(seat: OfflineExamSeat, payload: string, signature: string) {
    const expected = createHmac('sha256', Buffer.from(reveal(seat.hmacKey), 'base64url')).update(payload, 'utf8').digest();
    const given = Buffer.from(signature, 'base64url');
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** Who may upload for a seat: the student, or staff who can see the exam (a shared exam device). */
  private async checkUploader(seat: OfflineExamSeat, exam: OnlineExam) {
    const ctx = currentContext();
    const me = await this.prisma.db.student.findFirst({ where: { userId: ctx.userId }, select: { id: true } });
    if (me) {
      if (me.id !== seat.studentId) throw new ForbiddenException('This hand-in belongs to another student. Sign in as staff to sync an exam device.');
      return;
    }
    const paper = await this.prisma.db.examPaper.findUnique({ where: { id: exam.paperId }, select: { subjectId: true } });
    const scope: StaffScope = await this.cbt.staffScope();
    if (!ctx.permissions.has('assessment.read') || !paper || !this.cbt.canSee(scope, exam, paper.subjectId)) throw new ForbiddenException('You can’t sync hand-ins for this exam');
  }

  async sync(body: OfflineSyncInput): Promise<OfflineSyncResult> {
    let raw: unknown;
    try {
      raw = JSON.parse(body.payload);
    } catch {
      throw new BadRequestException('The hand-in could not be read');
    }
    const parsed = offlinePayloadSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('The hand-in could not be read');
    const p = parsed.data as OfflineSignedPayload;
    const db = this.prisma.db;
    const seat = await db.offlineExamSeat.findFirst({ where: { id: p.seatId, examId: p.examId } });
    if (!seat) throw new NotFoundException('This offline exam is not known here. Was it downloaded for another school?');
    const exam = await db.onlineExam.findUnique({ where: { id: seat.examId } });
    if (!exam) throw new NotFoundException('The exam was deleted');
    await this.checkUploader(seat, exam);

    const now = new Date();
    const signed = this.verify(seat, body.payload, body.signature);
    // How far the device clock is from ours, so its times can be read in server time.
    const skewMs = now.getTime() - Date.parse(body.deviceNow);
    const startedServer = new Date(Date.parse(p.startedAt) + skewMs);

    if (p.kind === 'progress') {
      // Progress pings only move the status board; an unsigned one is ignored.
      if (signed && !seat.syncedAt) {
        await db.offlineExamSeat.update({
          where: { id: seat.id },
          data: {
            startedAt: seat.startedAt ?? (startedServer > now ? now : startedServer),
            lastSeenAt: now,
            ...(p.stage === 'SUBMITTED' && !seat.submittedAt ? { submittedAt: now } : {}),
          },
        });
      }
      return { status: 'PROGRESS', flags: [], serverNow: now.toISOString(), message: signed ? 'Noted' : 'Ignored' };
    }

    // ---- a hand-in
    const flags = new Set<OfflineFlag>();
    if (!signed) flags.add('BAD_SIGNATURE');
    if (p.packVersion !== exam.offlineVersion) flags.add('STALE_PACK');
    const allowed = exam.durationMinutes * 60 + CBT_GRACE_SECONDS;
    const deviceSpan = p.submittedAt ? (Date.parse(p.submittedAt) - Date.parse(p.startedAt)) / 1000 : p.elapsedSeconds;
    if (p.elapsedSeconds > allowed || deviceSpan > allowed + 60) flags.add('OVER_TIME');
    if (p.clockIssues.length || Math.abs(skewMs) > 10 * 60_000 || Math.abs(p.wallSeconds - p.monotonicSeconds) > 120 || deviceSpan < 0) flags.add('CLOCK');
    if ((exam.offlineFrom && startedServer.getTime() < exam.offlineFrom.getTime() - 5 * 60_000) || (exam.offlineSyncBy && startedServer > exam.offlineSyncBy)) flags.add('OUTSIDE_WINDOW');
    if (exam.offlineSyncBy && now > exam.offlineSyncBy) flags.add('LATE_SYNC');

    const submission = { payload: body.payload, signature: body.signature, deviceNow: body.deviceNow, receivedAt: now.toISOString(), uploadedById: currentContext().userId ?? null, signatureValid: signed };

    type Outcome = { kind: 'dup'; seat: OfflineExamSeat } | { kind: 'other' } | { kind: 'held'; flags: OfflineFlag[] } | { kind: 'mark'; attemptId: string; submittedAt: Date; flags: OfflineFlag[] };
    const outcome = await this.prisma.root.$transaction(async (tx): Promise<Outcome> => {
      await tx.$queryRaw`SELECT id FROM offline_exam_seats WHERE id = ${seat.id} FOR UPDATE`;
      const s = (await tx.offlineExamSeat.findUnique({ where: { id: seat.id } }))!;
      if (s.submissionId === p.submissionId) return { kind: 'dup', seat: s };
      if (s.submissionId) {
        // A different hand-in after one was accepted: never replaces it, but the teacher should know.
        if (!s.flags.includes('DIFFERENT_RESUBMISSION')) await tx.offlineExamSeat.update({ where: { id: s.id }, data: { flags: { push: 'DIFFERENT_RESUBMISSION' }, flagsReviewedAt: null } });
        return { kind: 'other' };
      }
      const online = await tx.onlineExamAttempt.findUnique({ where: { examId_studentId: { examId: exam.id, studentId: s.studentId } }, select: { id: true } });
      if (online) flags.add('ALREADY_SAT');
      const list = [...flags];
      const base = {
        submissionId: p.submissionId,
        submission: submission as unknown as Prisma.InputJsonValue,
        syncedAt: now,
        startedAt: s.startedAt ?? (startedServer > now ? now : startedServer),
        submittedAt: now,
        lastSeenAt: now,
        elapsedSeconds: Math.round(p.elapsedSeconds),
        clockSkewSeconds: Math.round(skewMs / 1000),
        flags: list,
        flagsReviewedAt: null,
      };
      // A hand-in that may have been tampered with, or a student who already sat online, waits for a teacher.
      if (flags.has('BAD_SIGNATURE') || flags.has('ALREADY_SAT')) {
        await tx.offlineExamSeat.update({ where: { id: s.id }, data: { ...base, syncStatus: 'HELD' } });
        return { kind: 'held', flags: list };
      }
      const created = await this.createAttempt(tx, exam, s, p, now, skewMs);
      await tx.offlineExamSeat.update({ where: { id: s.id }, data: { ...base, syncStatus: 'SYNCED', attemptId: created.id } });
      return { kind: 'mark', attemptId: created.id, submittedAt: created.submittedAt, flags: list };
    });

    if (outcome.kind === 'dup') {
      return { status: 'DUPLICATE', flags: outcome.seat.flags as OfflineFlag[], serverNow: now.toISOString(), message: 'Already received' };
    }
    if (outcome.kind === 'other') {
      return { status: 'DUPLICATE', flags: ['DIFFERENT_RESUBMISSION'], serverNow: now.toISOString(), message: 'This student’s exam had already been handed in; this copy was kept aside for the teacher.' };
    }
    if (outcome.kind === 'held') {
      return { status: 'HELD', flags: outcome.flags, serverNow: now.toISOString(), message: 'Received. A teacher will check it before it is marked.' };
    }
    await this.cbt.finalize(outcome.attemptId, outcome.submittedAt);
    return { status: 'SYNCED', flags: outcome.flags, serverNow: now.toISOString(), message: 'Received and marked' };
  }

  /** The attempt an offline sitting becomes: the seat's layout, the answers mapped back to bank order. */
  private async createAttempt(tx: Prisma.TransactionClient, exam: OnlineExam, seat: OfflineExamSeat, p: OfflineSignedPayload, receivedAt: Date, skewMs: number) {
    const layout = layoutOf(seat) as Layout;
    const byId = new Map(layout.items.map((i) => [i.id, i]));
    // Anything for a question not in this student's paper, or of the wrong kind, is dropped rather than failing the whole hand-in.
    const answers = Object.fromEntries(
      Object.entries(p.answers).filter(([k, v]) => {
        const item = byId.get(k);
        if (!item || v === null) return !!item;
        return isObjective(item.type) ? typeof v === 'number' && v >= 0 && v < item.order.length : typeof v === 'string';
      }),
    );
    const stored = this.cbt.toStored(layout, answers);
    const elapsedMs = Math.max(0, Math.round(p.elapsedSeconds * 1000));
    // In server time: handed in when the device said (never in the future), started `elapsed` before that.
    const deviceSubmitted = p.submittedAt ? Date.parse(p.submittedAt) + skewMs : receivedAt.getTime();
    const submittedAt = new Date(Math.min(receivedAt.getTime(), deviceSubmitted));
    const startedAt = new Date(submittedAt.getTime() - elapsedMs);
    const endsAt = new Date(startedAt.getTime() + exam.durationMinutes * 60_000);
    return tx.onlineExamAttempt.create({
      data: {
        tenantId: seat.tenantId,
        examId: exam.id,
        studentId: seat.studentId,
        layout: seat.layout as Prisma.InputJsonValue,
        answers: stored as unknown as Prisma.InputJsonValue,
        startedAt,
        endsAt,
        focusLosses: p.focusLosses,
        ip: 'offline',
      },
      select: { id: true },
    }).then((a) => ({ id: a.id, submittedAt }));
  }

  /** A teacher's decision on a held or flagged hand-in. */
  async review(exam: OnlineExam, seatId: string, action: 'accept' | 'reject' | 'reviewed') {
    const db = this.prisma.db;
    const seat = await db.offlineExamSeat.findFirst({ where: { id: seatId, examId: exam.id } });
    if (!seat) throw new NotFoundException('Seat not found');
    const by = currentContext().userId ?? null;
    if (action === 'reviewed') {
      await db.offlineExamSeat.update({ where: { id: seat.id }, data: { flagsReviewedAt: new Date(), flagsReviewedById: by } });
      return;
    }
    if (seat.syncStatus !== 'HELD') throw new BadRequestException('Only a held hand-in can be accepted or rejected');
    if (action === 'reject') {
      await db.offlineExamSeat.update({ where: { id: seat.id }, data: { syncStatus: 'REJECTED', flagsReviewedAt: new Date(), flagsReviewedById: by } });
      return;
    }
    const sub = seat.submission as { payload?: string; deviceNow?: string; receivedAt?: string } | null;
    if (!sub?.payload) throw new BadRequestException('Nothing was received for this student');
    const p = offlinePayloadSchema.parse(JSON.parse(sub.payload)) as OfflineSignedPayload;
    const receivedAt = new Date(sub.receivedAt ?? Date.now());
    const skewMs = receivedAt.getTime() - Date.parse(sub.deviceNow ?? receivedAt.toISOString());
    const created = await this.prisma.root.$transaction(async (tx) => {
      const online = await tx.onlineExamAttempt.findUnique({ where: { examId_studentId: { examId: exam.id, studentId: seat.studentId } }, select: { id: true } });
      if (online) throw new BadRequestException('This student already has a sitting for this exam (online), so the offline one can’t be marked as well');
      const a = await this.createAttempt(tx, exam, seat, p, receivedAt, skewMs);
      await tx.offlineExamSeat.update({ where: { id: seat.id }, data: { syncStatus: 'SYNCED', attemptId: a.id, flagsReviewedAt: new Date(), flagsReviewedById: by } });
      return a;
    });
    await this.cbt.finalize(created.id, created.submittedAt);
  }

  // ---------------------------------------------------------- staff views

  async status(exam: OnlineExam, canManage: boolean): Promise<OfflineExamStatus> {
    const db = this.prisma.db;
    const [seats, enrolled, attempts] = await Promise.all([
      db.offlineExamSeat.findMany({ where: { examId: exam.id } }),
      this.enrolled(exam),
      db.onlineExamAttempt.findMany({ where: { examId: exam.id }, select: { id: true, studentId: true, status: true, score: true, objectiveScore: true, total: true } }),
    ]);
    const ids = [...new Set([...enrolled, ...seats.map((s) => s.studentId)])];
    const students = await this.students(ids);
    const seatBy = new Map(seats.map((s) => [s.studentId, s]));
    const attemptBy = new Map(attempts.map((a) => [a.studentId, a]));
    const rows: OfflineSeatRow[] = ids.flatMap((id) => {
      const st = students.get(id);
      if (!st) return [];
      const s = seatBy.get(id);
      const a = attemptBy.get(id);
      const status: OfflineSeatStatus = !s?.downloadedAt
        ? 'NOT_DOWNLOADED'
        : s.syncStatus === 'SYNCED' || s.syncStatus === 'HELD' || s.syncStatus === 'REJECTED'
          ? (s.syncStatus as OfflineSeatStatus)
          : s.submittedAt
            ? 'SUBMITTED'
            : s.startedAt
              ? 'STARTED'
              : 'DOWNLOADED';
      const offlineAttempt = s?.attemptId && a?.id === s.attemptId ? a : null;
      return [
        {
          student: { id: st.id, name: fullName(st), admissionNumber: st.admissionNumber, classArm: st.classArm },
          seatId: s?.id ?? null,
          status,
          downloads: s?.downloads ?? 0,
          downloadedAt: s?.downloadedAt?.toISOString() ?? null,
          mode: (s?.downloadMode as 'PERSONAL' | 'DEVICE' | null) ?? null,
          stale: !!s?.downloadedAt && !s.syncedAt && s.packVersion !== exam.offlineVersion,
          startedAt: s?.startedAt?.toISOString() ?? null,
          lastSeenAt: s?.lastSeenAt?.toISOString() ?? null,
          syncedAt: s?.syncedAt?.toISOString() ?? null,
          elapsedSeconds: s?.elapsedSeconds ?? null,
          clockSkewSeconds: s?.clockSkewSeconds ?? null,
          flags: (s?.flags ?? []) as OfflineFlag[],
          flagsReviewed: !!s?.flagsReviewedAt,
          attemptId: s?.attemptId ?? null,
          score: offlineAttempt ? (offlineAttempt.score ?? offlineAttempt.objectiveScore) : null,
          total: offlineAttempt?.total ?? null,
          sittingOnline: !!a && a.id !== s?.attemptId,
        },
      ];
    });
    rows.sort((x, y) => (x.student.classArm ?? '').localeCompare(y.student.classArm ?? '') || x.student.name.localeCompare(y.student.name));
    const n = (f: (r: OfflineSeatRow) => boolean) => rows.filter(f).length;
    return {
      examId: exam.id,
      enabled: exam.offlineEnabled,
      availableFrom: exam.offlineFrom?.toISOString() ?? null,
      syncBy: exam.offlineSyncBy?.toISOString() ?? null,
      version: exam.offlineVersion,
      code: canManage ? reveal(exam.offlineCode) : null,
      canManage,
      serverNow: new Date().toISOString(),
      counts: {
        students: enrolled.length,
        downloaded: n((r) => r.status !== 'NOT_DOWNLOADED'),
        started: n((r) => ['STARTED', 'SUBMITTED', 'SYNCED', 'HELD', 'REJECTED'].includes(r.status)),
        synced: n((r) => r.status === 'SYNCED'),
        held: n((r) => r.status === 'HELD'),
        flagged: n((r) => r.flags.length > 0 && !r.flagsReviewed),
      },
      rows,
    };
  }

  async sheet(exam: OnlineExam, paper: PaperRow): Promise<OfflineInvigilatorSheet> {
    if (!exam.offlineCode) throw new BadRequestException('Turn on offline sitting first');
    const seats = await this.ensureSeats(exam, paper, await this.enrolled(exam));
    const tenant = await this.prisma.db.tenant.findUnique({ where: { id: currentTenantId() }, select: { name: true } });
    return {
      schoolName: tenant?.name ?? '',
      exam: {
        id: exam.id,
        title: exam.title,
        subject: paper.subject.name,
        classLevel: paper.classLevel.name,
        durationMinutes: exam.durationMinutes,
        questionCount: paper.items.length,
        totalMarks: paper.items.reduce((n, i) => n + i.question.marks, 0),
      },
      code: reveal(exam.offlineCode),
      version: exam.offlineVersion,
      availableFrom: exam.offlineFrom?.toISOString() ?? null,
      syncBy: exam.offlineSyncBy?.toISOString() ?? null,
      seats: seats
        .map((s) => ({ name: fullName(s.student), admissionNumber: s.student.admissionNumber, classArm: s.student.classArm, pin: reveal(s.pin) }))
        .sort((a, b) => (a.classArm ?? '').localeCompare(b.classArm ?? '') || a.name.localeCompare(b.name)),
    };
  }

  /** For a student's exam list: whether it can be sat offline and whether they already downloaded it. */
  async myOffline(studentId: string, exams: OnlineExam[]) {
    const ids = exams.filter((e) => e.offlineEnabled).map((e) => e.id);
    if (!ids.length) return new Map<string, { downloaded: boolean; synced: boolean }>();
    const seats = await this.prisma.db.offlineExamSeat.findMany({ where: { studentId, examId: { in: ids } }, select: { examId: true, downloadedAt: true, syncedAt: true } });
    return new Map(seats.map((s) => [s.examId, { downloaded: !!s.downloadedAt, synced: !!s.syncedAt }]));
  }
}
