import TurndownService from 'turndown';

export interface MarkdownTransformerOptions {
  preserveImages?: boolean;
}

/**
 * Transforms cleaned HTML into high-quality Markdown optimized for LLM consumption.
 * Preserves code blocks, tables, headings hierarchy, and semantic structure.
 */
export class MarkdownTransformer {
  private turndown: TurndownService;
  private options: MarkdownTransformerOptions;

  constructor(options: MarkdownTransformerOptions = {}) {
    this.options = options;
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

    // Complex table handling with colspan/rowspan
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

    // Image alt text preservation
    this.turndown.addRule('images', {
      filter: 'img',
      replacement: (_, node) => {
        const el = node as HTMLElement;
        const alt = el.getAttribute('alt') || '';
        const src = el.getAttribute('src') || '';
        const title = el.getAttribute('title');
        if (!this.options.preserveImages) {
          return alt ? `[Image: ${alt}]` : '';
        }
        const titlePart = title ? ` "${title}"` : '';
        return `![${alt}](${src}${titlePart})`;
      },
    });

    // Nested list handling with proper indentation
    this.turndown.addRule('listItem', {
      filter: 'li',
      replacement: (content, node) => {
        const el = node as HTMLElement;
        const parent = el.parentElement;
        const isOrdered = parent?.nodeName === 'OL';

        // Calculate nesting depth
        let depth = 0;
        let ancestor = parent?.parentElement;
        while (ancestor) {
          if (ancestor.nodeName === 'UL' || ancestor.nodeName === 'OL') {
            depth++;
          }
          ancestor = ancestor.parentElement;
        }

        const indent = '  '.repeat(depth);
        const trimmed = content
          .replace(/^\n+/, '')
          .replace(/\n+$/, '')
          .replace(/\n/g, `\n${indent}  `);

        // Task list detection
        const checkbox = el.querySelector('input[type="checkbox"]');
        if (checkbox) {
          const checked = (checkbox as HTMLInputElement).checked || checkbox.hasAttribute('checked');
          return `${indent}${checked ? '- [x]' : '- [ ]'} ${trimmed}\n`;
        }

        if (isOrdered) {
          const start = parent?.getAttribute('start');
          const index = Array.from(parent!.children).indexOf(el);
          const num = (start ? parseInt(start, 10) : 1) + index;
          return `${indent}${num}. ${trimmed}\n`;
        }

        return `${indent}- ${trimmed}\n`;
      },
    });

    // Strikethrough support
    this.turndown.addRule('strikethrough', {
      filter: (node) =>
        node.nodeName === 'DEL' ||
        node.nodeName === 'S' ||
        node.nodeName === 'STRIKE',
      replacement: (content) => `~~${content}~~`,
    });

    // Details/summary element handling
    this.turndown.addRule('details', {
      filter: 'details',
      replacement: (_, node) => {
        const el = node as HTMLElement;
        const summary = el.querySelector('summary');
        const summaryText = summary?.textContent?.trim() || 'Details';
        // Get content excluding the summary element
        const clone = el.cloneNode(true) as HTMLElement;
        const summaryEl = clone.querySelector('summary');
        summaryEl?.remove();
        const bodyContent = this.turndown.turndown(clone.innerHTML).trim();
        return `\n\n<details>\n<summary>${summaryText}</summary>\n\n${bodyContent}\n\n</details>\n\n`;
      },
    });

    // Admonition/callout detection (blockquotes with alert markers)
    this.turndown.addRule('admonition', {
      filter: (node) => {
        if (node.nodeName !== 'BLOCKQUOTE') return false;
        const text = node.textContent || '';
        return /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(text);
      },
      replacement: (_, node) => {
        const el = node as HTMLElement;
        const html = el.innerHTML;
        const md = this.turndown.turndown(html).trim();
        const lines = md.split('\n');
        return '\n\n' + lines.map((l) => `> ${l}`).join('\n') + '\n\n';
      },
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
    const grid = this.buildTableGrid(table);
    if (!grid.length) return '';

    const colCount = Math.max(...grid.map((r) => r.length));
    const normalized = grid.map((r) => {
      while (r.length < colCount) r.push('');
      return r;
    });

    const header = `| ${normalized[0].join(' | ')} |`;
    const separator = `| ${normalized[0].map(() => '---').join(' | ')} |`;
    const body = normalized
      .slice(1)
      .map((r) => `| ${r.join(' | ')} |`)
      .join('\n');

    return [header, separator, body].filter(Boolean).join('\n');
  }

  /**
   * Builds a 2D grid from a table, expanding colspan/rowspan into repeated cells.
   */
  private buildTableGrid(table: HTMLElement): string[][] {
    const rows = table.querySelectorAll('tr');
    const grid: string[][] = [];
    const rowspanTracker: Map<number, { value: string; remaining: number }[]> = new Map();

    rows.forEach((tr, rowIdx) => {
      if (!grid[rowIdx]) grid[rowIdx] = [];
      let colIdx = 0;

      // Fill in cells carried over by rowspan from previous rows
      const pending = rowspanTracker.get(rowIdx);
      if (pending) {
        for (const { value, remaining } of pending) {
          while (grid[rowIdx][colIdx] !== undefined) colIdx++;
          grid[rowIdx][colIdx] = value;
          if (remaining > 1) {
            const nextRow = rowIdx + 1;
            if (!rowspanTracker.has(nextRow)) rowspanTracker.set(nextRow, []);
            rowspanTracker.get(nextRow)!.push({ value, remaining: remaining - 1 });
          }
          colIdx++;
        }
      }

      tr.querySelectorAll('th, td').forEach((cell) => {
        // Skip past already-filled positions
        while (grid[rowIdx][colIdx] !== undefined) colIdx++;

        const text = (cell.textContent || '').trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10);
        const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10);

        for (let c = 0; c < colspan; c++) {
          grid[rowIdx][colIdx + c] = c === 0 ? text : '';
          // Track rowspan for subsequent rows
          if (rowspan > 1) {
            for (let r = 1; r < rowspan; r++) {
              const targetRow = rowIdx + r;
              if (!grid[targetRow]) grid[targetRow] = [];
              // Reserve the position - we'll fill during that row's processing
              if (!rowspanTracker.has(targetRow)) rowspanTracker.set(targetRow, []);
            }
            const nextRow = rowIdx + 1;
            if (!rowspanTracker.has(nextRow)) rowspanTracker.set(nextRow, []);
            rowspanTracker.get(nextRow)!.push({ value: c === 0 ? text : '', remaining: rowspan - 1 });
          }
        }
        colIdx += colspan;
      });
    });

    return grid.filter((r) => r.length > 0);
  }
}
