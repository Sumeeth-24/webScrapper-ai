import { CrawlResult, ContentDiff } from '../core/types';

export interface WebhookConfig {
  url: string;
  secret?: string;
  events: Array<'crawl.complete' | 'crawl.error' | 'content.changed'>;
  headers?: Record<string, string>;
}

/**
 * Webhook notification system for crawl events.
 * Sends POST requests to configured URLs when events occur.
 */
export class WebhookNotifier {
  private configs: WebhookConfig[] = [];

  register(config: WebhookConfig): void {
    this.configs.push(config);
  }

  unregister(url: string): void {
    this.configs = this.configs.filter(c => c.url !== url);
  }

  async notifyCrawlComplete(result: CrawlResult): Promise<void> {
    const subscribers = this.configs.filter(c => c.events.includes('crawl.complete'));
    const payload = {
      event: 'crawl.complete',
      timestamp: new Date().toISOString(),
      data: {
        source: result.context.source,
        pagesProcessed: result.stats.pagesProcessed,
        totalTokens: result.stats.totalTokens,
        duration: result.stats.duration,
        errors: result.stats.errors.length,
      },
    };
    await this.send(subscribers, payload);
  }

  async notifyCrawlError(url: string, error: string): Promise<void> {
    const subscribers = this.configs.filter(c => c.events.includes('crawl.error'));
    const payload = {
      event: 'crawl.error',
      timestamp: new Date().toISOString(),
      data: { url, error },
    };
    await this.send(subscribers, payload);
  }

  async notifyContentChanged(diffs: ContentDiff[]): Promise<void> {
    if (!diffs.length) return;
    const subscribers = this.configs.filter(c => c.events.includes('content.changed'));
    const payload = {
      event: 'content.changed',
      timestamp: new Date().toISOString(),
      data: {
        changedPages: diffs.length,
        diffs: diffs.map(d => ({
          url: d.url,
          addedSections: d.addedSections,
          removedSections: d.removedSections,
        })),
      },
    };
    await this.send(subscribers, payload);
  }

  private async send(subscribers: WebhookConfig[], payload: any): Promise<void> {
    const promises = subscribers.map(async (config) => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...config.headers,
        };
        if (config.secret) {
          const { createHmac } = await import('crypto');
          const signature = createHmac('sha256', config.secret)
            .update(JSON.stringify(payload))
            .digest('hex');
          headers['X-Webhook-Signature'] = signature;
        }
        await fetch(config.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
      } catch {}
    });
    await Promise.allSettled(promises);
  }
}
