import { Controller, Get, Module } from '@nestjs/common';
import type { OverviewResponse } from '@aischool/shared';
import { RequirePermissions } from '../common/decorators';
import { SchoolSnapshotService } from './school-snapshot.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly snapshot: SchoolSnapshotService) {}

  @Get('overview')
  @RequirePermissions('school.read')
  overview(): Promise<OverviewResponse> {
    return this.snapshot.overview();
  }
}

@Module({
  controllers: [DashboardController],
  providers: [SchoolSnapshotService],
  exports: [SchoolSnapshotService],
})
export class DashboardModule {}
