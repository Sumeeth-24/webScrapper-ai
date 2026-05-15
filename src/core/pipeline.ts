import {
  CrawlOptions, CrawlResult, CrawlStats, CrawlCheckpoint, CrawlProgress,
  WebContextPlugin, ContentDiff, PageRelationship, ContextPacket,
  ContentChunk, ExtractedContent, WebContextConfig, CrawlError,
} from './types';
import { BrowserManager } from '../browser/manager';
import { ContentExtractor } from '../extractors/content';
import { PdfExtractor } from '../extractors/pdf';
import { GitHubExtractor } from '../extractors/github';
import { MarkdownTransformer } from '../transformers/markdown';
import { ContentChunker } from '../chunking/chunker';
import { CrawlCache } from '../cache/cache';
import { SitemapParser } from '../utils/sitemap';
import { Deduplicator } from '../utils/dedup';
import PQueue from 'p-queue';
import { createHash } from 'crypto';
import * as cheerio from 'cheerio';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Main crawling pipeline that orchestrates the full extraction workflow:
 * URL → Fetch → Extract → Transform → Chunk → Output
 */
export class CrawlPipeline {
  private browser: BrowserManager;
  private extractor: ContentExtractor;
  private pdfExtractor: PdfExtractor;
  private githubExtractor: GitHubExtractor;
  private transformer: MarkdownTransformer;
  private chunker: ContentChunker;
  private cache: CrawlCache;
  private sitemapParser: SitemapParser;
  private dedup: Deduplicator;
  private config: WebContextConfig;

  constructor(config: WebContextConfig = {}) {
    this.config = config;
    this.browser = new BrowserManager(config.browser, config.rateLimit);
    this.extractor = new ContentExtractor();
    this.pdfExtractor = new PdfExtractor();
    this.githubExtractor = new GitHubExtractor();
    this.transformer = new MarkdownTransformer({
      preserveImages: config.extraction?.preserveImages,
    });
    this.chunker = new ContentChunker(config.chunking);
    this.cache = new CrawlCache({
      enabled: config.cache?.enabled ?? true,
      ttl: config.cache?.ttl ?? 3600,
      maxSize: config.cache?.maxSize ?? 500,
      directory: config.cache?.directory,
      contentHashing: config.cache?.contentHashing ?? true,
    });
    this.sitemapParser = new SitemapParser();
    this.dedup = new Deduplicator();
  }

