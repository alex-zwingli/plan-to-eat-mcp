// Shared credential + cookie-session bootstrap.
//
// Both adapters (MCP server, CLI) need the same three things: read credentials
// from the environment, restore a cached cookie session from disk if one is
// there, and write it back after any call that may have refreshed it.
//
// Env vars (required):
//   PLAN_TO_EAT_USERNAME
//   PLAN_TO_EAT_PASSWORD
//
// Env vars (optional):
//   PLAN_TO_EAT_SESSION_FILE  Path to a JSON file used to persist the cookie
//                             session across restarts. Defaults to
//                             ~/.plan-to-eat-session.json. Set to "" to
//                             disable disk caching.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PlanToEat, type Session } from './client.js';

export class MissingCredentialsError extends Error {
  constructor() {
    super('Missing PLAN_TO_EAT_USERNAME and/or PLAN_TO_EAT_PASSWORD env vars.');
    this.name = 'MissingCredentialsError';
  }
}

export function sessionFilePath(): string | null {
  const configured = process.env.PLAN_TO_EAT_SESSION_FILE;
  if (configured === '') return null;
  return configured || path.join(os.homedir(), '.plan-to-eat-session.json');
}

export interface SessionHandle {
  pte: PlanToEat;
  /** Log in (or restore cached cookies) once. Safe to await repeatedly. */
  ensure(): Promise<void>;
  /** Write the current cookies back to disk. Never throws. */
  persist(): void;
}

/**
 * Build a client wired to env credentials and the on-disk session cache.
 * `onWarning` receives non-fatal cache problems — the MCP server routes these
 * to stderr so they don't corrupt the stdio protocol stream.
 */
export function createSession(onWarning: (message: string) => void = () => {}): SessionHandle {
  const email = process.env.PLAN_TO_EAT_USERNAME;
  const password = process.env.PLAN_TO_EAT_PASSWORD;
  if (!email || !password) throw new MissingCredentialsError();

  const sessionFile = sessionFilePath();
  const pte = new PlanToEat();
  pte.setCredentials({ email, password });

  const persist = (): void => {
    if (!sessionFile) return;
    try { fs.writeFileSync(sessionFile, JSON.stringify(pte.exportSession(), null, 2)); }
    catch { /* a cold cache is recoverable; a crash here is not */ }
  };

  let ready: Promise<void> | null = null;
  const ensure = (): Promise<void> => {
    if (ready) return ready;
    ready = (async () => {
      if (sessionFile && fs.existsSync(sessionFile)) {
        try {
          pte.importSession(JSON.parse(fs.readFileSync(sessionFile, 'utf8')) as Session);
        } catch (e) {
          onWarning(`could not load session file: ${(e as Error).message}`);
        }
      }
      // First call surfaces auth issues early. Auto re-login is handled inside the client.
      await pte.getCounts();
      persist();
    })();
    return ready;
  };

  return { pte, ensure, persist };
}
