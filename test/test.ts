/**
 * WebContext Test — pass any URL as argument.
 *
 * Usage:
 *   npx ts-node test/test.ts <url>
 *   npx ts-node test/test.ts https://tanstack.com/query/latest/docs/overview
 *   npx ts-node test/test.ts https://reactnative.dev/docs/view
 */
import { WebContext } from '../src/index';

const args = process.argv.slice(2);
const useJs = args.includes('--js');
const url = args.find(a => !a.startsWith('--'))!;
if (!url) {
  console.error('Usage: npx ts-node test/test.ts <url> [--js]');
  process.exit(1);
}

async function main() {
  const wc = new WebContext({
    cache: { enabled: true, ttl: 3600, maxSize: 100, contentHashing: true },
    chunking: { maxTokens: 1500, strategy: 'semantic' },
  });

  try {
    // 1. Extract
    console.log(`\n📄 Extracting: ${url}${useJs ? ' (browser mode)' : ''}\n`);
    const result = await wc.extract(url, { javascript: useJs || undefined });
    if (!result.pages.length) {
      console.error('❌ No pages extracted. The site may require JavaScript rendering.');
      console.error('   Try without --no-js flag (requires Playwright/Chromium).');
      console.log(`   Stats: ${JSON.stringify(result.stats)}`);
      process.exit(1);
    }
    const page = result.pages[0];
    console.log(`  Title: ${page.title}`);
    console.log(`  Type: ${page.metadata.type}`);
    console.log(`  Code blocks: ${page.codeBlocks.length}`);
    console.log(`  Headings: ${page.headings.length}`);
    console.log(`  Links: ${page.links.length} (${page.links.filter(l => l.isInternal).length} internal)`);
    console.log(`  Stats: ${result.stats.totalTokens} tokens, ${result.stats.duration}ms`);
    console.log(`\n  Markdown preview:\n`);
    console.log(page.markdown.slice(0, 500));

    // 2. Chunks
    console.log(`\n\n🧩 Chunks (${result.context.chunks.length} total):\n`);
    result.context.chunks.slice(0, 3).forEach((c, i) => {
      console.log(`  [${i + 1}] ${c.tokens} tokens | code: ${c.metadata.hasCode} | ${c.metadata.headingPath.join(' > ') || '(root)'}`);
      console.log(`      ${c.content.slice(0, 100)}...\n`);
    });

    // 3. Search
    const query = page.headings[0]?.text || page.title;
    console.log(`\n🔍 Search: "${query}"\n`);
    const results = await wc.search(url, query, 3);
    results.forEach((r, i) => {
      console.log(`  [${i + 1}] score: ${r.score.toFixed(3)} — ${r.chunk.content.slice(0, 120)}...`);
    });

    // 4. LLM Context
    console.log(`\n\n🤖 LLM Context (budget: 2000 tokens):\n`);
    const context = await wc.toContext(url, { maxTokens: 2000 });
    console.log(context.slice(0, 600));
    console.log(`\n  ... (${Math.ceil(context.length / 4)} estimated tokens)`);

    console.log('\n\n✅ All tests passed!');
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    wc.dispose();
  }
}

main();
