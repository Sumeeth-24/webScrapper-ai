import { CrawlOptions, CrawlResult, ExtractedContent, ContextPacket, ContentChunk, CrawlStats, CrawlError, WebContextConfig, PageRelationship } from '../core/types';
import { BrowserManager } from '../browser/manager';
import { ContentExtractor } from '../extractors/content';
import { MarkdownTransformer } from '../transformers/markdown';
import { ContentChunker } from '../chunking/chunker';
import { CrawlCache } from '../cache/cache';
import { createHash } from 'crypto';

/**
 * Main crawling pipeline that orchestrates the full extraction workflow:
 * URL → Fetch → Extract → Transform → Chunk → Output
 */
export class CrawlPipeline {
  private browser: BrowserManager;
  private extractor: ContentExtractor;
  private transformer: MarkdownTransformer;
  private chunker: ContentChunker;
  private cache: CrawlCache;
  private config: WebContextConfig;

  constructor(config: WebContextConfig = {}) {
    this.config = config;
    this.browser = new BrowserManager(config.browser);
    this.extractor = new ContentExtractor();
    this.transformer = new MarkdownTransformer();
    this.chunker = new ContentChunker(config.chunking);
    this.cache = new CrawlCache(config.cache);
  }

  async crawl(options: CrawlOptions): Promise<CrawlResult> {
    const startTime = Date.now();
    const pages: ExtractedContent[] = [];
    const errors: CrawlError[] = [];
    const visited = new Set<string>();
    const queue: string[] = [options.url];
    let cached = 0;

    const maxPages = options.maxPages ?? 50;
    const depth = options.depth ?? 0;

    try {
      while (queue.length > 0 && pages.length < maxPages) {
        const url = queue.shift()!;
        if (visited.has(url)) continue;
        visited.add(url);

        try {
          // Check cache
          if (options.cache !== false) {
            const cachedContent = this.cache.get(url);
            if (cachedContent) {
              pages.push(cachedContent);
              cached++;
              continue;
            }
          }

          // Fetch page
          const { html, status } = options.javascript !== false
            ? await this.browser.fetchPage(url, {
                waitForSelector: options.waitForSelector,
                timeout: options.timeout,
                cookies: options.cookies,
                headers: options.headers,
              })
            : await this.browser.fetchStatic(url, options.headers);

          if (status >= 400) {
            errors.push({ url, error: `HTTP ${status}`, statusCode: status });
            continue;
          }

          // Extract content
          const extracted = this.extractor.extract(html, url, options.focusMode);

          // Transform to markdown
          extracted.markdown = this.transformer.transform(extracted.html || '');

          // Cache result
          if (options.cache !== false) {
            this.cache.set(url, extracted);
          }

          pages.push(extracted);

          // Queue internal links for recursive crawl
          if (depth > 0 && this.getCurrentDepth(url, options.url) < depth) {
            const newUrls = extracted.links
              .filter(l => l.isInternal)
              .filter(l => this.matchesPatterns(l.href, options.includePatterns, options.excludePatterns))
              .map(l => l.href);
            queue.push(...newUrls);
          }

          // Respect delay
          if (options.delay) {
            await new Promise(r => setTimeout(r, options.delay));
          }
        } catch (err: any) {
          errors.push({ url, error: err.message });
        }
      }

      // Build context packet
      const allChunks: ContentChunk[] = [];
      for (const page of pages) {
        const chunks = this.chunker.chunk(page.markdown, {
          sourceUrl: page.url,
          title: page.title,
          headings: page.headings,
        });
        allChunks.push(...chunks);
      }

      const relationships = this.buildRelationships(pages);
      const totalTokens = allChunks.reduce((sum, c) => sum + c.tokens, 0);

      const context: ContextPacket = {
        id: createHash('sha256').update(options.url + Date.now()).digest('hex').slice(0, 16),
        source: options.url,
        chunks: allChunks,
        totalTokens,
        metadata: {
          crawledAt: new Date().toISOString(),
          pageCount: pages.length,
          contentType: pages[0]?.metadata.type || 'unknown',
          framework: pages[0]?.metadata.framework,
          relationships,
        },
        format: this.config.output?.format || 'markdown',
      };

      const stats: CrawlStats = {
        pagesProcessed: pages.length,
        totalTokens,
        duration: Date.now() - startTime,
        errors,
        cached,
      };

      return { pages, context, stats };
    } finally {
      await this.browser.close();
    }
  }

  private getCurrentDepth(url: string, baseUrl: string): number {
    const basePath = new URL(baseUrl).pathname;
    const currentPath = new URL(url).pathname;
    const relative = currentPath.replace(basePath, '');
    return relative.split('/').filter(Boolean).length;
  }

  private matchesPatterns(url: string, include?: string[], exclude?: string[]): boolean {
    if (exclude?.some(p => url.includes(p))) return false;
    if (include?.length && !include.some(p => url.includes(p))) return false;
    return true;
  }

  private buildRelationships(pages: ExtractedContent[]): PageRelationship[] {
    const relationships: PageRelationship[] = [];
    const urls = new Set(pages.map(p => p.url));

    for (const page of pages) {
      for (const link of page.links) {
        if (urls.has(link.href) && link.href !== page.url) {
          relationships.push({ from: page.url, to: link.href, type: 'links-to' });
        }
      }
    }
    return relationships;
  }
}
