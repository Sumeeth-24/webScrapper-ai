// Core types for the webcontext package

export interface CrawlOptions {
  url: string;
  depth?: number;                    // Recursive crawl depth (default: 0 = single page)
  maxPages?: number;                 // Max pages to crawl (default: 50)
  includePatterns?: string[];        // URL patterns to include
  excludePatterns?: string[];        // URL patterns to exclude
  waitForSelector?: string;          // Wait for element before extraction
  timeout?: number;                  // Page load timeout in ms
  headers?: Record<string, string>;  // Custom headers
  cookies?: Cookie[];                // Authentication cookies
  auth?: AuthConfig;                 // Auth configuration
  respectRobotsTxt?: boolean;        // Default: true
  delay?: number;                    // Delay between requests in ms
  javascript?: boolean;              // Enable JS rendering (default: true)
  focusMode?: FocusMode;            // Content focus strategy
  cache?: boolean;                   // Enable caching (default: true)
  cacheTTL?: number;                // Cache TTL in seconds
}

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
}

export interface AuthConfig {
  type: 'basic' | 'bearer' | 'cookie' | 'custom';
  credentials: Record<string, string>;
}

export type FocusMode = 'full' | 'article' | 'code' | 'api' | 'readme' | 'section';

export interface ExtractedContent {
  url: string;
  title: string;
  description?: string;
  markdown: string;
  html?: string;
  text: string;
  codeBlocks: CodeBlock[];
  headings: Heading[];
  links: LinkInfo[];
  metadata: PageMetadata;
  timestamp: string;
}

export interface CodeBlock {
  language: string;
  code: string;
  context?: string;       // Surrounding text/heading
  lineNumbers?: boolean;
}

export interface Heading {
  level: number;
  text: string;
  id?: string;
}

export interface LinkInfo {
  href: string;
  text: string;
  isInternal: boolean;
}

export interface PageMetadata {
  author?: string;
  publishedDate?: string;
  modifiedDate?: string;
  language?: string;
  framework?: string;
  library?: string;
  tags?: string[];
  ogImage?: string;
  canonical?: string;
  siteName?: string;
  type?: ContentType;
}

export type ContentType = 
  | 'documentation'
  | 'api-reference'
  | 'blog-post'
  | 'readme'
  | 'tutorial'
  | 'article'
  | 'changelog'
  | 'unknown';

export interface ChunkOptions {
  maxTokens?: number;         // Max tokens per chunk (default: 1500)
  overlap?: number;           // Token overlap between chunks (default: 100)
  strategy?: ChunkStrategy;   // Chunking strategy
  preserveCodeBlocks?: boolean; // Keep code blocks intact (default: true)
  preserveHeadings?: boolean;   // Keep heading hierarchy (default: true)
}

export type ChunkStrategy = 'semantic' | 'fixed' | 'heading' | 'paragraph';

export interface ContentChunk {
  id: string;
  content: string;
  tokens: number;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  sourceUrl: string;
  title: string;
  headingPath: string[];     // Breadcrumb of headings
  chunkIndex: number;
  totalChunks: number;
  hasCode: boolean;
  language?: string;
}

export interface ContextPacket {
  id: string;
  source: string;
  chunks: ContentChunk[];
  summary?: string;
  totalTokens: number;
  metadata: PacketMetadata;
  format: OutputFormat;
}

export interface PacketMetadata {
  crawledAt: string;
  pageCount: number;
  contentType: ContentType;
  framework?: string;
  version?: string;
  relationships: PageRelationship[];
}

export interface PageRelationship {
  from: string;
  to: string;
  type: 'links-to' | 'parent-of' | 'related-to' | 'next' | 'previous';
}

export type OutputFormat = 'markdown' | 'json' | 'chunks' | 'context-packet';

export interface WebContextConfig {
  browser?: BrowserConfig;
  extraction?: ExtractionConfig;
  chunking?: ChunkOptions;
  output?: OutputConfig;
  cache?: CacheConfig;
  concurrency?: number;
}

export interface BrowserConfig {
  headless?: boolean;
  proxy?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export interface ExtractionConfig {
  removeSelectors?: string[];     // CSS selectors to remove
  contentSelectors?: string[];    // CSS selectors for main content
  preserveImages?: boolean;
  preserveTables?: boolean;
  maxContentLength?: number;
}

export interface OutputConfig {
  format: OutputFormat;
  includeMetadata?: boolean;
  includeSourceLinks?: boolean;
  compressWhitespace?: boolean;
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;           // seconds
  maxSize: number;       // max cached pages
  directory?: string;    // cache directory path
}

export interface CrawlResult {
  pages: ExtractedContent[];
  context: ContextPacket;
  stats: CrawlStats;
}

export interface CrawlStats {
  pagesProcessed: number;
  totalTokens: number;
  duration: number;
  errors: CrawlError[];
  cached: number;
}

export interface CrawlError {
  url: string;
  error: string;
  statusCode?: number;
}
