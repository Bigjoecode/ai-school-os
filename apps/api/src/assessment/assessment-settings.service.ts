import { Injectable } from '@nestjs/common';
import {
  DEFAULT_ASSESSMENT_COMPONENTS,
  DEFAULT_GRADING_SCALE,
  type AssessmentComponent,
  type AssessmentSettings,
  type GradeBand,
} from '@aischool/shared';
import type { Prisma } from '../generated/prisma/client';
import { currentTenantId } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** How the current school's term scores are made up, and how they're graded. */
@Injectable()
export class AssessmentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<{ components: AssessmentComponent[]; gradingScale: GradeBand[] }> {
    const t = await this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: { assessmentComponents: true, gradingScale: true },
    });
    return {
      components: (t.assessmentComponents as AssessmentComponent[] | null) ?? DEFAULT_ASSESSMENT_COMPONENTS,
      gradingScale: [...((t.gradingScale as GradeBand[] | null) ?? DEFAULT_GRADING_SCALE)].sort((a, b) => b.min - a.min),
    };
  }

  async set(settings: AssessmentSettings) {
    await this.prisma.root.tenant.update({
      where: { id: currentTenantId() },
      data: {
        assessmentComponents: settings.components as unknown as Prisma.InputJsonValue,
        gradingScale: [...settings.gradingScale].sort((a, b) => b.min - a.min) as unknown as Prisma.InputJsonValue,
      },
    });
    return this.get();
  }
}
