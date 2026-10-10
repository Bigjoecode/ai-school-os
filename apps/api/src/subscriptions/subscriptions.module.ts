import { Global, Module } from '@nestjs/common';
import { ConsoleModule } from '../console/console.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PlatformModule } from '../platform/platform.module';
import { BillingStateService } from './billing-state.service';
import { SignupService } from './signup.service';
import { ConsoleSubscriptionsController, SignupController, SubscriptionController } from './subscriptions.controller';
import { SubscriptionService } from './subscription.service';

/**
 * Self-serve sign-up and subscription billing. Global so the auth guard can
 * ask BillingStateService whether a school is read-only.
 */
@Global()
@Module({
  imports: [ConsoleModule, OnboardingModule, PlatformModule],
  controllers: [SignupController, SubscriptionController, ConsoleSubscriptionsController],
  providers: [BillingStateService, SignupService, SubscriptionService],
  exports: [BillingStateService],
})
export class SubscriptionsModule {}
