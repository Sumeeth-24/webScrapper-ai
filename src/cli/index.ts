#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { WebContext } from '../index';
import { VectorSearch } from '../search/vector';
import { CrawlScheduler } from '../utils/scheduler';
import { validateUrl } from '../utils/validation';
import { writeFileSync, mkdirSync } from 'fs';

const program = new Command();

program
  .name('webcontext')
  .description('Turn any web content into clean AI-ready context')
  .version('2.0.0');

program
  .command('extract')
  .description('Extract content from a URL')
  .argument('<url>', 'URL to extract')
  .option('-f, --format <format>', 'Output format: markdown|json|chunks', 'markdown')
  .option('-o, --output <file>', 'Output file path')
  .option('--focus <mode>', 'Focus mode: full|article|code|api|readme', 'full')
  .option('--no-js', 'Disable JavaScript rendering')
  .option('--selector <css>', 'Wait for CSS selector before extraction')
  .action(async (url: string, opts) => {
    try {
      validateUrl(url);
      const spinner = ora(`Extracting content from ${url}`).start();
      const wc = new WebContext();
      const result = await wc.extract(url, {
        focusMode: opts.focus,
        javascript: opts.js !== false,
        waitForSelector: opts.selector,
      });
      spinner.succeed(`Extracted ${result.stats.pagesProcessed} pages (${result.stats.totalTokens} tokens)`);

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
        writeFileSync(opts.output, output);
        console.log(chalk.green(`✓ Written to ${opts.output}`));
      } else {
        console.log(output);
      }
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('crawl')
  .description('Recursively crawl a documentation site')
  .argument('<url>', 'Base URL to crawl')
  .option('-d, --depth <n>', 'Crawl depth', '2')
  .option('-m, --max-pages <n>', 'Max pages to crawl', '50')
  .option('-f, --format <format>', 'Output format: markdown|json', 'markdown')
  .option('-o, --output <file>', 'Output file path')
  .option('--include <patterns...>', 'URL patterns to include')
  .option('--exclude <patterns...>', 'URL patterns to exclude')
  .option('--delay <ms>', 'Delay between requests in ms', '500')
  .option('--sitemap <url>', 'Sitemap URL to use for discovery')
  .action(async (url: string, opts) => {
    try {
      validateUrl(url);
      const spinner = ora(`Crawling ${url} (depth: ${opts.depth}, max: ${opts.maxPages} pages)`).start();
      const wc = new WebContext();
      const result = await wc.crawlDocs(url, {
        depth: parseInt(opts.depth),
        maxPages: parseInt(opts.maxPages),
        includePatterns: opts.include,
        excludePatterns: opts.exclude,
        delay: parseInt(opts.delay),
        sitemapUrl: opts.sitemap,
      });
      spinner.succeed(`${result.stats.pagesProcessed} pages | ${result.stats.totalTokens} tokens | ${result.stats.duration}ms`);

      if (result.stats.errors.length) {
        console.log(chalk.yellow(`⚠ ${result.stats.errors.length} errors`));
      }

      const output = opts.format === 'json'
        ? JSON.stringify(result.context, null, 2)
        : result.pages.map(p => `# ${p.title}\n\nSource: ${p.url}\n\n${p.markdown}`).join('\n\n---\n\n');

      if (opts.output) {
        writeFileSync(opts.output, output);
        console.log(chalk.green(`✓ Written to ${opts.output}`));
      } else {
        console.log(output);
      }
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
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
    try {
      validateUrl(url);
      const spinner = ora('Generating LLM context...').start();
      const wc = new WebContext();
      const context = await wc.toContext(url, {
        focusMode: opts.focus,
        maxTokens: parseInt(opts.budget),
      });
      spinner.succeed('Context generated');
      console.log(context);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Semantic search within a page\'s content')
  .argument('<url>', 'URL to search within')
  .argument('<query>', 'Search query')
  .option('-k, --top-k <n>', 'Number of results', '5')
  .action(async (url: string, query: string, opts) => {
    try {
      validateUrl(url);
      const spinner = ora(`Extracting and searching ${url}...`).start();
      const wc = new WebContext();
      const results = await wc.search(url, query, parseInt(opts.topK));
      spinner.succeed(`Found ${results.length} results`);

      results.forEach((r, i) => {
        console.log(chalk.cyan(`\n--- Result ${i + 1} (score: ${r.score.toFixed(3)}) ---`));
        console.log(r.chunk.content.slice(0, 500));
      });
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('schedule')
  .description('Schedule a recurring crawl')
  .argument('<url>', 'URL to crawl')
  .requiredOption('--cron <expr>', 'Cron expression (e.g., "*/30 * * * *" for every 30 min)')
  .option('-d, --depth <n>', 'Crawl depth', '2')
  .option('-o, --output <dir>', 'Output directory for results')
  .action(async (url: string, opts) => {
    try {
      validateUrl(url);
      const scheduler = new CrawlScheduler();
      const wc = new WebContext();

      console.log(chalk.green(`Scheduled crawl for ${url}`));
      console.log(chalk.dim(`  Cron: ${opts.cron}`));
      console.log(chalk.dim(`  Depth: ${opts.depth}`));

      scheduler.schedule('cli-job', {
        cron: opts.cron,
        urls: [url],
        options: { depth: parseInt(opts.depth) },
        onComplete: (result) => {
          console.log(chalk.green(`✓ Crawl complete: ${result.stats.pagesProcessed} pages, ${result.stats.totalTokens} tokens`));
          if (opts.output) {
            mkdirSync(opts.output, { recursive: true });
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            writeFileSync(`${opts.output}/crawl-${timestamp}.json`, JSON.stringify(result.context, null, 2));
          }
        },
      }, (crawlUrl, crawlOpts) => wc.crawlDocs(crawlUrl, crawlOpts));

      console.log(chalk.green('Scheduler running. Press Ctrl+C to stop.'));
      await new Promise(() => {}); // Keep alive
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('metrics')
  .description('Show metrics from a running server')
  .option('-p, --port <port>', 'Server port', '3456')
  .option('--host <host>', 'Server host', 'localhost')
  .action(async (opts) => {
    try {
      const res = await fetch(`http://${opts.host}:${opts.port}/metrics`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      console.log(chalk.cyan('\n--- Server Metrics ---'));
      for (const [key, value] of Object.entries(data)) {
        console.log(`  ${chalk.bold(key)}: ${value}`);
      }
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate a URL is accessible and show page info')
  .argument('<url>', 'URL to validate')
  .option('--timeout <ms>', 'Request timeout in ms', '10000')
  .action(async (url: string, opts) => {
    try {
      validateUrl(url);
      const spinner = ora(`Validating ${url}...`).start();
      const start = Date.now();
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(parseInt(opts.timeout)),
      });
      const elapsed = Date.now() - start;

      if (res.ok) {
        spinner.succeed(`URL is accessible (${res.status})`);
      } else {
        spinner.warn(`URL returned status ${res.status}`);
      }

      console.log(chalk.cyan('\n--- Page Info ---'));
      console.log(`  ${chalk.bold('Status')}: ${res.status} ${res.statusText}`);
      console.log(`  ${chalk.bold('Content-Type')}: ${res.headers.get('content-type') || 'unknown'}`);
      console.log(`  ${chalk.bold('Response Time')}: ${elapsed}ms`);
      console.log(`  ${chalk.bold('Server')}: ${res.headers.get('server') || 'unknown'}`);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message}`));
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
