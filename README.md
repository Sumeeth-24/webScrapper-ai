# WebContext AI

> Turn any web content into clean AI-ready context — with crawling, chunking, semantic search, and MCP tools.

WebContext is a developer tool that crawls, extracts, cleans, and structures web content for consumption by LLMs, RAG pipelines, and AI agents. Think of it as Firecrawl — but open-source, self-hosted, and optimized for developer documentation.

## Features

- **Smart Extraction** — Removes ads, navigation, cookie banners, and noise automatically
- **Code Preservation** — Keeps code blocks intact with language detection (15+ languages)
- **Recursive Crawling** — Crawl entire documentation sites with depth control and sitemap support
- **Token-Aware Chunking** — Semantic, heading-based, paragraph, or fixed-size chunking using tiktoken
- **Semantic Search** — TF-IDF vector search over extracted content chunks
- **Multiple Output Formats** — Markdown, JSON, chunks, or LLM context packets
- **Browser Rendering** — Playwright-powered JS rendering for SPAs
- **Rate Limiting** — Token bucket rate limiter with configurable requests/second
- **Retry with Backoff** — Exponential backoff on 429/5xx responses
- **robots.txt Compliance** — Respects robots.txt by default
- **Caching** — Dual-layer (LRU memory + file-based) with TTL and content diff detection
- **Content Diffing** — Detect what changed between crawls via content hashing
- **Focus Modes** — Extract only articles, code, API references, or READMEs
- **OpenAPI Detection** — Automatically extracts API endpoints in API focus mode
- **Plugin System** — Hook into any phase of the pipeline (pre/post fetch, extract, transform, chunk)
- **Checkpoint/Resume** — Save crawl state to disk and resume interrupted crawls
- **Scheduling** — Cron-based recurring crawls for keeping context fresh
- **MCP Server** — Model Context Protocol tools for AI agents
- **LangChain Compatible** — Document loader adapter included
- **Metrics** — Track crawl performance, cache hit rates, token usage
- **Input Validation** — Zod-based validation on all inputs

## Quick Start

```bash
npm install @sumeethmoolya/webcontext-ai
```

> **Note:** WebContext works out of the box for most sites (server-rendered). For JavaScript-heavy SPAs, you also need Playwright:
> ```bash
> npm install playwright
> npx playwright install chromium
> ```
> Then pass `{ javascript: true }` to enable browser rendering.

### CLI Usage

```bash
# Extract a single page as markdown
webcontext extract https://docs.example.com/api --format markdown

# Crawl documentation recursively
webcontext crawl https://docs.example.com --depth 3 --max-pages 100 -o docs.md

# Generate LLM-ready context with token budget
webcontext context https://docs.example.com/quickstart --budget 4000

# Semantic search within a page
webcontext search https://docs.example.com/api "authentication"

# Validate a URL
webcontext validate https://docs.example.com

# Schedule recurring crawls
webcontext schedule https://docs.example.com --cron "0 */6 * * *" -o ./docs-cache

# View server metrics
webcontext metrics --port 3456

# Start API server
webcontext serve --port 3456
```

### SDK Usage

```typescript
import { WebContext } from '@sumeethmoolya/webcontext-ai';

const wc = new WebContext({
  metrics: true,
  cache: { enabled: true, ttl: 3600, maxSize: 500, contentHashing: true },
  concurrency: 5,
});

// Extract single page
const result = await wc.extract('https://docs.example.com/api');
console.log(result.pages[0].markdown);

// Crawl documentation site
const docs = await wc.crawlDocs('https://docs.example.com', {
  depth: 2,
  sitemapUrl: 'https://docs.example.com/sitemap.xml',
  onProgress: (p) => console.log(`${p.pagesProcessed}/${p.totalDiscovered} - ${p.currentUrl}`),
});

// Get RAG-ready chunks
const chunks = await wc.toChunks('https://docs.example.com/guide');

// Generate token-budgeted context for LLM
const context = await wc.toContext('https://docs.example.com', { maxTokens: 4000 });

// Semantic search
const results = await wc.search('https://docs.example.com/api', 'authentication', 5);
results.forEach(r => console.log(`[${r.score.toFixed(2)}] ${r.chunk.content.slice(0, 100)}`));

// Get metrics
console.log(wc.getMetrics());

// Cleanup
wc.dispose();
```

### Client SDK (Remote Server)

```typescript
import { WebContextClient } from '@sumeethmoolya/webcontext-ai/sdk/client';

const client = new WebContextClient({ serverUrl: 'http://localhost:3456' });
const markdown = await client.toMarkdown('https://example.com');
const results = await client.search('https://example.com', 'pricing', 3);
const metrics = await client.getMetrics();
```

### LangChain Integration

```typescript
import { WebContextLoader } from '@sumeethmoolya/webcontext-ai/sdk/client';

const loader = new WebContextLoader();
const docs = await loader.load('https://docs.example.com/guide');
// Returns LangChain-compatible Document[] with pageContent + metadata
```

### MCP Tools (AI Agent Integration)

```typescript
import { createMCPTools } from '@sumeethmoolya/webcontext-ai/sdk/mcp';

const tools = createMCPTools();
// Available tools:
// - webcontext_extract: Extract content from URL
// - webcontext_crawl: Crawl documentation site
// - webcontext_search: Semantic search within content
// - webcontext_chunk: Get RAG-ready chunks
// - webcontext_summarize: Get extractive summary
```

### Plugin System

