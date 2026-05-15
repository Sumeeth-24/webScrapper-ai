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

Use WebContext as a tool inside **Cursor**, **Claude Desktop**, **Amazon Q Developer**, or any MCP-compatible AI agent.

#### Setup for Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "webcontext": {
      "command": "node",
      "args": ["C:/path/to/node_modules/@sumeethmoolya/webcontext-ai/dist/mcp-server.js"]
    }
  }
}
```

#### Setup for Cursor

Add to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "webcontext": {
      "command": "npx",
      "args": ["-y", "@sumeethmoolya/webcontext-ai", "webcontext-mcp"]
    }
  }
}
```

#### Setup for Amazon Q Developer

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "webcontext": {
      "command": "npx",
      "args": ["-y", "@sumeethmoolya/webcontext-ai", "webcontext-mcp"]
    }
  }
}
```

#### Available MCP Tools

Once configured, your AI agent can use these tools:

| Tool | Description | Example Prompt |
|------|-------------|----------------|
| `webcontext_extract` | Extract clean content from a URL | "Extract the React docs for useState" |
| `webcontext_crawl` | Crawl a documentation site | "Crawl the Express.js guide, 3 levels deep" |
| `webcontext_search` | Semantic search within a page | "Search the Next.js docs for 'server components'" |
| `webcontext_chunk` | Get RAG-ready chunks | "Chunk the TailwindCSS docs for my vector DB" |
| `webcontext_summarize` | Summarize a web page | "Summarize this API reference page" |

```typescript
// Programmatic MCP setup (for custom integrations)
import { createMCPTools } from '@sumeethmoolya/webcontext-ai/sdk/mcp';

const tools = createMCPTools();
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

## Real-World Examples

### Feed documentation into your AI chatbot

```typescript
import { WebContext } from '@sumeethmoolya/webcontext-ai';

const wc = new WebContext();

// Crawl your product docs and get chunks for a vector database
const result = await wc.crawlDocs('https://your-docs.com', { depth: 3, maxPages: 100 });

// Upload chunks to Pinecone, Chroma, Weaviate, etc.
for (const chunk of result.context.chunks) {
  await vectorDB.upsert({
    id: chunk.id,
    content: chunk.content,
    metadata: chunk.metadata,
  });
}
```

### Keep AI context fresh with scheduled re-crawls

```typescript
import { WebContext, CrawlScheduler } from '@sumeethmoolya/webcontext-ai';

const wc = new WebContext();
const scheduler = new CrawlScheduler();

// Re-crawl every 6 hours and update your vector DB
scheduler.schedule('docs-sync', {
  cron: '0 */6 * * *',
  urls: ['https://your-docs.com'],
  options: { depth: 2 },
  onComplete: async (result) => {
    // result.diffs tells you what changed
    if (result.diffs?.length) {
      console.log(`${result.diffs.length} pages changed — updating index`);
      // Re-index only changed content
    }
  },
}, (url, opts) => wc.crawlDocs(url, opts));
```

### Use in a Cursor/Claude workflow

Just ask your AI agent:
- *"Use webcontext to extract the Next.js App Router docs and explain how layouts work"*
- *"Crawl the Stripe API reference and summarize the payment intents section"*
- *"Search the React docs for information about useEffect cleanup"*

The agent calls the MCP tools automatically — no code needed from you.

## Troubleshooting

### "Executable doesn't exist" / Playwright errors

Playwright is only needed for JavaScript-heavy SPAs. Most sites work without it.

```bash
# If you need browser rendering:
npm install playwright
npx playwright install chromium
```

Then use `{ javascript: true }` in your options.

### "fetch failed" / SSL certificate errors

Common in corporate environments with proxy/firewall:

```bash
# Temporary fix (current terminal session only):
set NODE_TLS_REJECT_UNAUTHORIZED=0    # Windows
export NODE_TLS_REJECT_UNAUTHORIZED=0  # Mac/Linux
```

If behind a corporate proxy:
```bash
set HTTPS_PROXY=http://your-proxy:8080
```

### Empty extraction / "No pages extracted"

1. **SPA sites** (React/Vue/Angular apps) need `{ javascript: true }` + Playwright
2. **Landing pages** have little content — target specific doc pages instead
3. **Blocked by WAF** — some CDNs block automated requests. Try with custom headers:
   ```typescript
   wc.extract(url, { headers: { 'Accept': 'text/html' } });
   ```

### Slow extraction

- Use `{ javascript: false }` (default) when possible — 10x faster than browser rendering
- Reduce `maxPages` and `depth` for crawls
- Enable caching: `{ cache: { enabled: true, ttl: 3600 } }`

## License

MIT
