import { CrawlOptions, CrawlResult, WebContextConfig, OutputFormat, ContextPacket, ContentChunk } from './core/types';
import { CrawlPipeline } from './core/pipeline';

export * from './core/types';
export { CrawlPipeline } from './core/pipeline';
export { BrowserManager } from './browser/manager';
export { ContentExtractor } from './extractors/content';
export { MarkdownTransformer } from './transformers/markdown';
export { ContentChunker } from './chunking/chunker';
export { CrawlCache } from './cache/cache';

/**
 * WebContext - Turn any web content into clean AI-ready context instantly.
 * 
 * @example
 * ```typescript
 * import { WebContext } from 'webcontext';
 * 
 * const wc = new WebContext();
 * const result = await wc.extract('https://docs.example.com/api');
 * console.log(result.markdown);
 * ```
 */
export class WebContext {
  private pipeline: CrawlPipeline;
  private config: WebContextConfig;

  constructor(config: WebContextConfig = {}) {
    this.config = config;
    this.pipeline = new CrawlPipeline(config);
  }

  /** Extract content from a single URL */
  async extract(url: string, options: Partial<CrawlOptions> = {}): Promise<CrawlResult> {
    return this.pipeline.crawl({ url, depth: 0, ...options });
  }

  /** Crawl a documentation site recursively */
  async crawlDocs(url: string, options: Partial<CrawlOptions> = {}): Promise<CrawlResult> {
    return this.pipeline.crawl({ url, depth: options.depth ?? 3, ...options });
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
    const result = await this.extract(url, options);
    return this.formatForLLM(result.context, options.maxTokens);
  }

  /** Extract GitHub README */
  async extractReadme(repoUrl: string): Promise<CrawlResult> {
    // Normalize GitHub URL to raw README
    const normalized = repoUrl.replace(/\/$/, '');
    return this.extract(normalized, { focusMode: 'readme' });
  }

  /** Extract API reference */
  async extractAPI(url: string): Promise<CrawlResult> {
    return this.extract(url, { focusMode: 'api' });
  }

  /** Format context packet for LLM with token budget */
  private formatForLLM(packet: ContextPacket, maxTokens?: number): string {
    const budget = maxTokens ?? 8000;
    let output = `# ${packet.source}\n\n`;
    output += `> Crawled ${packet.metadata.pageCount} pages | ${packet.totalTokens} tokens | ${packet.metadata.contentType}\n\n`;

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
