// Smoke test: spawn server.js and run a few MCP tool calls.
require('dotenv').config({ override: true });
const { spawn } = require('child_process');
const path = require('path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

(async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, 'server.js')],
    env: {
      ...process.env,
      PLAN_TO_EAT_USERNAME: process.env.USERNAME,  // already-overridden by .env
      PLAN_TO_EAT_PASSWORD: process.env.PASSWORD,
    },
  });

  const client = new Client({ name: 'smoke', version: '0.0.1' });
  await client.connect(transport);

  const tools = await client.listTools();
  console.log('Tools:', tools.tools.map(t => t.name).join(', '));

  console.log('\n-- get_counts --');
  let r = await client.callTool({ name: 'get_counts', arguments: {} });
  console.log(r.content[0].text);

  console.log('\n-- list_courses (head) --');
  r = await client.callTool({ name: 'list_courses', arguments: {} });
  console.log(r.content[0].text.slice(0, 200) + '...');

  console.log('\n-- create + delete via MCP --');
  r = await client.callTool({ name: 'create_recipe', arguments: {
    title: 'MCP smoke test',
    servings: 1,
    directions: 'test',
    ingredients: [{ title: 'water', amount: '1', unit: 'cup' }],
  }});
  const created = JSON.parse(r.content[0].text);
  console.log('created id:', created.id);

  r = await client.callTool({ name: 'get_recipe', arguments: { id: created.id } });
  const got = JSON.parse(r.content[0].text);
  console.log('fetched ingredients:', got.ingredients.map(i => `${i.amount} ${i.unit} ${i.title}`));

  r = await client.callTool({ name: 'delete_recipe', arguments: { id: created.id } });
  console.log('deleted:', JSON.parse(r.content[0].text).id);

  await client.close();
})().catch(e => {
  console.error('FAIL', e);
  process.exit(1);
});
