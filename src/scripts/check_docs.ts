// Guards against the registry and docs/TOOLS.md drifting apart.
//
// TOOLS.md is hand-written on purpose — it documents return shapes and gotchas
// the registry doesn't carry — so this checks coverage rather than generating
// the file: every tool needs a `### \`name\`` section, and every section needs a
// tool. Run via `npm run check:docs`.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { tools } from '../core/tools.js';

const docPath = path.join(__dirname, '..', '..', 'docs', 'TOOLS.md');
const doc = fs.readFileSync(docPath, 'utf8');

const documented = new Set(
  [...doc.matchAll(/^### `([a-z_]+)`/gm)].map((m) => m[1]),
);
const registered = new Set(tools.map((t) => t.name));

const undocumented = [...registered].filter((n) => !documented.has(n));
const orphaned = [...documented].filter((n) => !registered.has(n));

for (const name of undocumented) {
  console.error(`missing from docs/TOOLS.md: ${name}`);
}
for (const name of orphaned) {
  console.error(`documented but not registered: ${name}`);
}

if (undocumented.length || orphaned.length) {
  console.error(`\n${undocumented.length + orphaned.length} problem(s).`);
  process.exit(1);
}

console.log(`docs/TOOLS.md covers all ${registered.size} registered tools.`);
