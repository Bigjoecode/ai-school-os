import { Controller, Get, Module, Param, Post, Query, Res, UploadedFile as Upload, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { UploadedFile } from '@aischool/shared';
import { Public, RequirePermissions } from '../common/decorators';
import { env } from '../config/env';
import { FilesService } from './files.service';

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Uploads for the website (public files). Other uses can add their own permission later. */
  @Post('files')
  @RequirePermissions('website.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: env().UPLOAD_MAX_MB * 1024 * 1024, files: 1 } }))
  upload(@Upload() file: Express.Multer.File | undefined, @Query('public') isPublic?: string): Promise<UploadedFile> {
    return this.files.save(file, isPublic !== 'false');
  }

  @Get('public/files/:id')
  @Public()
  async publicFile(@Param('id') id: string, @Res() res: Response) {
    this.send(res, await this.files.read(id, true), true);
  }

  @Get('files/:id')
  @RequirePermissions('school.read')
  async privateFile(@Param('id') id: string, @Res() res: Response) {
    this.send(res, await this.files.read(id, false), false);
  }

  private send(res: Response, f: { data: Buffer; mimeType: string; filename: string; inline: boolean }, cacheable: boolean) {
    res.setHeader('content-type', f.mimeType);
    res.setHeader('content-length', String(f.data.length));
    res.setHeader('x-content-type-options', 'nosniff');
    // A file opened directly can't run anything.
    res.setHeader('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('cache-control', cacheable ? 'public, max-age=31536000, immutable' : 'private, max-age=300');
    res.setHeader('cross-origin-resource-policy', 'cross-origin');
    res.setHeader('content-disposition', `${f.inline ? 'inline' : 'attachment'}; filename="${f.filename.replace(/"/g, '')}"`);
    res.end(f.data);
  }
}

@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
