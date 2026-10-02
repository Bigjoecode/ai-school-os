import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { KB_AUDIENCES, kbAskSchema, kbDocumentSchema, type KbAudience } from '@aischool/shared';
import { z } from 'zod';
import { AiModule } from '../ai/ai.module';
import { RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { FilesModule } from '../files/files.module';
import { FilesService } from '../files/files.service';
import { KnowledgeService } from './knowledge.service';

/** The school's knowledge base: upload documents; staff, parents, students and the website ask questions of them. */
@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly kb: KnowledgeService,
    private readonly files: FilesService,
  ) {}

  @Get('documents')
  @RequirePermissions('knowledge.manage')
  list() {
    return this.kb.list();
  }

  /** A PDF or Word document, private to the school. */
  @Post('upload')
  @RequirePermissions('knowledge.manage')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined) {
    return this.files.save(file, false);
  }

  @Post('documents')
  @RequirePermissions('knowledge.manage')
  create(@Body(new ZodPipe(kbDocumentSchema)) body: z.infer<typeof kbDocumentSchema>) {
    return this.kb.create(body);
  }

  @Put('documents/:id')
  @RequirePermissions('knowledge.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(z.object({ title: z.string().trim().min(2).max(160).optional(), audience: z.enum(KB_AUDIENCES).optional() }))) body: { title?: string; audience?: KbAudience }) {
    return this.kb.update(id, body);
  }

  @Post('documents/:id/reprocess')
  @HttpCode(200)
  @RequirePermissions('knowledge.manage')
  reprocess(@Param('id') id: string) {
    return this.kb.reprocess(id);
  }

  @Delete('documents/:id')
  @HttpCode(204)
  @RequirePermissions('knowledge.manage')
  async remove(@Param('id') id: string) {
    await this.kb.remove(id);
  }

  /** Anyone signed in may ask; they only get answers from documents meant for them. */
  @Post('ask')
  @HttpCode(200)
  @RequirePermissions('ai.use')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  ask(@Body(new ZodPipe(kbAskSchema)) body: { question: string }) {
    return this.kb.ask(body.question);
  }
}

@Module({
  imports: [AiModule, FilesModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
