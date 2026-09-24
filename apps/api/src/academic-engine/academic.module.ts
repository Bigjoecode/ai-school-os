import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AcademicEngineService } from './academic-engine.service';
import { CurriculaController } from './curricula.controller';
import { GenerationQueue } from './generation-queue';
import { LessonsController } from './lessons.controller';
import { SchemesController } from './schemes.controller';

/** Phase 3: Curriculum → Scheme of Work → Lesson Plan, each with an AI generator. */
@Module({
  imports: [AiModule],
  controllers: [CurriculaController, SchemesController, LessonsController],
  providers: [AcademicEngineService, GenerationQueue],
})
export class AcademicModule {}
