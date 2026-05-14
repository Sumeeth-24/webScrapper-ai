import { get_encoding, Tiktoken } from 'tiktoken';
import { createHash } from 'crypto';
import { ContentChunk, ChunkOptions, ChunkStrategy, ChunkMetadata, Heading } from '../core/types';

/**
 * Token-aware content chunking for RAG/LLM pipelines.
 * Uses actual tiktoken for accurate token counting.
 */
export class ContentChunker {
  private encoder: Tiktoken;
  private options: Required<ChunkOptions>;

  constructor(options: ChunkOptions = {}) {
    this.encoder = get_encoding('cl100k_base');
    this.options = {
      maxTokens: options.maxTokens ?? 1500,
      overlap: options.overlap ?? 100,
      strategy: options.strategy ?? 'semantic',
      preserveCodeBlocks: options.preserveCodeBlocks ?? true,
      preserveHeadings: options.preserveHeadings ?? true,
    };
  }

  /** Count tokens using tiktoken */
  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  /** Chunk content using configured strategy */
  chunk(markdown: string, sourceUrl: string, title: string, headings: Heading[], options?: ChunkOptions): ContentChunk[] {
    const opts = { ...this.options, ...options };
    let rawChunks: string[];

    switch (opts.strategy) {
      case 'heading':
        rawChunks = this.splitByHeading(markdown);
        break;
      case 'fixed':
        rawChunks = this.splitFixed(markdown, opts.maxTokens);
        break;
      case 'paragraph':
        rawChunks = this.splitByParagraph(markdown, opts.maxTokens);
        break;
      case 'semantic':
      default:
        rawChunks = this.splitSemantic(markdown, opts.maxTokens);
        break;
    }

    // Preserve code blocks by merging split blocks
    if (opts.preserveCodeBlocks) {
      rawChunks = this.mergeCodeBlocks(rawChunks, opts.maxTokens);
    }

    // Enforce max token size
    rawChunks = rawChunks.flatMap(c =>
      this.countTokens(c) > opts.maxTokens ? this.splitFixed(c, opts.maxTokens) : [c]
    );

    // Apply overlap
    if (opts.overlap > 0 && rawChunks.length > 1) {
      rawChunks = this.applyOverlap(rawChunks, opts.overlap);
    }

    const totalChunks = rawChunks.length;
    return rawChunks.map((text, i) => {
      const id = createHash('sha256').update(`${sourceUrl}:${i}:${text.slice(0, 64)}`).digest('hex').slice(0, 16);
      const headingPath = this.getHeadingPath(markdown, text, headings);
      return {
        id,
        content: text,
        tokens: this.countTokens(text),
        metadata: {
          sourceUrl,
          title,
          headingPath,
          chunkIndex: i,
          totalChunks,
          hasCode: /```[\s\S]*?```/.test(text),
          language: this.detectChunkLanguage(text),
        },
      };
    });
  }

  /** Free tiktoken encoder memory */
  dispose(): void {
    this.encoder.free();
  }

  private splitSemantic(content: string, maxTokens: number): string[] {
    const sections = this.splitBySections(content);
    const chunks: string[] = [];
    let buffer = '';

    for (const section of sections) {
      const combined = buffer ? buffer + '\n\n' + section : section;
      if (this.countTokens(combined) > maxTokens && buffer) {
        chunks.push(buffer.trim());
        buffer = section;
      } else {
        buffer = combined;
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks;
  }

  private splitByHeading(content: string): string[] {
    return content.split(/(?=^#{1,3}\s)/m).map(s => s.trim()).filter(Boolean);
  }

  private splitFixed(content: string, maxTokens: number): string[] {
    const lines = content.split('\n');
    const chunks: string[] = [];
    let buffer = '';

    for (const line of lines) {
      const candidate = buffer ? buffer + '\n' + line : line;
      if (this.countTokens(candidate) > maxTokens && buffer) {
        chunks.push(buffer.trim());
        buffer = line;
      } else {
        buffer = candidate;
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks;
  }

  private splitByParagraph(content: string, maxTokens: number): string[] {
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
    const chunks: string[] = [];
    let buffer = '';

    for (const para of paragraphs) {
      const combined = buffer ? buffer + '\n\n' + para : para;
      if (this.countTokens(combined) > maxTokens && buffer) {
        chunks.push(buffer.trim());
        buffer = para;
      } else {
        buffer = combined;
      }
    }
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks;
  }

  private splitBySections(markdown: string): string[] {
    const parts: string[] = [];
    const lines = markdown.split('\n');
    let current = '';
    let inCodeBlock = false;

    for (const line of lines) {
      if (line.startsWith('```')) inCodeBlock = !inCodeBlock;
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

  private mergeCodeBlocks(chunks: string[], maxTokens: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const openCount = (chunks[i].match(/```/g) || []).length;
      if (openCount % 2 !== 0 && i + 1 < chunks.length) {
        const merged = chunks[i] + '\n' + chunks[i + 1];
        if (this.countTokens(merged) <= maxTokens * 1.5) {
          result.push(merged);
          i++;
          continue;
        }
      }
      result.push(chunks[i]);
    }
    return result;
  }

  private applyOverlap(chunks: string[], overlapTokens: number): string[] {
    const result: string[] = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prevWords = chunks[i - 1].split(/\s+/);
      let overlap = '';
      for (let j = prevWords.length - 1; j >= 0; j--) {
        const candidate = prevWords.slice(j).join(' ');
        if (this.countTokens(candidate) > overlapTokens) break;
        overlap = candidate;
      }
      result.push(overlap ? overlap + '\n' + chunks[i] : chunks[i]);
    }
    return result;
  }

  private getHeadingPath(fullContent: string, chunkText: string, headings: Heading[]): string[] {
    const chunkStart = fullContent.indexOf(chunkText.slice(0, 50));
    if (chunkStart === -1) return [];
    const before = fullContent.slice(0, chunkStart);
    const path: string[] = [];
    for (const h of headings) {
      if (before.includes(h.text) || chunkText.includes(h.text)) {
        if (h.level <= 3) path[h.level - 1] = h.text;
      }
    }
    return path.filter(Boolean);
  }

  private detectChunkLanguage(content: string): string | undefined {
    const match = content.match(/```(\w+)/);
    return match?.[1];
  }
}
