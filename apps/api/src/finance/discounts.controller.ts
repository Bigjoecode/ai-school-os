import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  discountListQuerySchema,
  discountPreviewSchema,
  discountReportQuerySchema,
  discountRulesSchema,
  reapplyDiscountsSchema,
  studentDiscountSchema,
  type DiscountPreview,
  type DiscountPreviewInput,
  type DiscountReport,
  type DiscountRules,
  type ReapplyResult,
  type StudentDiscountInput,
  type StudentDiscountRow,
  type StudentDiscountSummary,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { DiscountsService } from './discounts.service';

const bulkIds = z.object({ studentIds: z.array(z.string().min(1)).max(200).optional() });

/** Standing fee discounts: per-student awards, automatic rules, re-applying and the report. */
@Controller('finance/discounts')
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  @RequirePermissions('finance.read')
  list(@Query(new ZodPipe(discountListQuerySchema)) q: z.infer<typeof discountListQuerySchema>): Promise<StudentDiscountRow[]> {
    return this.discounts.list(q);
  }

  /** One discount for one student, or the same one for several (`studentIds`). */
  @Post()
  @RequirePermissions('finance.manage')
  create(@Body(new ZodPipe(studentDiscountSchema)) body: StudentDiscountInput, @Body(new ZodPipe(bulkIds)) extra: z.infer<typeof bulkIds>): Promise<StudentDiscountRow[]> {
    return this.discounts.create(body, extra.studentIds);
  }

  @Get('rules')
  @RequirePermissions('finance.read')
  rules(): Promise<DiscountRules> {
    return this.discounts.rules();
  }

  @Put('rules')
  @RequirePermissions('finance.manage')
  setRules(@Body(new ZodPipe(discountRulesSchema)) body: DiscountRules): Promise<DiscountRules> {
    return this.discounts.setRules(body);
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermissions('finance.read')
  preview(@Body(new ZodPipe(discountPreviewSchema)) body: DiscountPreviewInput): Promise<DiscountPreview> {
    return this.discounts.preview(body);
  }

  @Post('reapply')
  @HttpCode(200)
  @RequirePermissions('finance.manage')
  reapply(@Body(new ZodPipe(reapplyDiscountsSchema)) body: z.infer<typeof reapplyDiscountsSchema>): Promise<ReapplyResult> {
    return this.discounts.reapply(body.termId, body.dryRun);
  }

  @Get('report')
  @RequirePermissions('finance.read')
  report(@Query(new ZodPipe(discountReportQuerySchema)) q: { termId?: string }): Promise<DiscountReport> {
    return this.discounts.report(q.termId);
  }

  @Get('report.csv')
  @RequirePermissions('finance.read')
  @Header('content-type', 'text/csv; charset=utf-8')
  async reportCsv(@Query(new ZodPipe(discountReportQuerySchema)) q: { termId?: string }): Promise<string> {
    return (await this.discounts.reportCsv(q.termId)).csv;
  }

  @Get('student/:studentId')
  @RequirePermissions('finance.read')
  forStudent(@Param('studentId') studentId: string): Promise<StudentDiscountSummary> {
    return this.discounts.forStudent(studentId);
  }

  @Put(':id')
  @RequirePermissions('finance.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(studentDiscountSchema)) body: StudentDiscountInput): Promise<StudentDiscountRow> {
    return this.discounts.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('finance.manage')
  remove(@Param('id') id: string): Promise<void> {
    return this.discounts.remove(id);
  }
}
