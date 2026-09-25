import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  DAY_NAMES,
  absenceMessageSchema,
  aiAbsenceMessageSchema,
  attendanceSettingsSchema,
  checkInSchema,
  dateQuerySchema,
  registerQuerySchema,
  saveRegisterSchema,
  saveStaffAttendanceSchema,
  termQuerySchema,
  type AbsenceMessage,
  type AttendanceSettings,
  type AttendanceTermQuery,
  type CheckInResult,
  type ClassAttendanceReport,
  type KioskToken,
  type MyAttendanceToday,
  type RegisterQuery,
  type RegisterView,
  type SaveRegisterInput,
  type SaveStaffAttendanceInput,
  type SchoolAttendanceReport,
  type StaffAttendanceDay,
  type StudentAttendanceView,
  type TodayAttendance,
} from '@aischool/shared';
import { z } from 'zod';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { RequirePermissions } from '../common/decorators';
import { fullName } from '../common/format';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from './attendance.service';
import { absenceMessagePrompt, attendanceInsightPrompt } from './prompts';

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly prisma: PrismaService,
    private readonly gateway: AiGatewayService,
  ) {}

  // ---------------------------------------------------------- settings

  @Get('settings')
  @RequirePermissions('attendance.read')
  async settings(): Promise<AttendanceSettings> {
    return (await this.attendance.school()).settings;
  }

  @Put('settings')
  @RequirePermissions('attendance.manage')
  setSettings(@Body(new ZodPipe(attendanceSettingsSchema)) body: AttendanceSettings) {
    return this.attendance.setSettings(body);
  }

  // ---------------------------------------------------------- students

  @Get('register')
  @RequirePermissions('attendance.read')
  register(@Query(new ZodPipe(registerQuerySchema)) q: RegisterQuery): Promise<RegisterView> {
    return this.attendance.register(q.classArmId, q.date);
  }

  /** attendance.take is checked per class inside (class teacher, or attendance.manage). */
  @Put('register')
  @RequirePermissions('attendance.read')
  saveRegister(@Body(new ZodPipe(saveRegisterSchema)) body: SaveRegisterInput): Promise<RegisterView> {
    return this.attendance.saveRegister(body);
  }

  @Get('today')
  @RequirePermissions('attendance.read')
  today(@Query(new ZodPipe(dateQuerySchema)) q: { date?: string }): Promise<TodayAttendance> {
    return this.attendance.today(q.date);
  }

  @Get('students/:id')
  @RequirePermissions('attendance.read')
  student(@Param('id') id: string, @Query(new ZodPipe(termQuerySchema)) q: AttendanceTermQuery): Promise<StudentAttendanceView> {
    return this.attendance.studentView(id, q.termId);
  }

  @Get('reports/class')
  @RequirePermissions('attendance.read')
  classReport(@Query(new ZodPipe(termQuerySchema.required({ classArmId: true }))) q: AttendanceTermQuery): Promise<ClassAttendanceReport> {
    return this.attendance.classReport(q.classArmId!, q.termId);
  }

  @Get('reports/school')
  @RequirePermissions('attendance.read')
  schoolReport(@Query(new ZodPipe(termQuerySchema)) q: AttendanceTermQuery): Promise<SchoolAttendanceReport> {
    return this.attendance.schoolReport(q.termId);
  }

  // ---------------------------------------------------------- staff

  @Get('staff')
  @RequirePermissions('attendance.manage')
  staff(@Query(new ZodPipe(dateQuerySchema)) q: { date?: string }): Promise<StaffAttendanceDay> {
    return this.attendance.staffDay(q.date);
  }

  @Put('staff')
  @RequirePermissions('attendance.manage')
  saveStaff(@Body(new ZodPipe(saveStaffAttendanceSchema)) body: SaveStaffAttendanceInput): Promise<StaffAttendanceDay> {
    return this.attendance.saveStaff(body);
  }

  /** The reception screen polls this for a fresh QR code every minute. */
  @Get('kiosk')
  @RequirePermissions('attendance.manage')
  kiosk(@Req() req: Request): Promise<KioskToken> {
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
    const origin = (req.headers.origin as string | undefined) ?? `${proto}://${host}`;
    return this.attendance.kioskToken(origin);
  }

  /** Any signed-in member of staff, from their own phone. */
  @Post('check-in')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkIn(@Body(new ZodPipe(checkInSchema)) body: { token: string }): Promise<CheckInResult> {
    return this.attendance.checkIn(body.token);
  }

  @Get('me')
  me(): Promise<MyAttendanceToday> {
    return this.attendance.me();
  }

  // ---------------------------------------------------------- AI

  @Post('insight')
  @HttpCode(200)
  @RequirePermissions('attendance.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async insight(@Body(new ZodPipe(termQuerySchema)) q: AttendanceTermQuery) {
    const [r, today, school] = await Promise.all([
      this.attendance.schoolReport(q.termId),
      this.attendance.today(),
      this.attendance.school(),
    ]);
    if (!r.counts.present && !r.counts.absent && !r.counts.late) throw new BadRequestException('No registers have been taken this term yet');
    const lastTen = r.daily.filter((d) => d.rate !== null).slice(-10);
    const data = [
      `${r.term.name}. Overall attendance ${r.rate}% (${r.counts.present} present, ${r.counts.late} late, ${r.counts.absent} absent, ${r.counts.excused} excused marks).`,
      `By weekday: ${r.byWeekday.map((w) => `${DAY_NAMES[w.day]} ${w.rate ?? 'n/a'}%`).join(', ')}.`,
      `Last ${lastTen.length} school days: ${lastTen.map((d) => `${d.date} ${d.rate}%`).join(', ')}.`,
      `Classes: ${r.classes.map((c) => `${c.classArm.levelName} ${c.classArm.name} ${c.rate ?? 'n/a'}% (${c.registersTaken} registers)`).join('; ')}.`,
      `Persistently absent (below 90%): ${r.chronic.length ? r.chronic.slice(0, 12).map((c) => `${c.name}, ${c.classArm}, ${c.rate}%`).join('; ') : 'none'}.`,
      `Today (${today.dayName}): ${today.registersTaken} of ${today.registersExpected} registers taken; ${today.students.rate ?? 'n/a'}% present so far. ` +
        `Missing registers: ${today.classes.filter((c) => !c.taken && c.onRoll).map((c) => `${c.classArm.levelName} ${c.classArm.name}`).join(', ') || 'none'}.`,
      `Staff attendance this term: ${r.staffRate ?? 'n/a'}%, ${r.staffLateDays} late arrivals.`,
    ].join('\n');
    const { system, user } = attendanceInsightPrompt(school.name, data);
    const result = await this.gateway.generate({ tier: 'advanced', system, messages: [{ role: 'user', content: user }] }, 'attendance-insight');
    return { text: result.text, provider: result.provider, model: result.model };
  }

  /** Drafts a supportive note to a student's parent about their absences (nothing is sent). */
  @Post('absence-message')
  @HttpCode(200)
  @RequirePermissions('attendance.read', 'guardians.read', 'ai.use')
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async absenceMessage(@Body(new ZodPipe(absenceMessageSchema)) body: z.infer<typeof absenceMessageSchema>): Promise<AbsenceMessage> {
    const view = await this.attendance.studentView(body.studentId, body.termId);
    if (!view.counts.absent) throw new BadRequestException(`${view.student.name} has no absences this term`);
    const [student, school] = await Promise.all([
      this.prisma.db.student.findUniqueOrThrow({
        where: { id: body.studentId },
        include: { guardians: { orderBy: { isPrimary: 'desc' }, include: { guardian: true } } },
      }),
      this.prisma.root.tenant.findUniqueOrThrow({ where: { id: currentTenantId() }, select: { name: true } }),
    ]);
    const guardian = student.guardians[0]?.guardian ?? null;
    const absentDays = view.days.filter((d) => d.status === 'ABSENT');
    const facts = [
      `Learner: ${student.firstName} (${view.student.classArm ?? 'no class'}), ${student.gender === 'MALE' ? 'he' : 'she'}.`,
      `Parent/guardian: ${guardian ? `${guardian.relationship} ${guardian.firstName} ${guardian.lastName}` : 'not on record (address as "Dear Parent/Guardian")'}.`,
      `${view.term.name}: attended ${view.rate}% of ${view.daysMarked} marked days.`,
      `Absent on: ${absentDays.map((d) => d.date).join(', ')}${view.currentAbsenceStreak > 1 ? ` (the last ${view.currentAbsenceStreak} school days in a row)` : ''}.`,
      absentDays.some((d) => d.note) ? `Notes recorded: ${absentDays.filter((d) => d.note).map((d) => `${d.date}: ${d.note}`).join('; ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const { system, user } = absenceMessagePrompt(school.name, facts);
    const result = await this.gateway.generateJson(
      { tier: 'standard', system, messages: [{ role: 'user', content: user }] },
      aiAbsenceMessageSchema,
      'absence-message',
    );
    return {
      ...result.data,
      guardian: guardian ? { name: fullName(guardian), phone: guardian.phone, email: guardian.email } : null,
      provider: result.provider,
      model: result.model,
    };
  }
}

