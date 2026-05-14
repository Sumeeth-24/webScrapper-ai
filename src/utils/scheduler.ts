import { ScheduleConfig, CrawlResult } from '../core/types';

/**
 * Simple cron-like scheduler for periodic re-crawling.
 * Uses setInterval with parsed cron expressions for basic scheduling.
 */
export class CrawlScheduler {
  private jobs: Map<string, NodeJS.Timeout> = new Map();

  schedule(id: string, config: ScheduleConfig, executor: (url: string, options: any) => Promise<CrawlResult>): void {
    this.cancel(id);
    const interval = this.cronToInterval(config.cron);
    const timer = setInterval(async () => {
      for (const url of config.urls) {
        const result = await executor(url, config.options);
        config.onComplete?.(result);
      }
    }, interval);
    this.jobs.set(id, timer);
  }

  cancel(id: string): void {
    const timer = this.jobs.get(id);
    if (timer) { clearInterval(timer); this.jobs.delete(id); }
  }

  cancelAll(): void {
    for (const timer of this.jobs.values()) clearInterval(timer);
    this.jobs.clear();
  }

  listJobs(): string[] { return [...this.jobs.keys()]; }

  private cronToInterval(cron: string): number {
    const [minute, hour] = cron.split(' ');
    if (hour.startsWith('*/')) return parseInt(hour.slice(2)) * 60 * 60 * 1000;
    if (minute.startsWith('*/')) return parseInt(minute.slice(2)) * 60 * 1000;
    if (minute === '0' && hour === '0') return 24 * 60 * 60 * 1000;
    if (minute === '0' && hour === '*') return 60 * 60 * 1000;
    return 60 * 60 * 1000;
  }
}
