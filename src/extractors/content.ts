import * as cheerio from 'cheerio';
import { ExtractedContent, CodeBlock, Heading, LinkInfo, PageMetadata, ContentType, FocusMode } from '../core/types';

/**
 * Content extractor that cleans HTML and extracts structured content.
 * Uses Readability algorithm + custom heuristics for developer content.
 */
export class ContentExtractor {
  // Selectors for noise elements to remove
  private static NOISE_SELECTORS = [
    'nav', 'header', 'footer', 'aside',
    '.sidebar', '.navigation', '.nav',
    '.cookie-banner', '.cookie-consent', '.gdpr',
    '.advertisement', '.ad', '.ads', '[class*="ad-"]',
    '.social-share', '.share-buttons',
    '.comments', '#comments', '.disqus',
    '.newsletter', '.subscribe',
    '.popup', '.modal', '.overlay',
    '.breadcrumb', '.pagination',
    'script', 'style', 'noscript', 'iframe',
    '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
  ];

  // Content-likely selectors (priority order)
  private static CONTENT_SELECTORS = [
    'article', 'main', '[role="main"]',
    '.markdown-body', '.documentation', '.doc-content',
    '.post-content', '.article-content', '.entry-content',
    '.readme', '#readme',
    '.content', '#content',
  ];

  extract(html: string, url: string, focusMode: FocusMode = 'full'): ExtractedContent {
    const $ = cheerio.load(html);

    // Remove noise
    ContentExtractor.NOISE_SELECTORS.forEach(sel => $(sel).remove());

    // Find main content area
    const contentEl = this.findContentElement($, focusMode);
    const title = this.extractTitle($);
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || '';

    // Extract structured data before converting
    const codeBlocks = this.extractCodeBlocks($, contentEl);
    const headings = this.extractHeadings($, contentEl);
    const links = this.extractLinks($, contentEl, url);
    const metadata = this.extractMetadata($, url);

    // Get clean text
    const text = contentEl.text().replace(/\s+/g, ' ').trim();

    // Get clean HTML for markdown conversion
    const cleanHtml = contentEl.html() || '';

    return {
      url,
      title,
      description,
      markdown: '', // Filled by transformer pipeline
      html: cleanHtml,
      text,
      codeBlocks,
      headings,
      links,
      metadata,
      timestamp: new Date().toISOString(),
    };
  }

  private findContentElement($: cheerio.CheerioAPI, focusMode: FocusMode): cheerio.Cheerio<any> {
    if (focusMode === 'code') {
      const codeContainer = $('pre, .highlight, .code-block').parent();
      if (codeContainer.length) return codeContainer;
    }

    if (focusMode === 'api') {
      const apiContent = $('.api-content, .endpoint, .method-section, .operation').first();
      if (apiContent.length) return apiContent;
    }

    for (const selector of ContentExtractor.CONTENT_SELECTORS) {
      const el = $(selector).first();
      if (el.length && (el.text().length > 200)) {
        return el;
      }
    }

    return $('body');
  }

  private extractTitle($: cheerio.CheerioAPI): string {
    return $('h1').first().text().trim() ||
           $('title').text().trim() ||
           $('meta[property="og:title"]').attr('content') || 'Untitled';
  }

  private extractCodeBlocks($: cheerio.CheerioAPI, container: cheerio.Cheerio<any>): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    container.find('pre code, pre').each((_, el) => {
      const $el = $(el);
      const code = $el.text().trim();
      if (!code) return;

      // Detect language from class
      const classes = ($el.attr('class') || '') + ' ' + ($el.parent().attr('class') || '');
      const langMatch = classes.match(/(?:language-|lang-|highlight-)(\w+)/);
      const language = langMatch?.[1] || this.detectLanguage(code);

      // Get surrounding context (previous heading or paragraph)
      const prevHeading = $el.closest('section, div').find('h1,h2,h3,h4').last().text().trim();

      blocks.push({ language, code, context: prevHeading || undefined });
    });
    return blocks;
  }

  private extractHeadings($: cheerio.CheerioAPI, container: cheerio.Cheerio<any>): Heading[] {
    const headings: Heading[] = [];
    container.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const $el = $(el);
      headings.push({
        level: parseInt(el.tagName?.[1] || '1'),
        text: $el.text().trim(),
        id: $el.attr('id') || undefined,
      });
    });
    return headings;
  }

  private extractLinks($: cheerio.CheerioAPI, container: cheerio.Cheerio<any>, baseUrl: string): LinkInfo[] {
    const links: LinkInfo[] = [];
    const baseHost = new URL(baseUrl).hostname;

    container.find('a[href]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const text = $el.text().trim();
      if (!href || !text || href.startsWith('#')) return;

      try {
        const resolved = new URL(href, baseUrl).href;
        links.push({
          href: resolved,
          text,
          isInternal: new URL(resolved).hostname === baseHost,
        });
      } catch {}
    });
    return links;
  }

  private extractMetadata($: cheerio.CheerioAPI, url: string): PageMetadata {
    const meta: PageMetadata = {};

    meta.author = $('meta[name="author"]').attr('content') || 
                  $('[rel="author"]').text().trim() || undefined;
    meta.publishedDate = $('meta[property="article:published_time"]').attr('content') ||
                         $('time[datetime]').first().attr('datetime') || undefined;
    meta.language = $('html').attr('lang') || undefined;
    meta.ogImage = $('meta[property="og:image"]').attr('content') || undefined;
    meta.canonical = $('link[rel="canonical"]').attr('href') || undefined;
    meta.siteName = $('meta[property="og:site_name"]').attr('content') || undefined;
    meta.type = this.detectContentType($, url);
    meta.framework = this.detectFramework($, url);

    return meta;
  }

  private detectContentType($: cheerio.CheerioAPI, url: string): ContentType {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('/api') || urlLower.includes('/reference')) return 'api-reference';
    if (urlLower.includes('/docs') || urlLower.includes('/documentation')) return 'documentation';
    if (urlLower.includes('/blog') || $('article').length) return 'blog-post';
    if (urlLower.includes('github.com') && urlLower.includes('/readme')) return 'readme';
    if ($('#readme').length || $('.markdown-body').length) return 'readme';
    if (urlLower.includes('/tutorial') || urlLower.includes('/guide')) return 'tutorial';
    if (urlLower.includes('/changelog') || urlLower.includes('/releases')) return 'changelog';
    return 'unknown';
  }

  private detectFramework($: cheerio.CheerioAPI, url: string): string | undefined {
    const text = $('body').text().toLowerCase();
    const frameworks = [
      'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt',
      'express', 'fastapi', 'django', 'flask', 'spring', 'rails',
      'tailwind', 'bootstrap', 'pytorch', 'tensorflow',
    ];
    return frameworks.find(f => text.includes(f) || url.includes(f));
  }

  private detectLanguage(code: string): string {
    if (code.includes('import ') && code.includes('from ')) return 'python';
    if (code.includes('const ') || code.includes('let ') || code.includes('=>')) return 'javascript';
    if (code.includes('func ') && code.includes(':=')) return 'go';
    if (code.includes('fn ') && code.includes('->')) return 'rust';
    if (code.includes('public class') || code.includes('System.out')) return 'java';
    if (code.includes('<?php')) return 'php';
    if (code.match(/^\s*\$/m)) return 'bash';
    if (code.includes('interface ') || code.includes(': string')) return 'typescript';
    return 'text';
  }
}
