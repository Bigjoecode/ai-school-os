import { Body, Controller, Get, HttpCode, Module, Param, Post, Put, Query } from '@nestjs/common';
import {
  gamesPrivacySchema,
  gamesSettingsSchema,
  leaderboardQuerySchema,
  localScoreSchema,
  roundAnswerSchema,
  roundStartSchema,
  type ChildGamesSummary,
  type ClassGamesActivity,
  type GameAnswerFeedback,
  type GameRoundResult,
  type GameRoundView,
  type GamesAdminStatus,
  type GamesHub,
  type GamesLeaderboard,
  type GamesSettings,
  type LocalScoreInput,
  type RoundAnswerInput,
  type SyllabusMatchPack,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { LearningModule } from '../learning/learning.module';
import { GamesContent } from './games.content';
import { GamesService } from './games.service';

/**
 * EduGames for students (hub, rounds, scores, leaderboards), plus what
 * teachers (class activity), parents (a line on the child page) and the school
 * (settings: on/off, quiet hours, leaderboards, house points) see.
 * Score endpoints are rate-limited per student inside the service (a whole
 * school can share one IP address, so the IP throttle stays generous).
 */
@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get('hub')
  hub(): Promise<GamesHub> {
    return this.games.hub();
  }

  @Post('rounds')
  start(@Body(new ZodPipe(roundStartSchema)) body: z.output<typeof roundStartSchema>): Promise<GameRoundView> {
    return this.games.start(body);
  }

  @Get('rounds/:id')
  round(@Param('id') id: string): Promise<GameRoundView> {
    return this.games.round(id);
  }

  @Post('rounds/:id/answer')
  @HttpCode(200)
  answer(@Param('id') id: string, @Body(new ZodPipe(roundAnswerSchema)) body: RoundAnswerInput): Promise<GameAnswerFeedback> {
    return this.games.answer(id, body);
  }

  @Post('rounds/:id/finish')
  @HttpCode(200)
  finish(@Param('id') id: string): Promise<GameRoundResult> {
    return this.games.finish(id);
  }

  /** A round played on the device (Maths Sprint, word games, Match Up, offline True or False), marked by replay. */
  @Post('scores')
  @HttpCode(200)
  score(@Body(new ZodPipe(localScoreSchema)) body: LocalScoreInput): Promise<GameRoundResult> {
    return this.games.submitLocal(body);
  }

  @Get('match/syllabus')
  syllabusPack(@Query(new ZodPipe(z.object({ subject: z.string().trim().min(1).max(80) }))) q: { subject: string }): Promise<SyllabusMatchPack | null> {
    return this.games.syllabusPack(q.subject);
  }

  @Get('leaderboard')
  leaderboard(@Query(new ZodPipe(leaderboardQuerySchema)) q: z.output<typeof leaderboardQuerySchema>): Promise<GamesLeaderboard> {
    return this.games.leaderboard(q.scope);
  }

  @Put('me/privacy')
  privacy(@Body(new ZodPipe(gamesPrivacySchema)) body: { hidden: boolean }) {
    return this.games.setHidden(body.hidden);
  }

  // ---------------------------------------------------------- staff and parents

  @Get('class/:classArmId')
  classActivity(@Param('classArmId') classArmId: string): Promise<ClassGamesActivity> {
    return this.games.classActivity(classArmId);
  }

  @Get('child/:studentId')
  child(@Param('studentId') studentId: string): Promise<ChildGamesSummary> {
    return this.games.child(studentId);
  }

  @Get('settings')
  @RequirePermissions('school.read')
  settings(): Promise<GamesAdminStatus> {
    return this.games.adminStatus();
  }

  @Put('settings')
  @RequirePermissions('school.manage')
  save(@Body(new ZodPipe(gamesSettingsSchema)) body: GamesSettings): Promise<GamesAdminStatus> {
    return this.games.saveSettings(body);
  }
}

/** EduGames: free, short curriculum games with XP, streaks, badges and weekly leaderboards. */
@Module({
  imports: [LearningModule],
  controllers: [GamesController],
  providers: [GamesService, GamesContent],
})
export class GamesModule {}
