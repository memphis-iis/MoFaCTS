import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { dependency } from './dependencies.mjs';

const { InvalidClientMetadataError, InvalidGrantError, InvalidScopeError, InvalidTargetError, InvalidTokenError } =
  await dependency('@modelcontextprotocol/sdk/server/auth/errors.js');
export const CONNECTION_ORIGIN = 'https://staging2.optimallearning.org';
export const CONNECTION_BASE = `${CONNECTION_ORIGIN}/audit-connection`;
export const CONNECTION_RESOURCE = `${CONNECTION_BASE}/mcp`;
export const CONNECTION_SCOPES = Object.freeze(['audit:mail', 'audit:status']);
const secret = () => randomBytes(32).toString('base64url');
export const secretHash = value => createHash('sha256').update(value).digest('hex');
const invalidGrant = () => { throw new InvalidGrantError('Audit connection grant is invalid'); };
const exactSecret = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
function scopes(value) {
  if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length
    || value.some(item => !CONNECTION_SCOPES.includes(item))) throw new InvalidScopeError('Invalid audit scope');
  return [...value].sort();
}
function resource(value) {
  if (String(value) !== CONNECTION_RESOURCE) throw new InvalidTargetError('Invalid audit resource');
}
function callback(value) {
  // Exact ChatGPT callback family only; no arbitrary URL, query, fragment or
  // local redirect. The connection's actual callback is verified at linking.
  return typeof value === 'string' && (value === 'https://chatgpt.com/connector_platform_oauth_redirect'
    || /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/.test(value));
}
function prune(state, now) {
  for (const family of ['codes', 'access', 'refresh']) {
    for (const [key, value] of Object.entries(state[family])) if (value.expiresAt <= now) delete state[family][key];
  }
  for (const [key, value] of Object.entries(state.grants)) if (value.expiresAt <= now) delete state.grants[key];
}

