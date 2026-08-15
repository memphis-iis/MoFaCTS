# mofacts-mcp-sidecar

Small sidecar services for AI-assisted testing and inspection of a running MoFaCTS site.

This project does two things:

1. Exposes an off-the-shelf Playwright MCP server so an AI client can drive the real website UI.
2. Exposes a tiny read-only Mongo MCP server so an AI client can inspect usage data safely.

It does not add a second UI, does not change your main app, and does not expose arbitrary database queries.

## Architecture

- `playwright-mcp` is a standalone browser automation MCP server. It connects to your live site the same way a real browser does, so clicks, navigation, and inspection happen against the real app. The local image extends the official Playwright MCP image and runs isolated browser contexts by default for repeatable experiment smoke tests.
- `mongo-mcp` is a separate MCP server that connects to MongoDB with read-only application logic. It exposes only a few fixed tools instead of a raw query console.
- Both services are published as HTTP MCP endpoints, so an AI client can attach to them side by side.

## Project Layout

```text
mofacts-mcp-sidecar/
  docker-compose.yml
  README.md
  .env.example
  services/
    playwright-mcp/
    mongo-mcp/
```

## Start

1. Copy `.env.example` to `.env`.
2. Fill in `MONGO_URI`, `DB_NAME`, and
   `MOFACTS_MONGO_REPLICA_SET_NAME`. `MONGO_URI` must contain a read-only
   sidecar account, its `authSource`, and the selected replica-set name.
3. Start everything:

```bash
docker compose up --build
```

That starts:

- Playwright MCP at `http://localhost:8931/mcp`
- Mongo MCP at `http://localhost:8932/mcp`

## Local Hotfix Dev Target

When testing the canonical MoFaCTS hotfix server at `http://localhost:3200`, use the sidecar guard script:

```powershell
mofacts-mcp-sidecar\scripts\check-localhost-sidecar.ps1 -Start
```

The script first inspects the named Docker Compose project without parsing the
Compose configuration. If both sidecars are already running, it reports that
state and does not run Compose. If a start or restart is actually needed, it
uses the authenticated local Mongo configuration in `deploy/.env.local` to
idempotently provision a dedicated, local-only `read` account. Its generated
credentials and Compose environment remain ignored in
`deploy/local-hotfix/sidecar-mcp.env`; no production or app credentials are
given to the sidecar. If the local Mongo service is not running or its required
configuration is absent, the script fails before it changes sidecar containers.

The local-server overlay points Playwright MCP at
`http://host.docker.internal:3200` and attaches Mongo MCP to the
`deploy_mofacts` network. The private environment file remains the sole owner
of the authenticated topology-capable MongoDB URI; the overlay does not replace
it with a standalone URL.

For Codex agents working in this repo, this sidecar is the authoritative browser automation path for MoFaCTS UI checks. Use the `mcp__mofacts_playwright__` tools exposed by `http://localhost:8931/mcp`. Do not use the bundled Browser `iab` registry or the Chrome extension backend as a substitute for this sidecar.

If the current Codex turn does not list `mcp__mofacts_playwright__` as a callable namespace, or `tool_search` finds no such tools, do not treat that as proof the sidecar is down or unavailable. First verify the hotfix app, start or restart this sidecar, and check `http://localhost:8931/mcp`. A missing callable namespace after that is a Codex tool-exposure/session issue, not a MoFaCTS sidecar diagnosis.

Codex can also expose a partial tool list even when the sidecar is healthy. In one observed session the first callable list included only tools such as `browser_navigate`, `browser_evaluate`, `browser_hover`, `browser_tabs`, and `browser_run_code_unsafe`, while the Playwright MCP server itself was still advertising the normal browser tools:

- `browser_snapshot`
- `browser_click`
- `browser_fill_form`
- `browser_type`
- `browser_take_screenshot`
- `browser_wait_for`
- `browser_network_requests`
- `browser_network_request`

When that happens, do not replace the sidecar with ad hoc Playwright and do not hand-write MCP JSON-RPC calls for the UI task. Verify what the MCP server advertises, then use `tool_search` with the missing tool names so Codex loads those deferred tools into the turn.

From `mofacts-mcp-sidecar\services\mongo-mcp`, this probe lists the tools advertised by the running Playwright MCP endpoint:

```powershell
node --input-type=module -e "import { Client } from '@modelcontextprotocol/sdk/client/index.js'; import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'; const client = new Client({ name: 'probe', version: '1.0.0' }); const transport = new StreamableHTTPClientTransport(new URL('http://localhost:8931/mcp')); await client.connect(transport); const result = await client.listTools(); console.log(JSON.stringify(result.tools.map(t => ({ name: t.name, description: t.description })), null, 2)); await client.close();"
```

If that probe lists `browser_snapshot`, `browser_click`, or `browser_fill_form`, the tools did not disappear from the sidecar. Search for those exact names with Codex `tool_search`, then continue using the `mcp__mofacts_playwright__` namespace. If the probe does not list them, inspect the running image and upstream Playwright MCP package before diagnosing Codex exposure:

