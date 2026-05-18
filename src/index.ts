export * from './core/types';
export { CrawlPipeline } from './core/pipeline';
export { CrawlStream } from './core/stream';
export { BrowserManager } from './browser/manager';
export { ContentExtractor } from './extractors/content';
export { PdfExtractor } from './extractors/pdf';
export { GitHubExtractor } from './extractors/github';
export { ImageExtractor } from './extractors/images';
export { ScreenshotCapture } from './extractors/screenshot';
export { MarkdownTransformer } from './transformers/markdown';
export { ContentChunker } from './chunking/chunker';
export { CrawlCache } from './cache/cache';
export { VectorSearch } from './search/vector';
export { VectorDBExporter, VectorDBExportOptions, OutputFormatter, OutputTemplate } from './export';
export { SitemapParser } from './utils/sitemap';
export { MetricsCollector } from './utils/metrics';
export { CrawlScheduler } from './utils/scheduler';
export { Deduplicator } from './utils/dedup';
export { WebhookNotifier, WebhookConfig } from './utils/webhook';
export { validateUrl, validateCrawlOptions } from './utils/validation';

import {
  WebContextConfig, CrawlOptions, CrawlResult, ContentChunk,
  ContextPacket, SearchResult, MetricsData,
} from './core/types';
import { CrawlPipeline } from './core/pipeline';
import { CrawlStream } from './core/stream';
import { VectorSearch } from './search/vector';
import { VectorDBExporter, VectorDBExportOptions } from './export';
import { WebhookNotifier, WebhookConfig } from './utils/webhook';
import { MetricsCollector } from './utils/metrics';
import { validateUrl } from './utils/validation';

/**
 * WebContext - Turn any web content into clean AI-ready context instantly.
 */
export class WebContext {
  private pipeline: CrawlPipeline;
  private vectorSearch: VectorSearch;
  private metrics: MetricsCollector | null;
  private webhooks: WebhookNotifier | null = null;
  private config: WebContextConfig;

  constructor(config: WebContextConfig = {}) {
    this.config = config;
    this.pipeline = new CrawlPipeline(config);
    this.vectorSearch = new VectorSearch();
    this.metrics = config.metrics ? new MetricsCollector() : null;
  }

  /** Extract content from a single URL */
  async extract(url: string, options: Partial<CrawlOptions> = {}): Promise<CrawlResult> {
    validateUrl(url);
    const start = Date.now();
    const result = await this.pipeline.crawl({ url, depth: 0, ...options });
    if (this.metrics) {
      this.metrics.recordCrawl(result.stats.pagesProcessed, result.stats.totalTokens, Date.now() - start);
    }
    return result;
  }

  /** Crawl a documentation site recursively */
  async crawlDocs(url: string, options: Partial<CrawlOptions> = {}): Promise<CrawlResult> {
    validateUrl(url);
    const start = Date.now();
    const result = await this.pipeline.crawl({ url, depth: options.depth ?? 3, ...options });
    if (this.metrics) {
      this.metrics.recordCrawl(result.stats.pagesProcessed, result.stats.totalTokens, Date.now() - start);
    }
    return result;
  }

  /** Extract and return only markdown */
  async toMarkdown(url: string, options: Partial<CrawlOptions> = {}): Promise<string> {
    const result = await this.extract(url, options);
    return result.pages.map(p => p.markdown).join('\n\n---\n\n');
  }

  /** Extract and return chunked content for RAG */
  async toChunks(url: string, options: Partial<CrawlOptions> = {}): Promise<ContentChunk[]> {
    const result = await this.extract(url, options);
    return result.context.chunks;
  }

  /** Extract and return a context packet optimized for LLM consumption */
  async toContext(url: string, options: Partial<CrawlOptions> & { maxTokens?: number } = {}): Promise<string> {
    const { maxTokens, ...crawlOptions } = options;
    const result = await this.extract(url, crawlOptions);
    return this.formatForLLM(result.context, maxTokens);
  }

  /** Semantic search within a page's content */
  async search(url: string, query: string, topK: number = 5, options: Partial<CrawlOptions> = {}): Promise<SearchResult[]> {
    const chunks = await this.toChunks(url, options);
    this.vectorSearch.index(chunks);
    return this.vectorSearch.search(query, topK);
  }

  /** Extract GitHub README */
  async extractReadme(repoUrl: string): Promise<CrawlResult> {
    validateUrl(repoUrl);
    return this.extract(repoUrl.replace(/\/$/, ''));
  }

  /** Extract GitHub repo with docs */
  async extractGitHub(repoUrl: string, options: Partial<CrawlOptions> = {}): Promise<CrawlResult> {
    return this.crawlDocs(repoUrl, { depth: 1, ...options });
  }

  /** Extract content from a PDF (URL or local path) */
  async extractPdf(source: string): Promise<CrawlResult> {
    if (source.startsWith('http')) {
      return this.extract(source);
    }
    // Local file — bypass URL validation, call pipeline directly
    const result = await this.pipeline.crawl({ url: source, depth: 0 });
    return result;
  }

  /** Extract API reference */
  async extractAPI(url: string): Promise<CrawlResult> {
    return this.extract(url, { focusMode: 'api' });
  }

  /** Export chunks in vector DB format */
  async exportForVectorDB(url: string, options: VectorDBExportOptions & Partial<CrawlOptions> = { format: 'json' }): Promise<string> {
    const { format, namespace, collection, includeMetadata, ...crawlOptions } = options;
    const result = await this.extract(url, crawlOptions);
    const exporter = new VectorDBExporter();
    return exporter.exportChunks(result.context.chunks, { format, namespace, collection, includeMetadata });
  }

  /** Stream crawl results in real-time */
  extractStream(url: string, options: Partial<CrawlOptions> = {}): CrawlStream {
    const stream = new CrawlStream();
    validateUrl(url);
    // Run crawl async and emit events
    this.pipeline.crawl({ url, depth: 0, ...options, onProgress: (p) => stream.emitProgress(p) })
      .then((result) => {
        for (const page of result.pages) stream.emitPage(page);
        stream.emitChunks(result.context.chunks);
        if (result.diffs?.length) stream.emitDone(result);
        else stream.emitDone(result);
      })
      .catch((err) => stream.emitError({ url, error: err.message }));
    return stream;
  }

  /** Register a webhook for crawl notifications */
  registerWebhook(config: WebhookConfig): void {
    if (!this.webhooks) this.webhooks = new WebhookNotifier();
    this.webhooks.register(config);
  }

  /** Get collected metrics */
  getMetrics(): MetricsData | null {
    return this.metrics?.getMetrics() ?? null;
  }

  /** Cleanup resources */
  dispose(): void {
    this.vectorSearch.clear();
    this.pipeline.dispose();
  }

  private formatForLLM(packet: ContextPacket, maxTokens?: number): string {
    const budget = maxTokens ?? 8000;
    let output = `# ${packet.source}\n\n`;
    if (packet.summary) output += `> ${packet.summary}\n\n`;
    output += `> ${packet.metadata.pageCount} pages | ${packet.totalTokens} tokens | ${packet.metadata.contentType}\n\n`;

    let usedTokens = Math.ceil(output.length / 4);
    for (const chunk of packet.chunks) {
      if (usedTokens + chunk.tokens > budget) break;
      if (chunk.metadata.headingPath.length) {
        output += `## ${chunk.metadata.headingPath.join(' > ')}\n\n`;
      }
      output += chunk.content + '\n\n';
      usedTokens += chunk.tokens;
    }
    return output.trim();
  }
}

export default WebContext;
