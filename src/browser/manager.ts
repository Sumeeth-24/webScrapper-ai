import { BrowserConfig } from './types';

/**
 * Browser manager using Playwright for JS-heavy page rendering.
 * Handles page lifecycle, authentication, and resource optimization.
 */
export class BrowserManager {
  private browser: any = null;
  private context: any = null;
  private config: BrowserConfig;

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: true,
      userAgent: 'WebContext/1.0 (AI Context Crawler)',
      viewport: { width: 1280, height: 720 },
      ...config,
    };
  }

  async initialize(): Promise<void> {
    const { chromium } = await import('playwright');
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: this.config.proxy ? [`--proxy-server=${this.config.proxy}`] : [],
    });
    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: this.config.viewport,
    });
  }

  async fetchPage(url: string, options: {
    waitForSelector?: string;
    timeout?: number;
    cookies?: Array<{ name: string; value: string; domain: string; path?: string }>;
    headers?: Record<string, string>;
  } = {}): Promise<{ html: string; url: string; status: number }> {
    if (!this.context) await this.initialize();

    if (options.cookies?.length) {
      await this.context.addCookies(options.cookies);
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

      const html = await page.content();
      const finalUrl = page.url();
      const status = response?.status() || 200;

      return { html, url: finalUrl, status };
    } finally {
      await page.close();
    }
  }

  async fetchStatic(url: string, headers?: Record<string, string>): Promise<{ html: string; url: string; status: number }> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.config.userAgent || 'WebContext/1.0',
        ...headers,
      },
    });
    const html = await response.text();
    return { html, url: response.url, status: response.status };
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}
