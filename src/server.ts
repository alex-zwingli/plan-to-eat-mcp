#!/usr/bin/env node
// Back-compat shim. The MCP server moved to `dist/mcp/server.js`; existing host
// configs and deployments pointing at `dist/server.js` keep working through
// this file. Prefer the new path (or the `plan-to-eat-mcp` bin) in new configs.
import './mcp/server.js';
