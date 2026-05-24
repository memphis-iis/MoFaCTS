FROM mcr.microsoft.com/playwright/mcp

LABEL org.opencontainers.image.title="mofacts-playwright-mcp"
LABEL org.opencontainers.image.description="MoFaCTS Playwright MCP sidecar with project defaults"

COPY mofacts-entrypoint.cjs /app/mofacts-entrypoint.cjs

ENTRYPOINT ["node", "/app/mofacts-entrypoint.cjs"]
