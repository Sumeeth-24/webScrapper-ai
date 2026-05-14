import { WebContext } from '../index';
import { VectorSearch } from '../search/vector';
import { CrawlOptions, CrawlResult, ContentChunk, SearchResult, WebContextConfig, MetricsData } from '../core/types';
import { z } from 'zod';

const urlSchema = z.string().url();

/**
 * WebContext SDK Client - connects to a running WebContext server or runs locally.
 */
export class WebContextClient {
  private baseUrl?: string;
  private local?: WebContext;

  constructor(options: { serverUrl?: string; config?: WebContextConfig } = {}) {
    if (options.serverUrl) {
      this.baseUrl = options.serverUrl.replace(/\/$/, '');
    } else {
      this.local = new WebContext(options.config);
    }
  }

  async extract(url: string, options: Partial<CrawlOptions> = {}): Promise<CrawlResult> {
    urlSchema.parse(url);
    if (this.local) return this.local.extract(url, options);
    return this.post('/extract', { url, options });
  }

  async crawl(url: string, options: Partial<CrawlOptions> = {}): Promise<CrawlResult> {
    urlSchema.parse(url);
    if (this.local) return this.local.crawlDocs(url, options);
    return this.post('/crawl', { url, options });
  }

  async toMarkdown(url: string): Promise<string> {
    urlSchema.parse(url);
    if (this.local) return this.local.toMarkdown(url);
    const res = await this.post('/extract', { url });
    return res.markdown;
  }

  async toChunks(url: string, options: Partial<CrawlOptions> = {}): Promise<ContentChunk[]> {
    urlSchema.parse(url);
    if (this.local) return this.local.toChunks(url, options);
    const res = await this.post('/chunks', { url, options });
    return res.chunks;
  }

  async toContext(url: string, maxTokens = 8000): Promise<string> {
    urlSchema.parse(url);
    if (this.local) return this.local.toContext(url, { maxTokens });
    const res = await this.post('/context', { url, maxTokens });
    return res.context;
  }

  async search(url: string, query: string, topK = 5): Promise<SearchResult[]> {
    urlSchema.parse(url);
    if (this.local) return this.local.search(url, query, topK);
    const res = await this.post('/search', { url, query, topK });
    return res.results;
  }

  async getMetrics(): Promise<MetricsData> {
    if (!this.baseUrl) throw new Error('Metrics only available in remote mode');
    return this.get('/metrics');
  }

  async scheduleJob(id: string, config: { cron: string; urls: string[]; options?: Partial<CrawlOptions> }): Promise<{ id: string; status: string }> {
    config.urls.forEach(u => urlSchema.parse(u));
    return this.post('/schedule', { id, ...config });
  }

  async cancelJob(id: string): Promise<{ id: string; status: string }> {
    const response = await fetch(`${this.baseUrl}/schedule/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  private async post(path: string, body: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  private async get(path: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
}

/**
 * LangChain-compatible document loader.
 */
export class WebContextLoader {
  private client: WebContextClient;

  constructor(options: { serverUrl?: string; config?: WebContextConfig } = {}) {
    this.client = new WebContextClient(options);
  }

  async load(url: string, options: Partial<CrawlOptions> = {}): Promise<Array<{ pageContent: string; metadata: Record<string, any> }>> {
    const chunks = await this.client.toChunks(url, options);
    return chunks.map(chunk => ({
      pageContent: chunk.content,
      metadata: {
        source: chunk.metadata.sourceUrl,
        title: chunk.metadata.title,
        headingPath: chunk.metadata.headingPath,
        chunkIndex: chunk.metadata.chunkIndex,
        hasCode: chunk.metadata.hasCode,
        language: chunk.metadata.language,
      },
    }));
  }
}
