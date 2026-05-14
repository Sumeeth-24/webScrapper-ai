import { MetricsData } from '../core/types';

/**
 * Simple metrics collector for WebContext operations.
 * Tracks crawl counts, page counts, token usage, cache performance, and errors.
 */
export class MetricsCollector {
  private data: MetricsData = { crawlsTotal: 0, pagesTotal: 0, tokensTotal: 0, cacheHits: 0, cacheMisses: 0, avgDuration: 0, errors: 0 };
  private durations: number[] = [];

  recordCrawl(pages: number, tokens: number, duration: number): void {
    this.data.crawlsTotal++;
    this.data.pagesTotal += pages;
    this.data.tokensTotal += tokens;
    this.durations.push(duration);
    this.data.avgDuration = this.durations.reduce((a, b) => a + b, 0) / this.durations.length;
  }

  recordCacheHit(): void { this.data.cacheHits++; }
  recordCacheMiss(): void { this.data.cacheMisses++; }
  recordError(): void { this.data.errors++; }
  getMetrics(): MetricsData { return { ...this.data }; }

  reset(): void {
    this.data = { crawlsTotal: 0, pagesTotal: 0, tokensTotal: 0, cacheHits: 0, cacheMisses: 0, avgDuration: 0, errors: 0 };
    this.durations = [];
  }
}
