// Smoke test: spawn the built server and run a few MCP tool calls.
import * as dotenv from 'dotenv';
import * as path from 'node:path';

dotenv.config({ override: true });
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ToolContent { type: string; text: string }
interface ToolResult { content: ToolContent[] }

async function main(): Promise<void> {
  const username = process.env.PLAN_TO_EAT_USERNAME ?? process.env.USERNAME;
  const password = process.env.PLAN_TO_EAT_PASSWORD ?? process.env.PASSWORD;
  if (!username || !password) throw new Error('Missing credentials env vars');

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '..', 'mcp', 'server.js')],
    env: {
      ...(process.env as Record<string, string>),
      PLAN_TO_EAT_USERNAME: username,
      PLAN_TO_EAT_PASSWORD: password,
    },
  });

  const client = new Client({ name: 'smoke', version: '0.0.1' });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log('Tools:', tools.tools.map((t) => t.name).join(', '));

  console.log('\n-- get_counts --');
  let r = (await client.callTool({ name: 'get_counts', arguments: {} })) as ToolResult;
  console.log(r.content[0].text);

  console.log('\n-- list_courses (head) --');
  r = (await client.callTool({ name: 'list_courses', arguments: {} })) as ToolResult;
  console.log(r.content[0].text.slice(0, 200) + '...');

  console.log('\n-- create + delete via MCP --');
  r = (await client.callTool({
    name: 'create_recipe',
    arguments: {
      title: 'MCP smoke test',
      servings: 1,
      directions: 'test',
      ingredients: [{ title: 'water', amount: '1', unit: 'cup' }],
    },
  })) as ToolResult;
  const created = JSON.parse(r.content[0].text) as { id: number };
  console.log('created id:', created.id);

  r = (await client.callTool({ name: 'get_recipe', arguments: { id: created.id } })) as ToolResult;
  const got = JSON.parse(r.content[0].text) as { ingredients: { amount: string; unit: string; title: string }[] };
  console.log('fetched ingredients:', got.ingredients.map((i) => `${i.amount} ${i.unit} ${i.title}`));

  r = (await client.callTool({ name: 'delete_recipe', arguments: { id: created.id } })) as ToolResult;
  console.log('deleted:', (JSON.parse(r.content[0].text) as { id: number }).id);

  await client.close();
}

main().catch((e: Error) => {
  console.error('FAIL', e);
  process.exit(1);
});
