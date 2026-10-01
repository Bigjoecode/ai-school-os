import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AudienceService } from './audience.service';
import { ChannelsService } from './channels.service';
import { CommsController } from './comms.controller';
import { CommunityController } from './community.controller';
import { NotificationsController } from './notifications.controller';
import { SchedulerService } from './scheduler.service';
import { SenderService } from './sender.service';

/** Phase 10: email, SMS, WhatsApp, push and in-app messages; announcements; the calendar; automations. */
@Module({
  imports: [AiModule],
  controllers: [CommsController, CommunityController, NotificationsController],
  providers: [ChannelsService, AudienceService, SenderService, SchedulerService],
  exports: [SenderService],
})
export class CommsModule {}
