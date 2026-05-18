import { readFileSync, existsSync } from 'fs';
import { ExtractedContent, Heading } from '../core/types';

/**
 * PDF content extractor. Requires optional dependency: npm install pdf-parse
 */
export class PdfExtractor {
  private pdfParse: any = null;

  private async loadParser(): Promise<any> {
    if (this.pdfParse) return this.pdfParse;
    try {
      // @ts-ignore
      this.pdfParse = (await import('pdf-parse')).default;
      return this.pdfParse;
    } catch {
      throw new Error(
        'pdf-parse is required for PDF extraction but is not installed.\n' +
        'Install it with: npm install pdf-parse'
      );
    }
  }

  async extract(source: string): Promise<ExtractedContent> {
    const parser = await this.loadParser();
    let buffer: Buffer;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      try {
        const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`Failed to fetch PDF: HTTP ${response.status}`);
        buffer = Buffer.from(await response.arrayBuffer());
      } catch (err: any) {
        if (err.message?.includes('fetch failed') || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
          const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
          if (!response.ok) throw new Error(`Failed to fetch PDF: HTTP ${response.status}`);
          buffer = Buffer.from(await response.arrayBuffer());
        } else {
          throw err;
        }
      }
    } else if (existsSync(source)) {
      buffer = readFileSync(source);
    } else {
      throw new Error(`PDF source not found: ${source}`);
    }

    const data = await parser(buffer);
    const text: string = data.text || '';
    const title = data.info?.Title || source.split('/').pop()?.replace('.pdf', '') || 'Untitled PDF';
    const author = data.info?.Author;
    const pages = data.numpages || 0;

    // Extract headings (lines that look like headings: short, no period, often uppercase or title case)
    const headings: Heading[] = [];
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 100 || trimmed.endsWith('.')) continue;
      if (/^\d+\.\s+[A-Z]/.test(trimmed) || /^[A-Z][A-Z\s]{3,}$/.test(trimmed)) {
        headings.push({ level: /^\d+\.\d+/.test(trimmed) ? 2 : 1, text: trimmed });
      }
    }

    // Convert to markdown
    let markdown = `# ${title}\n\n`;
    if (author) markdown += `> Author: ${author}\n\n`;
    markdown += `> ${pages} pages\n\n`;
    markdown += text;

    return {
      url: source,
      title,
      description: `PDF document: ${title} (${pages} pages)`,
      markdown,
      text,
      codeBlocks: [],
      headings,
      links: [],
      metadata: {
        author,
        type: 'documentation',
        tags: ['pdf'],
      },
      timestamp: new Date().toISOString(),
    };
  }

  isPdf(url: string): boolean {
    return url.toLowerCase().endsWith('.pdf') ||
      url.includes('/pdf/') ||
      url.includes('application/pdf');
  }
}
