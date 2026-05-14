// Core types for the webcontext package

export interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

export interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
  retryOn: number[];
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
}

export interface CrawlProgress {
  pagesProcessed: number;
  totalDiscovered: number;
  currentUrl: string;
  status: 'crawling' | 'paused' | 'complete' | 'error';
}

export interface PluginHook {
  name: string;
  phase: 'pre-fetch' | 'post-fetch' | 'pre-extract' | 'post-extract' | 'pre-transform' | 'post-transform' | 'pre-chunk' | 'post-chunk';
}

export interface WebContextPlugin {
  name: string;
  hooks: Record<string, (ctx: any) => Promise<any>>;
}

export interface CrawlOptions {
  url: string;
  depth?: number;
  maxPages?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  waitForSelector?: string;
  timeout?: number;
  headers?: Record<string, string>;
  cookies?: Cookie[];
  auth?: AuthConfig;
  respectRobotsTxt?: boolean;
  delay?: number;
  javascript?: boolean;
  focusMode?: FocusMode;
  cache?: boolean;
  cacheTTL?: number;
  retry?: RetryConfig;
  rateLimit?: RateLimitConfig;
  sitemapUrl?: string;
  checkpoint?: boolean;
  checkpointDir?: string;
  plugins?: WebContextPlugin[];
  onProgress?: (progress: CrawlProgress) => void;
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
  context?: string;
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
  version?: string;
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
  maxTokens?: number;
  overlap?: number;
  strategy?: ChunkStrategy;
  preserveCodeBlocks?: boolean;
  preserveHeadings?: boolean;
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
  headingPath: string[];
  chunkIndex: number;
  totalChunks: number;
  hasCode: boolean;
  language?: string;
}

export interface CrawlCheckpoint {
  visitedUrls: string[];
  pendingUrls: string[];
  pages: ExtractedContent[];
  errors: CrawlError[];
  timestamp: string;
}

export interface EmbeddingResult {
  id: string;
  vector: number[];
  content: string;
  metadata: ChunkMetadata;
}

export interface SearchResult {
  chunk: ContentChunk;
  score: number;
}

export interface ContentDiff {
  url: string;
  previousHash: string;
  currentHash: string;
  changed: boolean;
  addedSections: string[];
  removedSections: string[];
}

export interface ScheduleConfig {
  cron: string;
  urls: string[];
  options: Partial<CrawlOptions>;
  onComplete?: (result: CrawlResult) => void;
}

export interface MetricsData {
  crawlsTotal: number;
  pagesTotal: number;
  tokensTotal: number;
  cacheHits: number;
  cacheMisses: number;
  avgDuration: number;
  errors: number;
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
  retry?: RetryConfig;
  rateLimit?: RateLimitConfig;
  plugins?: WebContextPlugin[];
  metrics?: boolean;
}

export interface BrowserConfig {
  headless?: boolean;
  proxy?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export interface ExtractionConfig {
  removeSelectors?: string[];
  contentSelectors?: string[];
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
  ttl: number;
  maxSize: number;
  directory?: string;
  contentHashing?: boolean;
}

export interface CrawlResult {
  pages: ExtractedContent[];
  context: ContextPacket;
  stats: CrawlStats;
  diffs?: ContentDiff[];
}

export interface CrawlStats {
  pagesProcessed: number;
  totalTokens: number;
  duration: number;
  errors: CrawlError[];
  cached: number;
  cacheHits: number;
  cacheMisses: number;
  retries: number;
}

export interface CrawlError {
  url: string;
  error: string;
  statusCode?: number;
}
