import robotsParser from 'robots-parser';
import { BrowserConfig, RetryConfig, RateLimitConfig } from '../core/types';

const DEFAULT_RETRY: RetryConfig = { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2, retryOn: [429, 500, 502, 503, 504] };
const DEFAULT_RATE_LIMIT: RateLimitConfig = { requestsPerSecond: 2, burstSize: 5 };

/**
 * Browser manager using Playwright for JS-heavy page rendering.
 * Handles rate limiting, retry with backoff, and robots.txt compliance.
 */
export class BrowserManager {
  private browser: any = null;
  private context: any = null;
  private config: BrowserConfig;
  private rateLimitConfig: RateLimitConfig;
  private robotsCache: Map<string, any> = new Map();
  private tokens: number;
  private lastRefill: number;

  constructor(config: BrowserConfig = {}, rateLimitConfig?: RateLimitConfig) {
    this.config = {
      headless: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      ...config,
    };
    this.rateLimitConfig = rateLimitConfig || DEFAULT_RATE_LIMIT;
    this.tokens = this.rateLimitConfig.burstSize;
    this.lastRefill = Date.now();
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.rateLimitConfig.burstSize, this.tokens + elapsed * this.rateLimitConfig.requestsPerSecond);
    this.lastRefill = now;
  }

  private async waitForToken(): Promise<void> {
    this.refillTokens();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const waitMs = ((1 - this.tokens) / this.rateLimitConfig.requestsPerSecond) * 1000;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refillTokens();
    this.tokens -= 1;
  }

  async launch(): Promise<void> {
    if (this.browser) return;
    let chromium: any;
    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch {
      throw new Error(
        'Playwright is required for JavaScript rendering but is not installed.\n' +
        'Install it with: npm install playwright && npx playwright install chromium\n' +
        'Or use { javascript: false } to extract without a browser.'
      );
    }
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: this.config.proxy ? [`--proxy-server=${this.config.proxy}`] : [],
    });
    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: this.config.viewport,
    });
  }

  async checkRobots(url: string): Promise<boolean> {
    const origin = new URL(url).origin;
    if (!this.robotsCache.has(origin)) {
      try {
        const robotsUrl = `${origin}/robots.txt`;
        const response = await fetch(robotsUrl, {
          headers: { 'User-Agent': this.config.userAgent || 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000),
        });
        const body = response.ok ? await response.text() : '';
        this.robotsCache.set(origin, robotsParser(robotsUrl, body));
      } catch {
        this.robotsCache.set(origin, robotsParser(`${origin}/robots.txt`, ''));
      }
    }
    return this.robotsCache.get(origin)!.isAllowed(url, this.config.userAgent || '*') ?? true;
  }

  async fetchWithRetry<T>(fn: () => Promise<T>, retryConfig: RetryConfig = DEFAULT_RETRY): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        if (attempt === retryConfig.maxRetries) break;
        const delay = retryConfig.backoffMs * Math.pow(retryConfig.backoffMultiplier, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async fetchPage(url: string, options: {
    respectRobots?: boolean;
    waitForSelector?: string;
    timeout?: number;
    cookies?: Array<{ name: string; value: string; domain: string; path?: string }>;
    headers?: Record<string, string>;
    retryConfig?: RetryConfig;
  } = {}): Promise<{ content: string; status: number }> {
    if (options.respectRobots !== false) {
      const allowed = await this.checkRobots(url);
      if (!allowed) throw new Error(`Blocked by robots.txt: ${url}`);
    }

    await this.waitForToken();
    if (!this.context) await this.launch();

    return this.fetchWithRetry(async () => {
      if (options.cookies?.length) {
        await this.context.addCookies(options.cookies.map((c: any) => ({ ...c, path: c.path || '/' })));
      }

      const page = await this.context.newPage();
      if (options.headers) {
        await page.setExtraHTTPHeaders(options.headers);
      }

      // Block unnecessary resources for speed
      await page.route('**/*', (route: any) => {
        const type = route.request().resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      try {
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: options.timeout || 30000,
        });

        if (options.waitForSelector) {
          await page.waitForSelector(options.waitForSelector, { timeout: 10000 }).catch(() => {});
        }

        // Wait for dynamic content
        await page.waitForTimeout(1000);

        const content = await page.content();
        const status = response?.status() || 200;

        // Throw on retryable status codes to trigger retry
        if ((options.retryConfig?.retryOn || DEFAULT_RETRY.retryOn).includes(status)) {
          throw new Error(`HTTP ${status}`);
        }

        return { content, status };
      } finally {
        await page.close();
      }
    }, options.retryConfig);
  }

  async fetchStatic(url: string, options: {
    respectRobots?: boolean;
    headers?: Record<string, string>;
    retryConfig?: RetryConfig;
  } = {}): Promise<{ body: Buffer; status: number }> {
    if (options.respectRobots !== false) {
      const allowed = await this.checkRobots(url);
      if (!allowed) throw new Error(`Blocked by robots.txt: ${url}`);
    }

    await this.waitForToken();

    return this.fetchWithRetry(async () => {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.userAgent || 'WebContext/2.0',
          ...options.headers,
        },
        signal: AbortSignal.timeout(30000),
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const status = response.status;

      if ((options.retryConfig?.retryOn || DEFAULT_RETRY.retryOn).includes(status)) {
        throw new Error(`HTTP ${status}`);
      }

      return { body: buffer, status };
    }, options.retryConfig);
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.robotsCache.clear();
  }
}
