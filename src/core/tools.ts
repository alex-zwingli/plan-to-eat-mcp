// The tool registry: one declarative entry per capability, consumed by both
// adapters. `src/mcp/server.ts` turns each entry into an MCP tool;
// `src/cli/main.ts` turns each into a subcommand. Add a tool here and it shows
// up in both surfaces with the same name, schema, and description.

import { z } from 'zod';
import type {
  PlanToEat, PlannerSection, RecipeWritable, ShoppingListItemInput,
} from './client.js';

export type ToolGroup =
  | 'recipes' | 'lookup' | 'planner-read' | 'planner-write' | 'freezer' | 'shopping' | 'other';

export const TOOL_GROUP_LABELS: Record<ToolGroup, string> = {
  recipes: 'Recipes',
  lookup: 'Lookup tables',
  'planner-read': 'Planner (read)',
  'planner-write': 'Planner (write)',
  freezer: 'Freezer',
  shopping: 'Shopping list',
  other: 'Other',
};

export interface ToolDef {
  name: string;
  group: ToolGroup;
  description: string;
  /** A Zod *raw shape* — MCP consumes it directly; the CLI wraps it in z.object(). */
  input: z.ZodRawShape;
  /** Fields accepted positionally on the CLI, in order, before any flags. */
  positional?: string[];
  /** Preferred columns when the CLI renders an array result as a table. */
  columns?: string[];
  run(pte: PlanToEat, args: Record<string, unknown>): Promise<unknown>;
}

