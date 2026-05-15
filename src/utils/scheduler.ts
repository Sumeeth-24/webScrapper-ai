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

  /**
   * Parse a cron expression into a millisecond interval.
   * Supports: *\/N for minutes/hours, day-of-week specific (runs daily),
   * and common patterns. Falls back to 1 hour for unsupported expressions.
   */
  private cronToInterval(cron: string): number {
    const parts = cron.trim().split(/\s+/);
    if (parts.length < 5) return 60 * 60 * 1000; // fallback: 1 hour

    const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

    // */N minutes (e.g., "*/5 * * * *" = every 5 min)
    if (minute.startsWith('*/')) return parseInt(minute.slice(2)) * 60 * 1000;
    // */N hours (e.g., "0 */2 * * *" = every 2 hours)
    if (hour.startsWith('*/')) return parseInt(hour.slice(2)) * 60 * 60 * 1000;
    // Daily at specific time (e.g., "0 9 * * *" or "0 9 * * MON")
    if (minute !== '*' && hour !== '*' && dayOfMonth === '*') return 24 * 60 * 60 * 1000;
    // Every hour (e.g., "0 * * * *")
    if (minute !== '*' && hour === '*') return 60 * 60 * 1000;
    // Every minute ("* * * * *")
    if (minute === '*') return 60 * 1000;

    return 60 * 60 * 1000; // fallback: 1 hour
  }
}
