import TurndownService from 'turndown';

/**
 * Transforms cleaned HTML into high-quality Markdown optimized for LLM consumption.
 * Preserves code blocks, tables, headings hierarchy, and semantic structure.
 */
export class MarkdownTransformer {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
    });

    this.configureRules();
  }

  private configureRules(): void {
    // Preserve code blocks with language hints
    this.turndown.addRule('fencedCodeBlock', {
      filter: (node) => node.nodeName === 'PRE' && !!node.querySelector('code'),
      replacement: (_, node) => {
        const codeEl = (node as HTMLElement).querySelector('code');
        if (!codeEl) return '';
        const code = codeEl.textContent || '';
        const classes = codeEl.className || '';
        const langMatch = classes.match(/(?:language-|lang-)(\w+)/);
        const lang = langMatch?.[1] || '';
        return `\n\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n\n`;
      },
    });

    // Preserve tables
    this.turndown.addRule('table', {
      filter: 'table',
      replacement: (_, node) => {
        return '\n\n' + this.tableToMarkdown(node as HTMLElement) + '\n\n';
      },
    });

    // Remove empty links
    this.turndown.addRule('emptyLinks', {
      filter: (node) => node.nodeName === 'A' && !(node.textContent?.trim()),
      replacement: () => '',
    });
  }

  transform(html: string): string {
    let markdown = this.turndown.turndown(html);
    markdown = this.postProcess(markdown);
    return markdown;
  }

  private postProcess(md: string): string {
    return md
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing whitespace
      .replace(/[ \t]+$/gm, '')
      // Ensure headings have blank line before
      .replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2')
      // Clean up excessive escaping
      .replace(/\\([[\](){}])/g, '$1')
      .trim();
  }

  private tableToMarkdown(table: HTMLElement): string {
    const rows: string[][] = [];
    table.querySelectorAll('tr').forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        cells.push((cell.textContent || '').trim().replace(/\|/g, '\\|'));
      });
      if (cells.length) rows.push(cells);
    });

    if (!rows.length) return '';

    const colCount = Math.max(...rows.map(r => r.length));
    const normalized = rows.map(r => {
      while (r.length < colCount) r.push('');
      return r;
    });

    const header = `| ${normalized[0].join(' | ')} |`;
    const separator = `| ${normalized[0].map(() => '---').join(' | ')} |`;
    const body = normalized.slice(1).map(r => `| ${r.join(' | ')} |`).join('\n');

    return [header, separator, body].filter(Boolean).join('\n');
  }
}
