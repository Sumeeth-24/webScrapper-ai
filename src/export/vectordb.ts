import { ContentChunk } from '../core/types';
import { writeFileSync } from 'fs';

export interface VectorDBExportOptions {
  format: 'pinecone' | 'chroma' | 'weaviate' | 'qdrant' | 'json';
  namespace?: string;
  collection?: string;
  includeMetadata?: boolean;
}

interface PineconeRecord {
  id: string;
  values?: number[];
  metadata: Record<string, any>;
}

interface ChromaRecord {
  id: string;
  document: string;
  metadata: Record<string, any>;
}

interface WeaviateRecord {
  class: string;
  properties: Record<string, any>;
}

interface QdrantRecord {
  id: string;
  payload: Record<string, any>;
}

/**
 * Export chunks in formats ready for vector database import.
 * Generates JSON files compatible with each DB's bulk import API.
 */
export class VectorDBExporter {
  exportChunks(chunks: ContentChunk[], options: VectorDBExportOptions): string {
    switch (options.format) {
      case 'pinecone': return this.toPinecone(chunks, options);
      case 'chroma': return this.toChroma(chunks, options);
      case 'weaviate': return this.toWeaviate(chunks, options);
      case 'qdrant': return this.toQdrant(chunks, options);
      case 'json': default: return this.toJSON(chunks);
    }
  }

  exportToFile(chunks: ContentChunk[], options: VectorDBExportOptions, outputPath: string): void {
    const data = this.exportChunks(chunks, options);
    writeFileSync(outputPath, data);
  }

  private toPinecone(chunks: ContentChunk[], options: VectorDBExportOptions): string {
    const records: PineconeRecord[] = chunks.map(chunk => ({
      id: chunk.id,
      metadata: {
        content: chunk.content,
        source: chunk.metadata.sourceUrl,
        title: chunk.metadata.title,
        headingPath: chunk.metadata.headingPath.join(' > '),
        chunkIndex: chunk.metadata.chunkIndex,
        totalChunks: chunk.metadata.totalChunks,
        hasCode: chunk.metadata.hasCode,
        language: chunk.metadata.language || '',
        tokens: chunk.tokens,
        ...(options.namespace ? { namespace: options.namespace } : {}),
      },
    }));
    return JSON.stringify({ vectors: records, namespace: options.namespace || '' }, null, 2);
  }

  private toChroma(chunks: ContentChunk[], options: VectorDBExportOptions): string {
    const records: ChromaRecord[] = chunks.map(chunk => ({
      id: chunk.id,
      document: chunk.content,
      metadata: {
        source: chunk.metadata.sourceUrl,
        title: chunk.metadata.title,
        headingPath: chunk.metadata.headingPath.join(' > '),
        chunkIndex: chunk.metadata.chunkIndex,
        hasCode: chunk.metadata.hasCode,
        language: chunk.metadata.language || '',
        tokens: chunk.tokens,
      },
    }));
    return JSON.stringify({
      collection: options.collection || 'webcontext',
      documents: records,
    }, null, 2);
  }

  private toWeaviate(chunks: ContentChunk[], options: VectorDBExportOptions): string {
    const records: WeaviateRecord[] = chunks.map(chunk => ({
      class: options.collection || 'WebContent',
      properties: {
        content: chunk.content,
        source: chunk.metadata.sourceUrl,
        title: chunk.metadata.title,
        headingPath: chunk.metadata.headingPath.join(' > '),
        chunkIndex: chunk.metadata.chunkIndex,
        totalChunks: chunk.metadata.totalChunks,
        hasCode: chunk.metadata.hasCode,
        language: chunk.metadata.language || '',
        tokens: chunk.tokens,
        chunkId: chunk.id,
      },
    }));
    return JSON.stringify(records, null, 2);
  }

  private toQdrant(chunks: ContentChunk[], options: VectorDBExportOptions): string {
    const records: QdrantRecord[] = chunks.map(chunk => ({
      id: chunk.id,
      payload: {
        content: chunk.content,
        source: chunk.metadata.sourceUrl,
        title: chunk.metadata.title,
        headingPath: chunk.metadata.headingPath.join(' > '),
        chunkIndex: chunk.metadata.chunkIndex,
        totalChunks: chunk.metadata.totalChunks,
        hasCode: chunk.metadata.hasCode,
        language: chunk.metadata.language || '',
        tokens: chunk.tokens,
      },
    }));
    return JSON.stringify({ collection: options.collection || 'webcontext', points: records }, null, 2);
  }

  private toJSON(chunks: ContentChunk[]): string {
    return JSON.stringify(chunks, null, 2);
  }
}
