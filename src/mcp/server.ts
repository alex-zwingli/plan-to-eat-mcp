#!/usr/bin/env node
// Plan to Eat MCP server (stdio).
//
// A thin adapter: every tool comes from the shared registry in
// `src/core/tools.ts`. See `src/core/session.ts` for the env vars.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSession, MissingCredentialsError, type SessionHandle } from '../core/session.js';
import { tools } from '../core/tools.js';
import { packageVersion } from '../core/version.js';

const log = (msg: string): void => { console.error(`[plan-to-eat] ${msg}`); };

let session: SessionHandle;
try {
  session = createSession(log);
} catch (e) {
  if (e instanceof MissingCredentialsError) {
    log(e.message);
    process.exit(1);
  }
  throw e;
}

const server = new McpServer({ name: 'plan-to-eat', version: packageVersion() });

for (const def of tools) {
  server.registerTool(
    def.name,
    { description: def.description, inputSchema: def.input },
    async (args: unknown) => {
      await session.ensure();
      const result = await def.run(session.pte, (args ?? {}) as Record<string, unknown>);
      session.persist();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}

(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`mcp server ready on stdio (${tools.length} tools)`);
})().catch((e: Error) => {
  log(`startup error: ${e.stack ?? e.message}`);
  process.exit(1);
});
