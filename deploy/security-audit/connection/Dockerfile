FROM node:24.22.1-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
WORKDIR /opt/mofacts/mofacts-mcp-sidecar/services/mongo-mcp
COPY mofacts-mcp-sidecar/services/mongo-mcp/package.json mofacts-mcp-sidecar/services/mongo-mcp/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
WORKDIR /opt/mofacts
COPY package.json ./
COPY deploy/security-audit/connection ./deploy/security-audit/connection
COPY mofacts/common/securityAudit ./mofacts/common/securityAudit
COPY mofacts/server/securityAudit/securityAuditIngestionV2.ts ./mofacts/server/securityAudit/securityAuditIngestionV2.ts
COPY mofacts/scripts/security-audit/authentication ./mofacts/scripts/security-audit/authentication
COPY mofacts/scripts/security-audit/core ./mofacts/scripts/security-audit/core
USER 2000:2000
ENTRYPOINT ["node", "deploy/security-audit/connection/main.mjs"]
