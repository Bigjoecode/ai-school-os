import { Global, Module } from '@nestjs/common';
import { ConsoleModule } from '../console/console.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PlatformModule } from '../platform/platform.module';
import { SuccessModule } from '../success/success.module';
import { BillingStateService } from './billing-state.service';
import { PilotService } from './pilot.service';
import { SignupService } from './signup.service';
import { ConsolePilotController, ConsoleSubscriptionsController, SignupController, SubscriptionController } from './subscriptions.controller';
import { SubscriptionService } from './subscription.service';

/**
 * Self-serve sign-up and subscription billing. Global so the auth guard can
 * ask BillingStateService whether a school is read-only.
 */
@Global()
@Module({
  imports: [ConsoleModule, OnboardingModule, PlatformModule, SuccessModule],
  controllers: [SignupController, SubscriptionController, ConsoleSubscriptionsController, ConsolePilotController],
  providers: [BillingStateService, SignupService, SubscriptionService, PilotService],
  exports: [BillingStateService],
})
export class SubscriptionsModule {}
