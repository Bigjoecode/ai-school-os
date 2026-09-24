import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { ProvisioningService } from './provisioning.service';

@Module({
  controllers: [PlatformController],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class PlatformModule {}
