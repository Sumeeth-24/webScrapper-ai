# WebContext AI

> Turn any web content into clean AI-ready context — with crawling, chunking, semantic search, vector DB export, and MCP tools.

WebContext is a developer tool that crawls, extracts, cleans, and structures web content for consumption by LLMs, RAG pipelines, and AI agents. Think of it as Firecrawl — but open-source, self-hosted, and optimized for developer documentation.

## Features

- **Smart Extraction** — Removes ads, navigation, cookie banners, and noise automatically
- **Code Preservation** — Keeps code blocks intact with language detection (15+ languages)
- **Recursive Crawling** — Crawl entire documentation sites with depth control and sitemap support
- **Token-Aware Chunking** — Semantic, heading-based, paragraph, or fixed-size chunking using tiktoken
- **Semantic Search** — TF-IDF vector search over extracted content chunks
- **Vector DB Export** — Export chunks ready for Pinecone, Chroma, Weaviate, Qdrant
- **PDF Extraction** — Extract text from PDF files and URLs
- **GitHub Extraction** — Fetch README and /docs from any GitHub repository
- **Screenshot Capture** — Take full-page screenshots of web pages
- **Image Extraction** — Extract images with alt text and surrounding context
- **Streaming** — Real-time event-based output as pages are crawled
- **Output Templates** — Built-in templates (LLM, XML, minimal) or define your own
- **MCP Server** — Model Context Protocol tools for AI agents (Cursor, Claude, Amazon Q)
- **Browser Rendering** — Optional Playwright-powered JS rendering for SPAs
- **Rate Limiting** — Token bucket rate limiter with configurable requests/second
- **Retry with Backoff** — Exponential backoff on 429/5xx responses
- **robots.txt Compliance** — Respects robots.txt by default
- **Caching** — Dual-layer (LRU memory + file-based) with TTL and content diff detection
- **Content Diffing** — Detect what changed between crawls via content hashing
- **Deduplication** — Automatically skips duplicate content during crawls
- **Sitemap Auto-Discovery** — Finds and uses sitemaps automatically before crawling
- **Link Resolution** — Converts relative links to absolute URLs in output
- **Focus Modes** — Extract only articles, code, API references, or READMEs
- **Plugin System** — Hook into any phase of the pipeline (pre/post fetch, extract, transform, chunk)
- **Checkpoint/Resume** — Save crawl state to disk and resume interrupted crawls
- **Scheduling** — Cron-based recurring crawls for keeping context fresh
- **Webhooks** — Get notified when crawls complete or content changes
- **LangChain Compatible** — Document loader adapter included
- **Metrics** — Track crawl performance, cache hit rates, token usage
- **Input Validation** — Zod-based validation on all inputs

## Quick Start

```bash
npm install webcontext-ai
```

> **Note:** WebContext works out of the box for most sites (server-rendered). For JavaScript-heavy SPAs, you also need Playwright:
> ```bash
> npm install playwright
> npx playwright install chromium
> ```
> Then pass `{ javascript: true }` to enable browser rendering.

> **Optional extras:**
> ```bash
> npm install pdf-parse    # For PDF extraction
> npm install playwright   # For screenshots & JS rendering
> ```

## CLI Usage

```bash
# Extract a single page as markdown
webcontext extract https://docs.example.com/api --format markdown

# Crawl documentation recursively
webcontext crawl https://docs.example.com --depth 3 --max-pages 100 -o docs.md

# Generate LLM-ready context with token budget
webcontext context https://docs.example.com/quickstart --budget 4000

# Semantic search within a page
webcontext search https://docs.example.com/api "authentication"

# Export for vector database
webcontext export https://docs.example.com --to pinecone -o chunks.json
webcontext export https://docs.example.com --to chroma --namespace my-docs

# Extract GitHub repository
webcontext github https://github.com/user/repo -o repo-docs.md

# Extract PDF
webcontext pdf https://example.com/paper.pdf -o paper.md
webcontext pdf ./local-file.pdf -o extracted.md

# Take screenshot
webcontext screenshot https://docs.example.com -o ./screenshots --full-page

# Validate a URL
webcontext validate https://docs.example.com

# Schedule recurring crawls
webcontext schedule https://docs.example.com --cron "0 */6 * * *" -o ./docs-cache

# Start API server
webcontext serve --port 3456
```

## SDK Usage

