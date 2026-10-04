import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FilesModule } from '../files/files.module';
import { MaterialsController } from './materials.controller';

/** Study materials: notes, documents, slides, videos and links for classes, and the student/parent library. */
@Module({
  imports: [AiModule, FilesModule],
  controllers: [MaterialsController],
})
export class MaterialsModule {}
