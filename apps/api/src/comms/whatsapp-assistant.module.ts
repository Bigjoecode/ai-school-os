import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { CommsModule } from './comms.module';
import { WhatsappAssistantController, WhatsappWebhookController } from './whatsapp-assistant.controller';
import { WhatsappAssistantService } from './whatsapp-assistant.service';

/**
 * The WhatsApp parent assistant. Separate from CommsModule because it needs
 * the Parent AI (AgentsModule), which itself depends on CommsModule.
 */
@Module({
  imports: [CommsModule, AgentsModule],
  controllers: [WhatsappWebhookController, WhatsappAssistantController],
  providers: [WhatsappAssistantService],
})
export class WhatsappAssistantModule {}
