/**
 * Minimal test that works without Playwright.
 * Uses native fetch to grab React Native docs (they're server-rendered).
 * 
 * Run: npx ts-node test/test-simple.ts
 */
import { ContentExtractor } from '../src/extractors/content';
import { MarkdownTransformer } from '../src/transformers/markdown';
import { ContentChunker } from '../src/chunking/chunker';

async function main() {
  const url = 'https://reactnative.dev/docs/view';

  console.log(`Fetching: ${url}\n`);
  const res = await fetch(url, { headers: { 'User-Agent': 'WebContext/1.0' } });
  const html = await res.text();
  console.log(`Got ${html.length} bytes of HTML\n`);

  // Extract
  const extractor = new ContentExtractor();
  const extracted = extractor.extract(html, url, 'full');
  console.log(`Title: ${extracted.title}`);
  console.log(`Type: ${extracted.metadata.type}`);
  console.log(`Code blocks: ${extracted.codeBlocks.length}`);
  console.log(`Headings: ${extracted.headings.length}`);

  // Transform to markdown
  const transformer = new MarkdownTransformer();
  const markdown = transformer.transform(extracted.html || '');
  console.log(`\nMarkdown length: ${markdown.length} chars (~${Math.ceil(markdown.length / 4)} tokens)`);
  console.log(`\n--- First 600 chars ---\n`);
  console.log(markdown.slice(0, 600));

  // Chunk
  const chunker = new ContentChunker({ maxTokens: 1000, strategy: 'semantic' });
  const chunks = chunker.chunk(markdown, {
    sourceUrl: url,
    title: extracted.title,
    headings: extracted.headings,
  });
  console.log(`\n--- Chunks ---`);
  console.log(`Total: ${chunks.length} chunks`);
  chunks.slice(0, 3).forEach((c, i) => {
    console.log(`  [${i}] ${c.tokens} tokens | code: ${c.metadata.hasCode} | ${c.content.slice(0, 80)}...`);
  });

  console.log('\n✅ Done!');
}

main().catch(console.error);
