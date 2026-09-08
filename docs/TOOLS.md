# Tool reference

Every tool exposed by the `plan-to-eat-mcp` server. Inputs use the JSON-Schema shape MCP hosts already understand; types here are abbreviated.

- [Recipes](#recipes) — list, get, create, update, delete
- [Lookup tables](#lookup-tables) — courses, cuisines, main ingredients, tags, stores, grocery categories
- [Planner: read](#planner-read) — view events, get a week's plan
- [Planner: write](#planner-write) — add/move/edit/delete planner events, reorder, leftovers
- [Freezer](#freezer) — list / add / consume frozen portions
- [Shopping list](#shopping-list) — read the list, add / update / remove items
- [Other](#other) — friends, menus, counts, planner options

---

## Recipes

### `list_recipes`
List the user's recipe book (own + saved + queued + friend recipes). Capped at ~500 entries by the upstream API; pagination params don't work.

- **Input**: none
- **Returns**: `RecipeSummary[]` — id, title, course/cuisine titles, tag titles, total time, ingredient titles (no directions)
- **Notes**: Use this as the catalog. For full recipe content, follow up with `get_recipe`.

### `get_recipe`
Get a single recipe with full detail.

- **Input**: `{ id: number }`
- **Returns**: `Recipe` — adds `directions`, `ingredients[]`, `tags[]`, `prep_notes`, `comments`
- **Notes**: An ingredient is `{ id, title, amount, unit, note, position, ... }`.

### `create_recipe`
Create a new recipe. Only `title` is required.

- **Input**: subset of `{ title, description, source, url, servings, yield, prep_time, cook_time, total_time, course_id, cuisine_id, main_ingredient_id, directions, tag_titles, rating, private, draft, calories, sodium, fat, carbohydrate, protein, sugar, fiber, cholesterol, saturated_fat, ingredients }`
- **Returns**: full `Recipe`
- **Notes**:
  - `ingredients` is the friendly alias for the wire field `recipe_ingredients_attributes`. Each entry: `{ title, amount, unit, note, position }`.
  - `tag_titles` is a comma-separated string, not an array.
  - `prep_time` / `cook_time` / `total_time` are minutes.
  - For URL-imported recipes, set `url` and Plan to Eat may auto-populate fields server-side.

### `update_recipe`
Patch any subset of the writable fields above.

- **Input**: `{ id: number, ...patch }`
- **Returns**: full `Recipe`
- **Notes**: To remove an existing ingredient, include `{ id, _destroy: true }` in `ingredients`.

### `delete_recipe`
Delete a recipe by id.

- **Input**: `{ id: number }`
- **Returns**: the deleted `Recipe`

---

## Lookup tables

Small tables that map human-friendly names to the integer ids the write endpoints want. The recipe ones return `[{ id, title, owned }]`; the shopping list ones are noted below.

### `list_courses`
Appetizers, Main Course, Dessert, etc.

### `list_cuisines`
Italian, Thai, Mexican, etc.

### `list_main_ingredients`
Beef, Chicken, Fish, Pasta, etc.

### `list_tags`
Free-form tags the user has applied across their recipe book.

### `list_stores`
The user's grocery stores — `[{ id, title }]`. These ids are what `store_id` means on a shopping list item.

### `list_grocery_categories`
The user's grocery aisles: Produce, Dairy, Frozen, etc. — `[{ id, title, position }]`. These ids are what `category_id` means on a shopping list item.

---

## Planner: read

### `list_planner_events`
List **all** planner events. No date filter — returns the entire calendar.

- **Input**: none
- **Returns**: `PlannerEvent[]`
- **Notes**: For a date range, prefer `get_planner_week`. Useful when you need the full set (e.g. searching across many months).

### `get_planner_week`
Fetch planner events in a date range, with recipe titles enriched.

- **Input**: `{ start_date: "YYYY-MM-DD", end_date?: "YYYY-MM-DD" }`. `end_date` defaults to `start_date + 6 days`.
- **Returns**: `{ start_date, end_date, events: PlannerEvent[] }` — events sorted by date, then position, with `recipe_title` added on recipe events
- **Notes**: This is the right tool for "what's on my plan this week". Implementation filters `list_planner_events` and joins against `list_recipes` client-side.

---

## Planner: write

All write operations target the Rails web controllers at `/planner/*`, not `/api/v1/`. The server returns empty bodies on creates/duplicates, so the MCP recovers new event IDs by diffing `list_planner_events` before and after. If a diff misses (concurrent change), the call returns `null`.

### `add_planner_recipe`
Schedule a recipe on a meal slot.

- **Input**: `{ recipe_id, date, section, frozen_id? }`
- **Returns**: the new `PlannerEvent` (or `null` if the diff missed)
- **Notes**: `frozen_id` is for scheduling from frozen. Pass `null` for "from frozen, no specific recipe"; omit for a normal recipe schedule.

### `add_planner_ingredient`
Add a freeform ingredient entry to a meal slot — e.g. "2 lbs ground beef" attached to Wednesday dinner.

- **Input**: `{ title, date, section }`
- **Returns**: new `PlannerEvent` with `kind: "ingredient"`

### `add_planner_note`
Add a freeform note to a meal slot — e.g. "Defrost chicken" on Tuesday breakfast.

- **Input**: `{ title, date, section }`
- **Returns**: new `PlannerEvent` with `kind: "note"`

### `move_planner_event`
Move an existing event to a different date and/or section. Works for recipes, notes, and ingredients alike.

- **Input**: `{ event_id, date, section }`
- **Returns**: `{ ok: true }`
- **Notes**: Server-side, `section=dinner` may normalize to `supper` based on the user's account config. Read-back via `list_planner_events` will reflect the canonical name.

### `update_planner_entry_text`
Rewrite the text of a note or ingredient entry.

- **Input**: `{ id, description }`
- **Returns**: `{ ok: true }`
- **Notes**: The wire field is `description`, even though create-side uses `title`. This is an upstream Rails inconsistency, mirrored faithfully.

### `set_planner_servings`
Set the servings count on a recipe event.

- **Input**: `{ event_id, servings }`
- **Returns**: `{ ok: true }`
- **Notes**: Only meaningful on `kind: "recipe"` events. Has no effect on notes/ingredients.

### `duplicate_planner_event`
Duplicate any planner event.

- **Input**: `{ id, plan_leftover?: boolean }`
- **Returns**: the new `PlannerEvent` (or `null` if the diff missed)
- **Notes**: `plan_leftover: true` marks the copy as a leftover (Plan to Eat's "eat the leftovers" tracking). Defaults to `false`.

### `delete_planner_event`
Delete a planner event by id.

- **Input**: `{ id }`
- **Returns**: `{ ok: true }`

### `find_planned_dates`
Find planner events for a given recipe, optionally constrained to a date range.

- **Input**: `{ recipe_id, start_date?, end_date? }`
- **Returns**: `PlannerEvent[]`
- **Notes**: Useful for "is this already planned this week?" checks before scheduling. Implemented by filtering `list_planner_events` client-side; the upstream `/planner/search_dates` endpoint returns rendered HTML and isn't usable as a data API.

### `reorder_planner_events`
Reorder events within a section.

- **Input**: `{ event_ids: number[] }` — ids in the desired order
- **Returns**: `{ ok: true }`
- **Notes**: All ids should belong to the same date+section for the reorder to be meaningful. Wire format: `ids=e<id1>,e<id2>` to `POST /planner/update_order`.

### `add_leftover_meal`
Schedule a leftover meal derived from a previously planned recipe event.

- **Input**: `{ source_event_id, date?, section? }` — `date`/`section` default to the source event's date/section
- **Returns**: the new `PlannerEvent`
- **Notes**: Convenience wrapper. Internally `duplicate_planner_event` with `plan_leftover=true`, then `move_planner_event` if a different `date`/`section` was requested.

---

## Freezer

The "freezer" is Plan to Eat's tracking of cooked-and-frozen portions: after cooking a planned meal, you can mark N portions as frozen for later use. Each entry is `{ id, recipe_id, count, servings, frozen_on }` — `count` is portions remaining, `servings` is per-portion size. The API soft-deletes by setting `count: 0` rather than removing rows.

### `list_frozen_recipes`
What's currently in the freezer.

- **Input**: `{ include_consumed?: boolean }` — defaults to `false` (only `count > 0`)
- **Returns**: `FrozenRecipe[]`
- **Notes**: With `include_consumed: true` you also see history (entries that were consumed/thrown out — `count = 0`).

### `freeze_recipe_portions`
Mark N portions of a previously cooked recipe as frozen.

- **Input**: `{ recipe_id, event_id, count, servings }` — `event_id` is the planner event the portions came from (typically the recipe event you just cooked); `servings` is per-portion (e.g. `1.0` means each container = 1 serving).
- **Returns**: `{ ok: true }`. Use `list_frozen_recipes` afterwards to recover the new id.

### `delete_frozen_recipe`
Mark a frozen entry as consumed (eaten or thrown out).

- **Input**: `{ id }`
- **Returns**: the entry as the API stored it (with `count: 0`).
- **Notes**: Soft-delete — the entry persists as history. After this call, the entry no longer appears in `list_frozen_recipes()` unless `include_consumed: true` is passed.

---

## Shopping list

Reads come from the JSON API. Writes don't have a JSON equivalent, so they go through the same form-encoded `/shopping_lists/update` controller the web app posts to — one endpoint that adds, re-files, edits, and removes depending on which keys it's sent. The client hides that; it also scrapes the account's shopping list id off the list page once per session, since nothing exposes it as JSON.

**Lines, not items.** Plan to Eat merges duplicate ingredients — the same garlic pulled in by three planned recipes — into one line. So a line has no scalar id: it has an `item_ids` array holding every underlying row. Pass that array back to update or remove the line.

### `get_shopping_list`
Read the shopping list.

- **Input**: none
- **Returns**: `ShoppingListItem[]` — `{ item_ids, title, amount, unit, extra_notes, store_id, store_title, grocery_category_id, grocery_category_title, recipe_ids, event_ids, purchased, ... }`
- **Notes**:
  - **Store**: `store_title` always names the store; `store_id` is `null` for the account's default store (the one with the heart in the app) and a `list_stores` id otherwise.
  - **Aisle**: `grocery_category_title` is resolved for you from `list_grocery_categories`; both it and `grocery_category_id` are `null` when Plan to Eat couldn't guess an aisle.
  - `recipe_ids` is which planned recipes pulled the item onto the list; a line with an empty `recipe_ids` was added by hand.
  - Removed lines are never returned — see `remove_shopping_list_items`.

### `add_shopping_list_items`
Add items to the shopping list.

- **Input**: `{ items: { title, amount?, unit?, note?, category_id?, store_id? }[] }` — only `title` is required per item
- **Returns**: the created `ShoppingListItem[]`
- **Notes**:
  - Omit `category_id` and the client asks Plan to Eat's `/recommend_category` for the aisle, the same guess the app's add-items dialog makes as you type. It comes back empty for titles it doesn't recognise, which leaves the line uncategorized.
  - Omit `store_id` and the client asks `/shopping_lists/last_store_designated` which store that item was last bought at, falling back to the account's default store when it's new. This is the dialog's "Auto-select" — note that the `autoStore` form field alone does *not* do it: the server ignores that field, it only tells the browser to run the lookup.
  - `note` is the line's own free-text note; it comes back as `extra_notes`.
  - The endpoint returns nothing useful, so created lines are recovered by diffing item ids across the write.

### `update_shopping_list_items`
Change shopping list lines.

- **Input**: `{ item_ids: number[], title?, amount?, unit?, note?, category_id?, store_id? }`
- **Returns**: the affected `ShoppingListItem[]`, as they now stand
- **Notes**:
  - **Re-filing** — `store_id` and/or `category_id` on their own — applies to as many lines as you pass at once. This is the app's drag-to-a-different-store path.
  - **Editing text** — any of `title`, `amount`, `unit`, `note` — is one line at a time; ids spanning two lines are refused. The endpoint wants the values as they were alongside the new ones (it diffs them to decide what changed), so the client reads the line back first and fills in the `_start` half itself.
  - **Naming one id of a merged line affects the whole line.** The client widens whatever you pass to the full group before writing, which is what the app's edit dialog does — it posts the group's entire id list and never a subset. Passing a subset would otherwise rename half a line and split it in two.
  - **A text edit consolidates a merged line into a single row**, keeping the combined quantity (two rows of 1 box and 2 box become one row of 3 box). So the ids you sent may not all still exist afterwards — take `item_ids` from the returned line rather than reusing what you sent.

### `remove_shopping_list_items`
Remove lines from the shopping list.

- **Input**: `{ item_ids: number[] }`
- **Returns**: `{ ok: true }`
- **Notes**: A soft delete, same as the app's — `restore_shopping_list_items` undoes it. But nothing lists removed lines (the JSON API drops them, even with the app's "Hide Removed" toggle off), so keep the `item_ids` if the removal might need undoing.

### `restore_shopping_list_items`
Put removed lines back on the list.

- **Input**: `{ item_ids: number[] }` — the ids the line had before it was removed
- **Returns**: `{ ok: true }`

---

## Other

### `list_menus`
List saved menus (collections of planned meals).

- **Input**: none
- **Returns**: `Menu[]`

### `list_friends`
List Plan to Eat friends.

- **Input**: none
- **Returns**: `Friend[]`

### `get_counts`
Recipe-book widget counts.

- **Input**: none
- **Returns**: `{ friends, queued, frozen }`

### `update_planner_options`
Update planner display/behaviour preferences (timezone, planner start day, which nutrition columns to show, etc).

- **Input**: `{ options: Record<string, string|number|boolean> }` — pass Rails-style nested keys like `user[time_zone]` or `calendar_settings[show_calories]`. Example: `{ "user[time_zone]": "America/Denver", "calendar_settings[show_calories]": 1 }`.
- **Returns**: `{ ok: true }`
- **Notes**: Rarely needed. The HAR shows the UI's settings panel sending the full options object on every save.
