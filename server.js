#!/usr/bin/env node
// Plan to Eat MCP server (stdio).
//
// Env vars (required):
//   PLAN_TO_EAT_USERNAME
//   PLAN_TO_EAT_PASSWORD
//
// Env vars (optional):
//   PLAN_TO_EAT_SESSION_FILE  Path to a JSON file used to persist the cookie
//                             session across restarts. Defaults to
//                             ~/.plan-to-eat-session.json. Set to "" to
//                             disable disk caching.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { PlanToEat } = require('./client');

const EMAIL = process.env.PLAN_TO_EAT_USERNAME;
const PASSWORD = process.env.PLAN_TO_EAT_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Missing PLAN_TO_EAT_USERNAME and/or PLAN_TO_EAT_PASSWORD env vars.');
  process.exit(1);
}

const SESSION_FILE = process.env.PLAN_TO_EAT_SESSION_FILE === ''
  ? null
  : (process.env.PLAN_TO_EAT_SESSION_FILE || path.join(os.homedir(), '.plan-to-eat-session.json'));

const pte = new PlanToEat();
pte.setCredentials({ email: EMAIL, password: PASSWORD });

let sessionReady = null;
async function ensureSession() {
  if (sessionReady) return sessionReady;
  sessionReady = (async () => {
    if (SESSION_FILE && fs.existsSync(SESSION_FILE)) {
      try {
        pte.importSession(JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')));
      } catch (e) {
        console.error('[plan-to-eat] could not load session file:', e.message);
      }
    }
    // If the session file's cookies are stale, the first API call will
    // 401/302 and the client will auto re-login (because we set credentials).
    // Force a cheap call now to surface auth errors at startup.
    try {
      await pte.getCounts();
    } catch (e) {
      // already retried inside; rethrow
      throw new Error(`Auth check failed: ${e.message}`);
    }
    if (SESSION_FILE) {
      try { fs.writeFileSync(SESSION_FILE, JSON.stringify(pte.exportSession(), null, 2)); }
      catch (e) { console.error('[plan-to-eat] could not save session file:', e.message); }
    }
  })();
  return sessionReady;
}

// Wrap a client method so every tool call ensures a session and persists any
// cookie changes back to disk.
function tool(fn) {
  return async (args) => {
    await ensureSession();
    const result = await fn(args || {});
    if (SESSION_FILE) {
      try { fs.writeFileSync(SESSION_FILE, JSON.stringify(pte.exportSession(), null, 2)); }
      catch {}
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  };
}

const server = new McpServer({ name: 'plan-to-eat', version: '0.1.0' });

const ingredientShape = z.object({
  id: z.number().int().optional().describe('Existing ingredient id (for updates)'),
  title: z.string(),
  amount: z.string().optional(),
  unit: z.string().optional(),
  note: z.string().optional(),
  position: z.number().int().optional(),
  _destroy: z.boolean().optional().describe('Set to true with id to remove an ingredient on update'),
});

const recipeWritable = {
  title: z.string().optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  url: z.string().optional(),
  servings: z.number().optional(),
  yield: z.string().optional(),
  prep_time: z.number().optional().describe('Minutes'),
  cook_time: z.number().optional().describe('Minutes'),
  total_time: z.number().optional().describe('Minutes'),
  course_id: z.number().int().nullable().optional(),
  cuisine_id: z.number().int().nullable().optional(),
  main_ingredient_id: z.number().int().nullable().optional(),
  directions: z.string().optional(),
  tag_titles: z.string().optional().describe('Comma-separated list of tag names'),
  rating: z.union([z.string(), z.number()]).optional(),
  private: z.boolean().optional(),
  draft: z.boolean().optional(),
  calories: z.string().optional(),
  sodium: z.string().optional(),
  fat: z.string().optional(),
  carbohydrate: z.string().optional(),
  protein: z.string().optional(),
  sugar: z.string().optional(),
  fiber: z.string().optional(),
  cholesterol: z.string().optional(),
  saturated_fat: z.string().optional(),
  ingredients: z.array(ingredientShape).optional()
    .describe('Maps to recipe_ingredients_attributes on the wire'),
};

server.registerTool('list_recipes', {
  description: 'List the user\'s recipe book (own + saved + queued + friend recipes). Caps at ~500 entries.',
  inputSchema: {},
}, tool(() => pte.listRecipes()));

server.registerTool('get_recipe', {
  description: 'Get a single recipe by id, including directions, ingredients, tags, prep_notes, comments.',
  inputSchema: { id: z.number().int() },
}, tool(({ id }) => pte.getRecipe(id)));

server.registerTool('create_recipe', {
  description: 'Create a new recipe. Only `title` is required. Ingredients are an array of {title, amount, unit, note, position}.',
  inputSchema: recipeWritable,
}, tool((args) => pte.createRecipe(args)));

server.registerTool('update_recipe', {
  description: 'Update an existing recipe. Pass only the fields you want to change. To remove an ingredient include {id, _destroy: true} in ingredients.',
  inputSchema: { id: z.number().int(), ...recipeWritable },
}, tool(({ id, ...patch }) => pte.updateRecipe(id, patch)));

server.registerTool('delete_recipe', {
  description: 'Delete a recipe by id.',
  inputSchema: { id: z.number().int() },
}, tool(({ id }) => pte.deleteRecipe(id)));

server.registerTool('list_courses', {
  description: 'List all courses (Appetizers, Main Course, etc.).',
  inputSchema: {},
}, tool(() => pte.listCourses()));

server.registerTool('list_cuisines', {
  description: 'List all cuisines.',
  inputSchema: {},
}, tool(() => pte.listCuisines()));

server.registerTool('list_main_ingredients', {
  description: 'List all main-ingredient categories.',
  inputSchema: {},
}, tool(() => pte.listMainIngredients()));

server.registerTool('list_tags', {
  description: 'List all tags.',
  inputSchema: {},
}, tool(() => pte.listTags()));

server.registerTool('list_planner_events', {
  description: 'List all planner (calendar) events. Each entry: { date, recipe_id, section, servings, ... }.',
  inputSchema: {},
}, tool(() => pte.listEvents()));

server.registerTool('list_menus', {
  description: 'List saved menus.',
  inputSchema: {},
}, tool(() => pte.listMenus()));

server.registerTool('get_shopping_list', {
  description: 'Get the current shopping list with sync metadata.',
  inputSchema: {},
}, tool(() => pte.getShoppingList()));

server.registerTool('list_friends', {
  description: 'List friends.',
  inputSchema: {},
}, tool(() => pte.listFriends()));

server.registerTool('get_counts', {
  description: 'Get recipe-book counts: { friends, queued, frozen }.',
  inputSchema: {},
}, tool(() => pte.getCounts()));

(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[plan-to-eat] mcp server ready on stdio');
})().catch(e => {
  console.error('[plan-to-eat] startup error:', e);
  process.exit(1);
});
