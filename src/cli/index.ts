#!/usr/bin/env node
import { Command } from 'commander';
import { WebContext } from '../index';
import { CrawlOptions, OutputFormat } from '../core/types';

const program = new Command();

program
  .name('webcontext')
  .description('Turn any web content into clean AI-ready context')
  .version('1.0.0');

program
  .command('extract')
  .description('Extract content from a URL')
  .argument('<url>', 'URL to extract')
  .option('-f, --format <format>', 'Output format: markdown|json|chunks', 'markdown')
  .option('-o, --output <file>', 'Output file path')
  .option('--focus <mode>', 'Focus mode: full|article|code|api|readme', 'full')
  .option('--no-js', 'Disable JavaScript rendering')
  .option('--max-tokens <n>', 'Max tokens for context output', '8000')
  .option('--selector <css>', 'Wait for CSS selector before extraction')
  .action(async (url: string, opts) => {
    const wc = new WebContext({ output: { format: opts.format as OutputFormat } });
    try {
      const result = await wc.extract(url, {
        focusMode: opts.focus,
        javascript: opts.js !== false,
        waitForSelector: opts.selector,
      });

      let output: string;
      switch (opts.format) {
        case 'json':
          output = JSON.stringify(result.context, null, 2);
          break;
        case 'chunks':
          output = JSON.stringify(result.context.chunks, null, 2);
          break;
        default:
          output = result.pages.map(p => p.markdown).join('\n\n---\n\n');
      }

      if (opts.output) {
        const { writeFileSync } = await import('fs');
        writeFileSync(opts.output, output);
        console.log(`✓ Written to ${opts.output} (${result.stats.pagesProcessed} pages, ${result.stats.totalTokens} tokens)`);
      } else {
        console.log(output);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('crawl')
  .description('Recursively crawl a documentation site')
  .argument('<url>', 'Base URL to crawl')
  .option('-d, --depth <n>', 'Crawl depth', '2')
  .option('-m, --max-pages <n>', 'Max pages to crawl', '50')
  .option('-f, --format <format>', 'Output format: markdown|json|chunks', 'markdown')
  .option('-o, --output <file>', 'Output file path')
  .option('--include <patterns...>', 'URL patterns to include')
  .option('--exclude <patterns...>', 'URL patterns to exclude')
  .option('--delay <ms>', 'Delay between requests in ms', '500')
  .action(async (url: string, opts) => {
    const wc = new WebContext();
    try {
      console.error(`Crawling ${url} (depth: ${opts.depth}, max: ${opts.maxPages} pages)...`);
      const result = await wc.crawlDocs(url, {
        depth: parseInt(opts.depth),
        maxPages: parseInt(opts.maxPages),
        includePatterns: opts.include,
        excludePatterns: opts.exclude,
        delay: parseInt(opts.delay),
      });

      const output = opts.format === 'json'
        ? JSON.stringify(result.context, null, 2)
        : result.pages.map(p => `# ${p.title}\n\nSource: ${p.url}\n\n${p.markdown}`).join('\n\n---\n\n');

      if (opts.output) {
        const { writeFileSync } = await import('fs');
        writeFileSync(opts.output, output);
      } else {
        console.log(output);
      }

      console.error(`\n✓ ${result.stats.pagesProcessed} pages | ${result.stats.totalTokens} tokens | ${result.stats.duration}ms`);
      if (result.stats.errors.length) {
        console.error(`⚠ ${result.stats.errors.length} errors`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('context')
  .description('Generate LLM-ready context from a URL')
  .argument('<url>', 'URL to process')
  .option('--budget <tokens>', 'Token budget for output', '8000')
  .option('--focus <mode>', 'Focus mode: full|article|code|api|readme', 'full')
  .action(async (url: string, opts) => {
    const wc = new WebContext();
    try {
      const context = await wc.toContext(url, {
        focusMode: opts.focus,
        maxTokens: parseInt(opts.budget),
      });
      console.log(context);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('serve')
  .description('Start the WebContext API server')
  .option('-p, --port <port>', 'Port number', '3456')
  .action(async (opts) => {
    const { startServer } = await import('../sdk/server');
    startServer(parseInt(opts.port));
  });

program.parse();
