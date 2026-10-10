import { Module } from '@nestjs/common';
import { CensusController, PlatformCensusController } from './census.controller';
import { CensusService } from './census.service';

/** Returns & census: ASC-style tables, exam candidate lists and a platform preview of opted-in totals. */
@Module({
  controllers: [CensusController, PlatformCensusController],
  providers: [CensusService],
})
export class CensusModule {}
