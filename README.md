# 🍽️ plan-to-eat-mcp

> **Stop typing recipes. Start telling them.**
> Hand your favorite LLM the keys to your Plan to Eat recipe book, planner,
> and shopping list — over the Model Context Protocol.

A drop-in MCP server (and standalone Node client) that gives Claude, ChatGPT,
or any MCP-aware assistant full read/write access to your
[Plan to Eat](https://www.plantoeat.com/ref/d7d2327524) account.

```
You:  "Save the Bon Appétit miso pasta from this URL and tag it weeknight."
LLM:  ✓ created recipe #48,872,094 — 7 ingredients, 25 min, tagged weeknight.

You:  "Plan dinner around it Tuesday and add the missing pantry items to my
       shopping list."
LLM:  ✓ event created 2026-05-05 / dinner / 4 servings.
      ✓ shopping list now reflects miso, mirin, and dashi.
```

That's it. No recipe re-typing. No copy-pasting URLs into a phone app. Just
talk.

---

## ❤️ Why Plan to Eat?

If you're not already using it, [Plan to Eat](https://www.plantoeat.com/ref/d7d2327524)
is genuinely the best meal-planning app I've ever used:

- **A clip-anywhere recipe importer** that actually works on real-world food blogs.
- **Drag-and-drop weekly planner** that automatically rolls ingredients into a
  shopping list, with smart units and pantry deduplication.
- **Yours forever** — your recipe book is portable, exportable, and not held
  hostage by an algorithm.
- **Family-friendly** — share recipes and menus with friends in-app.
- **14-day free trial, no credit card needed.**

👉 **[Sign up with my referral link](https://www.plantoeat.com/ref/d7d2327524)** —
you get the trial, and I get a tiny thank-you. Win/win.

---

## ✨ What this gives you

- 🤖 **MCP server out of the box** — point Claude Desktop, Claude Code, OpenClaw,
  or any MCP-compatible host at it and start talking to your recipe book.
- 🔐 **Auto-auth & auto-recovery** — set your credentials once, the server
  handles login, caches the cookie session to disk, and silently re-auths
  whenever Plan to Eat invalidates it.
- 🧰 **30 tools, all the verbs that matter** — full recipe CRUD, full
  meal-planner CRUD (add / move / duplicate / delete recipes, notes, and
  ingredient entries), reorder events in a slot, leftovers as a first-class
  workflow, freezer tracking, browse courses & cuisines & tags, peek at the
  shopping list, count what's in your queue.
- 🗓️ **Real planner control** — view a week's plan with recipe titles
  pre-joined, schedule recipes on dates, attach prep notes, reschedule with
  one tool call, change servings, duplicate, search for duplicates, reorder
  same-slot events.
- ❄️ **Freezer tracking** — after cooking, mark N portions as frozen with
  `freeze_recipe_portions`; check what's stashed with `list_frozen_recipes`;
  consume entries when you eat them (soft-delete, history preserved).
- 🍳 **Real CRUD** — including ingredient lists with proper units, directions,
  prep/cook times, nutrition, ratings, and tags.
- 📦 **Tiny runtime** — no Playwright, no headless browser, no native modules.
  Just `fetch`, the MCP SDK, and Zod. Boots in under a second.
- 🦺 **100% TypeScript** — fully typed `Recipe`, `Ingredient`, `PlannerEvent`
  shapes plus a generic `_json<T>` so your tools never have to guess what
  comes back.
- 📚 **A library too** — `client.ts` is a clean, plain-Node API client you can
  drop into any script.
- 🧠 **Bundled Claude Code skill** — `.claude/skills/plan-to-eat/SKILL.md`
  teaches any agent the common workflows and gotchas (the supper-vs-dinner
  alias, the `description`-vs-`title` mismatch, etc.) so it doesn't have to
  rediscover them.

> Reverse-engineered from the live web app. There's no public Plan to Eat API,
> but the desktop site uses these same endpoints internally. Use at your own
> risk — they could change anything at any time.

---

## 🚀 Quick start

```bash
git clone https://github.com/alex-zwingli/plan-to-eat-mcp.git
cd plan-to-eat-mcp
npm install
npm run build
```

Requires Node 18+ (for built-in `fetch`) and a
[Plan to Eat](https://www.plantoeat.com/ref/d7d2327524) account.
The build emits CommonJS to `dist/`.

### Wire it into Claude Desktop / Claude Code

```jsonc
{
  "mcpServers": {
    "plan-to-eat": {
      "command": "node",
      "args": ["/absolute/path/to/plan-to-eat-mcp/dist/server.js"],
      "env": {
        "PLAN_TO_EAT_USERNAME": "you@example.com",
        "PLAN_TO_EAT_PASSWORD": "hunter2"
      }
    }
  }
}
```

Restart your MCP host, and you're cooking.

### Run it standalone

```bash
PLAN_TO_EAT_USERNAME=you@example.com \
PLAN_TO_EAT_PASSWORD=hunter2 \
  npm start
```

### Configuration

| Var | Required | Default | Description |
|---|---|---|---|
| `PLAN_TO_EAT_USERNAME` | yes | — | Plan to Eat login email |
| `PLAN_TO_EAT_PASSWORD` | yes | — | Plan to Eat password |
| `PLAN_TO_EAT_SESSION_FILE` | no | `~/.plan-to-eat-session.json` | Where the cookie session is cached. Set to `""` to disable caching. |

---

## 🧰 Tools the server exposes

Full reference with input schemas and return shapes: **[docs/TOOLS.md](./docs/TOOLS.md)**.

**Recipes**

| Tool | What it does |
|---|---|
| `list_recipes` | Your whole recipe book (caps at ~500 entries). |
| `get_recipe` | One recipe with directions, ingredients, tags, prep_notes, comments. |
| `create_recipe` | Create. Only `title` is required. |
| `update_recipe` | Patch any subset of fields. |
| `delete_recipe` | Delete by id. |

**Planner — read**

| Tool | What it does |
|---|---|
| `list_planner_events` | All planner entries, no date filter. |
| `get_planner_week` | Events in a date range, with `recipe_title` pre-joined. `end_date` defaults to `start_date + 6 days`. |

**Planner — write**

| Tool | What it does |
|---|---|
| `add_planner_recipe` | Schedule a recipe on a date + section. |
| `add_planner_ingredient` | Attach a freeform ingredient ("2 lbs ground beef") to a meal slot. |
| `add_planner_note` | Attach a freeform note ("Defrost chicken") to a meal slot. |
| `add_leftover_meal` | Schedule a leftover from a previously planned recipe event (duplicate with `plan_leftover` + optional move). |
| `move_planner_event` | Reschedule any planner event to a new date/section. |
| `reorder_planner_events` | Reorder events within a section (pass ids in desired order). |
| `update_planner_entry_text` | Edit the text of a note or ingredient entry. |
| `set_planner_servings` | Change servings on a recipe event. |
| `duplicate_planner_event` | Duplicate any event. Optional `plan_leftover`. |
| `delete_planner_event` | Delete by id. |
| `find_planned_dates` | Find planner events for a recipe in a date range. Useful for duplicate checks. |

**Freezer**

| Tool | What it does |
|---|---|
| `list_frozen_recipes` | What's currently in the freezer. `{include_consumed: true}` to also see history. |
| `freeze_recipe_portions` | Mark N portions of a cooked recipe as frozen, tied to the planner event they came from. |
| `delete_frozen_recipe` | Mark a frozen entry as consumed (soft-delete: API zeroes count, row persists). |

**Lookup tables & extras**

| Tool | What it does |
|---|---|
| `list_courses` / `list_cuisines` / `list_main_ingredients` / `list_tags` | Lookup tables. |
| `list_menus` | Saved menus. |
| `get_shopping_list` | Current shopping list with sync metadata. |
| `list_friends` | Friends list. |
| `get_counts` | `{ friends, queued, frozen }` from the recipe-book widget. |
| `update_planner_options` | Set planner display preferences (timezone, start day, nutrition columns). Rarely needed. |

---

## 📚 Use the client as a library

```ts
import { PlanToEat, type Recipe } from 'plan-to-eat-mcp';

const pte = new PlanToEat();
await pte.login(process.env.PLAN_TO_EAT_USERNAME!, process.env.PLAN_TO_EAT_PASSWORD!);
// Or restore: pte.importSession(JSON.parse(fs.readFileSync('session.json', 'utf8')));

const recipes = await pte.listRecipes();
const detail: Recipe = await pte.getRecipe(recipes[0].id);

const created = await pte.createRecipe({
  title: 'Grilled cheese',
  servings: 1,
  directions: 'Butter bread. Cheese. Pan. Flip.',
  ingredients: [
    { title: 'bread',  amount: '2', unit: 'slice', position: 1 },
    { title: 'cheese', amount: '1', unit: 'slice', position: 2 },
  ],
  tag_titles: 'easy,lunch',
});

await pte.updateRecipe(created.id, { rating: 5 });
await pte.deleteRecipe(created.id);
```

The client stashes credentials internally on first login so it can transparently
re-authenticate if the cached cookies expire mid-session.

---

## 🧪 API reference (the parts that work)

All paths under `https://app.plantoeat.com`.

### JSON endpoints (`/api/v1/*`)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/recipes` | Whole recipe book. Caps at 500 entries; pagination params don't seem to work. |
| GET | `/api/v1/recipes/:id` | Single recipe with `directions`, `ingredients`, `tags`, `prep_notes`, `comments`. |
| POST | `/api/v1/recipes` | Create. Body: `{ "recipe": {...} }`. Returns 201 + full recipe. |
| PUT | `/api/v1/recipes/:id` | Update. Same body shape. |
| DELETE | `/api/v1/recipes/:id` | Delete. Returns the deleted recipe. |
| GET | `/api/v1/courses`, `/cuisines`, `/main_ingredients`, `/tags` | Lookup tables. |
| GET | `/api/v1/events` | Planner entries (calendar). Returns the entire calendar — filter by date client-side. |
| GET | `/api/v1/menus` | Saved menus. |
| GET | `/api/v1/shopping_list` | Shopping list with sync timestamp. |
| GET | `/api/v1/friends` | Friends. |
| GET | `/api/v1/frozen_recipes` | Freezer: `[{id, recipe_id, count, servings, frozen_on}]`. |
| DELETE | `/api/v1/frozen_recipes/:id` | Soft-delete (sets `count: 0`; row persists). Returns the updated row. |
| GET | `/recipes/counts/` | `{ friends, queued, frozen }`. (Note: not under `/api/v1`.) |

### Planner write endpoints (`/planner/*`)

A different style: form-encoded bodies, `text/javascript` (empty) responses. The server mutates state and the UI re-fetches separately. Required headers: `X-CSRF-Token`, `X-Requested-With: XMLHttpRequest`, `Accept: text/javascript`. Because the response body is empty, the client recovers any new event ID by diffing `/api/v1/events` before and after.

| Method | Path | Body |
|---|---|---|
| POST | `/planner/create` | `rid=<recipeId>&date=YYYY-MM-DD&section=...` (recipe), or `date=...&section=...&eventType=note\|ingredient&title=<text>` |
| POST | `/planner/create/` | `rid=<id>&frozen_id=&date=...&section=...` (frozen-recipe variant — note the trailing slash) |
| POST | `/planner/update` | `eventid=<id>&date=...&section=...&readonly=false` (move/reschedule) |
| POST | `/planner/update/<id>` | `description=<text>` (edit note/ingredient text) |
| POST | `/planner/update_serving` | `event=<id>&serving=<n>` |
| POST | `/planner/duplicate` | `id=<id>&plan_leftover=true\|false&readonly=false` |
| POST | `/planner/update_order` | `ids=e<id1>,e<id2>` — reorder events in a section |
| POST | `/planner/destroy` | `id=<id>&readonly=false` |
| POST | `/planner/update_planner_options` | Nested Rails keys: `user[time_zone]=...&calendar_settings[show_calories]=1&...` |
| POST | `/frozen_recipes` | `id=<recipe_id>&eid=<event_id>&count=<n>&servings=<per-portion>` — freeze N portions |
| GET | `/planner/search_dates` | Returns rendered HTML, **not JSON** — not used by the client. We filter `/api/v1/events` instead. |

`section` values are `breakfast`, `lunch`, `dinner`, `snacks`. Note that the server may normalize `dinner` → `supper` based on the user's per-account preference; reads will reflect the canonical name.

### Authentication

Cookie-based. The client supports two flows:

1. **Login.** `POST /login` with `login[email]` and `login[password]` plus the
   `authenticity_token` from the meta tag on `GET /login`. Server returns a 302
   and sets cookies.
2. **Reuse cookies.** The "remember me" pair `ptermid2` (user id) and
   `ptermxt2` (long-lived token) is sufficient on its own — stash those and
   skip re-login until they're invalidated.

Write requests need an `X-CSRF-Token` header. The client grabs it from the
`<meta name="csrf-token">` tag on the `/recipes` page on demand.

HTTP Basic auth on `/api/v1/...` is **not** supported (returns 401).

### Recipe payload shape

The single-recipe response has 65 fields. Writable on POST/PUT include:
`title`, `description`, `source`, `url`, `servings`, `yield`, `scaling`,
`prep_time`, `cook_time`, `total_time` (minutes),
`course_id`, `cuisine_id`, `main_ingredient_id`, `tag_titles` (comma list),
`directions` (free text), `private`, `draft`, `rating`,
nutrition strings (`calories`, `sodium`, etc.), and ingredients.

**Ingredients use Rails nested-attributes** — the wire field is
`recipe_ingredients_attributes`, not `ingredients`. The `client.js` and the
MCP `create_recipe` / `update_recipe` tools accept the friendlier name
`ingredients` and translate. Each entry:

```json
{ "title": "water", "amount": "1", "unit": "cup", "note": "", "position": 1 }
```

To delete an existing ingredient on update, include its `id` plus
`"_destroy": true`. The server back-fills `amount_float`, `metric_amount`,
`metric_unit`, and `similar_titles`.

---

## 📁 Files

- `src/client.ts` — the API client (runtime depends only on `fetch` and cookies).
- `src/server.ts` — the MCP server (stdio transport).
- `src/verify.ts` — end-to-end smoke test of the client (recipes).
- `src/planner_verify.ts` — end-to-end smoke test of the planner write endpoints.
- `src/test_server.ts` — end-to-end smoke test of the MCP server.
- `docs/TOOLS.md` — per-tool reference with input/output shapes.
- `.claude/skills/plan-to-eat/SKILL.md` — Claude Code skill that teaches an
  agent the common workflows and gotchas.
- `dist/` — emitted by `npm run build`. The MCP host runs `dist/server.js`.

Playwright was used during reverse engineering and is kept as a devDependency
for any future API-discovery work; the runtime depends only on `fetch` and
the MCP SDK.

### Scripts

| Command | What it does |
|---|---|
| `npm run build` | Compile `src/**/*.ts` to `dist/`. |
| `npm run watch` | Same, in watch mode. |
| `npm start` | Run the compiled MCP server (`dist/server.js`). |
| `npm run verify` | Smoke-test the client end-to-end against your account (recipes). |
| `npm run verify:planner` | Smoke-test the planner write endpoints (creates + cleans up test events on a date 6 months out). |
| `npm test` | Smoke-test the MCP server end-to-end (spawns it and calls tools). |
| `npm run clean` | Remove `dist/`. |

---

## 🙏 Support Plan to Eat

This whole project exists because Plan to Eat is great. If you find this
useful, the best thing you can do is
**[give Plan to Eat a try with my referral link](https://www.plantoeat.com/ref/d7d2327524)**.
Free 14-day trial, no card needed.

## License

MIT — see [LICENSE](./LICENSE). Do whatever you want with it; just don't blame
me if Plan to Eat ships a breaking change.
