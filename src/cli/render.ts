// Human-readable rendering of tool results. `--json` bypasses all of this and
// prints the raw payload, so scripts never have to parse a table.

const MAX_CELL = 48;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Terminal display width, ignoring the fact that emoji are wide. Good enough. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.length ? `[${value.length}]` : '';
  if (isPlainObject(value)) return '{…}';
  const s = String(value).replace(/\s+/g, ' ');
  return s.length > MAX_CELL ? `${s.slice(0, MAX_CELL - 1)}…` : s;
}

/**
 * Pick columns for a table: the caller's preferred list filtered to keys that
 * actually appear, else the keys of the first row minus anything structural.
 */
function pickColumns(rows: Record<string, unknown>[], preferred?: string[]): string[] {
  const present = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) present.add(k);
  if (preferred) {
    const hit = preferred.filter((c) => present.has(c));
    if (hit.length) return hit;
  }
  return [...present].filter((k) => rows.some((r) => !isPlainObject(r[k]) && !Array.isArray(r[k]))).slice(0, 8);
}

function table(rows: Record<string, unknown>[], preferred?: string[]): string {
  const columns = pickColumns(rows, preferred);
  if (!columns.length) return JSON.stringify(rows, null, 2);

  const header = columns.map((c) => c.toUpperCase());
  const body = rows.map((row) => columns.map((c) => cell(row[c])));
  const widths = columns.map((_, i) =>
    Math.max(header[i].length, ...body.map((r) => r[i].length)));

  const line = (cells: string[]): string =>
    cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ').trimEnd();

  return [line(header), line(widths.map((w) => '─'.repeat(w))), ...body.map(line)].join('\n');
}

function keyValues(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '');
  const width = Math.max(0, ...entries.map(([k]) => k.length));
  return entries
    .map(([k, v]) => {
      const rendered = isPlainObject(v) || Array.isArray(v)
        ? JSON.stringify(v)
        : String(v).replace(/\r?\n/g, '\n'.padEnd(width + 3));
      return `${k.padEnd(width)}  ${rendered}`;
    })
    .join('\n');
}

/** Render a tool result for a terminal. */
export function renderResult(result: unknown, columns?: string[]): string {
  if (result === null || result === undefined) return '(no output)';
  if (Array.isArray(result)) {
    if (!result.length) return '(no results)';
    if (result.every(isPlainObject)) {
      return `${table(result as Record<string, unknown>[], columns)}\n\n${result.length} row${result.length === 1 ? '' : 's'}`;
    }
    return result.map((v) => String(v)).join('\n');
  }
  if (isPlainObject(result)) {
    // Wrapper shapes like PlannerWeek carry a single array of rows; table that
    // and show the rest as context.
    const arrayKey = Object.keys(result).find((k) => Array.isArray(result[k]));
    if (arrayKey) {
      const rows = result[arrayKey] as unknown[];
      const rest = { ...result };
      delete rest[arrayKey];
      const head = Object.keys(rest).length ? `${keyValues(rest)}\n\n` : '';
      return head + renderResult(rows, columns);
    }
    return keyValues(result);
  }
  return String(result);
}
