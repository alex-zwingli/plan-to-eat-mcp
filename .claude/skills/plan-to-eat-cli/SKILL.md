---
name: plan-to-eat-cli
description: Use when the user wants to interact with Plan to Eat (plantoeat.com) — meal plan, recipes, planner notes/ingredients/leftovers, freezer, shopping list — and the `plan-to-eat` CLI is available but the plan-to-eat MCP server is NOT connected. Same capabilities as the MCP server, driven through the shell. Triggers on "what's on my meal plan", "plan X for Wednesday dinner", "add a note to Tuesday breakfast", "move dinner to Friday", "freeze leftovers", "what's in the freezer", "what's on my shopping list", "add milk to the shopping list" — when those must be answered with shell commands.
version: 0.8.0 # x-release-please-version
metadata:
  openclaw:
    requires:
      env:
        - PLAN_TO_EAT_USERNAME
        - PLAN_TO_EAT_PASSWORD
      bins:
        - node
      anyBins:
        - plan-to-eat
        - npx
    primaryEnv: PLAN_TO_EAT_PASSWORD
    envVars:
      - name: PLAN_TO_EAT_USERNAME
        required: true
        description: Plan to Eat login email.
      - name: PLAN_TO_EAT_PASSWORD
        required: true
        description: Plan to Eat password.
      - name: PLAN_TO_EAT_SESSION_FILE
        required: false
        description: Where the cookie session is cached. Set to "" to disable caching.
    emoji: "🍽️"
    homepage: https://github.com/alex-zwingli/plan-to-eat-mcp
    license: MIT
---

# plan-to-eat CLI

The `plan-to-eat` CLI exposes the same 36 capabilities as the `plan-to-eat` MCP
server, as subcommands. Use this skill when you have a shell but no
`plan-to-eat__*` tools.

**If the MCP tools *are* available, use them instead** — see the `plan-to-eat`
skill. They avoid a subprocess per call and return structured JSON directly.

## Setup check

```bash
plan-to-eat --version
```

**Command not found** — the CLI isn't on `PATH`. Work down this list before giving up:

1. **Run it without installing.** The CLI ships in the npm package and needs Node 18+:

   ```bash
   npx -y -p plan-to-eat-mcp@0.8.0 plan-to-eat --version # x-release-please-version
   ```

   Note the `-p`. The package exposes two bins, and the one named `plan-to-eat-mcp` — what plain `npx plan-to-eat-mcp` resolves to — is the **MCP server**, which will sit and wait on stdio. `-p plan-to-eat-mcp plan-to-eat` is what selects the CLI. If this works, prefix every command in this skill the same way.
2. **Install it properly.** Faster than `npx` per call, and puts `plan-to-eat` on `PATH`. **Show the user this rather than running it yourself** — it writes outside the working directory:

   ```bash
   npm i -g plan-to-eat-mcp@0.8.0 # x-release-please-version
   ```
3. **Working from a clone?** `node <repo>/dist/cli/main.js --version`. If `dist/` is missing, the build step was skipped — `npm install && npm run build` in the repo, then retry.
4. **Node missing entirely** (`node --version` fails) — stop and tell the user; don't install a runtime for them.

Keep the version pinned in whichever of these you pass on. `npx -y` and a bare
`npm i -g` run whatever the registry serves at that moment, so an unpinned
command picks up every future publish silently. Releases are published from CI
with npm trusted publishing, so each tarball carries a SLSA provenance
attestation binding it to the source repository and the commit it was built
from; `npm audit signatures` checks the copy that actually got installed.

**"Missing PLAN_TO_EAT_USERNAME and/or PLAN_TO_EAT_PASSWORD"** — credentials aren't set. They come from the environment or a `.env` in the working directory:

| Var | Required | Default |
|---|---|---|
| `PLAN_TO_EAT_USERNAME` | yes | — |
| `PLAN_TO_EAT_PASSWORD` | yes | — |
| `PLAN_TO_EAT_SESSION_FILE` | no | `~/.plan-to-eat-session.json` |

Ask the user to set them. **Never ask them to paste a password into the conversation, and never put credentials in a command you run** — no `PLAN_TO_EAT_PASSWORD=... plan-to-eat ...` one-liners, they land in shell history and in the transcript.