  async crawl(options: CrawlOptions): Promise<CrawlResult> {
    const startTime = Date.now();
    const pages: ExtractedContent[] = [];
    const errors: CrawlError[] = [];
    const diffs: ContentDiff[] = [];
    const visited = new Set<string>();
    const maxPages = options.maxPages ?? 50;
    const depth = options.depth ?? 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let retries = 0;

    // Load checkpoint if resuming
    let checkpoint: CrawlCheckpoint | null = null;
    if (options.checkpoint && options.checkpointDir) {
      checkpoint = this.loadCheckpoint(options.checkpointDir);
      if (checkpoint) {
        checkpoint.visitedUrls.forEach(u => visited.add(u));
        pages.push(...checkpoint.pages);
        errors.push(...checkpoint.errors);
      }
    }

    // Discover URLs: sitemap or link-based crawling
    let queue: string[] = [];
    if (options.sitemapUrl) {
      queue = await this.parseSitemap(options.sitemapUrl);
    } else if (checkpoint?.pendingUrls?.length) {
      queue = checkpoint.pendingUrls;
    } else {
      // Auto-discover sitemap before crawling
      if (depth > 0) {
        const sitemapUrl = await this.sitemapParser.discover(options.url).catch(() => null);
        if (sitemapUrl) {
          const entries = await this.sitemapParser.parse(sitemapUrl).catch(() => []);
          if (entries.length > 0) {
            queue = entries
              .map(e => e.url)
              .filter(u => this.matchesPatterns(u, options.includePatterns, options.excludePatterns))
              .slice(0, maxPages);
          }
        }
      }
      if (!queue.length) queue = [options.url];
    }

    // Handle special sources: PDF and GitHub
    if (this.pdfExtractor.isPdf(options.url)) {
      return this.handlePdf(options, startTime);
    }
    if (this.githubExtractor.isGitHubUrl(options.url)) {
      return this.handleGitHub(options, startTime);
    }

    // Initialize browser only if JS rendering is explicitly requested
    if (options.javascript === true) {
      await this.browser.launch();
    }

    const concurrency = this.config.concurrency ?? 3;
    const pQueue = new PQueue({ concurrency });

    const processUrl = async (url: string, currentDepth: number) => {
      if (visited.has(url) || pages.length >= maxPages) return;
      visited.add(url);

      // Progress callback
      options.onProgress?.({
        pagesProcessed: pages.length,
        totalDiscovered: visited.size + queue.length,
        currentUrl: url,
        status: 'crawling',
      });

      try {
        // Run pre-fetch plugins
        let ctx: any = { url };
        ctx = await this.runPlugins('pre-fetch', ctx, options.plugins);

        // Check cache first
        if (options.cache !== false) {
          const cached = this.cache.get(url);
          if (cached) {
            cacheHits++;
            pages.push(cached);

            // Check for content changes if hashing enabled
            if (this.config.cache?.contentHashing) {
              // We'll compare on next fresh fetch
            }

            // Still discover links for recursive crawl
            if (currentDepth < depth) {
              const newUrls = cached.links
                .filter(l => l.isInternal)
                .filter(l => this.matchesPatterns(l.href, options.includePatterns, options.excludePatterns))
                .filter(l => !visited.has(l.href))
                .map(l => l.href);
              for (const newUrl of newUrls.slice(0, maxPages - pages.length)) {
                pQueue.add(() => processUrl(newUrl, currentDepth + 1));
              }
            }
            return;
          }
          cacheMisses++;
        }

        // Fetch page
        let html: string;
        let status: number;
        if (options.javascript === true) {
          const result = await this.browser.fetchPage(url, {
            respectRobots: options.respectRobotsTxt,
            cookies: options.cookies,
            headers: options.headers,
            retryConfig: options.retry,
          });
          html = result.content;
          status = result.status;
        } else {
          const result = await this.browser.fetchStatic(url, {
            respectRobots: options.respectRobotsTxt,
            headers: options.headers,
            retryConfig: options.retry,
          });
          html = result.body.toString('utf-8');
          status = result.status;
        }

        if (status >= 400) {
          errors.push({ url, error: `HTTP ${status}`, statusCode: status });
          return;
        }

        // Run post-fetch plugins
        ctx = await this.runPlugins('post-fetch', { ...ctx, html }, options.plugins);
        const finalHtml = ctx.html ?? html;

        // Run pre-extract plugins
        ctx = await this.runPlugins('pre-extract', ctx, options.plugins);

        // Extract content
        const extracted = this.extractor.extract(finalHtml, url, options.focusMode);

        // Run post-extract plugins
        ctx = await this.runPlugins('post-extract', { ...ctx, extracted }, options.plugins);
        const finalExtracted: ExtractedContent = ctx.extracted ?? extracted;

        // Run pre-transform plugins
        ctx = await this.runPlugins('pre-transform', ctx, options.plugins);

        // Transform to markdown
        finalExtracted.markdown = this.transformer.transform(finalExtracted.html || '');

        // Run post-transform plugins
        ctx = await this.runPlugins('post-transform', { ...ctx, markdown: finalExtracted.markdown }, options.plugins);
        if (ctx.markdown) finalExtracted.markdown = ctx.markdown;

        // Resolve relative links to absolute URLs
        finalExtracted.markdown = this.resolveLinks(finalExtracted.markdown, url);

        // Deduplication check
        const dupOf = this.dedup.isDuplicate(url, finalExtracted.text);
        if (dupOf) {
          return; // Skip duplicate content
        }

        // Check content diff
        if (options.cache !== false && this.config.cache?.contentHashing) {
          const diff = this.cache.hasChanged(url, finalExtracted.markdown);
          if (diff.changed) diffs.push(diff);
        }

        // Cache result
        if (options.cache !== false) {
          this.cache.set(url, finalExtracted);
        }

        pages.push(finalExtracted);

        // Queue internal links for recursive crawl
        if (currentDepth < depth) {
          const newUrls = finalExtracted.links
            .filter(l => l.isInternal)
            .filter(l => this.matchesPatterns(l.href, options.includePatterns, options.excludePatterns))
            .filter(l => !visited.has(l.href))
            .map(l => l.href);
          for (const newUrl of newUrls.slice(0, maxPages - pages.length)) {
            pQueue.add(() => processUrl(newUrl, currentDepth + 1));
          }
        }

        // Respect delay
        if (options.delay) {
          await new Promise(r => setTimeout(r, options.delay));
        }

        // Save checkpoint
        if (options.checkpoint && options.checkpointDir) {
          this.saveCheckpoint({
            visitedUrls: [...visited],
            pendingUrls: queue.filter(u => !visited.has(u)),
            pages,
            errors,
            timestamp: new Date().toISOString(),
          }, options.checkpointDir);
        }
      } catch (err: any) {
        errors.push({ url, error: err.message });
      }
    };

    // Process initial queue
    for (const url of queue) {
      if (pages.length >= maxPages) break;
      pQueue.add(() => processUrl(url, 0));
    }

    await pQueue.onIdle();

    // Build chunks from all pages
    const allChunks: ContentChunk[] = [];
    for (const page of pages) {
      // Run pre-chunk plugins
      let ctx: any = { page };
      ctx = await this.runPlugins('pre-chunk', ctx, options.plugins);

      const chunks = this.chunker.chunk(
        page.markdown,
        page.url,
        page.title,
        page.headings,
        this.config.chunking,
      );

      // Run post-chunk plugins
      ctx = await this.runPlugins('post-chunk', { ...ctx, chunks }, options.plugins);
      allChunks.push(...(ctx.chunks ?? chunks));
    }

    const relationships = this.buildRelationships(pages);
    const totalTokens = allChunks.reduce((sum, c) => sum + c.tokens, 0);
    const summary = this.generateSummary(pages);

    const context: ContextPacket = {
      id: createHash('sha256').update(options.url + Date.now()).digest('hex').slice(0, 16),
      source: options.url,
      chunks: allChunks,
      summary,
      totalTokens,
      metadata: {
        crawledAt: new Date().toISOString(),
        pageCount: pages.length,
        contentType: pages[0]?.metadata.type || 'unknown',
        framework: pages[0]?.metadata.framework,
        version: pages[0]?.metadata.version,
        relationships,
      },
      format: this.config.output?.format || 'markdown',
    };

    const stats: CrawlStats = {
      pagesProcessed: pages.length,
      totalTokens,
      duration: Date.now() - startTime,
      errors,
      cached: cacheHits,
      cacheHits,
      cacheMisses,
      retries,
    };

    // Notify completion
    options.onProgress?.({
      pagesProcessed: pages.length,
      totalDiscovered: visited.size,
      currentUrl: '',
      status: 'complete',
    });

    // Cleanup browser (chunker is reusable, disposed via WebContext.dispose())
    await this.browser.close();

    return { pages, context, stats, diffs: diffs.length ? diffs : undefined };
  }

