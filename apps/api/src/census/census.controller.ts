import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import {
  PLATFORM_AREAS,
  candidatesQuerySchema,
  censusQuerySchema,
  saveCensusProfileSchema,
  type CandidatesQuery,
  type CensusAggregate,
  type CensusCandidates,
  type CensusQuery,
  type CensusReport,
  type CensusSettings,
} from '@aischool/shared';
import { z } from 'zod';
import { RequirePermissions, RequirePlatformRole } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { CensusService } from './census.service';

/**
 * Returns & census: ASC-style summary tables for the state's Annual School
 * Census and working candidate lists for exam-body registration. Aggregated
 * figures for school leaders who can see both pupil and staff records.
 */
@Controller('census')
export class CensusController {
  constructor(private readonly census: CensusService) {}

  @Get('profile')
  @RequirePermissions('school.read')
  profile(): Promise<CensusSettings> {
    return this.census.settings();
  }

  /** Campuses, for the profile's campus picker. */
  @Get('branches')
  @RequirePermissions('school.read')
  branches(): Promise<{ id: string; name: string }[]> {
    return this.census.branches();
  }

  @Put('profile')
  @RequirePermissions('school.manage')
  save(@Body(new ZodPipe(saveCensusProfileSchema)) body: z.output<typeof saveCensusProfileSchema>): Promise<CensusSettings> {
    return this.census.saveProfile(body);
  }

  @Delete('profile/branches/:branchId')
  @RequirePermissions('school.manage')
  removeBranch(@Param('branchId') branchId: string): Promise<CensusSettings> {
    return this.census.removeBranchProfile(branchId);
  }

  @Get('report')
  @RequirePermissions('school.read', 'students.read', 'staff.read')
  report(@Query(new ZodPipe(censusQuerySchema)) q: CensusQuery): Promise<CensusReport> {
    return this.census.report(q);
  }

  /** Personal data (names, dates of birth): audit-logged on every open. */
  @Get('candidates')
  @RequirePermissions('school.read', 'students.read')
  candidates(@Query(new ZodPipe(candidatesQuerySchema)) q: CandidatesQuery): Promise<CensusCandidates> {
    return this.census.candidates(q.classLevelId, q.branchId);
  }
}

const aggregateQuery = z.object({ state: z.string().trim().max(40).optional() });

/** Preview for later government work: counts across opted-in schools by state and LGA. */
@Controller('platform/census')
export class PlatformCensusController {
  constructor(private readonly census: CensusService) {}

  @Get('aggregate')
  @RequirePlatformRole(...PLATFORM_AREAS.overview)
  aggregate(@Query(new ZodPipe(aggregateQuery)) q: z.infer<typeof aggregateQuery>): Promise<CensusAggregate> {
    return this.census.aggregate(q.state || undefined);
  }
}
