import { ContentChunk, ExtractedContent, ContextPacket } from '../core/types';

export interface OutputTemplate {
  name: string;
  /** Template string with placeholders: {{title}}, {{url}}, {{markdown}}, {{chunks}}, {{summary}}, {{tokens}} */
  template: string;
}

const BUILT_IN_TEMPLATES: Record<string, OutputTemplate> = {
  default: {
    name: 'default',
    template: '# {{title}}\n\nSource: {{url}}\n\n{{markdown}}',
  },
  llm: {
    name: 'llm',
    template: '<context source="{{url}}" tokens="{{tokens}}">\n{{markdown}}\n</context>',
  },
  'xml-tags': {
    name: 'xml-tags',
    template: '<document>\n<title>{{title}}</title>\n<source>{{url}}</source>\n<content>\n{{markdown}}\n</content>\n</document>',
  },
  summary: {
    name: 'summary',
    template: '## {{title}}\n\n> {{summary}}\n\n**Source:** {{url}} | **Tokens:** {{tokens}}\n\n---\n\n{{markdown}}',
  },
  minimal: {
    name: 'minimal',
    template: '{{markdown}}',
  },
};

/**
 * Custom output template engine.
 * Formats extracted content using configurable templates.
 */
export class OutputFormatter {
  private templates: Map<string, OutputTemplate> = new Map();

  constructor() {
    for (const [key, tmpl] of Object.entries(BUILT_IN_TEMPLATES)) {
      this.templates.set(key, tmpl);
    }
  }

  /** Register a custom template */
  register(template: OutputTemplate): void {
    this.templates.set(template.name, template);
  }

  /** List available template names */
  list(): string[] {
    return [...this.templates.keys()];
  }

  /** Format a single page using a template */
  formatPage(page: ExtractedContent, templateName: string = 'default'): string {
    const tmpl = this.templates.get(templateName);
    if (!tmpl) throw new Error(`Unknown template: ${templateName}. Available: ${this.list().join(', ')}`);

    return tmpl.template
      .replace(/\{\{title\}\}/g, page.title)
      .replace(/\{\{url\}\}/g, page.url)
      .replace(/\{\{markdown\}\}/g, page.markdown)
      .replace(/\{\{summary\}\}/g, page.description || '')
      .replace(/\{\{tokens\}\}/g, String(Math.ceil(page.markdown.length / 4)));
  }

  /** Format a full context packet */
  formatContext(context: ContextPacket, templateName: string = 'default'): string {
    const tmpl = this.templates.get(templateName);
    if (!tmpl) throw new Error(`Unknown template: ${templateName}. Available: ${this.list().join(', ')}`);

    return tmpl.template
      .replace(/\{\{title\}\}/g, context.source)
      .replace(/\{\{url\}\}/g, context.source)
      .replace(/\{\{markdown\}\}/g, context.chunks.map(c => c.content).join('\n\n'))
      .replace(/\{\{summary\}\}/g, context.summary || '')
      .replace(/\{\{tokens\}\}/g, String(context.totalTokens))
      .replace(/\{\{chunks\}\}/g, String(context.chunks.length));
  }

  /** Format multiple pages */
  formatPages(pages: ExtractedContent[], templateName: string = 'default', separator: string = '\n\n---\n\n'): string {
    return pages.map(p => this.formatPage(p, templateName)).join(separator);
  }
}
