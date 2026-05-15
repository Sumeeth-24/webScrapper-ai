import { ExtractedContent, Heading, LinkInfo } from '../core/types';

/**
 * GitHub repository extractor.
 * Fetches README and optionally docs folder from GitHub repos.
 */
export class GitHubExtractor {
  constructor() {}

  isGitHubUrl(url: string): boolean {
    return /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+/.test(url);
  }

  parseRepoUrl(url: string): { owner: string; repo: string; branch?: string; path?: string } | null {
    const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/([\w.-]+)(?:\/(.+))?)?/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], branch: match[3], path: match[4] };
  }

  async extractReadme(url: string): Promise<ExtractedContent> {
    const parsed = this.parseRepoUrl(url);
    if (!parsed) throw new Error(`Invalid GitHub URL: ${url}`);

    const { owner, repo, branch } = parsed;
    const ref = branch || 'main';

    // Try fetching README
    const readmeUrls = [
      `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/README.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/readme.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/Readme.md`,
      `https://raw.githubusercontent.com/${owner}/${repo}/master/README.md`,
    ];

    let markdown = '';
    let fetchedUrl = '';
    for (const readmeUrl of readmeUrls) {
      try {
        const res = await fetch(readmeUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          markdown = await res.text();
          fetchedUrl = readmeUrl;
          break;
        }
      } catch {}
    }

    if (!markdown) throw new Error(`Could not find README for ${owner}/${repo}`);

    // Extract headings from markdown
    const headings: Heading[] = [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(markdown)) !== null) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }

    // Extract links
    const links: LinkInfo[] = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = linkRegex.exec(markdown)) !== null) {
      const href = match[2].startsWith('http') ? match[2] : `https://github.com/${owner}/${repo}/blob/${ref}/${match[2]}`;
      links.push({ href, text: match[1], isInternal: !match[2].startsWith('http') });
    }

    // Fetch repo metadata from API (no auth needed for public repos)
    let description = '';
    let tags: string[] = [];
    try {
      const apiRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(5000),
      });
      if (apiRes.ok) {
        const repoData = await apiRes.json();
        description = repoData.description || '';
        tags = repoData.topics || [];
      }
    } catch {}

    return {
      url,
      title: `${owner}/${repo}`,
      description,
      markdown,
      text: markdown.replace(/[#*`\[\]()>-]/g, ' ').replace(/\s+/g, ' ').trim(),
      codeBlocks: this.extractCodeBlocks(markdown),
      headings,
      links,
      metadata: {
        author: owner,
        type: 'readme',
        tags,
        siteName: 'GitHub',
      },
      timestamp: new Date().toISOString(),
    };
  }

  async extractDocs(url: string, docsPath: string = 'docs'): Promise<ExtractedContent[]> {
    const parsed = this.parseRepoUrl(url);
    if (!parsed) throw new Error(`Invalid GitHub URL: ${url}`);

    const { owner, repo, branch } = parsed;
    const ref = branch || 'main';

    // Fetch directory listing from GitHub API
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${docsPath}?ref=${ref}`;
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return [];
    const files: any[] = await res.json();
    const mdFiles = files.filter((f: any) => f.name.endsWith('.md') && f.type === 'file');

    const results: ExtractedContent[] = [];
    for (const file of mdFiles) {
      try {
        const contentRes = await fetch(file.download_url, { signal: AbortSignal.timeout(10000) });
        if (!contentRes.ok) continue;
        const markdown = await contentRes.text();

        const headings: Heading[] = [];
        const headingRegex = /^(#{1,6})\s+(.+)$/gm;
        let match: RegExpExecArray | null;
        while ((match = headingRegex.exec(markdown)) !== null) {
          headings.push({ level: match[1].length, text: match[2].trim() });
        }

        results.push({
          url: file.html_url,
          title: headings[0]?.text || file.name.replace('.md', ''),
          markdown,
          text: markdown.replace(/[#*`\[\]()>-]/g, ' ').replace(/\s+/g, ' ').trim(),
          codeBlocks: this.extractCodeBlocks(markdown),
          headings,
          links: [],
          metadata: { type: 'documentation', siteName: 'GitHub' },
          timestamp: new Date().toISOString(),
        });
      } catch {}
    }

    return results;
  }

  private extractCodeBlocks(markdown: string): { language: string; code: string; context?: string }[] {
    const blocks: { language: string; code: string; context?: string }[] = [];
    const regex = /```(\w*)\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({ language: match[1] || 'text', code: match[2].trim() });
    }
    return blocks;
  }
}
