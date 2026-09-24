import { Body, Controller, Get, Patch } from '@nestjs/common';
import { updateSchoolSchema, type UpdateSchoolInput } from '@aischool/shared';
import { AuditService } from '../audit/audit.service';
import { RequirePermissions } from '../common/decorators';
import { currentTenantId } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

const PROFILE_FIELDS = {
  id: true,
  slug: true,
  name: true,
  shortName: true,
  motto: true,
  email: true,
  phone: true,
  address: true,
  primaryColor: true,
  logoUrl: true,
  currency: true,
  timezone: true,
  country: true,
  status: true,
} as const;

@Controller('school')
export class SchoolController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('school.read')
  profile() {
    return this.prisma.root.tenant.findUniqueOrThrow({
      where: { id: currentTenantId() },
      select: PROFILE_FIELDS,
    });
  }

  @Patch()
  @RequirePermissions('school.manage')
  async update(@Body(new ZodPipe(updateSchoolSchema)) body: UpdateSchoolInput) {
    const school = await this.prisma.root.tenant.update({
      where: { id: currentTenantId() },
      data: body,
      select: PROFILE_FIELDS,
    });
    await this.audit.log({
      action: 'school.updated',
      summary: `Updated the school profile (${Object.keys(body).join(', ')})`,
      entityType: 'Tenant',
      entityId: school.id,
    });
    return school;
  }
}
