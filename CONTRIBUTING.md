# Contributing

Thanks for taking a look. This is a small, personal project that reverse-engineers
an API nobody promised us, so the bar is "clear, tested, and honest about what it
doesn't know" rather than anything ceremonial.

## Getting set up

```bash
git clone https://github.com/alex-zwingli/plan-to-eat-mcp.git
cd plan-to-eat-mcp
npm install
npm run build
```

You need Node 18+ and a [Plan to Eat](https://www.plantoeat.com) account. Put
your credentials in a `.env` at the repo root — it's gitignored:

```bash
PLAN_TO_EAT_USERNAME=you@example.com
PLAN_TO_EAT_PASSWORD=hunter2
```

## ⚠️ Tests run against your real account

There is no test fixture, no mock server, and no sandbox — Plan to Eat doesn't
offer one. `npm test`, `npm run verify`, and `npm run verify:planner` log into
whatever account `.env` points at and create real data.

They clean up after themselves (create → assert → delete), and the planner
script works on a date six months out to stay clear of anything you actually
planned. But a crash midway can leave a stray test recipe or planner note
behind. **Use your own account, and expect to occasionally delete something
called "API smoke test".**

If that's not acceptable for you, say so in the PR — a review against the
maintainer's account is a fine substitute for you running them.

| Command | What it touches |
|---|---|
| `npm run build` | Nothing. Always run this first — the scripts run compiled JS. |
| `npm run check:docs` | Nothing. Registry ↔ `docs/TOOLS.md` coverage. |
| `npm run verify` | Creates + deletes one recipe. |
| `npm run verify:planner` | Creates + deletes planner entries ~6 months out. |
| `npm test` | Spawns the MCP server; creates + deletes one recipe through it. |

## Adding or changing a tool

Tools live in one place: **`src/core/tools.ts`**. One entry gives you the MCP
tool and the CLI subcommand, so never add a capability to `src/mcp/` or
`src/cli/` directly.

1. Add the client method to `src/core/client.ts` if the endpoint is new.
2. Add a `defineTool({...})` entry to the registry:
   - `name` — snake_case; the CLI renders it as `kebab-case` automatically.
   - `group` — controls where it lands in `plan-to-eat --help`.
   - `description` — written for an LLM reading a tool list. First sentence
     should stand alone; it becomes the CLI's one-line summary.
   - `input` — a Zod *raw shape* (`{ id: z.number() }`), not `z.object({...})`.
     `.describe()` on a field shows up in both MCP schemas and CLI help.
   - `positional` — optional; which args can be given without a flag, in order.
     Good for the one or two obvious arguments, not for everything.
   - `columns` — optional; preferred table columns when the result is a list.
3. Document it in `docs/TOOLS.md` with a `### \`tool_name\`` heading, its input,
   its return shape, and any gotcha. `npm run check:docs` enforces that the
   heading exists.
4. Add it to the README's tool table.
5. Build, then exercise it both ways:
   ```bash
   npm run build
   node dist/cli/main.js your-new-tool --help
   node dist/cli/main.js your-new-tool ...
   npm test
   ```

### Argument types the CLI understands

`src/cli/args.ts` inspects each field's Zod type to decide how to read it from
argv. Strings, numbers, booleans, and enums work with no effort. Arrays become
repeatable flags. Records and objects are read as JSON. A union of primitives is
parsed as JSON if it can be, and treated as a string otherwise. If you reach for
a shape that doesn't fit those, teach `args.ts` about it rather than working
around it in the tool handler.

## The plugin, the skills, and `.mcp.json`

The repo doubles as a Claude Code plugin:

- `.claude-plugin/plugin.json` — the manifest. `.claude-plugin/marketplace.json`
  makes the repo installable with `claude plugin marketplace add`.
- `.mcp.json` — **must stay at the repo root**; that's where a plugin's MCP
  declaration is discovered. It uses `${CLAUDE_PLUGIN_ROOT}`, which only
  resolves when loaded as a plugin.
- `.claude/skills/plan-to-eat/` and `.claude/skills/plan-to-eat-cli/` — the two
  skills, referenced from `plugin.json`.

Validate manifests after touching them:

```bash
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
```

> Opening this repo in Claude Code shows a **pending-approval** MCP server named
> `plan-to-eat` with a `Missing environment variables: CLAUDE_PLUGIN_ROOT`
> warning. That's expected: Claude Code reads a root `.mcp.json` as a project
> config too, where that variable isn't defined. Decline it, and use the
> installed plugin or an explicit `claude mcp add` instead.

If you change a tool's behavior, update **both** skills — they document the same
capabilities for two different callers, and a fix to one usually applies to the
other.

## Style

- TypeScript, `strict: true`, no `any` that isn't load-bearing and commented.
- Match the surrounding code. It leans on plain functions and small modules;
  there's no framework here and it doesn't need one.
- Comments explain *why*, especially where the upstream API is strange. Those
  notes are the most valuable thing in this repo — `description` vs `title` on
  note entries, `supper` vs `dinner`, the empty `text/javascript` responses.
  When you discover a new quirk, write it down.
- Keep `core/` free of MCP and CLI concerns. That separation is what lets one
  registry feed two adapters.

## Reverse-engineering new endpoints

Playwright is a devDependency for exactly this: drive the real web app, watch
the network tab, and find out what the UI actually sends. When you add an
endpoint, record what you learned in the README's API reference section —
including the parts that *don't* work, which save the next person the trip.

## Pull requests

- Branch off `main`, one topic per PR.
- Say which of the scripts above you ran, and what happened.
- If Plan to Eat changed something upstream and broke a tool, that's the most
  useful kind of PR there is. Include the old and new request/response shapes.

## A note on the upstream API

There is no public Plan to Eat API. Everything here was reverse-engineered from
the desktop web app and could break without warning or notice. Please don't file
issues with Plan to Eat about this project, and don't use it in a way that would
put load on their servers — it's meant for one person driving their own account.

## License

Contributions are accepted under the [MIT License](./LICENSE).
