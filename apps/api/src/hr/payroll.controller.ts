import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createPayrollRunSchema,
  formatMoney,
  hrSettingsSchema,
  markPayrollPaidSchema,
  payProfileSchema,
  payslipAdjustmentsSchema,
  salaryGradeSchema,
  type AiText,
  type EmployeeDetail,
  type HrSettings,
  type PayProfileInput,
  type PayProfileRow,
  type PayrollRunDetail,
  type PayrollRunRow,
  type PayslipView,
  type SalaryGradeInput,
  type SalaryGradeRow,
} from '@aischool/shared';
import { z } from 'zod';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { RequireFeature, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { HrService } from './hr.service';
import { PayrollService } from './payroll.service';
import { payrollReviewPrompt } from './prompts';

@Controller('payroll')
@RequireFeature('payroll')
export class PayrollController {
  constructor(
    private readonly hr: HrService,
    private readonly payroll: PayrollService,
    private readonly gateway: AiGatewayService,
  ) {}

  // ---------------------------------------------------------- settings

  @Get('settings')
  @RequirePermissions('payroll.read')
  async settings(): Promise<HrSettings & { currency: string }> {
    const s = await this.hr.school();
    return { ...s.settings, currency: s.currency };
  }

  @Put('settings')
  @RequirePermissions('payroll.manage')
  setSettings(@Body(new ZodPipe(hrSettingsSchema)) body: HrSettings) {
    return this.hr.setSettings(body);
  }

  // ---------------------------------------------------------- grades & pay details

  @Get('grades')
  @RequirePermissions('payroll.read')
  grades(): Promise<SalaryGradeRow[]> {
    return this.payroll.grades();
  }

  @Post('grades')
  @RequirePermissions('payroll.manage')
  createGrade(@Body(new ZodPipe(salaryGradeSchema)) body: SalaryGradeInput) {
    return this.payroll.saveGrade(null, body);
  }

  @Put('grades/:id')
  @RequirePermissions('payroll.manage')
  updateGrade(@Param('id') id: string, @Body(new ZodPipe(salaryGradeSchema)) body: SalaryGradeInput) {
    return this.payroll.saveGrade(id, body);
  }

  @Post('grades/:id/apply')
  @HttpCode(200)
  @RequirePermissions('payroll.manage')
  applyGrade(@Param('id') id: string) {
    return this.payroll.applyGrade(id);
  }

  @Delete('grades/:id')
  @HttpCode(204)
  @RequirePermissions('payroll.manage')
  deleteGrade(@Param('id') id: string) {
    return this.payroll.deleteGrade(id);
  }

  @Get('profiles')
  @RequirePermissions('payroll.read')
  profiles(): Promise<PayProfileRow[]> {
    return this.payroll.profiles();
  }

  @Put('profiles/:staffId')
  @RequirePermissions('payroll.manage')
  saveProfile(@Param('staffId') staffId: string, @Body(new ZodPipe(payProfileSchema)) body: PayProfileInput): Promise<EmployeeDetail> {
    return this.payroll.saveProfile(staffId, body);
  }

  // ---------------------------------------------------------- runs

  @Get('runs')
  @RequirePermissions('payroll.read')
  runs(): Promise<PayrollRunRow[]> {
    return this.payroll.runs();
  }

  @Post('runs')
  @RequirePermissions('payroll.manage')
  create(@Body(new ZodPipe(createPayrollRunSchema)) body: z.infer<typeof createPayrollRunSchema>): Promise<PayrollRunDetail> {
    return this.payroll.createRun(body.period, body.note);
  }

  @Get('runs/:id')
  @RequirePermissions('payroll.read')
  run(@Param('id') id: string): Promise<PayrollRunDetail> {
    return this.payroll.runDetail(id);
  }

  @Delete('runs/:id')
  @HttpCode(204)
  @RequirePermissions('payroll.manage')
  remove(@Param('id') id: string) {
    return this.payroll.deleteRun(id);
  }

  @Post('runs/:id/recalculate')
  @HttpCode(200)
  @RequirePermissions('payroll.manage')
  recalculate(@Param('id') id: string): Promise<PayrollRunDetail> {
    return this.payroll.recalculate(id);
  }

  @Post('runs/:id/approve')
  @HttpCode(200)
  @RequirePermissions('payroll.approve')
  approve(@Param('id') id: string): Promise<PayrollRunDetail> {
    return this.payroll.approve(id);
  }

  @Post('runs/:id/reopen')
  @HttpCode(200)
  @RequirePermissions('payroll.approve')
  reopen(@Param('id') id: string): Promise<PayrollRunDetail> {
    return this.payroll.reopen(id);
  }

  @Post('runs/:id/paid')
  @HttpCode(200)
  @RequirePermissions('payroll.manage')
  paid(@Param('id') id: string, @Body(new ZodPipe(markPayrollPaidSchema)) body: z.infer<typeof markPayrollPaidSchema>): Promise<PayrollRunDetail> {
    return this.payroll.markPaid(id, body);
  }

  @Get('runs/:id/bank-schedule')
  @RequirePermissions('payroll.read')
  bankSchedule(@Param('id') id: string) {
    return this.payroll.bankSchedule(id);
  }

  @Put('payslips/:id/adjustments')
  @RequirePermissions('payroll.manage')
  adjust(@Param('id') id: string, @Body(new ZodPipe(payslipAdjustmentsSchema)) body: z.infer<typeof payslipAdjustmentsSchema>): Promise<PayrollRunDetail> {
    return this.payroll.setAdjustments(id, body.adjustments);
  }

  @Get('payslips/:id')
  @RequirePermissions('payroll.read')
  payslip(@Param('id') id: string): Promise<PayslipView> {
    return this.payroll.payslip(id);
  }

  /** A short memo for the approver: is this month's payroll ready, and what needs a look. */
  @Post('runs/:id/review')
  @HttpCode(200)
  @RequirePermissions('payroll.read', 'ai.use')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async review(@Param('id') id: string): Promise<AiText> {
    const r = await this.payroll.runDetail(id);
    const school = await this.hr.school();
    const money = (k: number) => formatMoney(k, r.currency);
    const line = (t: { staffCount: number; grossKobo: number; netKobo: number; payeKobo: number; pensionKobo: number; employerPensionKobo: number; costKobo: number }) =>
      `${t.staffCount} staff; gross ${money(t.grossKobo)}; net ${money(t.netKobo)}; PAYE ${money(t.payeKobo)}; employee pension ${money(t.pensionKobo)}; employer pension ${money(t.employerPensionKobo)}; total cost ${money(t.costKobo)}`;
    const adjusted = r.payslips.filter((p) => p.adjustments.length || p.unpaidLeaveDays);
    const data = [
      `Payroll for ${r.label} — status ${r.status.toLowerCase()}; ${r.workingDays} working days. Tax rules: ${r.taxRules}.`,
      `This month: ${line(r)}.`,
      r.previous ? `Last month (${r.previous.label}): ${line(r.previous)}.` : 'No earlier payroll to compare with.',
      `Checks found by the system (${r.checks.length}):\n${r.checks.map((c) => `- [${c.level}] ${c.message}`).join('\n') || '- none'}`,
      adjusted.length
        ? `Adjustments and unpaid leave:\n${adjusted
            .map(
              (p) =>
                `- ${p.staffName}: ${[
                  ...p.adjustments.map((a) => `${a.label} ${a.kind === 'DEDUCTION' ? '−' : '+'}${money(a.amountKobo)}`),
                  p.unpaidLeaveDays ? `${p.unpaidLeaveDays} unpaid leave days` : '',
                ]
                  .filter(Boolean)
                  .join(', ')}`,
            )
            .join('\n')}`
        : 'No one-off adjustments or unpaid leave this month.',
      `Remittances due: PAYE ${money(r.remittances.payeKobo)}; pension ${money(r.remittances.pensionKobo)} (${r.remittances.byPfa.map((p) => `${p.pfa} ${money(p.amountKobo)} for ${p.staff}`).join('; ')}); NHF ${money(r.remittances.nhfKobo)}.`,
    ].join('\n');
    const { system, user } = payrollReviewPrompt(school.name, data);
    const res = await this.gateway.generate({ tier: 'advanced', system, messages: [{ role: 'user', content: user }] }, 'payroll-review');
    return { text: res.text, provider: res.provider, model: res.model };
  }
}
