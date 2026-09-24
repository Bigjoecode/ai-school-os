import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { AcademicModule } from './academic-engine/academic.module';
import { AcademicsController } from './academics/academics.controller';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
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

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    const started = Date.now();
    await this.prisma.root.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'ok', dbLatencyMs: Date.now() - started, time: new Date().toISOString() };
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
    AuditModule,
    AuthModule,
    PlatformModule,
    DashboardModule,
    PeopleModule,
    RbacModule,
    AiModule,
    AcademicModule,
  ],
  controllers: [HealthController, SchoolController, AcademicsController],
  providers: [
    // Order matters: rate limiting first, then authentication/permissions.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(requestContext).forRoutes('{*splat}');
  }
}
