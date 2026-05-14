import { CacheConfig } from '../core/types';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * File-based cache with TTL support for crawled pages.
 * Enables incremental re-crawling by storing content with timestamps.
 */
export class CrawlCache {
  private config: Required<CacheConfig>;
  private memoryCache = new Map<string, { data: any; expires: number }>();

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      ttl: config.ttl ?? 3600,
      maxSize: config.maxSize ?? 500,
      directory: config.directory ?? join(process.cwd(), '.webcontext-cache'),
    };

    if (this.config.enabled && this.config.directory) {
      if (!existsSync(this.config.directory)) {
        mkdirSync(this.config.directory, { recursive: true });
      }
    }
  }

  get(url: string): any | null {
    if (!this.config.enabled) return null;

    const key = this.urlToKey(url);

    // Check memory first
    const memEntry = this.memoryCache.get(key);
    if (memEntry && memEntry.expires > Date.now()) {
      return memEntry.data;
    }

    // Check disk
    const filePath = join(this.config.directory, key + '.json');
    if (existsSync(filePath)) {
      const stat = statSync(filePath);
      const age = (Date.now() - stat.mtimeMs) / 1000;
      if (age < this.config.ttl) {
        const data = JSON.parse(readFileSync(filePath, 'utf-8'));
        this.memoryCache.set(key, { data, expires: Date.now() + this.config.ttl * 1000 });
        return data;
      }
    }

    return null;
  }

  set(url: string, data: any): void {
    if (!this.config.enabled) return;

    const key = this.urlToKey(url);
    this.memoryCache.set(key, { data, expires: Date.now() + this.config.ttl * 1000 });

    // Evict if over size
    if (this.memoryCache.size > this.config.maxSize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) this.memoryCache.delete(firstKey);
    }

    // Write to disk
    const filePath = join(this.config.directory, key + '.json');
    writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  }

  has(url: string): boolean {
    return this.get(url) !== null;
  }

  invalidate(url: string): void {
    const key = this.urlToKey(url);
    this.memoryCache.delete(key);
  }

  clear(): void {
    this.memoryCache.clear();
  }

  private urlToKey(url: string): string {
    return createHash('md5').update(url).digest('hex');
  }
}
