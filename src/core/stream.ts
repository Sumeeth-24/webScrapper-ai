import { EventEmitter } from 'events';
import { ExtractedContent, ContentChunk, CrawlProgress, CrawlResult } from './types';

/**
 * Streaming interface for crawl results.
 * Emits events as pages are processed, enabling real-time consumption.
 */
export class CrawlStream extends EventEmitter {
  private _pages: ExtractedContent[] = [];
  private _chunks: ContentChunk[] = [];
  private _errors: Array<{ url: string; error: string }> = [];
  private _done = false;

  /** Emitted when a page is extracted */
  onPage(handler: (page: ExtractedContent) => void): this {
    return this.on('page', handler);
  }

  /** Emitted when chunks are generated from a page */
  onChunks(handler: (chunks: ContentChunk[]) => void): this {
    return this.on('chunks', handler);
  }

  /** Emitted on progress updates */
  onProgress(handler: (progress: CrawlProgress) => void): this {
    return this.on('progress', handler);
  }

  /** Emitted on errors (non-fatal) */
  onError(handler: (error: { url: string; error: string }) => void): this {
    return this.on('error', handler);
  }

  /** Emitted when crawl is complete */
  onDone(handler: (result: CrawlResult) => void): this {
    return this.on('done', handler);
  }

  /** @internal */
  emitPage(page: ExtractedContent): void {
    this._pages.push(page);
    this.emit('page', page);
  }

  /** @internal */
  emitChunks(chunks: ContentChunk[]): void {
    this._chunks.push(...chunks);
    this.emit('chunks', chunks);
  }

  /** @internal */
  emitProgress(progress: CrawlProgress): void {
    this.emit('progress', progress);
  }

  /** @internal */
  emitError(error: { url: string; error: string }): void {
    this._errors.push(error);
    this.emit('error', error);
  }

  /** @internal */
  emitDone(result: CrawlResult): void {
    this._done = true;
    this.emit('done', result);
  }

  /** Get all pages collected so far */
  get pages(): ExtractedContent[] { return this._pages; }

  /** Get all chunks collected so far */
  get chunks(): ContentChunk[] { return this._chunks; }

  /** Check if crawl is complete */
  get done(): boolean { return this._done; }

  /** Wait for completion and return final result */
  toPromise(): Promise<CrawlResult> {
    if (this._done) return Promise.resolve(this.listenerCount('done') > 0 ? undefined as any : undefined as any);
    return new Promise((resolve) => this.once('done', resolve));
  }
}
