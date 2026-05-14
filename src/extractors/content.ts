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
    let codeBlocks = this.extractCodeBlocks($, contentEl);
    const headings = this.extractHeadings($, contentEl);
    const links = this.extractLinks($, contentEl, url);
    const metadata = this.extractMetadata($, url);

    // Extract OpenAPI endpoints in API focus mode
    if (focusMode === 'api') {
      const apiBlocks = this.extractOpenAPIEndpoints($, contentEl);
      codeBlocks = codeBlocks.concat(apiBlocks);
    }

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

    // Score remaining candidates by content density
    const body = $('body');
    const candidates = body.find('div, section').toArray();
    let best: cheerio.Cheerio<any> | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const $c = $(candidate);
      const textLen = $c.text().trim().length;
      if (textLen < 200) continue;

      const htmlLen = ($c.html() || '').length;
      if (htmlLen === 0) continue;

      const density = textLen / htmlLen;
      const paragraphs = $c.find('p').length;
      const codeEls = $c.find('pre, code').length;
      const score = density * (1 + paragraphs * 0.1 + codeEls * 0.2);

      if (score > bestScore) {
        bestScore = score;
        best = $c;
      }
    }

    return best || body;
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
    meta.version = this.detectVersion($);

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

  private detectVersion($: cheerio.CheerioAPI): string | undefined {
    // Check meta tags first
    const metaVersion = $('meta[name="version"]').attr('content') ||
                        $('meta[name="doc-version"]').attr('content');
    if (metaVersion) return metaVersion;

    // Search visible text for version patterns
    const text = $('body').text();
    const match = text.match(/(?:v|version\s*)(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/i);
    return match ? match[0].trim() : undefined;
  }

  extractOpenAPIEndpoints($: cheerio.CheerioAPI, container: cheerio.Cheerio<any>): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

    // Look for structured endpoint elements (Swagger UI, Redoc, etc.)
    container.find('.opblock, .operation, [class*="endpoint"], [class*="method"]').each((_, el) => {
      const $el = $(el);
      const text = $el.text();
      const methodMatch = text.match(new RegExp(`\\b(${methods.join('|')})\\b`));
      const pathMatch = text.match(/\/[\w\-\/.{}:]+/);
      if (methodMatch && pathMatch) {
        const description = $el.find('.opblock-summary-description, .description, p').first().text().trim();
        const endpoint = `${methodMatch[1]} ${pathMatch[0]}`;
        blocks.push({
          language: 'http',
          code: description ? `${endpoint}\n# ${description}` : endpoint,
          context: 'API Endpoint',
        });
      }
    });

    // Fallback: scan for HTTP method + path patterns in text nodes
    if (!blocks.length) {
      const text = container.text();
      const endpointRegex = new RegExp(`\\b(${methods.join('|')})\\s+(\/[\\w\\-\\/.{}:?&=]+)`, 'g');
      let match: RegExpExecArray | null;
      while ((match = endpointRegex.exec(text)) !== null) {
        blocks.push({
          language: 'http',
          code: `${match[1]} ${match[2]}`,
          context: 'API Endpoint',
        });
      }
    }

    return blocks;
  }

  private detectLanguage(code: string): string {
    // Python
    if (code.includes('import ') && code.includes('from ')) return 'python';
    // TypeScript (check before JS due to overlap)
    if (code.includes('interface ') || code.includes(': string')) return 'typescript';
    // JavaScript
    if (code.includes('const ') || code.includes('let ') || code.includes('=>')) return 'javascript';
    // Go
    if (code.includes('func ') && code.includes(':=')) return 'go';
    // Rust
    if (code.includes('fn ') && code.includes('->')) return 'rust';
    // Java
    if (code.includes('public class') || code.includes('System.out')) return 'java';
    // C#
    if (code.includes('using System') || (code.includes('namespace') && code.includes('public static'))) return 'csharp';
    // Kotlin
    if (code.includes('fun ') && (code.includes('val ') || code.includes('package'))) return 'kotlin';
    // Swift
    if (code.includes('import Foundation') || (code.includes('func ') && code.includes('let '))) return 'swift';
    // Ruby
    if (code.includes('def ') && code.includes('end')) return 'ruby';
    // PHP
    if (code.includes('<?php')) return 'php';
    // SQL
    if (/\b(SELECT|INSERT|UPDATE|CREATE TABLE)\b/.test(code)) return 'sql';
    // Shell
    if (code.startsWith('#!/bin/bash') || /^\s*\$/m.test(code)) return 'bash';
    // HTML
    if (code.trimStart().startsWith('<') && /<\w+[\s>]/.test(code)) return 'html';
    // CSS
    if (/\{[^}]*(color|margin|padding|display|font)\s*:/.test(code)) return 'css';
    // YAML
    if (/^[\w-]+\s*:(?:\s|$)/m.test(code) && !code.includes('{')) return 'yaml';
    return 'text';
  }
}
