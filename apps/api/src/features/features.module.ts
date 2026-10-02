import { Global, Module } from '@nestjs/common';
import { ApiUsageService } from './api-usage.service';
import { FeatureService } from './features.service';

/** Plan features and API metering, needed by the auth guard and the AI gateway. */
@Global()
@Module({
  providers: [FeatureService, ApiUsageService],
  exports: [FeatureService, ApiUsageService],
})
export class FeaturesModule {}
