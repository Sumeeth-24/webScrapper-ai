import express from 'express';
import cors from 'cors';
import { WebContext } from '../index';
import { CrawlOptions, OutputFormat } from '../core/types';

/**
 * REST API server for WebContext.
 * Provides HTTP endpoints for extraction, crawling, and context generation.
 */
export function startServer(port: number = 3456): void {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const wc = new WebContext();

  // Health check
  app.get('/health', (_, res) => res.json({ status: 'ok', version: '1.0.0' }));

  // Extract single URL
  app.post('/extract', async (req, res) => {
    try {
      const { url, options = {} } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });

      const result = await wc.extract(url, options as Partial<CrawlOptions>);
      const format = (options.format || 'markdown') as OutputFormat;

      switch (format) {
        case 'json':
          return res.json(result.context);
        case 'chunks':
          return res.json(result.context.chunks);
        default:
          return res.json({
            markdown: result.pages.map(p => p.markdown).join('\n\n---\n\n'),
            metadata: result.pages[0]?.metadata,
            stats: result.stats,
          });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Crawl documentation site
  app.post('/crawl', async (req, res) => {
    try {
      const { url, options = {} } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });

      const result = await wc.crawlDocs(url, options as Partial<CrawlOptions>);
      res.json({
        context: result.context,
        stats: result.stats,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generate LLM context
  app.post('/context', async (req, res) => {
    try {
      const { url, maxTokens = 8000, focusMode = 'full' } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });

      const context = await wc.toContext(url, { focusMode, maxTokens });
      res.json({ context, tokens: Math.ceil(context.length / 4) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get chunks for RAG
  app.post('/chunks', async (req, res) => {
    try {
      const { url, options = {} } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });

      const chunks = await wc.toChunks(url, options);
      res.json({ chunks, count: chunks.length, totalTokens: chunks.reduce((s, c) => s + c.tokens, 0) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(port, () => {
    console.log(`🌐 WebContext API server running on http://localhost:${port}`);
    console.log(`   POST /extract  - Extract content from URL`);
    console.log(`   POST /crawl    - Crawl documentation site`);
    console.log(`   POST /context  - Generate LLM-ready context`);
    console.log(`   POST /chunks   - Get RAG-ready chunks`);
  });
}