```typescript
import { WebContext } from 'webcontext-ai';

const wc = new WebContext({
  cache: { enabled: true, ttl: 3600, maxSize: 500, contentHashing: true },
  chunking: { maxTokens: 1500, strategy: 'semantic', overlap: 100 },
  concurrency: 5,
  metrics: true,
});

// Extract single page
const result = await wc.extract('https://docs.example.com/api');
console.log(result.pages[0].markdown);

// Crawl documentation site
const docs = await wc.crawlDocs('https://docs.example.com', {
  depth: 2,
  maxPages: 50,
  onProgress: (p) => console.log(`${p.pagesProcessed}/${p.totalDiscovered}`),
});

// Get RAG-ready chunks
const chunks = await wc.toChunks('https://docs.example.com/guide');

// Generate token-budgeted context for LLM
const context = await wc.toContext('https://docs.example.com', { maxTokens: 4000 });

// Semantic search
const results = await wc.search('https://docs.example.com/api', 'authentication', 5);

// Extract GitHub repo
const repo = await wc.extractGitHub('https://github.com/user/repo');

// Extract PDF
const pdf = await wc.extractPdf('https://example.com/paper.pdf');

// Export for vector DB
const pineconeData = await wc.exportForVectorDB('https://docs.example.com', {
  format: 'pinecone',
  namespace: 'my-docs',
});

// Stream results in real-time
const stream = wc.extractStream('https://docs.example.com');
stream.onPage((page) => console.log(`Extracted: ${page.title}`));
stream.onDone((result) => console.log(`Done! ${result.stats.totalTokens} tokens`));

// Webhooks
wc.registerWebhook({
  url: 'https://your-server.com/webhook',
  events: ['crawl.complete', 'content.changed'],
  secret: 'your-secret',
});

// Cleanup
wc.dispose();
```

## Vector DB Export

Export chunks in formats ready for direct import into popular vector databases:

```typescript
import { WebContext } from 'webcontext-ai';

const wc = new WebContext();
const result = await wc.extract('https://docs.example.com');

// Export as Pinecone format
const pinecone = await wc.exportForVectorDB('https://docs.example.com', { format: 'pinecone', namespace: 'docs' });

// Export as Chroma format
const chroma = await wc.exportForVectorDB('https://docs.example.com', { format: 'chroma', collection: 'my-docs' });

// Supported formats: pinecone, chroma, weaviate, qdrant, json
```

CLI:
```bash
webcontext export https://docs.example.com --to pinecone -o pinecone-chunks.json
webcontext export https://docs.example.com --to chroma --namespace docs -o chroma-chunks.json
```

## Output Templates

Format extracted content using built-in or custom templates:

```typescript
import { OutputFormatter } from 'webcontext-ai';

const fmt = new OutputFormatter();

// Built-in templates: default, llm, xml-tags, summary, minimal
fmt.formatPage(page, 'llm');
// Output: <context source="https://..." tokens="1234">...content...</context>

fmt.formatPage(page, 'xml-tags');
// Output: <document><title>...</title><source>...</source><content>...</content></document>

// Register custom template
fmt.register({
  name: 'my-format',
  template: '---\ntitle: {{title}}\nsource: {{url}}\n---\n\n{{markdown}}',
});
fmt.formatPage(page, 'my-format');
```

## MCP Tools (AI Agent Integration)

Use WebContext as a tool inside **Cursor**, **Claude Desktop**, **Amazon Q Developer**, or any MCP-compatible AI agent.

### Setup for Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webcontext": {
      "command": "npx",
      "args": ["-y", "webcontext-ai", "webcontext-mcp"]
    }
  }
}
```

### Setup for Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "webcontext": {
      "command": "npx",
      "args": ["-y", "webcontext-ai", "webcontext-mcp"]
    }
  }
}
```

### Setup for Amazon Q Developer / Kiro

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "webcontext": {
      "command": "npx",
      "args": ["-y", "webcontext-ai", "webcontext-mcp"]
    }
  }
}
```

### Available MCP Tools

| Tool | Description | Example Prompt |
|------|-------------|----------------|
| `webcontext_extract` | Extract clean content from a URL | "Extract the React docs for useState" |
| `webcontext_crawl` | Crawl a documentation site | "Crawl the Express.js guide, 3 levels deep" |
| `webcontext_search` | Semantic search within a page | "Search the Next.js docs for 'server components'" |
| `webcontext_chunk` | Get RAG-ready chunks | "Chunk the TailwindCSS docs for my vector DB" |
| `webcontext_summarize` | Summarize a web page | "Summarize this API reference page" |
| `webcontext_github` | Extract GitHub repo docs | "Get the README from TanStack/query" |
| `webcontext_pdf` | Extract PDF content | "Extract text from this research paper PDF" |

## Streaming

Get results in real-time as pages are processed:

```typescript
const stream = wc.extractStream('https://docs.example.com');

