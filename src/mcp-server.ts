#!/usr/bin/env node
/**
 * WebContext MCP Server for Amazon Q Developer / Claude Desktop / any MCP client.
 * 
 * Usage:
 *   node dist/mcp-server.js
 * 
 * This runs as a stdio MCP server that exposes WebContext tools to AI agents.
 */
import { createMCPTools } from './sdk/mcp';

const tools = createMCPTools({
  cache: { enabled: true, ttl: 3600, maxSize: 500, contentHashing: true },
  retry: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2, retryOn: [429, 500, 502, 503, 504] },
  rateLimit: { requestsPerSecond: 2, burstSize: 5 },
});

// MCP stdio protocol implementation
const server = {
  name: 'webcontext',
  version: '2.1.0',
  tools: tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
};

function sendResponse(id: string | number, result: any) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);
}

function sendError(id: string | number | null, code: number, message: string) {
  const msg = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);
}

async function handleRequest(request: any) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      sendResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: server.name, version: server.version },
      });
      break;

    case 'tools/list':
      sendResponse(id, { tools: server.tools });
      break;

    case 'tools/call': {
      const tool = tools.find(t => t.name === params.name);
      if (!tool) {
        sendError(id, -32602, `Unknown tool: ${params.name}`);
        return;
      }
      try {
        const result = await tool.handler(params.arguments || {});
        sendResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (err: any) {
        sendResponse(id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        });
      }
      break;
    }

    case 'notifications/initialized':
      // No response needed for notifications
      break;

    default:
      if (id) sendError(id, -32601, `Method not found: ${method}`);
  }
}

// Read stdio input (Content-Length header framing)
let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.slice(bodyStart, bodyStart + contentLength);
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const request = JSON.parse(body);
      handleRequest(request);
    } catch (err: any) {
      sendError(null, -32700, 'Parse error');
    }
  }
});

process.stderr.write('WebContext MCP Server started\n');
