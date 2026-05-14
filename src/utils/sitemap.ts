import * as cheerio from 'cheerio';
import { SitemapEntry } from '../core/types';

/**
 * Parse sitemap.xml and sitemap index files.
 * Supports: standard sitemaps, sitemap indexes, gzipped sitemaps.
 */
export class SitemapParser {
  private userAgent: string;

  constructor(userAgent: string = 'WebContext/1.0') {
    this.userAgent = userAgent;
  }

  /** Parse a sitemap URL, handling both sitemap indexes and regular sitemaps */
  async parse(sitemapUrl: string): Promise<SitemapEntry[]> {
    const xml = await this.fetchXml(sitemapUrl);
    const sitemapUrls = this.parseSitemapIndex(xml);

    if (sitemapUrls.length > 0) {
      const results = await Promise.all(sitemapUrls.map((url) => this.parse(url)));
      return results.flat();
    }

    return this.parseEntries(xml);
  }

  /** Discover sitemap URL from robots.txt or common locations */
  async discover(baseUrl: string): Promise<string | null> {
    const base = baseUrl.replace(/\/$/, '');

    try {
      const res = await fetch(`${base}/robots.txt`, {
        headers: { 'User-Agent': this.userAgent },
      });
      if (res.ok) {
        const text = await res.text();
        const match = text.match(/^Sitemap:\s*(.+)$/im);
        if (match) return match[1].trim();
      }
    } catch {}

    const commonPaths = ['/sitemap.xml', '/sitemap_index.xml'];
    for (const path of commonPaths) {
      try {
        const res = await fetch(`${base}${path}`, {
          method: 'HEAD',
          headers: { 'User-Agent': this.userAgent },
        });
        if (res.ok) return `${base}${path}`;
      } catch {}
    }

    return null;
  }

  private async fetchXml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'User-Agent': this.userAgent },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch sitemap: ${url} (${res.status})`);
    }
    return res.text();
  }

  private parseEntries(xml: string): SitemapEntry[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const entries: SitemapEntry[] = [];

    $('url').each((_, el) => {
      const loc = $(el).find('loc').text().trim();
      if (!loc) return;

      const entry: SitemapEntry = { url: loc };
      const lastmod = $(el).find('lastmod').text().trim();
      const changefreq = $(el).find('changefreq').text().trim();
      const priority = $(el).find('priority').text().trim();

      if (lastmod) entry.lastmod = lastmod;
      if (changefreq) entry.changefreq = changefreq;
      if (priority) entry.priority = parseFloat(priority);

      entries.push(entry);
    });

    return entries;
  }

  private parseSitemapIndex(xml: string): string[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const urls: string[] = [];

    $('sitemapindex sitemap loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });

    return urls;
  }
}
