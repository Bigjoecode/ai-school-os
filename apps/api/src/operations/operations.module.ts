import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DocumentsController } from './documents.controller';
import { HostelController } from './hostel.controller';
import { InventoryController } from './inventory.controller';
import { LibraryController } from './library.controller';
import { OperationsService } from './operations.service';
import { ReceptionController } from './reception.controller';
import { TransportController } from './transport.controller';

/** Phase 9: library, inventory, transport, hostel, reception, certificates and ID cards. */
@Module({
  imports: [AiModule],
  controllers: [LibraryController, InventoryController, TransportController, HostelController, ReceptionController, DocumentsController],
  providers: [OperationsService],
})
export class OperationsModule {}
