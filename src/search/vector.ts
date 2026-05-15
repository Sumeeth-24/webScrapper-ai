import { ContentChunk, ChunkMetadata, SearchResult, EmbeddingResult } from '../core/types';
import { createHash } from 'crypto';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
  'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her',
  'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'when',
  'where', 'why', 'how', 'not', 'no', 'nor', 'as', 'if', 'then',
  'than', 'too', 'very', 'just', 'about', 'above', 'after', 'again',
  'all', 'also', 'am', 'any', 'because', 'before', 'between', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
  'own', 'same', 'so', 'over', 'under', 'up', 'down', 'out', 'off',
  'once', 'here', 'there', 'into', 'through', 'during', 'further',
]);

/**
 * Simple in-memory vector search for content chunks.
 * Uses TF-IDF based embeddings for local semantic search without external dependencies.
 */
export class VectorSearch {
  private embeddings: EmbeddingResult[] = [];
  private vocabulary: Map<string, number> = new Map();
  private idfScores: Map<string, number> = new Map();
  private docFrequency: Map<string, number> = new Map();

  /** Index chunks for search */
  index(chunks: ContentChunk[]): void {
    this.embeddings = [];
    this.vocabulary.clear();
    this.idfScores.clear();

    const tokenizedDocs = chunks.map(c => this.tokenize(c.content));
    this.buildVocabulary(tokenizedDocs);

    for (let i = 0; i < chunks.length; i++) {
      const vector = this.computeTfIdf(tokenizedDocs[i]);
      const id = createHash('md5').update(chunks[i].id).digest('hex');
      this.embeddings.push({ id, vector, content: chunks[i].content, metadata: chunks[i].metadata });
    }
  }

  /** Search indexed chunks by query */
  search(query: string, topK: number = 5): SearchResult[] {
    if (this.embeddings.length === 0) return [];

    const queryTokens = this.tokenize(query);
    const queryVector = this.computeTfIdf(queryTokens);

    const results: SearchResult[] = this.embeddings.map(emb => ({
      chunk: { id: emb.id, content: emb.content, tokens: emb.content.split(/\s+/).length, metadata: emb.metadata },
      score: this.cosineSimilarity(queryVector, emb.vector),
    }));

    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /** Add a single chunk to the index and recompute IDF from actual document frequencies */
  addChunk(chunk: ContentChunk): void {
    const tokens = this.tokenize(chunk.content);
    const newTerms = new Set(tokens);

    // Register new terms in vocabulary
    for (const term of newTerms) {
      if (!this.vocabulary.has(term)) {
        this.vocabulary.set(term, this.vocabulary.size);
      }
    }

    // Track document frequency accurately
    for (const term of newTerms) {
      this.docFrequency.set(term, (this.docFrequency.get(term) || 0) + 1);
    }

    const N = this.embeddings.length + 1;

    // Recompute IDF for all terms using exact document frequencies
    for (const [term] of this.vocabulary) {
      const df = this.docFrequency.get(term) || 1;
      this.idfScores.set(term, Math.log(N / df));
    }

    const vector = this.computeTfIdf(tokens);
    const id = createHash('md5').update(chunk.id).digest('hex');
    this.embeddings.push({ id, vector, content: chunk.content, metadata: chunk.metadata });
  }

  /** Clear the index */
  clear(): void {
    this.embeddings = [];
    this.vocabulary.clear();
    this.idfScores.clear();
    this.docFrequency.clear();
  }

  /** Get index size */
  get size(): number {
    return this.embeddings.length;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 1 && !STOPWORDS.has(t));
  }

  private computeTfIdf(tokens: string[]): number[] {
    const vector = new Array(this.vocabulary.size).fill(0);
    const tf = new Map<string, number>();

    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }

    for (const [term, count] of tf) {
      const idx = this.vocabulary.get(term);
      if (idx !== undefined) {
        const idf = this.idfScores.get(term) || 0;
        vector[idx] = (count / tokens.length) * idf;
      }
    }

    return vector;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);
    let dot = 0, magA = 0, magB = 0;

    for (let i = 0; i < len; i++) {
      const ai = a[i] || 0;
      const bi = b[i] || 0;
      dot += ai * bi;
      magA += ai * ai;
      magB += bi * bi;
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  private buildVocabulary(documents: string[][]): void {
    const df = new Map<string, number>();
    const N = documents.length;

    for (const doc of documents) {
      for (const term of new Set(doc)) {
        df.set(term, (df.get(term) || 0) + 1);
      }
    }

    let idx = 0;
    for (const [term, docFreq] of df) {
      this.vocabulary.set(term, idx++);
      this.idfScores.set(term, Math.log(N / docFreq));
    }
  }
}
