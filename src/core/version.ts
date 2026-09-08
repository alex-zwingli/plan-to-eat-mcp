import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Package version, read from package.json at runtime so the MCP server banner,
 * the CLI's `--version`, and the published package can never drift apart.
 * From `dist/core/` the manifest sits two levels up — the same shape the
 * deploy script ships to the remote.
 */
export function packageVersion(): string {
  try {
    const manifest = path.join(__dirname, '..', '..', 'package.json');
    return (JSON.parse(fs.readFileSync(manifest, 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