```typescript
import { WebContext, WebContextPlugin } from '@sumeethmoolya/webcontext-ai';

const myPlugin: WebContextPlugin = {
  name: 'custom-cleaner',
  hooks: {
    'post-extract': async (ctx) => {
      // Modify extracted content
      ctx.extracted.markdown = ctx.extracted.markdown.replace(/CONFIDENTIAL/g, '[REDACTED]');
      return ctx;
    },
    'post-chunk': async (ctx) => {
      // Filter chunks
      ctx.chunks = ctx.chunks.filter(c => c.tokens > 50);
      return ctx;
    },
  },
};

const wc = new WebContext({ plugins: [myPlugin] });
```

### Checkpoint/Resume

```typescript
const wc = new WebContext();

// Large crawl with checkpoint support
const result = await wc.crawlDocs('https://large-docs.example.com', {
  depth: 5,
  maxPages: 1000,
  checkpoint: true,
  checkpointDir: './.webcontext-checkpoint',
});
// If interrupted, re-running with same checkpointDir resumes from where it left off
```

### Scheduling

```typescript
import { CrawlScheduler, WebContext } from '@sumeethmoolya/webcontext-ai';

const scheduler = new CrawlScheduler();
const wc = new WebContext();

scheduler.schedule('docs-refresh', {
  cron: '0 */6 * * *', // Every 6 hours
  urls: ['https://docs.example.com'],
  options: { depth: 2 },
  onComplete: (result) => {
    console.log(`Refreshed: ${result.stats.pagesProcessed} pages`);
  },
}, (url, opts) => wc.crawlDocs(url, opts));
```

## API Server

```bash
webcontext serve --port 3456
```

### Endpoints

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
| GET | `/schedule` | List active scheduled jobs |
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
    preserveImages: false,
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
    contentHashing: true,       // Enable diff detection
  },
  output: {
    format: 'markdown',
    includeMetadata: true,
    includeSourceLinks: true,
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

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        WebContext v2.0                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  URL ──► Sitemap Parser ──► URL Queue                           │
│              │                   │                               │
│              ▼                   ▼                               │
│  [Plugin: pre-fetch] ──► Browser Manager                        │
│              │              │ (Playwright + Rate Limiter)        │
│              │              │ (Retry + robots.txt)               │
│              ▼              ▼                                    │
│  [Plugin: post-fetch] ──► Raw HTML                              │
│              │                   │                               │
│              ▼                   ▼                               │
│  [Plugin: pre-extract] ──► Content Extractor                    │
│              │              │ (Cheerio + Readability + OpenAPI)  │
│              ▼              ▼                                    │
│  [Plugin: post-extract] ──► Clean Content                       │
│              │                   │                               │
│              ▼                   ▼                               │
│  [Plugin: pre-transform] ──► Markdown Transformer               │
│              │              │ (Turndown + tables + callouts)     │
│              ▼              ▼                                    │
│  [Plugin: post-transform] ──► Markdown                          │
│              │                   │                               │
│              ▼                   ▼                               │
│  [Plugin: pre-chunk] ──► Content Chunker                        │
│              │              │ (tiktoken + 4 strategies)          │
│              ▼              ▼                                    │
│  [Plugin: post-chunk] ──► Chunks                                │
│              │                   │                               │
│              ▼                   ▼                               │
│         Vector Search ◄── Context Formatter                     │
│         (TF-IDF)              │                                  │
│              │    ┌───────────┼───────────────┐                 │
│              ▼    ▼           ▼               ▼                 │
│          Search  Markdown  JSON/Chunks   LLM Context            │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│  Cache (LRU + File) │ Metrics │ Scheduler │ Checkpoint          │
├─────────────────────────────────────────────────────────────────┤
│  CLI │ REST API │ SDK │ Client │ MCP Tools │ LangChain          │
└─────────────────────────────────────────────────────────────────┘
```

## Focus Modes

| Mode | Best For |
|------|----------|
| `full` | Complete page content |
| `article` | Blog posts, articles |
| `code` | Code-heavy pages, examples |
| `api` | API references, endpoints (with OpenAPI detection) |
| `readme` | GitHub READMEs |
| `section` | Specific page sections |

## Chunking Strategies

| Strategy | Description |
|----------|-------------|
| `semantic` | Splits by sections, keeps code blocks intact, adds overlap |
| `heading` | Splits at heading boundaries (h1-h3) |
| `fixed` | Fixed token-size chunks |
| `paragraph` | Splits at paragraph boundaries |

## Language Detection

Automatically detects: Python, TypeScript, JavaScript, Go, Rust, Java, C#, Kotlin, Swift, Ruby, PHP, SQL, Bash, HTML, CSS, YAML.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Browser rendering | Playwright (lazy-loaded) |
| HTML parsing | Cheerio |
| Content extraction | Custom + Readability algorithm |
| Markdown conversion | Turndown (with custom rules) |
| Token counting | tiktoken (cl100k_base encoding) |
| Vector search | TF-IDF with cosine similarity |
| HTTP server | Express |
| CLI framework | Commander |
| Caching | LRU-Cache (memory) + File-based |
| Validation | Zod |
| Rate limiting | Token bucket algorithm |

## Security & Privacy

- Respects `robots.txt` by default
- Token bucket rate limiting to avoid overwhelming servers
- Exponential backoff on rate limit responses
- No data sent to external services (fully self-hosted)
- Authentication support (cookies, headers, basic, bearer)
- Cache stored locally with configurable TTL
- Input validation on all public APIs
- User-agent clearly identifies as a bot

## License

MIT