```powershell
docker exec mofacts-mcp-sidecar-playwright-mcp-1 node -e "const fs=require('fs'); console.log(fs.readFileSync('/app/package.json','utf8'))"
docker logs mofacts-mcp-sidecar-playwright-mcp-1 --tail 80
```

For a repeatable local check, run from the main repo:

```powershell
mofacts-mcp-sidecar\scripts\check-localhost-sidecar.ps1
```

Run the script without switches to inspect the hotfix app endpoint, sidecar
container services, Playwright MCP endpoint, and expected Codex namespace.
Use `-Start` only when the sidecar is not already running; it reports an
already-running sidecar without invoking Compose. On a needed start, it
provisions the local read-only Mongo account from `deploy/.env.local` before
invoking Compose. `-Restart` performs the same preflight and then recreates the
two sidecar containers.

## OpenAI Runner

If you want an OpenAI-native local client instead of Gemini, use the small Agents SDK runner in `openai-runner/`.

Setup:

```bash
cd openai-runner
npm install
```

Set your API key:

```bash
export OPENAI_API_KEY=sk-...
```

On Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="sk-..."
```

Run the inspector:

```bash
npm run inspect-dashboard
```

Or pass your own prompt:

```bash
node inspect-dashboard.mjs "Use Playwright to inspect the Learner Dashboard and summarize what is on screen."
```

This uses the OpenAI Agents SDK with local Streamable HTTP MCP servers at:

- `http://localhost:8931/mcp`
- `http://localhost:8932/mcp`

## Production Start

This repo includes a production wrapper that consumes a private environment
file. The file must define `BASE_URL`, `MONGO_URI`, `DB_NAME`, and
`MOFACTS_MONGO_REPLICA_SET_NAME`. `MONGO_URI` may be a reachable authenticated
replica-set seed list or SRV URI; Compose does not resolve a container IP or
force traffic through one MongoDB member.

On Windows PowerShell:

```powershell
$env:MOFACTS_PROD_ENV_FILE='C:\private\mofacts-sidecar.production.env'
.\scripts\start-production.ps1
```

The Mongo MCP process validates an authenticated ping and the exact connected
replica-set identity before listening. Connection errors are not expanded with
the URI, so credentials do not enter routine startup output.

When you are done:

```powershell
.\scripts\stop-production.ps1
```

## Reset Playwright Only

For repeated browser smoke tests, recreate the isolated Playwright MCP sidecar
without touching Mongo:

```powershell
.\scripts\reset-playwright.ps1
```

Against production overrides:

```powershell
.\scripts\reset-playwright.ps1 -Production
```

If old ad hoc Playwright MCP containers are still running, remove them explicitly:

```powershell
.\scripts\reset-playwright.ps1 -Production -RemoveOtherPlaywrightMcp
```

## How The AI Uses It

### Playwright for UI interaction

The AI connects to the Playwright MCP endpoint and uses browser tools to open pages, click buttons, inspect DOM state, and walk real user flows in the live app.

By default, the intended site target is:

```text
http://host.docker.internal:3200
```

That address works from inside Docker containers and points back to the sole supported local MoFaCTS endpoint at `http://localhost:3200`.

The `docker-compose.local-server.yml` sidecar override targets the sole localhost server at:

```text
http://host.docker.internal:3200
```

### Mongo for usage queries

The Mongo MCP server exposes only these read-only tools:

- `usage_summary(days)`
- `recent_sessions(limit)`
- `session_events(session_id, limit)`

These tools read from the MoFaCTS `history` collection and treat distinct `sessionID` values as sessions. That matches the current app data model without needing a separate session service.

## Example MCP Client Wiring

For an MCP client that supports remote HTTP servers, the config looks like this:

```json
{
  "mcpServers": {
    "playwright": {
      "url": "http://localhost:8931/mcp"
    },
    "mofacts-mongo": {
      "url": "http://localhost:8932/mcp"
    }
  }
}
```

## Pointing To A Remote Site

If the website is not running locally, change:

```text
BASE_URL=https://your-site.example.com
```

If Mongo is remote too, use a reachable topology-capable URI:

```text
MONGO_URI=mongodb+srv://readonly-user:password@cluster.example/MoFACT-meteor3?authSource=MoFACT-meteor3
DB_NAME=...
MOFACTS_MONGO_REPLICA_SET_NAME=...
```

Nothing else in the sidecar needs to change. Keep MongoDB private through the
deployment network, VPN, or another topology-capable private route. Do not make
a tunnel to one container the replica-set discovery contract; that would strand
the sidecar after member movement or a later parallel-server migration.

## Safe Extension Points

If you want to extend the data access later, keep changes in:

- `services/mongo-mcp/src/index.js`

Recommended rule: add narrowly scoped read-only tools for specific questions, instead of adding generic query execution.

## Notes

- The Playwright service is intentionally close to upstream. The local Dockerfile extends the official image so project defaults can be changed here without editing the main app.
- The Mongo service is intentionally small and readable rather than abstract.
- Both endpoints bind to `localhost` on the host machine by default so they are not exposed broadly.
- Production Mongo access uses the private topology-capable route named by the
  environment URI and validates the exact replica-set identity at startup.
