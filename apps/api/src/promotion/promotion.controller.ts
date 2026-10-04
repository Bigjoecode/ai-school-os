import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  applyPromotionSchema,
  newSessionSchema,
  promotionDraftSchema,
  promotionSettingsSchema,
  type NewSessionResult,
  type PromotionApplyResult,
  type PromotionReport,
  type PromotionSettings,
  type PromotionSheet,
  type PromotionUndoResult,
  type StudentPromotionHistoryItem,
  type SuggestedSession,
} from '@aischool/shared';
import type { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PromotionService } from './promotion.service';

/**
 * End of session: the promotion sheet (who moves up, repeats or graduates),
 * applying it in one go (and undoing it while the new session is untouched),
 * and rolling over into a new session with its terms and fees.
 */
@Controller('promotion')
export class PromotionController {
  constructor(private readonly promotion: PromotionService) {}

  @Get('settings')
  @RequirePermissions('academics.manage')
  settings(): Promise<PromotionSettings> {
    return this.promotion.getSettings();
  }

  @Put('settings')
  @RequirePermissions('academics.manage')
  setSettings(@Body(new ZodPipe(promotionSettingsSchema)) body: PromotionSettings): Promise<PromotionSettings> {
    return this.promotion.setSettings(body);
  }

  @Get('sessions/:id/sheet')
  @RequirePermissions('academics.manage')
  sheet(@Param('id') id: string): Promise<PromotionSheet> {
    return this.promotion.sheet(id);
  }

  @Put('sessions/:id/draft')
  @RequirePermissions('academics.manage')
  saveDraft(@Param('id') id: string, @Body(new ZodPipe(promotionDraftSchema)) body: z.infer<typeof promotionDraftSchema>): Promise<PromotionSheet> {
    return this.promotion.saveDraft(id, body.decisions);
  }

  /** Discards saved decisions so everyone goes back to the suggestion. */
  @Delete('sessions/:id/draft')
  @RequirePermissions('academics.manage')
  async clearDraft(@Param('id') id: string): Promise<PromotionSheet> {
    await this.promotion.clearDraft(id);
    return this.promotion.sheet(id);
  }

  @Post('sessions/:id/apply')
  @HttpCode(200)
  @RequirePermissions('academics.manage')
  apply(@Param('id') id: string, @Body(new ZodPipe(applyPromotionSchema)) body: z.infer<typeof applyPromotionSchema>): Promise<PromotionApplyResult> {
    return this.promotion.apply(id, body);
  }

  @Post('sessions/:id/undo')
  @HttpCode(200)
  @RequirePermissions('academics.manage')
  undo(@Param('id') id: string): Promise<PromotionUndoResult> {
    return this.promotion.undo(id);
  }

  @Get('sessions/:id/report')
  @RequirePermissions('academics.read')
  report(@Param('id') id: string): Promise<PromotionReport> {
    return this.promotion.report(id);
  }

  /** Suggested name and term dates for the session after this one. */
  @Get('sessions/:id/next-session')
  @RequirePermissions('academics.manage')
  suggestion(@Param('id') id: string): Promise<SuggestedSession> {
    return this.promotion.suggestion(id);
  }

  @Post('new-session')
  @RequirePermissions('academics.manage')
  createSession(@Body(new ZodPipe(newSessionSchema)) body: z.infer<typeof newSessionSchema>): Promise<NewSessionResult> {
    return this.promotion.createSession(body);
  }

  @Get('students/:id/history')
  @RequirePermissions('students.read')
  history(@Param('id') id: string): Promise<StudentPromotionHistoryItem[]> {
    return this.promotion.history(id);
  }
}
