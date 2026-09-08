#!/usr/bin/env node
// Plan to Eat CLI.
//
// A thin adapter over the same registry the MCP server uses: every tool in
// `src/core/tools.ts` is a subcommand here, named with dashes instead of
// underscores (`get_recipe` -> `get-recipe`; both spellings are accepted).
//
// Credentials come from the environment (see `src/core/session.ts`); a `.env`
// in the working directory is loaded as a convenience, without overriding
// variables already set in the shell.

import * as dotenv from 'dotenv';
import { z } from 'zod';
import { HttpError } from '../core/client.js';
import { createSession, MissingCredentialsError, sessionFilePath } from '../core/session.js';
import { TOOL_GROUP_LABELS, tools, toolsByName, type ToolDef, type ToolGroup } from '../core/tools.js';
import { packageVersion } from '../core/version.js';
import { describeFields, parseToolArgs, UsageError } from './args.js';
import { renderResult } from './render.js';

const BIN = 'plan-to-eat';
const SUMMARY_WIDTH = 76;

const commandName = (toolName: string): string => toolName.replace(/_/g, '-');

/**
 * One-line summary for the command list. Takes the first sentence — a period
 * followed by a capital, so "e.g." and "etc." don't split it — then clips to a
 * word boundary. The full description lives in `<command> --help`.
 */
function summarize(description: string): string {
  const sentence = /^.*?[.!?](?=\s+[A-Z])/.exec(description)?.[0] ?? description;
  if (sentence.length <= SUMMARY_WIDTH) return sentence;
  const clipped = sentence.slice(0, SUMMARY_WIDTH);
  return `${clipped.slice(0, clipped.lastIndexOf(' ')).replace(/[,;:(]$/, '')}…`;
}

function resolveTool(name: string): ToolDef | undefined {
  return toolsByName.get(name) ?? toolsByName.get(name.replace(/-/g, '_'));
}

function globalHelp(): string {
  const lines = [
    `${BIN} ${packageVersion()} — talk to your Plan to Eat account from the terminal.`,
    '',
    `Usage: ${BIN} <command> [args] [--json]`,
    `       ${BIN} <command> --help`,
    '',
    'Options:',
    '  --json       Print the raw JSON payload instead of a table.',
    '  --help, -h   Show this help, or a command\'s help.',
    '  --version    Print the version.',
    '',
    'Environment:',
    '  PLAN_TO_EAT_USERNAME      (required) login email',
    '  PLAN_TO_EAT_PASSWORD      (required) password',
    `  PLAN_TO_EAT_SESSION_FILE  cookie cache (default ${sessionFilePath() ?? 'disabled'})`,
    '',
    'Commands:',
  ];

  const width = Math.max(...tools.map((t) => commandName(t.name).length));
  for (const group of Object.keys(TOOL_GROUP_LABELS) as ToolGroup[]) {
    const inGroup = tools.filter((t) => t.group === group);
    if (!inGroup.length) continue;
    lines.push('', `  ${TOOL_GROUP_LABELS[group]}`);
    for (const t of inGroup) {
      lines.push(`    ${commandName(t.name).padEnd(width)}  ${summarize(t.description)}`);
    }
  }
  return lines.join('\n');
}

function commandHelp(def: ToolDef): string {
  const fields = describeFields(def);
  const positional = def.positional ?? [];
  const usage = [
    BIN,
    commandName(def.name),
    ...positional.map((p) => (fields.find((f) => f.name === p)?.required ? `<${p}>` : `[${p}]`)),
    ...(fields.some((f) => !positional.includes(f.name)) ? ['[options]'] : []),
  ].join(' ');

  const lines = [usage, '', def.description];
  if (fields.length) {
    lines.push('', 'Arguments:');
    const width = Math.max(...fields.map((f) => f.name.length));
    for (const f of fields) {
      const bits = [f.required ? 'required' : 'optional', f.kind];
      if (f.choices) bits.push(f.choices.join('|'));
      if (positional.includes(f.name)) bits.push(`positional #${positional.indexOf(f.name) + 1}`);
      lines.push(`  --${f.name.padEnd(width)}  ${f.description ? `${f.description} ` : ''}(${bits.join(', ')})`);
    }
    if (fields.some((f) => f.kind === 'array')) {
      lines.push('', 'Repeat an array flag once per item, or pass the whole array as JSON.');
    }
  } else {
    lines.push('', 'Takes no arguments.');
  }
  return lines.join('\n');
}

/** Pull `--json` out of argv before the per-command parser sees it. */
function takeFlag(argv: string[], flag: string): boolean {
  const i = argv.indexOf(flag);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
}

async function main(argv: string[]): Promise<number> {
  if (argv.includes('--version') || argv[0] === 'version') {
    console.log(packageVersion());
    return 0;
  }

  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(globalHelp());
    return command ? 0 : 1;
  }

  const def = resolveTool(command);
  if (!def) {
    console.error(`Unknown command "${command}". Run \`${BIN} --help\` for the list.`);
    return 1;
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(commandHelp(def));
    return 0;
  }

  const asJson = takeFlag(rest, '--json');
  const raw = parseToolArgs(def, rest);

  const parsed = z.object(def.input).safeParse(raw);
  if (!parsed.success) {
    console.error(`${commandName(def.name)}: invalid arguments`);
    for (const issue of parsed.error.issues) {
      const at = issue.path.length ? `--${issue.path.join('.')}: ` : '';
      console.error(`  ${at}${issue.message}`);
    }
    console.error(`\nRun \`${BIN} ${commandName(def.name)} --help\` for the argument list.`);
    return 1;
  }

  const session = createSession((msg) => console.error(`warning: ${msg}`));
  await session.ensure();
  const result = await def.run(session.pte, parsed.data as Record<string, unknown>);
  session.persist();

  console.log(asJson ? JSON.stringify(result, null, 2) : renderResult(result, def.columns));
  return 0;
}

dotenv.config({ quiet: true });

main(process.argv.slice(2))
  .then((code) => { process.exitCode = code; })
  .catch((e: unknown) => {
    if (e instanceof UsageError || e instanceof MissingCredentialsError) {
      console.error(`${BIN}: ${e.message}`);
    } else if (e instanceof HttpError) {
      console.error(`${BIN}: Plan to Eat returned ${e.status}`);
      if (e.body) console.error(typeof e.body === 'string' ? e.body : JSON.stringify(e.body, null, 2));
    } else {
      console.error(`${BIN}: ${(e as Error).stack ?? String(e)}`);
    }
    process.exitCode = 1;
  });
