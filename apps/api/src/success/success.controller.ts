import { Controller, Get, Query } from '@nestjs/common';
import { PLATFORM_AREAS, successQuerySchema, type PlatformSuccess, type SuccessQuery, type SuccessSummary, type SuccessTrends } from '@aischool/shared';
import { RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { SuccessService } from './success.service';

const canSeeFees = () => currentContext().permissions.has('finance.read');

/**
 * The school's success dashboard, for school leaders (principal, vice
 * principal, academic coordinator, admin): results.publish marks the people
 * who answer for the school's results. Fee figures need finance.read too.
 */
@Controller('success')
export class SuccessController {
  constructor(private readonly success: SuccessService) {}

  @Get('summary')
  @RequirePermissions('school.read', 'results.publish')
  async summary(@Query(new ZodPipe(successQuerySchema)) q: SuccessQuery): Promise<SuccessSummary> {
    const s = await this.success.summary(currentTenantId(), q.termId);
    return canSeeFees() ? s : { ...s, finance: null, parents: { ...s.parents, onlinePaymentsKobo: null } };
  }

  @Get('trends')
  @RequirePermissions('school.read', 'results.publish')
  async trends(@Query(new ZodPipe(successQuerySchema)) q: SuccessQuery): Promise<SuccessTrends> {
    const t = await this.success.trends(currentTenantId(), q.termId);
    return canSeeFees() ? t : { ...t, weeks: t.weeks.map((w) => ({ ...w, onlinePaymentsKobo: null })) };
  }
}

/** The platform team's view: every pilot school's health and risk flags side by side. */
@Controller('platform/success')
export class PlatformSuccessController {
  constructor(private readonly success: SuccessService) {}

  @Get()
  @RequirePlatformRole(...PLATFORM_AREAS.overview)
  overview(): Promise<PlatformSuccess> {
    return this.success.platform();
  }
}
