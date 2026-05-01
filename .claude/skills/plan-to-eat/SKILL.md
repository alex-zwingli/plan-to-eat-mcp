---
name: plan-to-eat
description: Use when the user wants to interact with Plan to Eat (plantoeat.com) — viewing or updating their meal plan, managing recipes, scheduling notes/ingredients on the planner, or checking the shopping list. Triggers on phrases like "what's on my meal plan", "plan X for Wednesday dinner", "add a note to Tuesday breakfast", "move dinner to Friday", "what's in my shopping list".
---

# plan-to-eat MCP

This skill teaches you to use the `plan-to-eat` MCP server effectively. The server gives you full read/write access to a Plan to Eat account: recipe book, weekly planner, shopping list.

## Setup check

If the user references Plan to Eat but no `plan-to-eat__*` tools are available, the MCP server isn't wired into this session. Point them to the project README for setup. Don't try to scrape the web app directly.

## Core concepts

**Recipe** — identified by numeric `id`. Fetch the catalog with `list_recipes` (returns ~500 entries with summaries); drill into one with `get_recipe` for directions/comments/full ingredient list. **Recipe IDs are not guessable** — always look them up before referencing.

**Planner event** — a single entry on the calendar. Shape:
```
{ id, date, section, kind, recipe_id?, title?, servings, ... }
```
- `kind` is `recipe`, `note`, or `ingredient`
- `section` is `breakfast`, `lunch`, `dinner`, or `snacks`
- `date` is `YYYY-MM-DD`

**A "week"** is whatever 7-day window the user means. Use `get_planner_week` with a `start_date`; `end_date` defaults to `start_date + 6 days`. If the user says "this week" without specifying a start day, ask or pick today.

## Common workflows

### "What's on the meal plan this week?"
```
get_planner_week({ start_date: "2026-05-04" })
```
Recipe events come pre-enriched with `recipe_title` — you don't need to join against `list_recipes`. Group the response by `date` then `section` for a readable answer.

### "Plan [recipe] for Wednesday dinner"
1. `list_recipes` → filter client-side to find the recipe id by title (case-insensitive match)
2. `add_planner_recipe({ recipe_id, date, section: "dinner" })`
3. If the user mentioned servings: follow up with `set_planner_servings({ event_id, servings })` using the id returned from step 2

### "Add a prep note: defrost chicken Monday morning"
```
add_planner_note({ date: "2026-05-04", section: "breakfast", title: "Defrost chicken" })
```

### "Add 2 lbs ground beef to Wednesday dinner"
```
add_planner_ingredient({ date: "2026-05-06", section: "dinner", title: "2 lbs ground beef" })
```
Use this for grocery-style additions tied to a meal slot. For the actual shopping list, use `get_shopping_list`.

### "Move Tuesday dinner to Wednesday"
1. `get_planner_week` to find the event id
2. `move_planner_event({ event_id, date: "<Wed>", section: "dinner" })`

### "Change [meal] from 2 servings to 4"
1. `get_planner_week` → find event id (must be a recipe event)
2. `set_planner_servings({ event_id, servings: 4 })`

### "Edit that note to say X"
```
update_planner_entry_text({ id, description: "X" })
```
**Note**: this tool uses `description` on the wire, even though `add_planner_note` uses `title` on create. Rails inconsistency — just remember it.

### "Is [recipe] already on the plan this week?"
1. `list_recipes` → resolve recipe id
2. `find_planned_dates({ recipe_id, start_date, end_date })`

### "Duplicate Tuesday's dinner to Friday"
```
duplicate_planner_event({ id, plan_leftover: false })
// returns a copy on the same date — then move it
move_planner_event({ event_id: <new id>, date: "<Fri>", section: "dinner" })
```
Set `plan_leftover: true` if the user explicitly says "as a leftover".

### "Remove that from the plan"
```
delete_planner_event({ id })
```

## Gotchas

- **`section` can come back as `supper`** — Plan to Eat normalizes to the user's per-account preference. Always send `dinner` on input; recognize `supper` as the same thing on read.
- **Create/duplicate may return `null`** — under the hood the API returns empty bodies, so the MCP recovers the new event by diffing `list_planner_events` before/after. If a concurrent change happens, the diff can miss. Re-list to find the new event.
- **Don't blindly accept the user's date** — Plan to Eat dates are `YYYY-MM-DD`. If the user says "Tuesday", convert to a real date relative to today.
- **Recipe events need a real `recipe_id`** — `add_planner_recipe` will not create a new recipe. To plan something not in the book, either `create_recipe` first, or use `add_planner_note` / `add_planner_ingredient` for freeform text.
- **Don't use `find_planned_dates` to look up recipes by title** — it's keyed on `recipe_id`. For "what recipes do I have", use `list_recipes`.

## Full tool reference

See [docs/TOOLS.md](../../../docs/TOOLS.md) for argument schemas, return shapes, and notes on each of the 24 tools.