/** Preserves per-tool arg inference at the definition site. */
function defineTool<S extends z.ZodRawShape>(def: {
  name: string;
  group: ToolGroup;
  description: string;
  input: S;
  positional?: (keyof S & string)[];
  columns?: string[];
  run: (pte: PlanToEat, args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}): ToolDef {
  return def as unknown as ToolDef;
}

/** Planner writes return empty bodies; report a uniform acknowledgement. */
const ok = async (p: Promise<unknown>): Promise<{ ok: true }> => { await p; return { ok: true }; };

// ---------------------------------------------------------------- schemas

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

const shoppingItemShape = z.object({
  title: z.string().describe('What to buy, e.g. "sliced almonds"'),
  amount: z.string().optional().describe('Quantity as text, e.g. "2" or "1/2"'),
  unit: z.string().optional().describe('e.g. "cup", "lb", "can"'),
  note: z.string().optional().describe('Free-text note on the line, e.g. "get the low-sodium one"'),
  category_id: z.number().int().optional()
    .describe('Aisle, from list_grocery_categories. Omit and Plan to Eat picks one.'),
  store_id: z.number().int().optional()
    .describe('Store, from list_stores. Omit to reuse the store last used for this item.'),
});

// A shopping list line is addressed by `item_ids`, not a scalar id: Plan to Eat
// merges duplicate ingredients into one line that keeps every underlying id.
const SHOPPING_COLUMNS = [
  'item_ids', 'amount', 'unit', 'title', 'store_title', 'grocery_category_title',
  'extra_notes', 'recipe_ids',
];

const sectionSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snacks']);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

// Note and ingredient entries carry their text in `description` (`title` is
// null for notes); recipe entries get `recipe_title` from getPlannerRange.
const EVENT_COLUMNS = ['id', 'date', 'section', 'kind', 'recipe_id', 'recipe_title', 'description', 'servings'];

// ---------------------------------------------------------------- registry

export const tools: ToolDef[] = [
  // -- Recipes ----------------------------------------------------------
  defineTool({
    name: 'list_recipes',
    group: 'recipes',
    description: "List the user's recipe book (own + saved + queued + friend recipes). Caps at ~500 entries.",
    input: {},
    columns: ['id', 'title', 'course_title', 'cuisine_title', 'total_time', 'rating'],
    run: (pte) => pte.listRecipes(),
  }),
  defineTool({
    name: 'get_recipe',
    group: 'recipes',
    description: 'Get a single recipe by id, including directions, ingredients, tags, prep_notes, comments.',
    input: { id: z.number().int() },
    positional: ['id'],
    run: (pte, { id }) => pte.getRecipe(id),
  }),
  defineTool({
    name: 'create_recipe',
    group: 'recipes',
    description: 'Create a new recipe. Only `title` is required. Ingredients are an array of {title, amount, unit, note, position}.',
    input: recipeWritable,
    run: (pte, args) => pte.createRecipe(args as RecipeWritable),
  }),
  defineTool({
    name: 'update_recipe',
    group: 'recipes',
    description: 'Update an existing recipe. Pass only the fields you want to change. To remove an ingredient include {id, _destroy: true} in ingredients.',
    input: { id: z.number().int(), ...recipeWritable },
    positional: ['id'],
    run: (pte, { id, ...patch }) => pte.updateRecipe(id, patch as RecipeWritable),
  }),
  defineTool({
    name: 'delete_recipe',
    group: 'recipes',
    description: 'Delete a recipe by id.',
    input: { id: z.number().int() },
    positional: ['id'],
    run: (pte, { id }) => pte.deleteRecipe(id),
  }),

  // -- Lookup tables ----------------------------------------------------
  defineTool({
    name: 'list_courses',
    group: 'lookup',
    description: 'List all courses (Appetizers, Main Course, etc.).',
    input: {},
    columns: ['id', 'title', 'owned'],
    run: (pte) => pte.listCourses(),
  }),
  defineTool({
    name: 'list_cuisines',
    group: 'lookup',
    description: 'List all cuisines.',
    input: {},
    columns: ['id', 'title', 'owned'],
    run: (pte) => pte.listCuisines(),
  }),
  defineTool({
    name: 'list_main_ingredients',
    group: 'lookup',
    description: 'List all main-ingredient categories.',
    input: {},
    columns: ['id', 'title', 'owned'],
    run: (pte) => pte.listMainIngredients(),
  }),
  defineTool({
    name: 'list_tags',
    group: 'lookup',
    description: 'List all tags.',
    input: {},
    columns: ['id', 'title', 'owned'],
    run: (pte) => pte.listTags(),
  }),
  defineTool({
    name: 'list_stores',
    group: 'lookup',
    description: "List the user's grocery stores. Use the ids as `store_id` when adding or re-filing shopping list items.",
    input: {},
    columns: ['id', 'title'],
    run: (pte) => pte.listStores(),
  }),
  defineTool({
    name: 'list_grocery_categories',
    group: 'lookup',
    description: "List the user's grocery aisles (Produce, Dairy, ...). Use the ids as `category_id` on shopping list items.",
    input: {},
    columns: ['id', 'title', 'position'],
    run: (pte) => pte.listGroceryCategories(),
  }),

  // -- Planner: read ----------------------------------------------------
  defineTool({
    name: 'list_planner_events',
    group: 'planner-read',
    description: 'List all planner (calendar) events. Each entry: { date, recipe_id, section, servings, ... }.',
    input: {},
    columns: EVENT_COLUMNS,
    run: (pte) => pte.listEvents(),
  }),
  defineTool({
    name: 'get_planner_week',
    group: 'planner-read',
    description: 'Fetch all planner events between start_date and end_date (inclusive, YYYY-MM-DD). end_date defaults to start_date + 6 days. Recipe events are enriched with `recipe_title`.',
    input: { start_date: dateSchema, end_date: dateSchema.optional() },
    positional: ['start_date', 'end_date'],
    columns: EVENT_COLUMNS,
    run: (pte, { start_date, end_date }) => pte.getPlannerRange(start_date, end_date),
  }),
  defineTool({
    name: 'find_planned_dates',
    group: 'planner-read',
    description: 'Find planner events for a given recipe, optionally constrained to a date range. Useful for "is this recipe already planned this week?" checks before scheduling.',
    input: {
      recipe_id: z.number().int(),
      start_date: dateSchema.optional(),
      end_date: dateSchema.optional(),
    },
    positional: ['recipe_id'],
    columns: EVENT_COLUMNS,
    run: (pte, args) => pte.findPlannedDates(args),
  }),

  // -- Planner: write ---------------------------------------------------
  defineTool({
    name: 'add_planner_recipe',
    group: 'planner-write',
    description: 'Add a recipe to a meal slot on the planner. Returns the newly created event (id, date, section, servings, ...).',
    input: {
      recipe_id: z.number().int(),
      date: dateSchema,
      section: sectionSchema,
      frozen_id: z.number().int().nullable().optional()
        .describe('Pass to schedule from a frozen recipe; null for "from frozen, no specific recipe".'),
    },
    positional: ['recipe_id', 'date', 'section'],
    run: (pte, args) => pte.createPlannerRecipe(args as {
      recipe_id: number; date: string; section: PlannerSection; frozen_id?: number | null;
    }),
  }),
  defineTool({
    name: 'add_planner_ingredient',
    group: 'planner-write',
    description: 'Add a freeform "ingredient" entry to a meal slot (e.g. "2 lbs ground beef" attached to Wednesday dinner).',
    input: { title: z.string(), date: dateSchema, section: sectionSchema },
    positional: ['title', 'date', 'section'],
    run: (pte, args) => pte.createPlannerIngredient(args),
  }),
  defineTool({
    name: 'add_planner_note',
    group: 'planner-write',
    description: 'Add a freeform "note" entry to a meal slot (e.g. "Defrost chicken" on Tuesday breakfast).',
    input: { title: z.string(), date: dateSchema, section: sectionSchema },
    positional: ['title', 'date', 'section'],
    run: (pte, args) => pte.createPlannerNote(args),
  }),
  defineTool({
    name: 'add_leftover_meal',
    group: 'planner-write',
    description: 'Schedule a leftover meal derived from a previously planned recipe event. Duplicates the source event with `plan_leftover=true` and optionally moves the duplicate to a different date/section. Returns the new event.',
    input: {
      source_event_id: z.number().int(),
      date: dateSchema.optional().describe('If omitted, leftover lands on the same date as the source event.'),
      section: sectionSchema.optional().describe('If omitted, leftover lands in the same section as the source event.'),
    },
    positional: ['source_event_id', 'date', 'section'],
    run: (pte, args) => pte.addLeftoverMeal(args),
  }),
  defineTool({
    name: 'move_planner_event',
    group: 'planner-write',
    description: 'Move an existing planner event to a different date and/or section. Works for recipe, note, and ingredient events.',
    input: { event_id: z.number().int(), date: dateSchema, section: sectionSchema },
    positional: ['event_id', 'date', 'section'],
    run: (pte, args) => ok(pte.movePlannerEvent(args)),
  }),
  defineTool({
    name: 'reorder_planner_events',
    group: 'planner-write',
    description: 'Reorder events within a section. Pass `event_ids` in the desired order. All events should belong to the same date+section for the reorder to be meaningful.',
    input: { event_ids: z.array(z.number().int()).min(1) },
    run: (pte, { event_ids }) => ok(pte.reorderPlannerEvents(event_ids)),
  }),
  defineTool({
    name: 'update_planner_entry_text',
    group: 'planner-write',
    description: 'Update the text of a note or ingredient planner entry. Note: uses the `description` field on the wire even though entries are created with `title`.',
    input: { id: z.number().int(), description: z.string() },
    positional: ['id', 'description'],
    run: (pte, args) => ok(pte.updatePlannerEntryText(args)),
  }),
  defineTool({
    name: 'set_planner_servings',
    group: 'planner-write',
    description: 'Set the servings count on a recipe planner event.',
    input: { event_id: z.number().int(), servings: z.number().int().positive() },
    positional: ['event_id', 'servings'],
    run: (pte, args) => ok(pte.setPlannerServings(args)),
  }),
  defineTool({
    name: 'duplicate_planner_event',
    group: 'planner-write',
    description: 'Duplicate a planner event. Set plan_leftover=true to mark the copy as a leftover.',
    input: { id: z.number().int(), plan_leftover: z.boolean().optional() },
    positional: ['id'],
    run: (pte, args) => pte.duplicatePlannerEvent(args),
  }),
  defineTool({
    name: 'delete_planner_event',
    group: 'planner-write',
    description: 'Delete a planner event by id.',
    input: { id: z.number().int() },
    positional: ['id'],
    run: (pte, { id }) => ok(pte.deletePlannerEvent(id)),
  }),
  defineTool({
    name: 'update_planner_options',
    group: 'planner-write',
    description: 'Update planner display/behaviour preferences (time_zone, planner_start_day, calendar_settings.show_calories, etc). Use Rails-style nested keys like `user[time_zone]` or `calendar_settings[show_calories]`. Rarely needed.',
    input: { options: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) },
    run: (pte, { options }) => ok(pte.updatePlannerOptions(options)),
  }),

  // -- Freezer ----------------------------------------------------------
  defineTool({
    name: 'list_frozen_recipes',
    group: 'freezer',
    description: "List what's in the freezer. Each entry: { id, recipe_id, count, servings, frozen_on }. By default only returns active entries (count > 0); pass include_consumed=true to also see history (the API soft-deletes by zeroing the count rather than removing the row).",
    input: { include_consumed: z.boolean().optional() },
    columns: ['id', 'recipe_id', 'count', 'servings', 'frozen_on'],
    run: (pte, { include_consumed }) => pte.listFrozenRecipes({ include_consumed }),
  }),
  defineTool({
    name: 'freeze_recipe_portions',
    group: 'freezer',
    description: 'Mark N portions of a previously cooked recipe as frozen. `event_id` ties the frozen entry back to the planner event the portions came from.',
    input: {
      recipe_id: z.number().int(),
      event_id: z.number().int().describe('The planner event the portions came from (typically the recipe event you just cooked).'),
      count: z.number().int().nonnegative().describe('Number of frozen portions / containers.'),
      servings: z.number().positive().describe('Servings per portion (e.g. 1.0 means each container = 1 serving).'),
    },
    positional: ['recipe_id', 'event_id', 'count', 'servings'],
    run: (pte, args) => ok(pte.freezeRecipePortions(args)),
  }),
  defineTool({
    name: 'delete_frozen_recipe',
    group: 'freezer',
    description: 'Mark a frozen entry as consumed (the portion was eaten or thrown out). Soft-delete: API sets count to 0; the entry persists as history.',
    input: { id: z.number().int() },
    positional: ['id'],
    run: (pte, { id }) => pte.deleteFrozenRecipe(id),
  }),

  // -- Shopping list ----------------------------------------------------
  defineTool({
    name: 'get_shopping_list',
    group: 'shopping',
    description: "Read the shopping list. Each line gives what to buy plus the store it's assigned to (`store_title` / `store_id`, where a null `store_id` means the account's default store) and the aisle it's filed under (`grocery_category_title` / `grocery_category_id`). `item_ids` is the handle for updating or removing that line — Plan to Eat merges duplicate ingredients into one line, so it's an array. `recipe_ids` shows which planned recipes pulled the item in.",
    input: {},
    columns: SHOPPING_COLUMNS,
    run: (pte) => pte.getShoppingListItems(),
  }),
  defineTool({
    name: 'add_shopping_list_items',
    group: 'shopping',
    description: "Add items to the shopping list. Only `title` is required per item. Leave `category_id` out and Plan to Eat guesses the aisle; leave `store_id` out and the item goes to the store it was last bought at, falling back to the default store if it's new. Returns the lines that were created.",
    input: { items: z.array(shoppingItemShape).min(1) },
    columns: SHOPPING_COLUMNS,
    run: (pte, { items }) => pte.addShoppingListItems(items as ShoppingListItemInput[]),
  }),
  defineTool({
    name: 'update_shopping_list_items',
    group: 'shopping',
    description: "Change shopping list lines. Pass `item_ids` from get_shopping_list — naming any id of a line affects that whole line. Moving items to a different store or aisle (`store_id` / `category_id` on their own) works across as many lines as you like; editing the text (`title`, `amount`, `unit`, `note`) applies to one line at a time, and collapses a merged line into a single row keeping its combined quantity. Returns the lines as they now stand, so re-read `item_ids` from the result rather than reusing the ones you sent.",
    input: {
      item_ids: z.array(z.number().int()).min(1)
        .describe('Ids from a line\'s `item_ids` in get_shopping_list.'),
      title: z.string().optional(),
      amount: z.string().optional(),
      unit: z.string().optional(),
      note: z.string().optional().describe('Replaces the line\'s free-text note.'),
      category_id: z.number().int().optional().describe('Aisle, from list_grocery_categories.'),
      store_id: z.number().int().optional().describe('Store, from list_stores.'),
    },
    columns: SHOPPING_COLUMNS,
    run: (pte, args) => pte.updateShoppingListItems(args),
  }),
  defineTool({
    name: 'remove_shopping_list_items',
    group: 'shopping',
    description: "Remove lines from the shopping list. This is a soft delete, the same one the app does, and restore_shopping_list_items undoes it — but nothing can list removed lines, so keep the item_ids around if the removal might need undoing.",
    input: {
      item_ids: z.array(z.number().int()).min(1)
        .describe('The `item_ids` array from get_shopping_list.'),
    },
    run: (pte, { item_ids }) => ok(pte.deleteShoppingListItems(item_ids)),
  }),
  defineTool({
    name: 'restore_shopping_list_items',
    group: 'shopping',
    description: 'Put previously removed shopping list lines back on the list. Takes the item_ids the line had before it was removed.',
    input: {
      item_ids: z.array(z.number().int()).min(1)
        .describe('The `item_ids` the line had before remove_shopping_list_items took it off.'),
    },
    run: (pte, { item_ids }) => ok(pte.restoreShoppingListItems(item_ids)),
  }),

  // -- Other ------------------------------------------------------------
  defineTool({
    name: 'list_menus',
    group: 'other',
    description: 'List saved menus.',
    input: {},
    columns: ['id', 'title', 'date_from', 'date_to', 'event_count', 'day_count'],
    run: (pte) => pte.listMenus(),
  }),
  defineTool({
    name: 'list_friends',
    group: 'other',
    description: 'List friends.',
    input: {},
    columns: ['id', 'login', 'full_name', 'menus_count'],
    run: (pte) => pte.listFriends(),
  }),
  defineTool({
    name: 'get_counts',
    group: 'other',
    description: 'Get recipe-book counts: { friends, queued, frozen }.',
    input: {},
    run: (pte) => pte.getCounts(),
  }),
];

export const toolsByName: ReadonlyMap<string, ToolDef> = new Map(tools.map((t) => [t.name, t]));
