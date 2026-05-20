# Playwright MCP

This sidecar builds a small MoFaCTS image from the official Playwright MCP
container. The local image keeps the upstream server behavior, but gives this
project a place for MoFaCTS-specific defaults.

Current project defaults:

- run with `--isolated` so experiment smoke tests get a fresh browser context
- write output under `/tmp/playwright-mcp/output`
- bind the MCP endpoint to port `8931`

Change the target website in the root `.env` file:

```text
BASE_URL=http://host.docker.internal:3100
```

The MCP server itself stays generic; your AI client uses that base URL when it starts browsing the live site.
