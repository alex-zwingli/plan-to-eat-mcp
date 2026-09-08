# 🍽️ plan-to-eat-mcp

> **Stop typing recipes. Start telling them.**
> Hand your favorite LLM the keys to your Plan to Eat recipe book, planner,
> and shopping list — over the Model Context Protocol.

A drop-in MCP server, a CLI, and a standalone Node client that give Claude,
ChatGPT, any MCP-aware assistant, or your own shell full read/write access to
your [Plan to Eat](https://www.plantoeat.com/ref/d7d2327524) account.

```
You:  "Save the Bon Appétit miso pasta from this URL and tag it weeknight."
LLM:  ✓ created recipe #48,872,094 — 7 ingredients, 25 min, tagged weeknight.

You:  "Plan dinner around it Tuesday and add the missing pantry items to my
       shopping list."
LLM:  ✓ event created 2026-05-05 / dinner / 4 servings.
      ✓ shopping list now reflects miso, mirin, and dashi.
```

…or, when you'd rather not talk to anything:

```console
$ plan-to-eat get-planner-week 2026-05-04
start_date  2026-05-04
end_date    2026-05-10

ID        DATE        SECTION    KIND        RECIPE_ID  RECIPE_TITLE        DESCRIPTION            SERVINGS
────────  ──────────  ─────────  ──────────  ─────────  ──────────────────  ─────────────────────  ────────
67698872  2026-05-05  breakfast  recipe      17314561   Breakfast Sandwich                         8
67483177  2026-05-05  dinner     ingredient                                 Asparagus (in season)  0
67710784  2026-05-06  dinner     note                                       Cucumber salad         0

3 rows
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
- ⌨️ **A CLI over the same tools** — every MCP tool is also a `plan-to-eat`
  subcommand, with tables for humans and `--json` for scripts. One registry
  feeds both surfaces, so they can't drift.
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
- 📚 **A library too** — `core/client.ts` is a clean, plain-Node API client you
  can drop into any script.
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
npx -y plan-to-eat-mcp          # run the MCP server
npm i -g plan-to-eat-mcp        # …or install both bins on PATH
```

Requires Node 18+ (for built-in `fetch`) and a
[Plan to Eat](https://www.plantoeat.com/ref/d7d2327524) account.

The package ships two bins: `plan-to-eat-mcp` (the MCP server) and
`plan-to-eat` (the CLI). To run the CLI through `npx` without installing, note
that you have to select it explicitly, since the default bin is the server:

```bash
npx -y -p plan-to-eat-mcp plan-to-eat --help
```

<details>
<summary>Building from a clone instead (for development, or the Claude Code plugin)</summary>

```bash
git clone https://github.com/alex-zwingli/plan-to-eat-mcp.git
cd plan-to-eat-mcp
npm install
npm run build
```

The build emits CommonJS to `dist/`.
</details>

### Configuration

| Var | Required | Default | Description |
|---|---|---|---|
| `PLAN_TO_EAT_USERNAME` | yes | — | Plan to Eat login email |
| `PLAN_TO_EAT_PASSWORD` | yes | — | Plan to Eat password |
| `PLAN_TO_EAT_SESSION_FILE` | no | `~/.plan-to-eat-session.json` | Where the cookie session is cached. Set to `""` to disable caching. |

The CLI also reads a `.env` in the working directory (shell variables win). The
MCP server does not — MCP hosts pass env explicitly, as shown below.

---

## 🤖 Use it with an agent

Any host that can launch a **local stdio MCP server** works. The server needs
one command, two env vars, and nothing else — no ports, no OAuth, no daemon.

### Claude Code, the easy way: install the plugin

The repo ships as a Claude Code plugin — MCP server *and* both skills in one
step:

```bash
export PLAN_TO_EAT_USERNAME=you@example.com
export PLAN_TO_EAT_PASSWORD=hunter2

git clone https://github.com/alex-zwingli/plan-to-eat-mcp.git
cd plan-to-eat-mcp && npm install && npm run build

claude plugin marketplace add "$(pwd)"
claude plugin install plan-to-eat@plan-to-eat
```

That gives you:

| Component | What it is |
|---|---|
| MCP server `plan-to-eat` | all 30 tools |
| Skill `plan-to-eat` | how to *use* the MCP tools well — workflows and gotchas |
| Skill `plan-to-eat-cli` | the same, for agents driving the CLI instead |

Confirm with `claude plugin details plan-to-eat@plan-to-eat` and `claude mcp list`.
The server reads `PLAN_TO_EAT_USERNAME` / `PLAN_TO_EAT_PASSWORD` from the
environment Claude Code was launched with, so export them in your shell profile
rather than committing them anywhere.

### Claude Code, manually

```bash
claude mcp add plan-to-eat \
  --env PLAN_TO_EAT_USERNAME=you@example.com \
  --env PLAN_TO_EAT_PASSWORD=hunter2 \
  -- npx -y plan-to-eat-mcp
```

Add `--scope user` to make it available in every project instead of just this
one. Check it connected with `claude mcp list`, or `/mcp` inside a session.

### Claude Desktop

Edit `claude_desktop_config.json` — **Settings → Developer → Edit Config**, or:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```jsonc
{
  "mcpServers": {
    "plan-to-eat": {
      "command": "npx",
      "args": ["-y", "plan-to-eat-mcp"],
      "env": {
        "PLAN_TO_EAT_USERNAME": "you@example.com",
        "PLAN_TO_EAT_PASSWORD": "hunter2"
      }
    }
  }
}
```

Restart Claude Desktop, and you're cooking.

### Any other MCP host

Cursor, Windsurf, Zed, Cline, Continue, OpenClaw, VS Code's MCP support, and
custom SDK clients all take the same three things. Point them at:

| Field | Value |
|---|---|
| Transport | stdio |
| Command | `npx` |
| Args | `["-y", "plan-to-eat-mcp"]` |
| Env | `PLAN_TO_EAT_USERNAME`, `PLAN_TO_EAT_PASSWORD` |

Most of them use the same `mcpServers` JSON block as Claude Desktop above —
often in `.cursor/mcp.json`, `.vscode/mcp.json`, or the host's settings UI.

If you installed globally (`npm i -g plan-to-eat-mcp`), use the
`plan-to-eat-mcp` bin as the command and drop the args entirely. If you built
from a clone, the command is `node` with
`["/absolute/path/to/plan-to-eat-mcp/dist/mcp/server.js"]`.

> **Absolute paths matter** for the clone route. MCP hosts don't launch servers
> from your project directory, so a relative path will fail to resolve. The
> `npx` command above sidesteps this entirely.

### Verify it works

```bash
PLAN_TO_EAT_USERNAME=you@example.com PLAN_TO_EAT_PASSWORD=hunter2 npx -y plan-to-eat-mcp
```

You should see `[plan-to-eat] mcp server ready on stdio (30 tools)` on stderr.
That's the server waiting for a client — Ctrl-C out. If instead you get a
credentials error, fix that before wiring up a host, where the failure is
harder to see.

### Teach your agent the workflows

Two skills ship in `.claude/skills/`, covering the common flows and the sharp
edges (the supper-vs-dinner alias, the `description`-vs-`title` mismatch on
note entries, checking for duplicates before scheduling):

- **`plan-to-eat`** — for agents calling the MCP tools.
- **`plan-to-eat-cli`** — for agents that have a shell but no MCP server. Same
  30 capabilities, driven through subcommands, with `--json` for parsing.

The plugin install above registers both. Agents on other hosts can read them as
plain context — point them at the files, or paste one into your system prompt.

Or install just the skills, into any of 18+ agents, with the
[skills.sh](https://www.skills.sh) CLI:

```bash
npx skills add alex-zwingli/plan-to-eat-mcp
```

That copies both `SKILL.md` files into `.agents/skills/` and symlinks them for
Claude Code, Cursor, Codex, Copilot, Gemini CLI and the rest. Add
`--skill plan-to-eat-cli` to take only one. Note that this installs the *skills*
and not the server — each skill's setup section walks the agent through building
the MCP server or CLI if it isn't already there.

For [OpenClaw](https://docs.openclaw.ai) agents, both skills are on
[ClawHub](https://clawhub.ai):

```bash
clawhub install plan-to-eat        # MCP tools
clawhub install plan-to-eat-cli    # shell / CLI
```

Their frontmatter declares the credentials and binaries each one needs under
`metadata.openclaw`, so ClawHub can check your environment at install time.

---

## ⌨️ Use it from the terminal

Every MCP tool is also a subcommand. Underscores become dashes; both spellings
work.

```bash
npm i -g plan-to-eat-mcp
plan-to-eat --help
```

Or without installing — note the `-p`, since the package's default bin is the
MCP server, not the CLI:

```bash
npx -y -p plan-to-eat-mcp plan-to-eat --help
```

```console
$ plan-to-eat list-frozen-recipes
ID      RECIPE_ID  COUNT  SERVINGS  FROZEN_ON
──────  ─────────  ─────  ────────  ──────────
227854  44676380   6      1.0       2025-05-04
227908  17314561   3      1.0       2025-05-05

2 rows

$ plan-to-eat add-planner-note "Defrost chicken" 2026-05-05 dinner
id       67710999
date     2026-05-05
section  dinner

$ plan-to-eat get-counts --json | jq .frozen
10
```

- **Positional or flagged** — `get-recipe 123` and `get-recipe --id 123` are the
  same. `<command> --help` lists which arguments are positional.
- **`--json`** prints the raw payload instead of a table, for piping into `jq`.
- **Arrays** repeat the flag (`--event_ids 11 --event_ids 22`) or take JSON
  (`--event_ids '[11,22]'`). Object arguments take JSON:
  `--ingredients '{"title":"bread","amount":"2"}'`.
- **Validation is the same Zod schema the MCP server uses**, so a bad enum or a
  malformed date fails the same way in both surfaces.

---

## 🧰 The 30 tools

Each is an MCP tool *and* a CLI subcommand — `add_planner_recipe` the tool is
`plan-to-eat add-planner-recipe` in the shell. Full reference with input
schemas and return shapes: **[docs/TOOLS.md](./docs/TOOLS.md)**.

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

The tool registry is exported too, if you want to build your own adapter over
the same 30 capabilities:

```ts
import { toolsByName, createSession } from 'plan-to-eat-mcp';

const { pte, ensure } = createSession();
await ensure();

const getRecipe = toolsByName.get('get_recipe')!;
console.log(getRecipe.description);          // same text the MCP host sees
const recipe = await getRecipe.run(pte, { id: 123 });
```

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
`recipe_ingredients_attributes`, not `ingredients`. The client and the
`create_recipe` / `update_recipe` tools accept the friendlier name
`ingredients` and translate. Each entry:

```json
{ "title": "water", "amount": "1", "unit": "cup", "note": "", "position": 1 }
```

To delete an existing ingredient on update, include its `id` plus
`"_destroy": true`. The server back-fills `amount_float`, `metric_amount`,
`metric_unit`, and `similar_titles`.

---

## 📁 Layout

One package, three layers. The logic lives in `core/`; the MCP server and the
CLI are thin adapters over the same registry.

```
src/
  core/
    client.ts     API client — no MCP, no CLI, no I/O beyond fetch
    tools.ts      the tool registry: name, description, Zod shape, handler
    session.ts    credentials + cookie-cache bootstrap, shared by both adapters
    version.ts    version read from package.json at runtime
  mcp/server.ts   registry -> MCP tools (stdio transport)
  cli/
    main.ts       registry -> subcommands, help, dispatch
    args.ts       argv -> Zod-validated arguments
    render.ts     results -> tables (or raw JSON under --json)
  scripts/        smoke tests and the docs coverage check
  index.ts        public entrypoint for library consumers
  server.ts       back-compat shim, see below
```

**Adding a tool means adding one entry to `src/core/tools.ts`.** It appears in
the MCP server and the CLI at once, with the same name, schema, and
description — they can't drift apart.

Other files worth knowing:

- `docs/TOOLS.md` — per-tool reference with input/output shapes and gotchas.
  Hand-written; `npm run check:docs` fails if it and the registry disagree
  about which tools exist.
- `.claude/skills/plan-to-eat/SKILL.md` — how to use the MCP tools well.
- `.claude/skills/plan-to-eat-cli/SKILL.md` — the same, for the CLI.
- `.claude-plugin/` — Claude Code plugin and marketplace manifests.
- `.mcp.json` — the plugin's MCP server declaration.
- `dist/` — emitted by `npm run build`.

> **Upgrading from ≤0.4?** The server moved from `dist/server.js` to
> `dist/mcp/server.js`. The old path still works — it's a shim that loads the
> new one — so existing host configs and deployments keep running. New configs
> should use the new path or the `plan-to-eat-mcp` bin.

Playwright was used during reverse engineering and is kept as a devDependency
for any future API-discovery work; the runtime depends only on `fetch`, the
MCP SDK, and Zod.

### Scripts

| Command | What it does |
|---|---|
| `npm run build` | Compile `src/**/*.ts` to `dist/`. |
| `npm run watch` | Same, in watch mode. |
| `npm start` | Run the compiled MCP server (`dist/mcp/server.js`). |
| `npm run cli -- <command>` | Run the CLI without linking it globally. |
| `npm run verify` | Smoke-test the client end-to-end against your account (recipes). |
| `npm run verify:planner` | Smoke-test the planner write endpoints (creates + cleans up test events on a date 6 months out). |
| `npm test` | Smoke-test the MCP server end-to-end (spawns it and calls tools). |
| `npm run check:docs` | Check `docs/TOOLS.md` covers exactly the registered tools. |
| `npm run clean` | Remove `dist/`. |

The `verify*` and `test` scripts hit your real account. They create and delete
their own test data, but they are not a dry run — see
[CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 🤝 Contributing

Bug reports, new endpoints, and upstream-breakage fixes are all welcome — see
**[CONTRIBUTING.md](./CONTRIBUTING.md)**. The one thing to know up front: the
test scripts run against a **real** Plan to Eat account and create real data
(then clean it up). Use your own.

---

## 🙏 Support Plan to Eat

This whole project exists because Plan to Eat is great. If you find this
useful, the best thing you can do is
**[give Plan to Eat a try with my referral link](https://www.plantoeat.com/ref/d7d2327524)**.
Free 14-day trial, no card needed.

## License

MIT — see [LICENSE](./LICENSE). Do whatever you want with it; just don't blame
me if Plan to Eat ships a breaking change.
