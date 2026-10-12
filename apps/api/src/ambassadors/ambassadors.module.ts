import { Module } from '@nestjs/common';
import { AmbassadorPublicController, AmbassadorSelfController, ConsoleAmbassadorsController } from './ambassadors.controller';
import { AmbassadorsService } from './ambassadors.service';

/**
 * The ambassador referral programme: public applications, the ambassador's own
 * dashboard, commissions on referred schools' subscription payments (via
 * invoicePaidHooks / platformRefundHooks) and the console's review and payouts.
 */
@Module({
  controllers: [AmbassadorPublicController, AmbassadorSelfController, ConsoleAmbassadorsController],
  providers: [AmbassadorsService],
  exports: [AmbassadorsService],
})
export class AmbassadorsModule {}
