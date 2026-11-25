import { dependency } from './dependencies.mjs';
import { CONNECTION_BASE, CONNECTION_ORIGIN, CONNECTION_RESOURCE, CONNECTION_SCOPES } from './authorization.mjs';

const { default: express } = await dependency('express');
const { McpServer } = await dependency('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = await dependency('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { authorizationHandler } = await dependency('@modelcontextprotocol/sdk/server/auth/handlers/authorize.js');
const { tokenHandler } = await dependency('@modelcontextprotocol/sdk/server/auth/handlers/token.js');
const { clientRegistrationHandler } = await dependency('@modelcontextprotocol/sdk/server/auth/handlers/register.js');
const { revocationHandler } = await dependency('@modelcontextprotocol/sdk/server/auth/handlers/revoke.js');
const { requireBearerAuth } = await dependency('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');
const z = await dependency('zod/v4');
const base = '/audit-connection';
const resourceMetadata = '/.well-known/oauth-protected-resource/audit-connection/mcp';
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const contentSecurityPolicy = callback => `default-src 'none'; form-action 'self'${callback ? ` ${callback}` : ''}; frame-ancestors 'none'; base-uri 'none'`;

export function createConnectionApp({ authorization, handoff }) {
  const app = express();
  app.disable('x-powered-by');
  // Apache preserves Host. No X-Forwarded-* trust, reflected host, request-body
  // logging or caller-supplied target. Loopback is solely for local verification.
  app.use((req, res, next) => {
    if (!['staging2.optimallearning.org', '127.0.0.1', 'localhost'].includes(req.hostname)) return res.sendStatus(421);
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': contentSecurityPolicy() });
    next();
  });
  app.use(express.json({ limit: '128kb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '4kb', parameterLimit: 12 }));
  app.get(resourceMetadata, (_req, res) => res.json({ resource: CONNECTION_RESOURCE,
    authorization_servers: [CONNECTION_BASE], scopes_supported: CONNECTION_SCOPES,
    resource_name: 'MoFaCTS staging2 audit connection' }));
  app.get('/.well-known/oauth-authorization-server/audit-connection', (_req, res) => res.json({
    issuer: CONNECTION_BASE, authorization_endpoint: `${CONNECTION_BASE}/authorize`, token_endpoint: `${CONNECTION_BASE}/token`,
    registration_endpoint: `${CONNECTION_BASE}/register`, revocation_endpoint: `${CONNECTION_BASE}/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: CONNECTION_SCOPES,
  }));
  app.use(`${base}/authorize`, authorizationHandler({ provider: authorization.provider }));
  app.use(`${base}/token`, tokenHandler({ provider: authorization.provider }));
  app.use(`${base}/register`, clientRegistrationHandler({ clientsStore: authorization.provider.clientsStore }));
  app.use(`${base}/revoke`, revocationHandler({ provider: authorization.provider }));
  app.get(`${base}/consent`, (req, res) => {
    if (typeof req.query.request !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(req.query.request)) return res.sendStatus(400);
    const callback = authorization.consentRedirectUri(req.query.request);
    if (!callback) return res.sendStatus(400);
    // no-referrer makes native HTML form POSTs send Origin: null. Preserve the
    // exact-origin CSRF check while disclosing only the origin, never this
    // page's request query, in the form's Referer header.
    // Browsers apply form-action to the 303 return as well. Pin only this
    // pending request's already registered callback; no caller-supplied URL.
    res.set({ 'Referrer-Policy': 'strict-origin', 'Content-Security-Policy': contentSecurityPolicy(callback) })
      .type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Connect staging2 audit</title>
<main><h1>Connect the staging2 audit</h1><p>This connection can deliver a requested synthetic reset message and read sanitized audit status. It grants no shell, database, production or Gmail access.</p>
<form method="post" action="${base}/consent"><input type="hidden" name="request" value="${req.query.request}">
<label for="enrollment">One-time connection code</label><input id="enrollment" name="enrollment" type="password" required maxlength="43" autocomplete="off">
<button type="submit">Approve audit connection</button></form></main></html>`);
  });
  app.post(`${base}/consent`, async (req, res) => {
    try {
      if (req.get('origin') !== CONNECTION_ORIGIN || Object.keys(req.body).sort().join(',') !== 'enrollment,request') throw new Error();
      const cookies = String(req.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith('__Secure-mofacts-audit-consent='));
      if (cookies.length !== 1) throw new Error();
      const redirect = await authorization.consent({ requestId: req.body.request,
        csrf: cookies[0].slice('__Secure-mofacts-audit-consent='.length), enrollmentCode: req.body.enrollment });
      res.clearCookie('__Secure-mofacts-audit-consent', { path: '/audit-connection/consent', httpOnly: true, secure: true, sameSite: 'strict' });
      res.redirect(303, redirect);
    } catch { res.status(400).type('text').send('Connection approval could not be completed. Reopen the connection from ChatGPT and use the latest operator code.'); }
  });
  app.use(`${base}/mcp`, requireBearerAuth({ verifier: authorization.provider,
    resourceMetadataUrl: `${CONNECTION_ORIGIN}${resourceMetadata}`, expectedResource: CONNECTION_RESOURCE }));
  app.post(`${base}/mcp`, async (req, res) => {
    const server = new McpServer({ name: 'mofacts-staging2-audit', version: '0.1.0' });
    const permitted = scope => req.auth.scopes.includes(scope);
    const guarded = (scope, operation) => async args => {
      if (!permitted(scope)) return { isError: true, content: [{ type: 'text', text: 'Audit scope denied' }] };
      try { return result(await operation(args)); }
      catch { return { isError: true, content: [{ type: 'text', text: 'Audit operation unavailable' }] }; }
    };
    server.registerTool('audit_connection_status', { description: 'Read sanitized connection state. This never certifies an audit completed.', inputSchema: {},
      _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['audit:status'] }] },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } }, guarded('audit:status', () => handoff.status()));
    server.registerTool('audit_mail_request', { description: 'Signal the connected mail reader is ready and obtain only the owning scanner request. Use existing Gmail for the exact requested recipient; never search other mail.', inputSchema: {},
      _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['audit:mail'] }] },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, guarded('audit:mail', () => handoff.request()));
    server.registerTool('audit_mail_submit', { description: 'Privately submit the exact requested Gmail metadata or selected full message to the same owning scanner. Never put message bodies or tokens in chat prose.',
      inputSchema: { requestId: z.number().int().positive(), response: z.unknown() },
      _meta: { securitySchemes: [{ type: 'oauth2', scopes: ['audit:mail'] }] },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, guarded('audit:mail', input => handoff.submit(input)));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { void transport.close(); void server.close(); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'Audit connection unavailable' }); }
  });
  app.all(`${base}/mcp`, (_req, res) => res.sendStatus(405));
  app.use((_req, res) => res.sendStatus(404));
  app.use((_error, _req, res, _next) => { if (!res.headersSent) res.status(400).json({ error: 'Audit request rejected' }); });
  return app;
}
