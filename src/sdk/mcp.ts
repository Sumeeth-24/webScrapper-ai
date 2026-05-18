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
    {
      name: 'webcontext_github',
      description: 'Extract README and docs from a GitHub repository.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'GitHub repository URL (e.g., https://github.com/user/repo)' },
          includeDocs: { type: 'boolean', description: 'Also extract /docs folder (default: true)' },
        },
        required: ['url'],
      },
      handler: async (input: { url: string; includeDocs?: boolean }) => {
        const result = await wc.extractGitHub(input.url, { depth: input.includeDocs !== false ? 1 : 0 });
        return {
          pages: result.pages.map(p => ({ title: p.title, url: p.url, markdown: p.markdown.slice(0, 3000) })),
          stats: result.stats,
        };
      },
    },
    {
      name: 'webcontext_pdf',
      description: 'Extract text content from a PDF file (URL or local path).',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'PDF URL or local file path' },
        },
        required: ['source'],
      },
      handler: async (input: { source: string }) => {
        const result = await wc.extractPdf(input.source);
        return {
          title: result.pages[0]?.title,
          markdown: result.pages[0]?.markdown.slice(0, 5000),
          chunks: result.context.chunks.length,
          totalTokens: result.stats.totalTokens,
        };
      },
    },
    {
      name: 'webcontext_pipeline',
      description: 'Full AI data pipeline: crawl → chunk → export for vector DB. One tool to ingest any web content into your RAG system.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL, PDF path, or GitHub repo URL to ingest' },
          depth: { type: 'number', description: 'Crawl depth (default: 2)' },
          maxPages: { type: 'number', description: 'Max pages to crawl (default: 50)' },
          chunkStrategy: { type: 'string', enum: ['semantic', 'heading', 'paragraph', 'fixed'], description: 'Chunking strategy (default: semantic)' },
          maxTokensPerChunk: { type: 'number', description: 'Max tokens per chunk (default: 1500)' },
          exportFormat: { type: 'string', enum: ['pinecone', 'chroma', 'weaviate', 'qdrant', 'json'], description: 'Vector DB export format (default: json)' },
          namespace: { type: 'string', description: 'Namespace/collection name for vector DB' },
        },
        required: ['url'],
      },
      handler: async (input: { url: string; depth?: number; maxPages?: number; chunkStrategy?: string; maxTokensPerChunk?: number; exportFormat?: string; namespace?: string }) => {
        const pipelineWc = new WebContext({
          chunking: { maxTokens: input.maxTokensPerChunk ?? 1500, strategy: (input.chunkStrategy as any) ?? 'semantic', overlap: 100 },
          cache: { enabled: true, ttl: 3600, maxSize: 500, contentHashing: true },
        });
        try {
          const result = await pipelineWc.crawlDocs(input.url, { depth: input.depth ?? 2, maxPages: input.maxPages ?? 50 });
          const { VectorDBExporter } = await import('../export');
          const exporter = new VectorDBExporter();
          const exported = exporter.exportChunks(result.context.chunks, {
            format: (input.exportFormat as any) ?? 'json',
            namespace: input.namespace,
          });
          return {
            summary: `Crawled ${result.stats.pagesProcessed} pages, ${result.context.chunks.length} chunks, ${result.stats.totalTokens} tokens`,
            pages: result.pages.map(p => p.title),
            chunks: result.context.chunks.length,
            totalTokens: result.stats.totalTokens,
            exportFormat: input.exportFormat ?? 'json',
            exportedData: exported.slice(0, 5000),
            diffs: result.diffs?.filter(d => d.changed).map(d => ({ url: d.url, added: d.addedSections, removed: d.removedSections })) || [],
          };
        } finally {
          pipelineWc.dispose();
        }
      },
    },
  ];
}
