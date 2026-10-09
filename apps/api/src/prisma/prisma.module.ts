import { Global, Module } from '@nestjs/common';
import { HousekeepingService } from './housekeeping.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, HousekeepingService],
  exports: [PrismaService],
})
export class PrismaModule {}
