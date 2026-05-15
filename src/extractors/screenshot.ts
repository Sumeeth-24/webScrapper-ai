import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Screenshot capture for web pages. Requires Playwright (optional dependency).
 */
export class ScreenshotCapture {
  private outputDir: string;

  constructor(outputDir: string = './screenshots') {
    this.outputDir = outputDir;
  }

  async capture(url: string, options: {
    fullPage?: boolean;
    width?: number;
    height?: number;
    format?: 'png' | 'jpeg';
    quality?: number;
  } = {}): Promise<string> {
    let chromium: any;
    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch {
      throw new Error(
        'Playwright is required for screenshots but is not installed.\n' +
        'Install it with: npm install playwright && npx playwright install chromium'
      );
    }

    if (!existsSync(this.outputDir)) mkdirSync(this.outputDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: options.width || 1280, height: options.height || 720 },
    });
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      const filename = `${url.replace(/[^a-z0-9]/gi, '_').slice(0, 100)}.${options.format || 'png'}`;
      const filepath = join(this.outputDir, filename);

      await page.screenshot({
        path: filepath,
        fullPage: options.fullPage ?? true,
        type: options.format || 'png',
        ...(options.format === 'jpeg' && options.quality ? { quality: options.quality } : {}),
      });

      return filepath;
    } finally {
      await browser.close();
    }
  }

  async captureMultiple(urls: string[], options: {
    fullPage?: boolean;
    width?: number;
    height?: number;
    format?: 'png' | 'jpeg';
  } = {}): Promise<string[]> {
    const results: string[] = [];
    for (const url of urls) {
      try {
        const path = await this.capture(url, options);
        results.push(path);
      } catch {
        results.push('');
      }
    }
    return results;
  }
}
