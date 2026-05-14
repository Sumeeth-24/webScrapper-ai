import { ContentChunk, ChunkOptions, ChunkStrategy, ChunkMetadata, Heading } from '../core/types';
import { createHash } from 'crypto';

/**
 * Token-aware content chunking for RAG/LLM pipelines.
 * Supports semantic, heading-based, and fixed-size strategies.
 */
export class ContentChunker {
  private options: Required<ChunkOptions>;

  constructor(options: ChunkOptions = {}) {
    this.options = {
      maxTokens: options.maxTokens ?? 1500,
      overlap: options.overlap ?? 100,
      strategy: options.strategy ?? 'semantic',
      preserveCodeBlocks: options.preserveCodeBlocks ?? true,
      preserveHeadings: options.preserveHeadings ?? true,
    };
  }

  chunk(markdown: string, metadata: { sourceUrl: string; title: string; headings: Heading[] }): ContentChunk[] {
    switch (this.options.strategy) {
      case 'heading': return this.chunkByHeading(markdown, metadata);
      case 'fixed': return this.chunkByFixedSize(markdown, metadata);
      case 'paragraph': return this.chunkByParagraph(markdown, metadata);
      case 'semantic':
      default: return this.chunkSemantic(markdown, metadata);
    }
  }

  private chunkSemantic(markdown: string, meta: { sourceUrl: string; title: string; headings: Heading[] }): ContentChunk[] {
    const sections = this.splitBySections(markdown);
    const chunks: ContentChunk[] = [];
    let buffer = '';
    let currentHeadings: string[] = [];

    for (const section of sections) {
      const headingMatch = section.match(/^(#{1,6})\s+(.+)/m);
      if (headingMatch) {
        const level = headingMatch[1].length;
        currentHeadings = currentHeadings.slice(0, level - 1);
        currentHeadings[level - 1] = headingMatch[2];
      }

      const combined = buffer ? buffer + '\n\n' + section : section;
      const tokens = this.estimateTokens(combined);

      if (tokens > this.options.maxTokens && buffer) {
        chunks.push(this.createChunk(buffer, meta, currentHeadings, chunks.length));
        // Overlap: keep last paragraph of previous chunk
        const overlapText = this.getOverlapText(buffer);
        buffer = overlapText + '\n\n' + section;
      } else {
        buffer = combined;
      }
    }

    if (buffer.trim()) {
      chunks.push(this.createChunk(buffer, meta, currentHeadings, chunks.length));
    }

    // Set totalChunks
    chunks.forEach(c => c.metadata.totalChunks = chunks.length);
    return chunks;
  }

  private chunkByHeading(markdown: string, meta: { sourceUrl: string; title: string; headings: Heading[] }): ContentChunk[] {
    const sections = markdown.split(/(?=^#{1,3}\s)/m).filter(s => s.trim());
    const chunks: ContentChunk[] = [];

    for (const section of sections) {
      const tokens = this.estimateTokens(section);
      if (tokens > this.options.maxTokens) {
        // Sub-chunk large sections
        const subChunks = this.chunkByFixedSize(section, meta);
        chunks.push(...subChunks);
      } else {
        const headingMatch = section.match(/^(#{1,6})\s+(.+)/m);
        const headingPath = headingMatch ? [headingMatch[2]] : [];
        chunks.push(this.createChunk(section, meta, headingPath, chunks.length));
      }
    }

    chunks.forEach(c => c.metadata.totalChunks = chunks.length);
    return chunks;
  }

  private chunkByFixedSize(markdown: string, meta: { sourceUrl: string; title: string; headings: Heading[] }): ContentChunk[] {
    const chunks: ContentChunk[] = [];
    const lines = markdown.split('\n');
    let buffer = '';

    for (const line of lines) {
      const candidate = buffer ? buffer + '\n' + line : line;
      if (this.estimateTokens(candidate) > this.options.maxTokens && buffer) {
        chunks.push(this.createChunk(buffer, meta, [], chunks.length));
        buffer = line;
      } else {
        buffer = candidate;
      }
    }

    if (buffer.trim()) {
      chunks.push(this.createChunk(buffer, meta, [], chunks.length));
    }

    chunks.forEach(c => c.metadata.totalChunks = chunks.length);
    return chunks;
  }

  private chunkByParagraph(markdown: string, meta: { sourceUrl: string; title: string; headings: Heading[] }): ContentChunk[] {
    const paragraphs = markdown.split(/\n\n+/).filter(p => p.trim());
    const chunks: ContentChunk[] = [];
    let buffer = '';

    for (const para of paragraphs) {
      const combined = buffer ? buffer + '\n\n' + para : para;
      if (this.estimateTokens(combined) > this.options.maxTokens && buffer) {
        chunks.push(this.createChunk(buffer, meta, [], chunks.length));
        buffer = para;
      } else {
        buffer = combined;
      }
    }

    if (buffer.trim()) {
      chunks.push(this.createChunk(buffer, meta, [], chunks.length));
    }

    chunks.forEach(c => c.metadata.totalChunks = chunks.length);
    return chunks;
  }

  private splitBySections(markdown: string): string[] {
    // Split by headings and code blocks, keeping code blocks intact
    const parts: string[] = [];
    const lines = markdown.split('\n');
    let current = '';
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        current += line + '\n';
        continue;
      }

      if (!inCodeBlock && line.match(/^#{1,4}\s/) && current.trim()) {
        parts.push(current.trim());
        current = line + '\n';
      } else {
        current += line + '\n';
      }
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  private createChunk(content: string, meta: { sourceUrl: string; title: string }, headingPath: string[], index: number): ContentChunk {
    const tokens = this.estimateTokens(content);
    const id = createHash('sha256').update(content).digest('hex').slice(0, 12);

    return {
      id,
      content: content.trim(),
      tokens,
      metadata: {
        sourceUrl: meta.sourceUrl,
        title: meta.title,
        headingPath: headingPath.filter(Boolean),
        chunkIndex: index,
        totalChunks: 0, // Set after all chunks created
        hasCode: content.includes('```'),
        language: this.detectChunkLanguage(content),
      },
    };
  }

  private getOverlapText(text: string): string {
    const paragraphs = text.split('\n\n');
    let overlap = '';
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      const candidate = paragraphs[i] + (overlap ? '\n\n' + overlap : '');
      if (this.estimateTokens(candidate) > this.options.overlap) break;
      overlap = candidate;
    }
    return overlap;
  }

  private detectChunkLanguage(content: string): string | undefined {
    const match = content.match(/```(\w+)/);
    return match?.[1];
  }

  /** Approximate token count (~4 chars per token for English) */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
