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

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PlanToEat, type PlannerSection, type Session } from './client.js';

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

let sessionReady: Promise<void> | null = null;
async function ensureSession(): Promise<void> {
  if (sessionReady) return sessionReady;
  sessionReady = (async () => {
    if (SESSION_FILE && fs.existsSync(SESSION_FILE)) {
      try {
        pte.importSession(JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) as Session);
      } catch (e) {
        const err = e as Error;
        console.error('[plan-to-eat] could not load session file:', err.message);
      }
    }
    // First call surfaces auth issues early. Auto re-login is handled inside the client.
    await pte.getCounts();
    if (SESSION_FILE) {
      try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(pte.exportSession(), null, 2));
      } catch (e) {
        const err = e as Error;
        console.error('[plan-to-eat] could not save session file:', err.message);
      }
    }
  })();
  return sessionReady;
}

type ToolResult = { content: { type: 'text'; text: string }[] };

function persistSession(): void {
  if (!SESSION_FILE) return;
  try { fs.writeFileSync(SESSION_FILE, JSON.stringify(pte.exportSession(), null, 2)); }
  catch { /* swallow */ }
}

function tool<A>(fn: (args: A) => Promise<unknown>): (args: A) => Promise<ToolResult> {
  return async (args) => {
    await ensureSession();
    const result = await fn(args ?? ({} as A));
    persistSession();
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  };
}

const server = new McpServer({ name: 'plan-to-eat', version: '0.2.0' });

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
}, tool(({ id }: { id: number }) => pte.getRecipe(id)));

server.registerTool('create_recipe', {
  description: 'Create a new recipe. Only `title` is required. Ingredients are an array of {title, amount, unit, note, position}.',
  inputSchema: recipeWritable,
}, tool((args: Record<string, unknown>) => pte.createRecipe(args)));

server.registerTool('update_recipe', {
  description: 'Update an existing recipe. Pass only the fields you want to change. To remove an ingredient include {id, _destroy: true} in ingredients.',
  inputSchema: { id: z.number().int(), ...recipeWritable },
}, tool(({ id, ...patch }: { id: number } & Record<string, unknown>) => pte.updateRecipe(id, patch)));

server.registerTool('delete_recipe', {
  description: 'Delete a recipe by id.',
  inputSchema: { id: z.number().int() },
}, tool(({ id }: { id: number }) => pte.deleteRecipe(id)));

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

const sectionSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snacks']);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

server.registerTool('get_planner_week', {
  description: 'Fetch all planner events between start_date and end_date (inclusive, YYYY-MM-DD). end_date defaults to start_date + 6 days. Recipe events are enriched with `recipe_title`.',
  inputSchema: { start_date: dateSchema, end_date: dateSchema.optional() },
}, tool(({ start_date, end_date }: { start_date: string; end_date?: string }) =>
  pte.getPlannerRange(start_date, end_date)));

server.registerTool('add_planner_recipe', {
  description: 'Add a recipe to a meal slot on the planner. Returns the newly created event (id, date, section, servings, ...).',
  inputSchema: {
    recipe_id: z.number().int(),
    date: dateSchema,
    section: sectionSchema,
    frozen_id: z.number().int().nullable().optional().describe('Pass to schedule from a frozen recipe; null for "from frozen, no specific recipe".'),
  },
}, tool((args: { recipe_id: number; date: string; section: PlannerSection; frozen_id?: number | null }) =>
  pte.createPlannerRecipe(args)));

server.registerTool('add_planner_ingredient', {
  description: 'Add a freeform "ingredient" entry to a meal slot (e.g. "2 lbs ground beef" attached to Wednesday dinner).',
  inputSchema: { title: z.string(), date: dateSchema, section: sectionSchema },
}, tool((args: { title: string; date: string; section: PlannerSection }) =>
  pte.createPlannerIngredient(args)));

server.registerTool('add_planner_note', {
  description: 'Add a freeform "note" entry to a meal slot (e.g. "Defrost chicken" on Tuesday breakfast).',
  inputSchema: { title: z.string(), date: dateSchema, section: sectionSchema },
}, tool((args: { title: string; date: string; section: PlannerSection }) =>
  pte.createPlannerNote(args)));

server.registerTool('move_planner_event', {
  description: 'Move an existing planner event to a different date and/or section. Works for recipe, note, and ingredient events.',
  inputSchema: { event_id: z.number().int(), date: dateSchema, section: sectionSchema },
}, tool(async (args: { event_id: number; date: string; section: PlannerSection }) => {
  await pte.movePlannerEvent(args);
  return { ok: true };
}));

server.registerTool('update_planner_entry_text', {
  description: 'Update the text of a note or ingredient planner entry. Note: uses the `description` field on the wire even though entries are created with `title`.',
  inputSchema: { id: z.number().int(), description: z.string() },
}, tool(async (args: { id: number; description: string }) => {
  await pte.updatePlannerEntryText(args);
  return { ok: true };
}));

server.registerTool('set_planner_servings', {
  description: 'Set the servings count on a recipe planner event.',
  inputSchema: { event_id: z.number().int(), servings: z.number().int().positive() },
}, tool(async (args: { event_id: number; servings: number }) => {
  await pte.setPlannerServings(args);
  return { ok: true };
}));

server.registerTool('duplicate_planner_event', {
  description: 'Duplicate a planner event. Set plan_leftover=true to mark the copy as a leftover.',
  inputSchema: { id: z.number().int(), plan_leftover: z.boolean().optional() },
}, tool((args: { id: number; plan_leftover?: boolean }) => pte.duplicatePlannerEvent(args)));

server.registerTool('delete_planner_event', {
  description: 'Delete a planner event by id.',
  inputSchema: { id: z.number().int() },
}, tool(async ({ id }: { id: number }) => {
  await pte.deletePlannerEvent(id);
  return { ok: true };
}));

server.registerTool('find_planned_dates', {
  description: 'Find planner events for a given recipe, optionally constrained to a date range. Useful for "is this recipe already planned this week?" checks before scheduling.',
  inputSchema: {
    recipe_id: z.number().int(),
    start_date: dateSchema.optional(),
    end_date: dateSchema.optional(),
  },
}, tool((args: { recipe_id: number; start_date?: string; end_date?: string }) =>
  pte.findPlannedDates(args)));

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
})().catch((e: Error) => {
  console.error('[plan-to-eat] startup error:', e);
  process.exit(1);
});
