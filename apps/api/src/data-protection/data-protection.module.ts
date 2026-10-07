import { Module } from '@nestjs/common';
import { DataProtectionController } from './data-protection.controller';
import { DataProtectionService } from './data-protection.service';
import { SubjectExportService } from './subject-export.service';

/** NDPA tools: parental consent, the school's DPA acceptance, consent reports and data subject requests. */
@Module({
  controllers: [DataProtectionController],
  providers: [DataProtectionService, SubjectExportService],
  exports: [DataProtectionService],
})
export class DataProtectionModule {}
