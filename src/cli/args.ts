// Turns argv into an object the tool's Zod schema will accept.
//
// `parseArgs` only knows about strings and booleans, so we inspect each field's
// Zod type to decide how to read it: numbers get coerced, booleans become
// valueless flags, and anything structural is read as JSON. Validation itself
// still belongs to Zod — this layer only decides how to get from a string to a
// candidate value.

import { parseArgs } from 'node:util';
import { z } from 'zod';
import type { ToolDef } from '../core/tools.js';

export type FieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'enum'
  /** Repeatable flag; each occurrence is one JSON item. */
  | 'array'
  /** Strict JSON — objects and records. */
  | 'json'
  /** Union of primitives: JSON if it parses, otherwise the raw string. */
  | 'loose';

export interface FieldInfo {
  name: string;
  kind: FieldKind;
  required: boolean;
  /** Present for enums, to list choices in help output. */
  choices?: string[];
  description?: string;
}

export class UsageError extends Error {}

interface ZodInternals { def?: { type?: string; innerType?: z.ZodType } }

/** Peel `.optional()` / `.nullable()` / `.default()` wrappers off a schema. */
function unwrap(schema: z.ZodType): { inner: z.ZodType; optional: boolean } {
  let inner = schema;
  let optional = false;
  for (;;) {
    const def = (inner as unknown as ZodInternals).def;
    if (!def?.innerType) break;
    if (def.type === 'optional' || def.type === 'default') optional = true;
    else if (def.type !== 'nullable') break;
    inner = def.innerType;
  }
  return { inner, optional };
}

function kindOf(schema: z.ZodType): { kind: FieldKind; choices?: string[] } {
  switch ((schema as unknown as ZodInternals).def?.type) {
    case 'string': return { kind: 'string' };
    case 'number':
    case 'bigint': return { kind: 'number' };
    case 'boolean': return { kind: 'boolean' };
    case 'enum': return { kind: 'enum', choices: (schema as unknown as z.ZodEnum<never>).options as string[] };
    case 'array': return { kind: 'array' };
    case 'union': return { kind: 'loose' };
    default: return { kind: 'json' };
  }
}

export function describeFields(def: ToolDef): FieldInfo[] {
  return Object.entries(def.input).map(([name, schema]) => {
    const { inner, optional } = unwrap(schema as z.ZodType);
    const { kind, choices } = kindOf(inner);
    return { name, kind, required: !optional, choices, description: (schema as z.ZodType).description };
  });
}

function parseJson(raw: string, name: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw new UsageError(`--${name}: expected JSON, got ${JSON.stringify(raw)}`); }
}

function coerce(raw: string, field: FieldInfo): unknown {
  switch (field.kind) {
    case 'number': {
      const n = Number(raw);
      if (raw.trim() === '' || Number.isNaN(n)) {
        throw new UsageError(`--${field.name}: expected a number, got ${JSON.stringify(raw)}`);
      }
      return n;
    }
    case 'boolean':
      // Reachable only via `--flag=false`; a bare `--flag` never lands here.
      return raw !== 'false' && raw !== '0';
    case 'array':
    case 'json':
      return parseJson(raw, field.name);
    case 'loose':
      try { return JSON.parse(raw); } catch { return raw; }
    default:
      return raw;
  }
}

/**
 * Parse the argv tail for one tool. Returns a candidate object; the caller runs
 * it through Zod for real validation.
 */
export function parseToolArgs(def: ToolDef, argv: string[]): Record<string, unknown> {
  const fields = describeFields(def);
  const byName = new Map(fields.map((f) => [f.name, f]));

  const options: Record<string, { type: 'string' | 'boolean'; multiple?: boolean }> = {};
  for (const f of fields) {
    options[f.name] = f.kind === 'boolean'
      ? { type: 'boolean' }
      : { type: 'string', multiple: f.kind === 'array' };
    // Accept dashes as well as underscores: --start-date and --start_date.
    if (f.name.includes('_')) options[f.name.replace(/_/g, '-')] = options[f.name];
  }

  let parsed;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed.values)) {
    const name = key.replace(/-/g, '_');
    const field = byName.get(name);
    if (!field || value === undefined) continue;
    if (Array.isArray(value)) {
      // One JSON item per occurrence — unless a single occurrence already
      // holds the whole array, e.g. --event_ids '[1,2,3]'.
      const items = value.map((v) => coerce(String(v), field));
      out[name] = items.length === 1 && Array.isArray(items[0]) ? items[0] : items;
    } else if (typeof value === 'boolean') {
      out[name] = value;
    } else {
      out[name] = coerce(value, field);
    }
  }

  const positional = def.positional ?? [];
  if (parsed.positionals.length > positional.length) {
    throw new UsageError(
      `too many arguments: expected at most ${positional.length}` +
      `${positional.length ? ` (${positional.join(', ')})` : ''}, got ${parsed.positionals.length}`,
    );
  }
  parsed.positionals.forEach((raw, i) => {
    const name = positional[i];
    const field = byName.get(name);
    if (!field) return;
    if (name in out) throw new UsageError(`${name} given both positionally and as --${name}`);
    out[name] = coerce(raw, field);
  });

  return out;
}
