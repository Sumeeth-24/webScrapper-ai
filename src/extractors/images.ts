import * as cheerio from 'cheerio';

export interface ExtractedImage {
  src: string;
  alt: string;
  title?: string;
  width?: number;
  height?: number;
  context?: string; // surrounding heading or paragraph
}

/**
 * Extracts images and their alt text/context from HTML.
 * Useful for understanding diagrams, charts, and visual documentation.
 */
export class ImageExtractor {
  extract(html: string, baseUrl: string): ExtractedImage[] {
    const $ = cheerio.load(html);
    const images: ExtractedImage[] = [];

    $('img').each((_, el) => {
      const $el = $(el);
      const src = $el.attr('src') || '';
      if (!src || src.startsWith('data:')) return;

      const resolvedSrc = src.startsWith('http') ? src : new URL(src, baseUrl).href;
      const alt = $el.attr('alt') || '';
      const title = $el.attr('title');
      const width = parseInt($el.attr('width') || '0') || undefined;
      const height = parseInt($el.attr('height') || '0') || undefined;

      // Get surrounding context
      const parent = $el.closest('figure, p, section, div');
      const caption = parent.find('figcaption').text().trim();
      const prevHeading = $el.closest('section, div').find('h1,h2,h3,h4').last().text().trim();
      const context = caption || prevHeading || undefined;

      images.push({ src: resolvedSrc, alt, title, width, height, context });
    });

    return images;
  }

  /** Convert extracted images to markdown references */
  toMarkdown(images: ExtractedImage[]): string {
    return images
      .filter(img => img.alt || img.context)
      .map(img => {
        const desc = img.alt || img.context || 'Image';
        return `![${desc}](${img.src}${img.title ? ` "${img.title}"` : ''})`;
      })
      .join('\n\n');
  }

  /** Get image descriptions as plain text (for LLM context) */
  toDescriptions(images: ExtractedImage[]): string[] {
    return images
      .filter(img => img.alt || img.context)
      .map(img => `[Image: ${img.alt || img.context || 'untitled'}] (${img.src})`);
  }
}
