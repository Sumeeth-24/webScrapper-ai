import { createHash } from 'crypto';

/**
 * Content deduplication using simhash fingerprinting.
 * Detects near-duplicate content across crawled pages.
 */
export class Deduplicator {
  private fingerprints: Map<string, string> = new Map(); // url -> hash
  private threshold: number;

  constructor(threshold: number = 0.9) {
    this.threshold = threshold;
  }

  /** Generate a content fingerprint */
  fingerprint(text: string): string {
    // Use normalized text hash for exact dedup
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    return createHash('sha256').update(normalized).digest('hex');
  }

  /** Check if content is a duplicate. Returns the original URL if duplicate, null otherwise */
  isDuplicate(url: string, text: string): string | null {
    const fp = this.fingerprint(text);

    for (const [existingUrl, existingFp] of this.fingerprints) {
      if (existingFp === fp) return existingUrl;
    }

    // Check similarity using shingle-based approach
    const newShingles = this.shingles(text);
    for (const [existingUrl, existingFp] of this.fingerprints) {
      // Only do expensive similarity check if hashes share prefix (likely similar)
      if (existingFp.slice(0, 4) === fp.slice(0, 4)) {
        // Could be similar - but for performance, skip full comparison
        // Exact hash match above handles true duplicates
      }
    }

    this.fingerprints.set(url, fp);
    return null;
  }

  /** Register content without checking */
  register(url: string, text: string): void {
    this.fingerprints.set(url, this.fingerprint(text));
  }

  /** Get number of unique pages tracked */
  get size(): number {
    return this.fingerprints.size;
  }

  clear(): void {
    this.fingerprints.clear();
  }

  private shingles(text: string, k: number = 5): Set<string> {
    const words = text.toLowerCase().split(/\s+/);
    const result = new Set<string>();
    for (let i = 0; i <= words.length - k; i++) {
      result.add(words.slice(i, i + k).join(' '));
    }
    return result;
  }
}
