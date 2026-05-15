import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebContext } from '../index';
import { CrawlOptions } from '../core/types';
import { MetricsCollector } from '../utils/metrics';
import { CrawlScheduler } from '../utils/scheduler';
import { VectorSearch } from '../search/vector';
import { validateUrl } from '../utils/validation';

/**
 * REST API server for WebContext.
 */
export function startServer(port: number = 3456): void {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const wc = new WebContext({ metrics: true });
  const metrics = new MetricsCollector();
  const scheduler = new CrawlScheduler();
  const vector = new VectorSearch();

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '2.1.0' });
  });

  // Extract single URL
  app.post('/extract', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, options = {} } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });
      validateUrl(url);
      const result = await wc.extract(url, options as Partial<CrawlOptions>);
      res.json({
        markdown: result.pages.map(p => p.markdown).join('\n\n---\n\n'),
        metadata: result.pages[0]?.metadata,
        stats: result.stats,
      });
    } catch (err) { next(err); }
  });

  // Crawl documentation site
  app.post('/crawl', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, options = {} } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });
      validateUrl(url);
      const result = await wc.crawlDocs(url, options as Partial<CrawlOptions>);
      res.json({ context: result.context, stats: result.stats });
    } catch (err) { next(err); }
  });

  // Generate LLM context
  app.post('/context', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, maxTokens = 8000, focusMode = 'full' } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });
      validateUrl(url);
      const context = await wc.toContext(url, { focusMode, maxTokens });
      res.json({ context, tokens: Math.ceil(context.length / 4) });
    } catch (err) { next(err); }
  });

  // Get chunks for RAG
  app.post('/chunks', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, options = {} } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });
      validateUrl(url);
      const chunks = await wc.toChunks(url, options);
      res.json({ chunks, count: chunks.length, totalTokens: chunks.reduce((s, c) => s + c.tokens, 0) });
    } catch (err) { next(err); }
  });

  // Semantic search
  app.post('/search', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url, query, topK = 5 } = req.body;
      if (!url || !query) return res.status(400).json({ error: 'url and query are required' });
      validateUrl(url);
      const chunks = await wc.toChunks(url);
      vector.index(chunks);
      const results = vector.search(query, topK);
      res.json({ results, count: results.length });
    } catch (err) { next(err); }
  });

  // Metrics
  app.get('/metrics', (_req: Request, res: Response) => {
    const wcMetrics = wc.getMetrics();
    res.json(wcMetrics || metrics.getMetrics());
  });

  // Schedule crawl
  app.post('/schedule', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, cron, urls, options = {} } = req.body;
      if (!id || !cron || !urls?.length) {
        return res.status(400).json({ error: 'id, cron, and urls are required' });
      }
      urls.forEach((u: string) => validateUrl(u));
      scheduler.schedule(id, { cron, urls, options }, (url, opts) => wc.crawlDocs(url, opts));
      res.json({ id, status: 'scheduled' });
    } catch (err) { next(err); }
  });

  // Cancel scheduled job
  app.delete('/schedule/:id', (req: Request, res: Response) => {
    scheduler.cancel(req.params.id);
    res.json({ id: req.params.id, status: 'cancelled' });
  });

  // List scheduled jobs
  app.get('/schedule', (_req: Request, res: Response) => {
    res.json({ jobs: scheduler.listJobs() });
  });

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
  });

  app.listen(port, () => {
    console.log(`🌐 WebContext API server running on http://localhost:${port}`);
    console.log(`   POST /extract  - Extract content from URL`);
    console.log(`   POST /crawl    - Crawl documentation site`);
    console.log(`   POST /context  - Generate LLM-ready context`);
    console.log(`   POST /chunks   - Get RAG-ready chunks`);
    console.log(`   POST /search   - Semantic search within content`);
    console.log(`   GET  /metrics  - View metrics`);
    console.log(`   POST /schedule - Schedule recurring crawls`);
  });
}