stream.onPage((page) => {
  console.log(`✓ ${page.title} (${page.codeBlocks.length} code blocks)`);
});

stream.onProgress((p) => {
  console.log(`${p.pagesProcessed}/${p.totalDiscovered} - ${p.currentUrl}`);
});

stream.onDone((result) => {
  console.log(`Complete: ${result.stats.totalTokens} tokens`);
});

// Or await completion
const result = await stream.toPromise();
```

## GitHub Extraction

Extract README and documentation from any public GitHub repository:

```typescript
// Just the README
const readme = await wc.extractGitHub('https://github.com/TanStack/query');

// README + /docs folder
const full = await wc.extractGitHub('https://github.com/TanStack/query', { depth: 1 });
```

CLI:
```bash
webcontext github https://github.com/expressjs/express -o express-docs.md
```

## PDF Extraction

Extract text from PDF files (requires `npm install pdf-parse`):

```typescript
// From URL
const paper = await wc.extractPdf('https://example.com/paper.pdf');

// From local file
const local = await wc.extractPdf('./documents/spec.pdf');
```

CLI:
```bash
webcontext pdf https://arxiv.org/pdf/1706.03762 -o transformer-paper.md
webcontext pdf ./local-file.pdf --format chunks -o chunks.json
```

## Webhooks

Get notified when crawls complete or content changes:

```typescript
wc.registerWebhook({
  url: 'https://your-server.com/webhook',
  secret: 'hmac-secret',  // Signs payload with HMAC-SHA256
  events: ['crawl.complete', 'crawl.error', 'content.changed'],
});
```

Webhook payload example:
```json
{
  "event": "content.changed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "changedPages": 3,
    "diffs": [
      { "url": "https://docs.example.com/api", "addedSections": ["New Endpoint"], "removedSections": [] }
    ]
  }
}
```

## Client SDK (Remote Server)

```typescript
import { WebContextClient } from 'webcontext-ai/sdk/client';

const client = new WebContextClient({ serverUrl: 'http://localhost:3456' });
const markdown = await client.toMarkdown('https://example.com');
const results = await client.search('https://example.com', 'pricing', 3);
```

## LangChain Integration

```typescript
import { WebContextLoader } from 'webcontext-ai/sdk/client';

const loader = new WebContextLoader();
const docs = await loader.load('https://docs.example.com/guide');
// Returns LangChain-compatible Document[] with pageContent + metadata
```

## Plugin System

```typescript
import { WebContext, WebContextPlugin } from 'webcontext-ai';

const myPlugin: WebContextPlugin = {
  name: 'custom-cleaner',
  hooks: {
    'post-extract': async (ctx) => {
      ctx.extracted.markdown = ctx.extracted.markdown.replace(/CONFIDENTIAL/g, '[REDACTED]');
      return ctx;
    },
    'post-chunk': async (ctx) => {
      ctx.chunks = ctx.chunks.filter(c => c.tokens > 50);
      return ctx;
    },
  },
};

