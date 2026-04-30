# plan-to-eat-mcp

Unofficial JSON API client and **Model Context Protocol (MCP) server** for
[Plan to Eat](https://www.plantoeat.com) — letting LLMs (Claude, etc.) and
plain Node scripts read and manage your recipe book, planner, shopping list,
and more.

Reverse-engineered from the live web app at `https://app.plantoeat.com`. Plan
to Eat does not publish a public API; the desktop site uses these same
endpoints internally.

> **Disclaimer.** Unofficial. Plan to Eat could change or rate-limit any of
> this without notice. Use at your own risk.

## Features

- Cookie-based session auth that survives restarts (cached to disk).
- Auto re-login when the cached session expires.
- Full recipe CRUD (create / read / update / delete) including ingredients,
  directions, tags, course / cuisine / main-ingredient classification,
  and nutrition.
- Read access to courses, cuisines, main ingredients, tags, planner events,
  menus, shopping list, friends, and recipe-book counts.
- MCP server exposing all the above as tools.
- Plain Node client (`client.js`) usable independently of MCP.

## Requirements

- Node.js 18 or newer (for built-in `fetch`).
- A Plan to Eat account.

## Install

```bash
git clone https://github.com/alex-zwingli/plan-to-eat-mcp.git
cd plan-to-eat-mcp
npm install
```

## Use as an MCP server

Set credentials via environment variables and run:

```bash
PLAN_TO_EAT_USERNAME=you@example.com \
PLAN_TO_EAT_PASSWORD=hunter2 \
  npm start
```

Configuration variables:

| Var | Required | Default | Description |
|---|---|---|---|
| `PLAN_TO_EAT_USERNAME` | yes | — | Plan to Eat login email |
| `PLAN_TO_EAT_PASSWORD` | yes | — | Plan to Eat password |
| `PLAN_TO_EAT_SESSION_FILE` | no | `~/.plan-to-eat-session.json` | Where the cookie session is cached. Set to `""` to disable disk caching. |

### Wire it up to Claude Desktop / Claude Code

Add this to your Claude desktop config (or `mcp.json` for Claude Code):

```jsonc
{
  "mcpServers": {
    "plan-to-eat": {
      "command": "node",
      "args": ["/absolute/path/to/plan-to-eat-mcp/server.js"],
      "env": {
        "PLAN_TO_EAT_USERNAME": "you@example.com",
        "PLAN_TO_EAT_PASSWORD": "hunter2"
      }
    }
  }
}
```

### Tools exposed

| Tool | Description |
|---|---|
| `list_recipes` | The whole recipe book (caps at ~500 entries). |
| `get_recipe` | One recipe with directions, ingredients, tags, prep_notes, comments. |
| `create_recipe` | Create. Only `title` is required. |
| `update_recipe` | Patch any subset of fields. |
| `delete_recipe` | Delete by id. |
| `list_courses` / `list_cuisines` / `list_main_ingredients` / `list_tags` | Lookup tables. |
| `list_planner_events` | Calendar entries `{ date, recipe_id, section, servings, ... }`. |
| `list_menus` | Saved menus. |
| `get_shopping_list` | Current shopping list with sync metadata. |
| `list_friends` | Friends list. |
| `get_counts` | `{ friends, queued, frozen }` from the recipe-book widget. |

## Use the client as a library

```js
const { PlanToEat } = require('./client');
const pte = new PlanToEat();

await pte.login(process.env.PLAN_TO_EAT_USERNAME, process.env.PLAN_TO_EAT_PASSWORD);
// Or restore: pte.importSession(JSON.parse(fs.readFileSync('session.json', 'utf8')));

const recipes = await pte.listRecipes();
const detail  = await pte.getRecipe(recipes[0].id);

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

## API reference (the parts that work)

All paths under `https://app.plantoeat.com`. All return JSON.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/recipes` | Whole recipe book. Caps at 500 entries; pagination params don't seem to work. |
| GET | `/api/v1/recipes/:id` | Single recipe with `directions`, `ingredients`, `tags`, `prep_notes`, `comments`. |
| POST | `/api/v1/recipes` | Create. Body: `{ "recipe": {...} }`. Returns 201 + full recipe. |
| PUT | `/api/v1/recipes/:id` | Update. Same body shape. |
| DELETE | `/api/v1/recipes/:id` | Delete. Returns the deleted recipe. |
| GET | `/api/v1/courses`, `/cuisines`, `/main_ingredients`, `/tags` | Lookup tables. |
| GET | `/api/v1/events` | Planner entries (calendar). |
| GET | `/api/v1/menus` | Saved menus. |
| GET | `/api/v1/shopping_list` | Shopping list with sync timestamp. |
| GET | `/api/v1/friends` | Friends. |
| GET | `/recipes/counts/` | `{ friends, queued, frozen }`. (Note: not under `/api/v1`.) |

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

## Files

- `client.js` — the API client (no Playwright dependency at runtime, just
  `fetch` and cookies).
- `server.js` — the MCP server (stdio transport).
- `verify.js` — end-to-end smoke test of the client.
- `test_server.js` — end-to-end smoke test of the MCP server.

Playwright was used during reverse engineering and is kept as a devDependency
for any future API-discovery work; the runtime depends only on `fetch` and
the MCP SDK.

## License

MIT — see [LICENSE](./LICENSE).
