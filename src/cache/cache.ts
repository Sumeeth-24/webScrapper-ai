import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import { CacheConfig, ExtractedContent, ContentDiff } from '../core/types';

const urlSchema = z.string().url();

interface FileCacheEntry {
  hash: string;
  timestamp: number;
  data: ExtractedContent;
}

/**
 * Dual-layer cache (LRU memory + file-based) with content hashing for diff detection.
 */
export class CrawlCache {
  private memoryCache: LRUCache<string, ExtractedContent>;
  private hashCache: LRUCache<string, string>;
  private config: CacheConfig;
  private cacheDir: string;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      ttl: config.ttl ?? 3600,
      maxSize: config.maxSize ?? 500,
      directory: config.directory,
      contentHashing: config.contentHashing ?? true,
    };
    this.cacheDir = this.config.directory || join(process.cwd(), '.webcontext-cache');
    if (this.config.enabled && !existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
    this.memoryCache = new LRUCache<string, ExtractedContent>({
      max: this.config.maxSize,
      ttl: this.config.ttl * 1000,
    });
    this.hashCache = new LRUCache<string, string>({
      max: this.config.maxSize,
      ttl: this.config.ttl * 1000,
    });
  }

  private hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private urlToKey(url: string): string {
    return createHash('md5').update(url).digest('hex');
  }

  private readFileEntry(url: string): FileCacheEntry | null {
    const filepath = join(this.cacheDir, this.urlToKey(url) + '.json');
    if (!existsSync(filepath)) return null;
    try {
      const entry: FileCacheEntry = JSON.parse(readFileSync(filepath, 'utf-8'));
      const age = (Date.now() - entry.timestamp) / 1000;
      if (age > this.config.ttl) {
        rmSync(filepath);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  get(url: string): ExtractedContent | undefined {
    if (!this.config.enabled) return undefined;
    try { urlSchema.parse(url); } catch { return undefined; }

    const memResult = this.memoryCache.get(url);
    if (memResult) return memResult;

    const fileEntry = this.readFileEntry(url);
    if (fileEntry) {
      this.memoryCache.set(url, fileEntry.data);
      this.hashCache.set(url, fileEntry.hash);
      return fileEntry.data;
    }
    return undefined;
  }

  set(url: string, content: ExtractedContent): void {
    if (!this.config.enabled) return;
    try { urlSchema.parse(url); } catch { return; }

    const contentHash = this.hash(JSON.stringify(content));
    this.memoryCache.set(url, content);
    this.hashCache.set(url, contentHash);

    const entry: FileCacheEntry = { hash: contentHash, timestamp: Date.now(), data: content };
    const filepath = join(this.cacheDir, this.urlToKey(url) + '.json');
    writeFileSync(filepath, JSON.stringify(entry));
  }

  has(url: string): boolean {
    if (!this.config.enabled) return false;
    if (this.memoryCache.has(url)) return true;
    return this.readFileEntry(url) !== null;
  }

  invalidate(url: string): void {
    this.memoryCache.delete(url);
    this.hashCache.delete(url);
    const filepath = join(this.cacheDir, this.urlToKey(url) + '.json');
    if (existsSync(filepath)) rmSync(filepath);
  }

  clear(): void {
    this.memoryCache.clear();
    this.hashCache.clear();
    if (existsSync(this.cacheDir)) {
      for (const file of readdirSync(this.cacheDir)) {
        if (file.endsWith('.json')) rmSync(join(this.cacheDir, file));
      }
    }
  }

  getContentHash(url: string): string | undefined {
    const memHash = this.hashCache.get(url);
    if (memHash) return memHash;
    const fileEntry = this.readFileEntry(url);
    return fileEntry?.hash;
  }

  hasChanged(url: string, newContent: string): ContentDiff {
    const currentHash = this.hash(newContent);
    const previousHash = this.getContentHash(url) || '';
    const changed = previousHash !== '' && previousHash !== currentHash;

    let addedSections: string[] = [];
    let removedSections: string[] = [];

    if (changed) {
      const cached = this.get(url);
      if (cached) {
        const oldHeadings = cached.headings.map(h => h.text);
        const newHeadings = newContent.match(/^#{1,6}\s+(.+)$/gm)?.map(h => h.replace(/^#+\s+/, '')) || [];
        const oldSet = new Set(oldHeadings);
        const newSet = new Set(newHeadings);
        addedSections = newHeadings.filter(h => !oldSet.has(h));
        removedSections = oldHeadings.filter(h => !newSet.has(h));
      }
    }

    return { url, previousHash, currentHash, changed, addedSections, removedSections };
  }
}