const wc = new WebContext({ plugins: [myPlugin] });
```

## API Server

```bash
webcontext serve --port 3456
```

| Method | Path | Description |
|--------|------|-------------|
| POST | `/extract` | Extract content from a single URL |
| POST | `/crawl` | Recursively crawl a documentation site |
| POST | `/context` | Generate LLM-ready context with token budget |
| POST | `/chunks` | Get RAG-ready content chunks |
| POST | `/search` | Semantic search within extracted content |
| GET | `/metrics` | View crawl metrics |
| POST | `/schedule` | Schedule recurring crawls |
| DELETE | `/schedule/:id` | Cancel a scheduled job |
| GET | `/health` | Health check |

## Configuration

```typescript
const wc = new WebContext({
  browser: {
    headless: true,
    proxy: 'http://proxy:8080',
    userAgent: 'MyBot/1.0',
    viewport: { width: 1280, height: 720 },
  },
  extraction: {
    removeSelectors: ['.sidebar', '.footer'],
    contentSelectors: ['.doc-content'],
    preserveImages: true,
    preserveTables: true,
  },
  chunking: {
    maxTokens: 1500,
    overlap: 100,
    strategy: 'semantic',       // 'semantic' | 'heading' | 'fixed' | 'paragraph'
    preserveCodeBlocks: true,
    preserveHeadings: true,
  },
  cache: {
    enabled: true,
    ttl: 3600,
    maxSize: 500,
    directory: './.webcontext-cache',
    contentHashing: true,
  },
  retry: {
    maxRetries: 3,
    backoffMs: 1000,
    backoffMultiplier: 2,
    retryOn: [429, 500, 502, 503, 504],
  },
  rateLimit: {
    requestsPerSecond: 2,
    burstSize: 5,
  },
  concurrency: 3,
  metrics: true,
  plugins: [],
});
```

## Real-World Examples

### Feed documentation into your AI chatbot (RAG)

```typescript
import { WebContext } from 'webcontext-ai';

const wc = new WebContext();
const result = await wc.crawlDocs('https://your-docs.com', { depth: 3, maxPages: 100 });

// Export directly for your vector DB
const pineconeData = await wc.exportForVectorDB('https://your-docs.com', {
  format: 'pinecone',
  namespace: 'product-docs',
});
// Write to file and import via Pinecone CLI/API
```

### Keep AI context fresh with scheduled re-crawls

```typescript
import { WebContext, CrawlScheduler } from 'webcontext-ai';

const wc = new WebContext();
const scheduler = new CrawlScheduler();

scheduler.schedule('docs-sync', {
  cron: '0 */6 * * *',
  urls: ['https://your-docs.com'],
  options: { depth: 2 },
  onComplete: (result) => {
    if (result.diffs?.length) {
      console.log(`${result.diffs.length} pages changed — re-indexing`);
    }
  },
}, (url, opts) => wc.crawlDocs(url, opts));
```

### Use in a Cursor/Claude workflow

Just ask your AI agent:
- *"Use webcontext to extract the Next.js App Router docs and explain how layouts work"*
- *"Crawl the Stripe API reference and summarize the payment intents section"*
- *"Search the React docs for information about useEffect cleanup"*

The agent calls the MCP tools automatically.

## Troubleshooting

### "Executable doesn't exist" / Playwright errors

Playwright is only needed for `{ javascript: true }`. Most sites work without it.

```bash
npm install playwright && npx playwright install chromium
```

### "fetch failed" / SSL certificate errors

Common in corporate environments:

```bash
# Windows
set NODE_TLS_REJECT_UNAUTHORIZED=0

# Mac/Linux
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

### Empty extraction / "No pages extracted"

1. **SPA sites** (React/Vue/Angular) need `{ javascript: true }` + Playwright
2. **Landing pages** have little content — target specific doc pages
3. **Blocked by WAF** — try with custom headers

### "pdf-parse is required"

```bash
npm install pdf-parse
```

## Architecture

```
URL → Sitemap Discovery → URL Queue
         ↓
   [PDF?] → PDF Extractor
   [GitHub?] → GitHub Extractor
   [Web?] → Browser Manager (fetch/Playwright)
         ↓
   Content Extractor (Cheerio + heuristics)
         ↓
   Markdown Transformer (Turndown)
         ↓
   Deduplication Check
         ↓
   Content Chunker (tiktoken, 4 strategies)
         ↓
   ┌─────────────────────────────────────┐
   │  Vector Search  │  Vector DB Export  │
   │  Streaming      │  Output Templates  │
   │  Cache + Diff   │  Webhooks          │
   └─────────────────────────────────────┘
         ↓
   CLI │ REST API │ SDK │ MCP Server │ LangChain
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Browser rendering | Playwright (optional, lazy-loaded) |
| HTML parsing | Cheerio |
| Markdown conversion | Turndown (custom rules) |
| Token counting | tiktoken (cl100k_base) |
| Vector search | TF-IDF with cosine similarity |
| PDF parsing | pdf-parse (optional) |
| HTTP server | Express |
| CLI | Commander |
| Caching | LRU-Cache + File-based |
| Validation | Zod |
| Rate limiting | Token bucket algorithm |

## License

MIT
