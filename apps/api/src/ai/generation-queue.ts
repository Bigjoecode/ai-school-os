import { Injectable, Logger } from '@nestjs/common';

/**
 * Runs AI generation jobs in the background of the API process.
 *
 * Generating a term's curriculum takes about a minute — longer than shared
 * hosting lets a web request stay open — so the request records the job,
 * returns straight away, and the page polls the record's `generation` state.
 * Jobs keep the request's context (school, user), so tenant scoping and
 * usage records still apply. At most MAX_CONCURRENT run at once per process;
 * the rest wait their turn.
 *
 * In-process by design for now: a restart loses running jobs, which the
 * startup sweep marks as failed so users can retry. A persistent queue can
 * replace this without changing callers.
 */
@Injectable()
export class GenerationQueue {
  private static readonly MAX_CONCURRENT = 3;
  private readonly logger = new Logger(GenerationQueue.name);
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  enqueue(label: string, job: () => Promise<void>): void {
    const start = () => {
      this.running++;
      const started = Date.now();
      job()
        .then(() => this.logger.log(`${label} finished in ${Math.round((Date.now() - started) / 1000)}s`))
        .catch((err) => this.logger.error(`${label} failed: ${(err as Error).message}`))
        .finally(() => {
          this.running--;
          this.waiting.shift()?.();
        });
    };
    if (this.running < GenerationQueue.MAX_CONCURRENT) start();
    else this.waiting.push(start);
  }
}
