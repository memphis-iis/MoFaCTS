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
2. Fill in `MONGO_URI` and `DB_NAME`.
3. Start everything:

```bash
docker compose up --build
```

That starts:

- Playwright MCP at `http://localhost:8931/mcp`
- Mongo MCP at `http://localhost:8932/mcp`

## Local Hotfix Dev Target

When testing the MoFaCTS hotfix dev server at `http://localhost:3200`, start the sidecar with:

```powershell
docker compose -f docker-compose.yml -f docker-compose.hotfix-dev.yml up -d
```

That points Playwright MCP at `http://host.docker.internal:3200` and connects Mongo MCP to the local Docker database `MoFACT-meteor3` on the `deploy_mofacts` network.

For Codex agents working in this repo, this sidecar is the authoritative browser automation path for MoFaCTS UI checks. Use the `mcp__mofacts_playwright__` tools exposed by `http://localhost:8931/mcp`. Do not use the bundled Browser `iab` registry or the Chrome extension backend as a substitute for this sidecar.

If the current Codex turn does not list `mcp__mofacts_playwright__` as a callable namespace, or `tool_search` finds no such tools, do not treat that as proof the sidecar is down or unavailable. First verify the hotfix app, start or restart this sidecar, and check `http://localhost:8931/mcp`. A missing callable namespace after that is a Codex tool-exposure/session issue, not a MoFaCTS sidecar diagnosis.

For a repeatable local check, run from the main repo:

```powershell
mofacts-mcp-sidecar\scripts\check-hotfix-sidecar.ps1
```

Use `-Start` or `-Restart` to start the hotfix sidecar before checking. The script reports the hotfix app endpoint, sidecar compose services, Playwright MCP endpoint, and the expected Codex namespace.

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

This repo also includes a production wrapper for your current server:

- SSH host: `ubuntu@52.89.109.53`
- Public site: `https://mofacts.optimallearning.org`
- Remote Mongo DB: `MoFACT-meteor3`

On Windows PowerShell:

```powershell
.\scripts\start-production.ps1
```

That script:

1. Resolves the current Mongo container IP on the production host.
2. Starts a small SSH tunnel container inside Docker Compose.
3. Starts the sidecar with:
   - `BASE_URL=https://mofacts.optimallearning.org`
   - `MONGO_URI=mongodb://ssh-tunnel:27017/MoFACT-meteor3`
   - `DB_NAME=MoFACT-meteor3`

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
http://host.docker.internal:3100
```

That address works from inside Docker containers and points back to a website running on your host machine. Change `BASE_URL` in `.env` if your site moves somewhere else.

For the Windows native hotfix loop, the compose override `docker-compose.hotfix-dev.yml` changes this target to:

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

If Mongo is remote too, update:

```text
MONGO_URI=mongodb+srv://...
DB_NAME=...
```

Nothing else in the sidecar needs to change.

If Mongo is private, prefer an SSH tunnel instead of exposing the database directly. The production wrapper script included here follows that pattern.

## Safe Extension Points

If you want to extend the data access later, keep changes in:

- `services/mongo-mcp/src/index.js`

Recommended rule: add narrowly scoped read-only tools for specific questions, instead of adding generic query execution.

## Notes

- The Playwright service is intentionally close to upstream. The local Dockerfile extends the official image so project defaults can be changed here without editing the main app.
- The Mongo service is intentionally small and readable rather than abstract.
- Both endpoints bind to `localhost` on the host machine by default so they are not exposed broadly.
- Production Mongo access is tunneled over SSH rather than opened publicly.
