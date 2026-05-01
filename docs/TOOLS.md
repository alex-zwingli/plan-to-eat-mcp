# Tool reference

Every tool exposed by the `plan-to-eat-mcp` server. Inputs use the JSON-Schema shape MCP hosts already understand; types here are abbreviated.

- [Recipes](#recipes) — list, get, create, update, delete
- [Lookup tables](#lookup-tables) — courses, cuisines, main ingredients, tags
- [Planner: read](#planner-read) — view events, get a week's plan
- [Planner: write](#planner-write) — add/move/edit/delete planner events, reorder, leftovers
- [Freezer](#freezer) — list / add / consume frozen portions
- [Other](#other) — shopping list, friends, menus, counts, planner options

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

Each returns `[{ id, title, owned }]`. Use to map human-friendly names to the integer IDs that recipe-write endpoints want.

### `list_courses`
Appetizers, Main Course, Dessert, etc.

### `list_cuisines`
Italian, Thai, Mexican, etc.

### `list_main_ingredients`
Beef, Chicken, Fish, Pasta, etc.

### `list_tags`
Free-form tags the user has applied across their recipe book.

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

## Other

### `list_menus`
List saved menus (collections of planned meals).

- **Input**: none
- **Returns**: `Menu[]`

### `get_shopping_list`
Get the current shopping list with sync metadata.

- **Input**: none
- **Returns**: `{ updated_items: [...], last_sync_time: string | null }`

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