If none of this works, point the user at the project README rather than trying to scrape the web app.

## Using it

**Always pass `--json`.** The default output is a human-readable table meant for
the user's eyes; `--json` gives you the raw payload to reason over. Show the
user the table form only if they asked to see it.

```bash
plan-to-eat <command> [args] --json
```

Names map from the tool names one-to-one: `add_planner_recipe` is
`add-planner-recipe`. Both spellings work.

**Discover, don't guess:**

```bash
plan-to-eat --help                      # every command, grouped
plan-to-eat add-planner-recipe --help   # arguments, which are positional, enum values
```

**Argument forms:**

- Positional or flagged — `get-recipe 123` = `get-recipe --id 123`. `--help`
  says which arguments are positional and in what order.
- Flags accept dashes or underscores: `--start-date` = `--start_date`.
- Booleans are bare flags: `--include_consumed`.
- Arrays repeat, or take JSON: `--event_ids 11 --event_ids 22` = `--event_ids '[11,22]'`.
- Objects take JSON: `--ingredients '{"title":"bread","amount":"2"}'` (repeat per item).

**Quote anything with spaces**, especially note and ingredient text:
`plan-to-eat add-planner-note "Defrost chicken" 2026-05-04 breakfast`.

**Exit codes:** `0` success, `1` for bad arguments, missing credentials, or an
upstream error. Read stderr — argument errors name the offending flag and the
expected type.

## Core concepts

