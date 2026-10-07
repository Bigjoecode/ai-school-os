import { Module } from '@nestjs/common';
import { PlatformSuccessController, SuccessController } from './success.controller';
import { SuccessService } from './success.service';

/** School success dashboard: adoption, learning outcomes, parent engagement, time saved and a health score. */
@Module({
  controllers: [SuccessController, PlatformSuccessController],
  providers: [SuccessService],
})
export class SuccessModule {}
