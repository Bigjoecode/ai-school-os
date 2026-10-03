import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Module, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IMPORT_KINDS,
  importRequestSchema,
  setupClassesSchema,
  setupSubjectsSchema,
  setupYearSchema,
  type ImportKind,
  type ImportPreview,
  type ImportRequest,
  type ImportResult,
  type Permission,
  type SetupStatus,
  type SetupYearInput,
} from '@aischool/shared';
import { z } from 'zod';
import { AssessmentModule } from '../assessment/assessment.module';
import { RequirePermissions } from '../common/decorators';
import { currentContext } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { ImportService } from './import.service';
import { SetupService } from './setup.service';

/** New-school setup: the checklist and the Nigerian templates for the year, classes and subjects. */
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get()
  @RequirePermissions('school.read')
  status(): Promise<SetupStatus> {
    return this.setup.status();
  }

  @Post('year')
  @HttpCode(200)
  @RequirePermissions('academics.manage')
  year(@Body(new ZodPipe(setupYearSchema)) body: SetupYearInput) {
    return this.setup.year(body);
  }

  @Post('classes')
  @HttpCode(200)
  @RequirePermissions('academics.manage')
  classes(@Body(new ZodPipe(setupClassesSchema)) body: z.infer<typeof setupClassesSchema>) {
    return this.setup.classes(body);
  }

  @Post('subjects')
  @HttpCode(200)
  @RequirePermissions('academics.manage')
  subjects(@Body(new ZodPipe(setupSubjectsSchema)) body: z.infer<typeof setupSubjectsSchema>) {
    return this.setup.subjects(body);
  }
}

/** Who may import what: students also brings in parents; staff logins need user management. */
const NEEDS: Record<ImportKind, Permission[]> = {
  STUDENTS: ['students.manage', 'guardians.manage'],
  STAFF: ['staff.manage'],
  // Importing overwrites any class's scores, so it needs the publish right, not just a teacher's entry right.
  RESULTS: ['results.enter', 'results.publish'],
};

/** CSV imports: preview first (nothing written), then commit. */
@Controller('imports')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  private allow(req: ImportRequest | { kind: ImportKind }) {
    const perms = currentContext().permissions;
    const need = [...NEEDS[req.kind], ...('options' in req && req.options.createLogins ? (['users.manage'] as Permission[]) : [])];
    const missing = need.filter((p) => !perms.has(p));
    if (missing.length) throw new ForbiddenException(`You don't have permission to do this (${missing.join(', ')})`);
  }

  @Get('templates/:kind')
  @RequirePermissions('school.read')
  @Header('content-type', 'text/csv; charset=utf-8')
  async template(@Param('kind', new ZodPipe(z.enum(IMPORT_KINDS))) kind: ImportKind) {
    this.allow({ kind });
    // A BOM so Excel opens the file as UTF-8 (₦, accents).
    return `﻿${await this.imports.templateFor(kind)}`;
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermissions('school.read')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preview(@Body(new ZodPipe(importRequestSchema)) body: ImportRequest): Promise<ImportPreview> {
    this.allow(body);
    return this.imports.preview(body);
  }

  @Post('commit')
  @HttpCode(200)
  @RequirePermissions('school.read')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  commit(@Body(new ZodPipe(importRequestSchema)) body: ImportRequest): Promise<ImportResult> {
    this.allow(body);
    return this.imports.commit(body);
  }
}

@Module({
  imports: [AssessmentModule],
  controllers: [SetupController, ImportController],
  providers: [SetupService, ImportService],
})
export class OnboardingModule {}
