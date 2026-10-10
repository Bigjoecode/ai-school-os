import { Controller, Get, MiddlewareConsumer, Module, NestModule, Res } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/throttler.guard';
import type { NextFunction, Request, Response } from 'express';
import { AcademicModule } from './academic-engine/academic.module';
import { AssessmentModule } from './assessment/assessment.module';
import { TimetableModule } from './timetable/timetable.module';
import { AttendanceModule } from './attendance/attendance.module';
import { FinanceModule } from './finance/finance.module';
import { HrModule } from './hr/hr.module';
import { OperationsModule } from './operations/operations.module';
import { CommsModule } from './comms/comms.module';
import { PortalModule } from './portal/portal.module';
import { WelfareModule } from './welfare/welfare.module';
import { LiveModule } from './live/live.module';
import { AgentsModule } from './agents/agents.module';
import { FilesModule } from './files/files.module';
import { AlertsModule } from './alerts/alerts.service';
import { readBackupStatus } from './alerts/backup-status';
import { FeaturesModule } from './features/features.module';
import { apiUsageMiddleware } from './features/api-usage.service';
import { ConsoleModule } from './console/console.module';
import { LedgerModule } from './ledger/ledger.service';
import { EntitlementsModule } from './student-ai/entitlements.service';
import { CommerceModule } from './commerce/commerce.module';
import { LearningModule } from './learning/learning.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { MaterialsModule } from './materials/materials.module';
import { BackupModule } from './backup/backup.module';
import { PromotionModule } from './promotion/promotion.module';
import { WebsiteModule } from './website/website.module';
import { ResultPinsModule } from './result-pins/result-pins.module';
import { CbtModule } from './cbt/cbt.module';
import { AlumniModule } from './alumni/alumni.module';
import { HousesModule } from './houses/houses.module';
import { CareersModule } from './careers/careers.module';
import { JambModule } from './jamb/jamb.module';
import { LearningUpdatesModule } from './learning-updates/learning-updates.module';
import { DataProtectionModule } from './data-protection/data-protection.module';
import { SuccessModule } from './success/success.module';
import { CensusModule } from './census/census.module';
import { LessonModulesModule } from './lesson-modules/lesson-modules.module';
import { GamesModule } from './games/games.module';
import { ParentLinesModule } from './parent-lines/parent-lines.module';
import { WhatsappAssistantModule } from './comms/whatsapp-assistant.module';
import { AcademicsController } from './academics/academics.controller';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import type { PublicConfig } from '@aischool/shared';
import { DEMO_LOGIN_HINTS, DemoModeService } from './auth/demo-mode.service';
import { Public } from './common/decorators';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { RequestContextStore } from './common/request-context';
import { DashboardModule } from './dashboard/dashboard.module';
import { PeopleModule } from './people/people.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { RbacModule } from './rbac/rbac.module';
import { SchoolController } from './school/school.controller';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public, for uptime monitors (the GitHub "Uptime" workflow, UptimeRobot).
   * Nothing secret: the deployed commit, uptime, the newest applied migration
   * and when the database was last backed up. 503 when the database is down.
   */
  @Public()
  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    const base = { version: process.env.APP_VERSION ?? 'development', uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString() };
    const backup = readBackupStatus();
    const backupInfo = { backup: backup.state, lastBackupAt: backup.lastBackupAt };
    const started = Date.now();
    try {
      await this.prisma.root.$queryRaw`SELECT 1`;
    } catch {
      res.status(503);
      return { status: 'error', db: 'down', ...base, ...backupInfo };
    }
    const dbLatencyMs = Date.now() - started;
    const [migration] = await this.prisma.root
      .$queryRaw<{ name: string }[]>`SELECT "migration_name" AS name FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "migration_name" DESC LIMIT 1`
      .catch(() => []);
    return { status: 'ok', db: 'ok', dbLatencyMs, ...base, lastMigration: migration?.name ?? null, ...backupInfo };
  }
}

/** Public settings the sign-in page needs before anyone has signed in. */
@Controller('public/config')
class PublicConfigController {
  constructor(private readonly demo: DemoModeService) {}

  /** demoAccounts: advertise the demo logins (console → Schools → Demo schools; DEMO_LOGINS=off forces it off). */
  @Public()
  @Get()
  async config(): Promise<PublicConfig> {
    const show = (await this.demo.effective()).publicHints;
    return { demoAccounts: show, demoLogins: show ? DEMO_LOGIN_HINTS : [] };
  }
}

/** Opens the per-request context store before any guard or handler runs. */
function requestContext(req: Request, _res: Response, next: NextFunction) {
  RequestContextStore.run(
    { permissions: new Set(), ip: req.ip, userAgent: req.headers['user-agent'] },
    next,
  );
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    FeaturesModule,
    AlertsModule,
    LedgerModule,
    EntitlementsModule,
    AuditModule,
    AuthModule,
    PlatformModule,
    DashboardModule,
    PeopleModule,
    RbacModule,
    AiModule,
    AcademicModule,
    AssessmentModule,
    TimetableModule,
    AttendanceModule,
    FinanceModule,
    HrModule,
    OperationsModule,
    CommsModule,
    LiveModule,
    PortalModule,
    WelfareModule,
    AgentsModule,
    WhatsappAssistantModule,
    FilesModule,
    WebsiteModule,
    ResultPinsModule,
    ConsoleModule,
    CommerceModule,
    LearningModule,
    KnowledgeModule,
    OnboardingModule,
    AdmissionsModule,
    CbtModule,
    MaterialsModule,
    PromotionModule,
    BackupModule,
    AlumniModule,
    HousesModule,
    CareersModule,
    JambModule,
    LearningUpdatesModule,
    DataProtectionModule,
    SuccessModule,
    LessonModulesModule,
    GamesModule,
    CensusModule,
    ParentLinesModule,
    SubscriptionsModule,
  ],
  controllers: [HealthController, PublicConfigController, SchoolController, AcademicsController],
  providers: [
    // Order matters: rate limiting first, then authentication/permissions.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContext, apiUsageMiddleware).forRoutes('{*splat}');
  }
}