// Dedicated service authorization, not a Gmail grant or an application admin
// session. The operator issues one short-lived enrollment secret through the
// protected local owner; only its hash is retained. Never log returned secrets.
export function createAuditAuthorization({ store, now = Date.now }) {
  const pending = new Map();
  const milliseconds = () => now();
  const seconds = () => Math.floor(milliseconds() / 1000);
  function codeRecord(state, client, code) {
    if (!exactSecret(code)) invalidGrant();
    const row = state.codes[secretHash(code)];
    if (!row || row.clientId !== client.client_id || row.expiresAt <= seconds()) invalidGrant();
    return row;
  }
  function issue(state, grantId, grant) {
    const accessToken = secret(), refreshToken = secret(), time = seconds();
    grant.expiresAt = time + 30 * 86400;
    state.grants[grantId] = grant;
    state.access[secretHash(accessToken)] = { grantId, clientId: grant.clientId, scopes: grant.scopes, expiresAt: time + 900 };
    state.refresh[secretHash(refreshToken)] = { grantId, clientId: grant.clientId, scopes: grant.scopes, expiresAt: grant.expiresAt, used: false };
    return { access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 900, scope: grant.scopes.join(' ') };
  }
  const provider = {
    clientsStore: {
      getClient: async id => exactSecret(id) ? store.read().clients[id] : undefined,
      registerClient: async input => {
        if (input.token_endpoint_auth_method !== 'none' || input.client_secret
          || !Array.isArray(input.redirect_uris) || input.redirect_uris.length !== 1 || !callback(input.redirect_uris[0])
          || input.grant_types?.some(type => !['authorization_code', 'refresh_token'].includes(type))
          || input.response_types?.some(type => type !== 'code')) throw new InvalidClientMetadataError('Invalid audit client');
        return store.transaction(state => {
          if (Object.keys(state.clients).length >= 32) throw new InvalidClientMetadataError('Audit client limit reached');
          const client = { client_id: secret(), client_id_issued_at: seconds(), redirect_uris: [...input.redirect_uris],
            token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
            scope: CONNECTION_SCOPES.join(' '), client_name: 'MoFaCTS audit connection' };
          state.clients[client.client_id] = client;
          return client;
        });
      },
    },
    authorize: async (client, params, response) => {
      resource(params.resource);
      const selected = scopes(params.scopes);
      if (!exactSecret(params.codeChallenge) || !client.redirect_uris.includes(params.redirectUri)
        || typeof params.state !== 'string' || params.state.length < 1 || params.state.length > 1024) invalidGrant();
      for (const [id, row] of pending) if (row.deadline <= milliseconds()) pending.delete(id);
      if (pending.size >= 32) invalidGrant();
      const requestId = secret(), csrf = secret();
      pending.set(requestId, { clientId: client.client_id, redirectUri: params.redirectUri, state: params.state,
        challenge: params.codeChallenge, scopes: selected, csrfHash: secretHash(csrf), deadline: milliseconds() + 600000 });
      response.cookie('__Secure-mofacts-audit-consent', csrf, { httpOnly: true, secure: true, sameSite: 'strict',
        path: '/audit-connection/consent', maxAge: 600000 });
      response.redirect(`${CONNECTION_BASE}/consent?request=${requestId}`);
    },
    challengeForAuthorizationCode: async (client, code) => codeRecord(store.read(), client, code).challenge,
    exchangeAuthorizationCode: async (client, code, _verifier, redirectUri, requestedResource) => {
      resource(requestedResource);
      return store.transaction(state => {
        const row = codeRecord(state, client, code);
        if (redirectUri !== row.redirectUri) invalidGrant();
        delete state.codes[secretHash(code)];
        prune(state, seconds());
        if (Object.keys(state.grants).length >= 8) invalidGrant();
        return issue(state, secret(), { clientId: row.clientId, scopes: row.scopes, revoked: false });
      });
    },
    exchangeRefreshToken: async (client, token, requestedScopes, requestedResource) => {
      resource(requestedResource);
      if (!exactSecret(token)) invalidGrant();
      const result = await store.transaction(state => {
        const row = state.refresh[secretHash(token)];
        if (!row || row.clientId !== client.client_id || row.expiresAt <= seconds()) return null;
        const grant = state.grants[row.grantId];
        if (!grant || grant.revoked || grant.expiresAt <= seconds()) return null;
        if (row.used) { grant.revoked = true; return null; }
        const selected = requestedScopes ? scopes(requestedScopes) : row.scopes;
        if (selected.some(scope => !row.scopes.includes(scope))) throw new InvalidScopeError('Scope escalation denied');
        row.used = true;
        // Keep the spent token until its original expiry to revoke on replay.
        prune(state, seconds());
        return issue(state, row.grantId, { ...grant, scopes: selected });
      });
      if (!result) invalidGrant();
      return result;
    },
    verifyAccessToken: async token => {
      if (!exactSecret(token)) throw new InvalidTokenError('Invalid audit access');
      const state = store.read(), row = state.access[secretHash(token)], time = seconds();
      const grant = row && state.grants[row.grantId];
      if (!row || row.expiresAt <= time || !grant || grant.revoked || grant.expiresAt <= time)
        throw new InvalidTokenError('Invalid audit access');
      return { token, clientId: row.clientId, scopes: row.scopes, expiresAt: row.expiresAt, resource: CONNECTION_RESOURCE };
    },
    revokeToken: async (client, request) => store.transaction(state => {
      if (!exactSecret(request.token)) return;
      const key = secretHash(request.token), row = state.access[key] || state.refresh[key];
      if (row?.clientId === client.client_id && state.grants[row.grantId]) state.grants[row.grantId].revoked = true;
    }),
  };
  async function enroll() {
    const code = secret();
    await store.transaction(state => { state.enrollment = { hash: secretHash(code), expiresAt: seconds() + 600, attempts: 0 }; });
    return code;
  }
  async function consent({ requestId, csrf, enrollmentCode }) {
    const row = pending.get(requestId);
    if (!row || row.deadline <= milliseconds() || !exactSecret(csrf)
      || !timingSafeEqual(Buffer.from(row.csrfHash, 'hex'), Buffer.from(secretHash(csrf), 'hex'))) invalidGrant();
    const code = secret();
    const accepted = await store.transaction(state => {
      const enrollment = state.enrollment;
      if (!enrollment || enrollment.expiresAt <= seconds() || enrollment.attempts >= 5) return false;
      enrollment.attempts++;
      if (!exactSecret(enrollmentCode) || !timingSafeEqual(Buffer.from(enrollment.hash, 'hex'), Buffer.from(secretHash(enrollmentCode), 'hex'))) return false;
      state.enrollment = null;
      state.codes[secretHash(code)] = { clientId: row.clientId, redirectUri: row.redirectUri,
        challenge: row.challenge, scopes: row.scopes, expiresAt: seconds() + 60 };
      return true;
    });
    if (!accepted) invalidGrant();
    pending.delete(requestId);
    const redirect = new URL(row.redirectUri);
    redirect.searchParams.set('code', code); redirect.searchParams.set('state', row.state);
    return redirect.href;
  }
  return { provider, enroll, consent, revokeAll: () => store.transaction(state => {
    for (const grant of Object.values(state.grants)) grant.revoked = true;
    state.enrollment = null; state.codes = {}; pending.clear();
  }), consentRedirectUri: id => {
    const row = pending.get(id);
    return row && row.deadline > milliseconds() ? row.redirectUri : undefined;
  } };
}
