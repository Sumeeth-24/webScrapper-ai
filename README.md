# WebContext

> Turn any web content into clean AI-ready context instantly.

WebContext is a developer tool that crawls, extracts, cleans, and structures web content for consumption by LLMs, RAG pipelines, and AI agents. Think of it as Firecrawl — but open-source, self-hosted, and optimized for developer documentation.

## Features

- **Smart Extraction** — Removes ads, navigation, cookie banners, and noise automatically
- **Code Preservation** — Keeps code blocks intact with language detection
- **Recursive Crawling** — Crawl entire documentation sites with depth control
- **Token-Aware Chunking** — Semantic, heading-based, or fixed-size chunking for RAG
- **Multiple Output Formats** — Markdown, JSON, chunks, or LLM context packets
- **Browser Rendering** — Playwright-powered JS rendering for SPAs
- **Caching** — File-based cache with TTL for incremental re-crawling
- **Focus Modes** — Extract only articles, code, API references, or READMEs
- **MCP Server** — Model Context Protocol tools for AI agents
- **LangChain Compatible** — Document loader adapter included

## Quick Start

```bash
npm install webcontext
```

### CLI Usage

```bash
# Extract a single page as markdown
webcontext extract https://docs.example.com/api --format markdown

# Crawl documentation recursively
webcontext crawl https://docs.example.com --depth 3 --max-pages 100 -o docs.md

# Generate LLM-ready context with token budget
webcontext context https://docs.example.com/quickstart --budget 4000

# Start API server
webcontext serve --port 3456
```

### SDK Usage

```typescript
import { WebContext } from 'webcontext';

const wc = new WebContext();

// Extract single page
const result = await wc.extract('https://docs.example.com/api');
console.log(result.pages[0].markdown);

// Crawl documentation site
const docs = await wc.crawlDocs('https://docs.example.com', { depth: 2 });
console.log(`Crawled ${docs.stats.pagesProcessed} pages`);

// Get RAG-ready chunks
const chunks = await wc.toChunks('https://docs.example.com/guide');
// Each chunk has: { id, content, tokens, metadata }

// Generate token-budgeted context for LLM
const context = await wc.toContext('https://docs.example.com', { maxTokens: 4000 });
```

### Client SDK (Remote Server)

```typescript
import { WebContextClient } from 'webcontext/sdk/client';

const client = new WebContextClient({ serverUrl: 'http://localhost:3456' });
const markdown = await client.toMarkdown('https://example.com');
```

### LangChain Integration

```typescript
import { WebContextLoader } from 'webcontext/sdk/client';

const loader = new WebContextLoader();
const docs = await loader.load('https://docs.example.com/guide');
// Returns LangChain-compatible Document[] with pageContent + metadata
```

### MCP Tools (AI Agent Integration)

```typescript
import { createMCPTools } from 'webcontext/sdk/mcp';

const tools = createMCPTools();
// Register with your MCP server:
// - webcontext_extract: Extract content from URL
// - webcontext_crawl: Crawl documentation site
// - webcontext_search: Search within extracted content
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
| GET | `/health` | Health check |

### Request Examples

```bash
# Extract
curl -X POST http://localhost:3456/extract \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.example.com/api", "options": {"focusMode": "api"}}'

# Context with budget
curl -X POST http://localhost:3456/context \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.example.com", "maxTokens": 4000}'
```

## Configuration

```typescript
const wc = new WebContext({
  browser: {
    headless: true,
    proxy: 'http://proxy:8080',
    userAgent: 'MyBot/1.0',
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
  },
  cache: {
    enabled: true,
    ttl: 3600,
    maxSize: 500,
    directory: './.webcontext-cache',
  },
  output: {
    format: 'markdown',
    includeMetadata: true,
    includeSourceLinks: true,
  },
  concurrency: 3,
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        WebContext                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  URL ──► Browser Manager ──► Content Extractor               │
│              │                      │                        │
│              │ (Playwright/fetch)   │ (Cheerio + Readability) │
│              ▼                      ▼                        │
│         Raw HTML ──────────► Clean Content                   │
│                                     │                        │
│                                     ▼                        │
│                          Markdown Transformer                 │
│                            (Turndown + rules)                │
│                                     │                        │
│                                     ▼                        │
│                           Content Chunker                     │
│                        (Token-aware splitting)               │
│                                     │                        │
│                                     ▼                        │
│                          Context Formatter                    │
│                                     │                        │
│              ┌──────────────────────┼──────────────┐        │
│              ▼                      ▼              ▼        │
│          Markdown              JSON/Chunks     LLM Context   │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  Cache Layer │ CLI │ REST API │ SDK │ MCP Tools              │
└─────────────────────────────────────────────────────────────┘
```

## Focus Modes

| Mode | Best For |
|------|----------|
| `full` | Complete page content |
| `article` | Blog posts, articles |
| `code` | Code-heavy pages, examples |
| `api` | API references, endpoints |
| `readme` | GitHub READMEs |
| `section` | Specific page sections |

## Chunking Strategies

| Strategy | Description |
|----------|-------------|
| `semantic` | Splits by sections, keeps code blocks intact, adds overlap |
| `heading` | Splits at heading boundaries (h1-h3) |
| `fixed` | Fixed token-size chunks |
| `paragraph` | Splits at paragraph boundaries |

## Output Formats

### Markdown
Clean, structured markdown with preserved code blocks and headings.

### JSON (Context Packet)
```json
{
  "id": "abc123",
  "source": "https://docs.example.com",
  "chunks": [...],
  "totalTokens": 5200,
  "metadata": {
    "crawledAt": "2024-01-01T00:00:00Z",
    "pageCount": 5,
    "contentType": "documentation",
    "framework": "react",
    "relationships": [...]
  }
}
```

### Chunks (RAG-ready)
```json
[
  {
    "id": "chunk_abc",
    "content": "## Installation\n\nnpm install ...",
    "tokens": 450,
    "metadata": {
      "sourceUrl": "https://docs.example.com/install",
      "title": "Installation Guide",
      "headingPath": ["Getting Started", "Installation"],
      "chunkIndex": 0,
      "totalChunks": 12,
      "hasCode": true,
      "language": "bash"
    }
  }
]
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Browser rendering | Playwright |
| HTML parsing | Cheerio |
| Content extraction | Custom + Readability algorithm |
| Markdown conversion | Turndown |
| Token counting | tiktoken (approximate) |
| HTTP server | Express |
| CLI framework | Commander |
| Caching | File-based + LRU memory |
| Validation | Zod |

## Security & Privacy

- Respects `robots.txt` by default
- Configurable request delays to avoid rate limiting
- No data sent to external services (fully self-hosted)
- Authentication support for private documentation
- Cache stored locally with configurable TTL
- User-agent clearly identifies as a bot

## Scalability

- Concurrent page processing with configurable limits
- Memory-efficient streaming for large sites
- Incremental re-crawling via cache layer
- Horizontal scaling via API server mode
- Queue-based processing for large crawl jobs

## License

MIT
