import { Controller, Get, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { BackupExportRow } from '@aischool/shared';
import { RequirePermissions } from '../common/decorators';
import { currentContext, currentTenantId } from '../common/request-context';
import { BackupService } from './backup.service';

/** Settings → Backup & export: the school downloads its own records as a ZIP of CSV files. */
@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Post('export')
  @RequirePermissions('school.manage')
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  async export(@Res() res: Response): Promise<void> {
    const tenantId = currentTenantId();
    const userId = currentContext().userId!;
    const name = await this.backup.fileName(tenantId);
    this.backup.claim(tenantId);
    res.status(200);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    await this.backup.export(tenantId, userId, res);
  }

  @Get('exports')
  @RequirePermissions('school.manage')
  history(): Promise<BackupExportRow[]> {
    return this.backup.history(currentTenantId());
  }
}