  private async parseSitemap(sitemapUrl: string): Promise<string[]> {
    try {
      const result = await this.browser.fetchStatic(sitemapUrl);
      const xml = result.body.toString('utf-8');
      const $ = cheerio.load(xml, { xmlMode: true });
      return $('url > loc').map((_, el) => $(el).text()).get();
    } catch {
      return [];
    }
  }

  private saveCheckpoint(state: CrawlCheckpoint, dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'checkpoint.json'), JSON.stringify(state));
  }

  private loadCheckpoint(dir: string): CrawlCheckpoint | null {
    const file = join(dir, 'checkpoint.json');
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf-8'));
    } catch {
      return null;
    }
  }

  private async runPlugins(phase: string, ctx: any, plugins?: WebContextPlugin[]): Promise<any> {
    if (!plugins?.length) return ctx;
    for (const plugin of plugins) {
      if (plugin.hooks[phase]) {
        ctx = (await plugin.hooks[phase](ctx)) || ctx;
      }
    }
    return ctx;
  }

  private generateSummary(pages: ExtractedContent[]): string {
    const combined = pages.map(p => p.text).join(' ');
    const sentences = combined.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 3).join(' ').trim();
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

  private matchesPatterns(url: string, include?: string[], exclude?: string[]): boolean {
    if (exclude?.some(p => url.includes(p))) return false;
    if (include?.length && !include.some(p => url.includes(p))) return false;
    return true;
  }

  /** Resolve relative markdown links to absolute URLs */
  private resolveLinks(markdown: string, baseUrl: string): string {
    return markdown.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, href) => {
      if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) return match;
      try {
        const resolved = new URL(href, baseUrl).href;
        return `[${text}](${resolved})`;
      } catch {
        return match;
      }
    });
  }

  /** Handle PDF extraction */
  private async handlePdf(options: CrawlOptions, startTime: number): Promise<CrawlResult> {
    const extracted = await this.pdfExtractor.extract(options.url);
    const chunks = this.chunker.chunk(
      extracted.markdown, extracted.url, extracted.title, extracted.headings, this.config.chunking,
    );
    const totalTokens = chunks.reduce((s, c) => s + c.tokens, 0);
    return {
      pages: [extracted],
      context: {
        id: createHash('sha256').update(options.url).digest('hex').slice(0, 16),
        source: options.url,
        chunks,
        summary: extracted.description,
        totalTokens,
        metadata: {
          crawledAt: new Date().toISOString(),
          pageCount: 1,
          contentType: 'documentation',
          relationships: [],
        },
        format: 'markdown',
      },
      stats: {
        pagesProcessed: 1, totalTokens, duration: Date.now() - startTime,
        errors: [], cached: 0, cacheHits: 0, cacheMisses: 0, retries: 0,
      },
    };
  }

  /** Handle GitHub repository extraction */
  private async handleGitHub(options: CrawlOptions, startTime: number): Promise<CrawlResult> {
    const pages: ExtractedContent[] = [];

    // Always get README
    const readme = await this.githubExtractor.extractReadme(options.url);
    pages.push(readme);

    // If depth > 0, also get docs folder
    if ((options.depth ?? 0) > 0) {
      const docs = await this.githubExtractor.extractDocs(options.url);
      pages.push(...docs.slice(0, (options.maxPages ?? 50) - 1));
    }

    const allChunks: ContentChunk[] = [];
    for (const page of pages) {
      const chunks = this.chunker.chunk(
        page.markdown, page.url, page.title, page.headings, this.config.chunking,
      );
      allChunks.push(...chunks);
    }

    const totalTokens = allChunks.reduce((s, c) => s + c.tokens, 0);
    return {
      pages,
      context: {
        id: createHash('sha256').update(options.url).digest('hex').slice(0, 16),
        source: options.url,
        chunks: allChunks,
        summary: pages[0]?.description,
        totalTokens,
        metadata: {
          crawledAt: new Date().toISOString(),
          pageCount: pages.length,
          contentType: 'readme',
          relationships: this.buildRelationships(pages),
        },
        format: 'markdown',
      },
      stats: {
        pagesProcessed: pages.length, totalTokens, duration: Date.now() - startTime,
        errors: [], cached: 0, cacheHits: 0, cacheMisses: 0, retries: 0,
      },
    };
  }

  /** Free resources (tiktoken encoder) */
  dispose(): void {
    this.chunker.dispose();
    this.dedup.clear();
  }
}
