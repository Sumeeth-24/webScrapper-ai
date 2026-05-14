import { z } from 'zod';
import { CrawlOptions, WebContextConfig } from '../core/types';

/** Zod schemas for input validation */
export const urlSchema = z.string().url('Invalid URL format');

export const crawlOptionsSchema = z.object({
  url: urlSchema,
  depth: z.number().int().min(0, 'Depth must be >= 0').max(10, 'Depth must be <= 10').optional(),
  maxPages: z.number().int().min(1, 'maxPages must be >= 1').max(10000, 'maxPages must be <= 10000').optional(),
  timeout: z.number().int().min(1000, 'Timeout must be >= 1000ms').max(120000, 'Timeout must be <= 120000ms').optional(),
  delay: z.number().int().min(0, 'Delay must be >= 0').max(60000, 'Delay must be <= 60000ms').optional(),
  respectRobotsTxt: z.boolean().optional(),
  includeSitemap: z.boolean().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
}).passthrough();

export const webContextConfigSchema = z.object({
  baseUrl: urlSchema,
  outputDir: z.string().min(1, 'Output directory is required').optional(),
  crawlOptions: crawlOptionsSchema.optional(),
}).passthrough();

export function validateUrl(url: string): string {
  return urlSchema.parse(url);
}

export function validateCrawlOptions(options: unknown): CrawlOptions {
  return crawlOptionsSchema.parse(options) as CrawlOptions;
}

export function validateConfig(config: unknown): WebContextConfig {
  return webContextConfigSchema.parse(config) as WebContextConfig;
}