**Recipe** — numeric `id`. `list-recipes --json` returns the **whole** catalog
(every active recipe — well over a thousand on a big account, so narrow it with
the flags below rather than reading it all; unfiltered it's ~200 KB of JSON).
Each row is brief: always `id`, `title` and `owned`, plus whichever of
`course_title`, `cuisine_title`, `main_ingredient_title`, `tag_titles` (a
comma-separated string), `total_time` (minutes) and `rating` are set — **a
missing field means it's empty**, so in jq use `(.rating // "")`, not
`.rating`. `--full` adds the rest (`photo_url`, timestamps, `saved` /
`queued`, `stats_total_events`, …) at several times the size. Rows carry **no** ingredients,
directions, description, servings or nutrition — `get-recipe <id> --json` has
those, for any id. **Recipe IDs are not guessable** — look them up first.

`list-recipes` filters, all optional and combinable:

| Flag | Matches |
|---|---|
| `--search '<words>'` | Every word appears in the title, any order, case-insensitive. `'pork chive'` finds "Juicy Pork & Chive Pan-Fried Dumplings". |
| `--course '<name>'` | `course_title`, case-insensitive but exact — `Breakfast`, not `Break`. `list-courses` has the names. |
| `--owned_only` | Only the user's own recipes, not saved/queued friend recipes. |
| `--full` | Not a filter: return every field instead of brief rows. |

Inactive, removed and hidden recipes are never listed.

**Planner event** — one calendar entry: `{ id, date, section, kind, recipe_id?, description?, servings }`.
`kind` is `recipe`, `note`, or `ingredient`. `section` is `breakfast`, `lunch`,
`dinner`, or `snacks`. `date` is `YYYY-MM-DD`.

**Frozen recipe** — `{ id, recipe_id, count, servings, frozen_on }`. `count` is
portions remaining, `servings` is per-portion size. Consuming is a soft-delete:
the API zeroes `count` and keeps the row.

**Shopping list line** — one row of the list, addressed by an `item_ids`
*array*, not a scalar id: Plan to Eat merges duplicate ingredients into one line
that keeps every underlying row id. Pass the whole array to update or remove it.
A line also names its store (`store_title`; `store_id` is `null` for the
account's default store) and aisle (`grocery_category_title`), and `recipe_ids`
says which planned recipes pulled it in.

**A "week"** is whatever 7 days the user means. `get-planner-week <start>` runs
to `start + 6 days` unless you pass an end date. If the user says "this week"
without a start day, convert relative to today.

## Common workflows

Resolving a recipe by name is the usual first step. Let `--search` do the
filtering rather than eyeballing the catalog:

```bash
plan-to-eat list-recipes --search 'lasagna' --json \
  | jq -r '.[] | "\(.id)\t\(.title)"'
```

If `jq` isn't available, pipe to `node -e` or read the JSON yourself.

Use the distinctive words from what the user said, not the whole phrase —
`--search 'pork chive'` finds "Juicy Pork & Chive Pan-Fried Dumplings", where a
literal "pork and chive dumplings" wouldn't. No match? Drop a word and retry
before concluding the recipe isn't in the book. Several matches? Show the user
the titles and ask.

**Pass the search term as its own quoted argument**, never spliced into a
larger command string. The CLI treats it as plain text — no regex, no
wildcards — so `--search "Mom's Chili"` and `--search 'Chicken (Spicy)'` match
literally.

### "What [breakfast / dessert / soup] recipes do we have?"
```bash
plan-to-eat list-courses --json                        # the exact course names
plan-to-eat list-recipes --course 'Breakfast' --json
plan-to-eat list-recipes --course 'Breakfast' --owned_only --json   # just ours
```
`--course` wants the course's full name. If the user's word isn't one
(`list-courses` has, say, "Desserts" but not "dessert"), use the closest
course rather than `--search`, which only looks at titles. "Recipes we made
ourselves" / "not the ones from friends" means `--owned_only`.

### "What's on the meal plan this week?"
```bash
plan-to-eat get-planner-week 2026-05-04 --json
```
Recipe events arrive with `recipe_title` already joined — no second lookup
needed. Group by `date`, then `section`, for a readable answer.

### "Plan [recipe] for Wednesday dinner"
```bash
plan-to-eat add-planner-recipe <recipe_id> 2026-05-06 dinner --json
```
The response carries the new event `id`. If the user named a servings count,
follow with `set-planner-servings <event_id> <n>`.

### "Add a prep note / a grocery item to a slot"
```bash
plan-to-eat add-planner-note "Defrost chicken" 2026-05-04 breakfast --json
plan-to-eat add-planner-ingredient "2 lbs ground beef" 2026-05-06 dinner --json
```
Use `add-planner-ingredient` for grocery-style text tied to a meal. For the real
shopping list, see the shopping list workflows below.

### "Move Tuesday dinner to Wednesday"
```bash
plan-to-eat get-planner-week <week start> --json     # find the event id
plan-to-eat move-planner-event <event_id> 2026-05-06 dinner --json
```

### "Change that meal to 4 servings"
```bash
plan-to-eat set-planner-servings <event_id> 4 --json
```
Recipe events only.

### "Edit that note to say X"
```bash
plan-to-eat update-planner-entry-text <id> "X" --json
```
Note the asymmetry: notes are *created* with title text but *edited* through
`description`. The CLI hides most of this, but it's why the read shape shows
note text under `description`.

### "Is [recipe] already planned this week?"
```bash
plan-to-eat find-planned-dates <recipe_id> --start-date 2026-05-04 --end-date 2026-05-10 --json
```
Do this before scheduling if the user is trying to avoid repeats.

### "Plan Tuesday's lasagna as leftovers Thursday"
```bash
plan-to-eat add-leftover-meal <source_event_id> 2026-05-07 dinner --json
```
One call — it duplicates and moves. Omit the date/section to leave the leftover
in the source slot. For a plain copy, `duplicate-planner-event <id>`.

### "Reorder breakfast: pancakes first, then bacon"
```bash
plan-to-eat reorder-planner-events --event_ids <pancakes> --event_ids <bacon> --json
```
All ids must share a date and section.

### "Freeze 3 portions of last night's chili"
```bash
plan-to-eat freeze-recipe-portions <recipe_id> <event_id> 3 1.0 --json
plan-to-eat list-frozen-recipes --json      # confirm, and get the new entry id
```
`event_id` is the planner event the portions came from.

### "What's in the freezer?" / "We ate the freezer chili"
```bash
plan-to-eat list-frozen-recipes --json
plan-to-eat list-frozen-recipes --include_consumed --json   # with history
plan-to-eat delete-frozen-recipe <frozen entry id> --json
```
Freezer entries carry `recipe_id`, not titles — `get-recipe` each one if the
user wants names.

### "What's on the shopping list?"
```bash
plan-to-eat get-shopping-list
```
The table is already sorted by store. For a store-by-store readback:
```bash
plan-to-eat get-shopping-list --json | jq -r 'group_by(.store_title)[] | "\(.[0].store_title):", (.[] | "  \(.amount) \(.unit) \(.title)")'
```

### "Add sliced almonds and a jar of tahini to the list"
```bash
plan-to-eat add-shopping-list-items --items '[{"title":"Sliced almonds"},{"title":"Tahini","amount":"1","unit":"jar"}]'
```
Leave `category_id` and `store_id` off unless the user named a store or aisle —
Plan to Eat then guesses the aisle and reuses the store last used for that item.
To honor "get it at Trader Joe's", resolve the id first with `plan-to-eat
list-stores` (aisles: `plan-to-eat list-grocery-categories`).

### "Move the almonds to Costco" / "make it two jars"
```bash
plan-to-eat get-shopping-list --json \
  | jq --arg q 'almond' '.[] | select(.title|ascii_downcase|contains($q|ascii_downcase)) | .item_ids'
plan-to-eat update-shopping-list-items --item_ids '[511232505]' --store_id 138079
plan-to-eat update-shopping-list-items --item_ids '[511232505]' --amount 2 --unit jars
```
`--store_id` / `--category_id` on their own re-file any number of lines at once;
editing text (`--title`, `--amount`, `--unit`, `--note`) works on one line and
is refused if the ids span two. Only pass what changes. A text edit collapses a
merged line into one row, so read `item_ids` back off the result.

### "Take the bananas off the list"
```bash
plan-to-eat remove-shopping-list-items --item_ids '[518771191]'
```
Soft delete — `restore-shopping-list-items --item_ids '[...]'` undoes it. Nothing
lists removed lines, so echo the ids back to the user if they might want them.

### "Remove that from the plan"
```bash
plan-to-eat delete-planner-event <id> --json
```

## Gotchas

- **Never interpolate the user's text into a command string.** Titles, notes and
  ingredient lines are free text and routinely contain quotes, parentheses and
  `&`. Pass them as separate quoted arguments to `plan-to-eat`, and as `--arg`
  values to `jq`. This is also why the skill uses `contains` rather than
  `test` — a literal substring match has no metacharacters to get wrong.
- **`section` comes back as `supper` on some accounts.** Plan to Eat normalizes
  to a per-account preference. Always *send* `dinner`; treat `supper` as the
  same slot when reading.
- **Note and ingredient text lives in `description` on read**, not `title` —
  `title` is null for notes. Table output already accounts for this.
- **Create and duplicate can return `null`.** The upstream API returns empty
  bodies, so the client recovers the new event by diffing the event list before
  and after. A concurrent change can defeat that. Re-run `get-planner-week` to
  find the event rather than assuming the write failed.
- **Convert relative dates yourself.** "Tuesday" must become a real
  `YYYY-MM-DD` before it reaches the CLI. The date check only validates shape,
  so `2026-13-99` passes argument parsing and fails upstream.
- **`add-planner-recipe` won't create a recipe.** For something not in the book,
  `create-recipe` first, or use a note/ingredient entry for freeform text.
- **`find-planned-dates` is keyed on `recipe_id`, not title.** To go by name,
  resolve the id first with `list-recipes --search '<words>'`.
- **`list-recipes` rows have no ingredients.** To answer "what can I make with
  chicken thighs", narrow with `--search` / `--course` first, then
  `get-recipe` the candidates — don't `get-recipe` the whole book.
- **A shopping list line is `item_ids`, plural** — one line can hold several row
  ids. Naming any one of them affects the whole line, so precision isn't
  required; but a text edit consolidates a merged line into a single row
  (keeping the combined quantity), so don't assume every id you sent survives.
  Re-read `item_ids` from the output.
- **`store_id: null` isn't "no store"**, it's the account's default store, and
  `store_title` names it. Report the title, not the id.
- **Removed shopping list lines vanish.** Nothing can list them, so
  `restore-shopping-list-items` only works with ids you kept from before.
- **Writes are real and immediate.** There's no dry-run and no undo. Confirm
  with the user before deleting anything you didn't just create.

## Full reference

[docs/TOOLS.md](https://github.com/alex-zwingli/plan-to-eat-mcp/blob/main/docs/TOOLS.md) documents every command's arguments, return
shape, and quirks.
