import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FilesModule } from '../files/files.module';
import { LearningModule } from '../learning/learning.module';
import { CheckInService } from './checkin.service';
import { ClassroomController, ModulesController, MyLessonsController } from './modules.controller';
import { ModulesService } from './modules.service';
import { WorkbookService } from './workbook.service';

/** Learning modules with check-ins and video quizzes, classroom mode, the teacher's weekly workbook and the content library. */
@Module({
  imports: [AiModule, FilesModule, LearningModule],
  controllers: [ModulesController, MyLessonsController, ClassroomController],
  providers: [ModulesService, WorkbookService, CheckInService],
})
export class LessonModulesModule {}
