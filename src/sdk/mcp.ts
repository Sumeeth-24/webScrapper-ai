import { WebContext } from '../index';
import { CrawlOptions, CrawlResult, ContentChunk } from '../core/types';

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

export function createMCPTools(): MCPTool[] {
  const wc = new WebContext();

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
          pages: result.pages.map(p => ({ title: p.title, url: p.url, markdown: p.markdown })),
          stats: result.stats,
        };
      },
    },
    {
      name: 'webcontext_search',
      description: 'Extract content from a URL and search for specific information.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to search within' },
          query: { type: 'string', description: 'Search query to find relevant sections' },
        },
        required: ['url', 'query'],
      },
      handler: async (input: { url: string; query: string }) => {
        const result = await wc.toChunks(input.url);
        const queryLower = input.query.toLowerCase();
        const relevant = result
          .filter(c => c.content.toLowerCase().includes(queryLower))
          .slice(0, 5);
        return { chunks: relevant.length ? relevant : result.slice(0, 3) };
      },
    },
  ];
}
