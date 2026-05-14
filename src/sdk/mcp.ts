import { WebContext } from '../index';
import { VectorSearch } from '../search/vector';
import { CrawlOptions, SearchResult } from '../core/types';

/**
 * MCP (Model Context Protocol) Server for WebContext.
 * Exposes web extraction as tools for AI agents.
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (input: any) => Promise<any>;
}

export function createMCPTools(config?: any): MCPTool[] {
  const wc = new WebContext(config);

  return [
    {
      name: 'webcontext_extract',
      description: 'Extract clean content from a web URL. Returns markdown with code blocks preserved.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to extract content from' },
          focus: { type: 'string', enum: ['full', 'article', 'code', 'api', 'readme'], description: 'Content focus mode' },
          maxTokens: { type: 'number', description: 'Maximum tokens in output' },
        },
        required: ['url'],
      },
      handler: async (input: { url: string; focus?: string; maxTokens?: number }) => {
        const context = await wc.toContext(input.url, {
          focusMode: (input.focus as any) || 'full',
          maxTokens: input.maxTokens,
        });
        return { content: context };
      },
    },
    {
      name: 'webcontext_crawl',
      description: 'Crawl a documentation site and return structured content.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Base URL to crawl' },
          depth: { type: 'number', description: 'Crawl depth (default: 2)' },
          maxPages: { type: 'number', description: 'Max pages (default: 20)' },
        },
        required: ['url'],
      },
      handler: async (input: { url: string; depth?: number; maxPages?: number }) => {
        const result = await wc.crawlDocs(input.url, {
          depth: input.depth ?? 2,
          maxPages: input.maxPages ?? 20,
        });
        return {
          pages: result.pages.map(p => ({ title: p.title, url: p.url, markdown: p.markdown.slice(0, 2000) })),
          stats: result.stats,
        };
      },
    },
    {
      name: 'webcontext_search',
      description: 'Extract content from a URL and perform semantic search for specific information.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to search within' },
          query: { type: 'string', description: 'Search query to find relevant sections' },
          topK: { type: 'number', description: 'Number of results (default: 5)' },
        },
        required: ['url', 'query'],
      },
      handler: async (input: { url: string; query: string; topK?: number }) => {
        const results = await wc.search(input.url, input.query, input.topK ?? 5);
        return { results: results.map(r => ({ content: r.chunk.content, score: r.score, metadata: r.chunk.metadata })) };
      },
    },
    {
      name: 'webcontext_chunk',
      description: 'Get RAG-ready content chunks from a URL.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to chunk' },
          maxTokens: { type: 'number', description: 'Max tokens per chunk (default: 1500)' },
        },
        required: ['url'],
      },
      handler: async (input: { url: string; maxTokens?: number }) => {
        const chunks = await wc.toChunks(input.url);
        return { chunks: chunks.map(c => ({ id: c.id, content: c.content, tokens: c.tokens, metadata: c.metadata })), count: chunks.length };
      },
    },
    {
      name: 'webcontext_summarize',
      description: 'Get an extractive summary of a web page.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to summarize' },
        },
        required: ['url'],
      },
      handler: async (input: { url: string }) => {
        const result = await wc.extract(input.url);
        return {
          title: result.pages[0]?.title,
          summary: result.context.summary,
          pageCount: result.stats.pagesProcessed,
          totalTokens: result.stats.totalTokens,
        };
      },
    },
  ];
}
