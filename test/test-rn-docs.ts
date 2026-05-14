/**
 * Test: Extract React Native documentation
 * 
 * Run:
 *   npm install
 *   npx ts-node test/test-rn-docs.ts
 */
import { WebContext } from '../src/index';

async function testReactNativeDocs() {
  const wc = new WebContext({
    chunking: { maxTokens: 1500, strategy: 'semantic' },
  });

  console.log('=== WebContext Test: React Native Docs ===\n');

  // Test 1: Extract a single page (Components)
  console.log('📄 Test 1: Extracting React Native "View" component docs...\n');
  try {
    const result = await wc.extract('https://reactnative.dev/docs/view', {
      javascript: false, // RN docs are SSR, no need for browser
    });

    const page = result.pages[0];
    console.log(`Title: ${page.title}`);
    console.log(`Content Type: ${page.metadata.type}`);
    console.log(`Framework: ${page.metadata.framework}`);
    console.log(`Code Blocks Found: ${page.codeBlocks.length}`);
    console.log(`Headings: ${page.headings.map(h => h.text).join(', ')}`);
    console.log(`Links: ${page.links.length} (${page.links.filter(l => l.isInternal).length} internal)`);
    console.log(`\nMarkdown Preview (first 500 chars):\n`);
    console.log(page.markdown.slice(0, 500));
    console.log('\n---\n');
    console.log(`Stats: ${result.stats.pagesProcessed} pages, ${result.stats.totalTokens} tokens, ${result.stats.duration}ms`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
  }

  console.log('\n\n');

  // Test 2: Get LLM-ready context with token budget
  console.log('🤖 Test 2: Generate LLM context for "FlatList" (budget: 2000 tokens)...\n');
  try {
    const context = await wc.toContext('https://reactnative.dev/docs/flatlist', {
      javascript: false,
      maxTokens: 2000,
    });

    console.log(context.slice(0, 1000));
    console.log(`\n... (${Math.ceil(context.length / 4)} tokens total)`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
  }

  console.log('\n\n');

  // Test 3: Get RAG chunks
  console.log('🧩 Test 3: Chunk "StyleSheet" docs for RAG...\n');
  try {
    const chunks = await wc.toChunks('https://reactnative.dev/docs/stylesheet', {
      javascript: false,
    });

    console.log(`Total chunks: ${chunks.length}`);
    chunks.slice(0, 3).forEach((chunk, i) => {
      console.log(`\n  Chunk ${i + 1}:`);
      console.log(`    Tokens: ${chunk.tokens}`);
      console.log(`    Has Code: ${chunk.metadata.hasCode}`);
      console.log(`    Heading Path: ${chunk.metadata.headingPath.join(' > ') || '(root)'}`);
      console.log(`    Preview: ${chunk.content.slice(0, 100)}...`);
    });
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
  }

  console.log('\n\n');

  // Test 4: Crawl multiple pages
  console.log('🕷️ Test 4: Crawl RN docs (depth 1, max 5 pages)...\n');
  try {
    const result = await wc.crawlDocs('https://reactnative.dev/docs/getting-started', {
      depth: 1,
      maxPages: 5,
      javascript: false,
      delay: 1000,
      includePatterns: ['/docs/'],
    });

    console.log(`Pages crawled: ${result.stats.pagesProcessed}`);
    console.log(`Total tokens: ${result.stats.totalTokens}`);
    console.log(`Duration: ${result.stats.duration}ms`);
    console.log(`Errors: ${result.stats.errors.length}`);
    console.log(`\nPages:`);
    result.pages.forEach(p => {
      console.log(`  - ${p.title} (${p.url})`);
    });
    console.log(`\nRelationships: ${result.context.metadata.relationships.length} links between pages`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
  }

  console.log('\n✅ Tests complete!');
}

testReactNativeDocs().catch(console.error);
