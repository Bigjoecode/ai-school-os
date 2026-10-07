import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  offlineDevicePackSchema,
  offlineReviewSchema,
  offlineSettingsSchema,
  offlineSyncSchema,
  type OfflineDevicePackInput,
  type OfflineExamStatus,
  type OfflineInvigilatorSheet,
  type OfflinePack,
  type OfflineReviewInput,
  type OfflineSyncInput,
  type OfflineSyncResult,
} from '@aischool/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { currentContext } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { CbtService } from './cbt.service';
import { OfflineExamsService } from './offline-exams.service';

/** Staff side of offline exam packs: settings, start code, invigilator sheet, exam-device packs, sync status and review. */
@Controller('online-exams/:id/offline')
export class OfflineExamsStaffController {
  constructor(
    private readonly cbt: CbtService,
    private readonly offline: OfflineExamsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('assessment.read')
  async status(@Param('id') id: string): Promise<OfflineExamStatus> {
    const { exam, canManage } = await this.cbt.staffExam(id);
    return this.offline.status(exam, canManage);
  }

  @Put()
  @RequirePermissions('assessment.manage')
  async settings(@Param('id') id: string, @Body(new ZodPipe(offlineSettingsSchema)) body: z.output<typeof offlineSettingsSchema>): Promise<OfflineExamStatus> {
    const { exam } = await this.cbt.staffExam(id, 'manage');
    const updated = await this.offline.saveSettings(exam, body);
    if (updated.offlineEnabled !== exam.offlineEnabled) {
      await this.audit.log({ action: body.enabled ? 'cbt.offline_enabled' : 'cbt.offline_disabled', entityType: 'OnlineExam', entityId: id, summary: `${body.enabled ? 'Made' : 'Stopped making'} "${exam.title}" available offline` });
    }
    return this.offline.status(updated, true);
  }

  @Post('rotate-code')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  async rotate(@Param('id') id: string): Promise<OfflineExamStatus> {
    const { exam } = await this.cbt.staffExam(id, 'manage');
    const updated = await this.offline.rotate(exam);
    await this.audit.log({ action: 'cbt.offline_code_rotated', entityType: 'OnlineExam', entityId: id, summary: `Changed the offline start code of "${exam.title}" (packs downloaded earlier must be downloaded again)` });
    return this.offline.status(updated, true);
  }

  /** The start code and every student's exam PIN, for printing. */
  @Get('sheet')
  @RequirePermissions('assessment.manage')
  async sheet(@Param('id') id: string): Promise<OfflineInvigilatorSheet> {
    const { exam, paper } = await this.cbt.staffExam(id, 'manage');
    const sheet = await this.offline.sheet(exam, paper);
    await this.audit.log({ action: 'cbt.offline_sheet', entityType: 'OnlineExam', entityId: id, summary: `Opened the invigilator sheet of "${exam.title}"` });
    return sheet;
  }

  /** A pack for a shared exam device: every student (or these classes) signs in with admission number + exam PIN. */
  @Post('device-pack')
  @HttpCode(200)
  @RequirePermissions('assessment.read')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async devicePack(@Param('id') id: string, @Body(new ZodPipe(offlineDevicePackSchema)) body: OfflineDevicePackInput): Promise<OfflinePack> {
    const { exam, paper } = await this.cbt.staffExam(id);
    this.offline.checkDownloadable(exam);
    const ids = await this.offline.enrolled(exam, body.classArmIds?.length ? body.classArmIds : exam.classArmIds);
    // Students already handed in (offline) don't need a place on the device.
    const seats = (await this.offline.ensureSeats(exam, paper, ids)).filter((s) => !s.syncedAt);
    const pack = await this.offline.buildPack(exam, paper, seats, 'DEVICE');
    await this.audit.log({ action: 'cbt.offline_device_pack', entityType: 'OnlineExam', entityId: id, summary: `Prepared an exam device for "${exam.title}" (${seats.length} student${seats.length === 1 ? '' : 's'})` });
    return pack;
  }

  @Post('seats/:seatId/review')
  @HttpCode(200)
  @RequirePermissions('assessment.manage')
  async review(@Param('id') id: string, @Param('seatId') seatId: string, @Body(new ZodPipe(offlineReviewSchema)) body: OfflineReviewInput): Promise<OfflineExamStatus> {
    const { exam } = await this.cbt.staffExam(id, 'manage');
    await this.offline.review(exam, seatId, body.action);
    await this.audit.log({ action: `cbt.offline_${body.action}`, entityType: 'OnlineExam', entityId: id, summary: `Offline hand-in ${body.action === 'accept' ? 'accepted and marked' : body.action === 'reject' ? 'rejected' : 'reviewed'} for "${exam.title}"` });
    return this.offline.status(await this.cbt.staffExam(id).then((r) => r.exam), true);
  }
}

/** Student and device side: download a pack, and sync hand-ins (from a student or a staff-prepared exam device). */
@Controller('cbt/offline')
export class OfflineExamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offline: OfflineExamsService,
  ) {}

  @Post(':examId/pack')
  @HttpCode(200)
  @RequirePermissions('learning.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async pack(@Param('examId') examId: string): Promise<OfflinePack> {
    const me = await this.prisma.db.student.findFirst({ where: { userId: currentContext().userId, status: 'ACTIVE' } });
    if (!me) throw new ForbiddenException('Only students download exams for themselves');
    const exam = await this.prisma.db.onlineExam.findUnique({ where: { id: examId } });
    if (!exam || exam.status === 'DRAFT' || !exam.classArmIds.includes(me.classArmId ?? '')) throw new NotFoundException('Exam not found');
    this.offline.checkDownloadable(exam);
    const online = await this.prisma.db.onlineExamAttempt.findUnique({ where: { examId_studentId: { examId, studentId: me.id } }, select: { id: true } });
    if (online) throw new BadRequestException('You have already sat this exam');
    const paper = await this.offline.paper(exam);
    const [seat] = await this.offline.ensureSeats(exam, paper, [me.id]);
    if (!seat) throw new NotFoundException('Exam not found');
    if (seat.syncedAt) throw new BadRequestException('Your answers to this exam have already been handed in');
    return this.offline.buildPack(exam, paper, [seat], 'PERSONAL');
  }

  /** A signed progress report or hand-in. The same hand-in sent twice counts once. */
  @Post('sync')
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  sync(@Body(new ZodPipe(offlineSyncSchema)) body: OfflineSyncInput): Promise<OfflineSyncResult> {
    return this.offline.sync(body);
  }
}
