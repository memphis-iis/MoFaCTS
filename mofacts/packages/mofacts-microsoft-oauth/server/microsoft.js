// Server-side Microsoft OAuth implementation
import { Meteor } from 'meteor/meteor';
import { OAuth } from 'meteor/oauth';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { Log } from 'meteor/logging';
import { createPublicKey, verify as verifySignature } from 'node:crypto';

Microsoft = {
  serviceName: 'microsoft',

  // Keep only durable identifiers used by account creation/linking.
  whitelistedFields: [
    'email'
  ],

  retrieveCredential: function(credentialToken, credentialSecret) {
    return OAuth.retrieveCredential(credentialToken, credentialSecret);
  }
};

const CLOCK_SKEW_SECONDS = 300;
const metadataCache = new Map();
const jwksCache = new Map();

const decodeBase64Url = (value) => {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
};

const getCredentialTokenFromState = (query) => {
  if (typeof OAuth._credentialTokenFromQuery === 'function') {
    return OAuth._credentialTokenFromQuery(query);
  }

  if (!query?.state) {
    throw new Error('OAuth state is missing');
  }

  try {
    const parsedState = JSON.parse(decodeBase64Url(query.state).toString('utf8'));
    if (!parsedState?.credentialToken) {
      throw new Error('credentialToken missing from OAuth state');
    }
    return parsedState.credentialToken;
  } catch (error) {
    throw new Error(`Unable to parse OAuth state for nonce validation: ${error.message}`);
  }
};

const getOpenIdConfiguration = async (tenant) => {
  const cacheKey = tenant || 'common';
  const cached = metadataCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const metadataUrl = `https://login.microsoftonline.com/${cacheKey}/v2.0/.well-known/openid-configuration`;
  const response = await OAuth._fetch(metadataUrl, 'GET', {
    headers: {
      'Accept': 'application/json'
    }
  });
  const metadata = await response.json();

  metadataCache.set(cacheKey, {
    value: metadata,
    expiresAt: Date.now() + (60 * 60 * 1000)
  });

  return metadata;
};

const getJsonWebKeys = async (jwksUri) => {
  const cached = jwksCache.get(jwksUri);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const response = await OAuth._fetch(jwksUri, 'GET', {
    headers: {
      'Accept': 'application/json'
    }
  });
  const jwks = await response.json();

  jwksCache.set(jwksUri, {
    value: jwks,
    expiresAt: Date.now() + (60 * 60 * 1000)
  });

  return jwks;
};

// Exchange authorization code for tokens
const getTokens = async (query) => {
  const config = await ServiceConfiguration.configurations.findOneAsync({
    service: Microsoft.serviceName
  });

  if (!config) {
    throw new ServiceConfiguration.ConfigError();
  }

  const tenant = config.tenant || 'common';
  const tokenEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

  const content = new URLSearchParams({
    code: query.code,
    client_id: config.clientId,
    client_secret: OAuth.openSecret(config.secret),
    redirect_uri: OAuth._redirectUri(Microsoft.serviceName, config),
    grant_type: 'authorization_code'
  });

  try {
    const request = await OAuth._fetch(tokenEndpoint, 'POST', {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: content
    });

    const response = await request.json();

    if (response.error) {
      throw new Error(`Microsoft OAuth error: ${response.error_description || response.error}`);
    }

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresIn: response.expires_in,
      idToken: response.id_token
    };
  } catch (err) {
    throw new Error(`Failed to complete OAuth handshake with Microsoft: ${err.message}`);
  }
};

const decodeJwtSection = (token, sectionIndex) => {
  const sections = token.split('.');
  if (sections.length <= sectionIndex) {
    throw new Error('ID token is malformed');
  }

  return JSON.parse(decodeBase64Url(sections[sectionIndex]).toString('utf8'));
};

const getExpectedIssuer = (issuerTemplate, identity) => {
  if (!issuerTemplate.includes('{tenantid}')) {
    return issuerTemplate;
  }

  if (!identity.tid) {
    throw new Error('Microsoft ID token is missing tid claim required for issuer validation');
  }

  return issuerTemplate.replace('{tenantid}', identity.tid);
};

const validateIdentityClaims = (identity, expectedNonce, config, metadata) => {
  const now = Math.floor(Date.now() / 1000);

  if (identity.aud !== config.clientId) {
    throw new Error('Microsoft ID token audience does not match configured client ID');
  }

  const expectedIssuer = getExpectedIssuer(metadata.issuer, identity);
  if (identity.iss !== expectedIssuer) {
    throw new Error('Microsoft ID token issuer is invalid');
  }

  if (identity.nonce !== expectedNonce) {
    throw new Error('Microsoft ID token nonce is invalid');
  }

  if (typeof identity.exp !== 'number' || identity.exp < (now - CLOCK_SKEW_SECONDS)) {
    throw new Error('Microsoft ID token has expired');
  }

  if (typeof identity.nbf === 'number' && identity.nbf > (now + CLOCK_SKEW_SECONDS)) {
    throw new Error('Microsoft ID token is not valid yet');
  }
};

const getServiceIdentityId = (identity) => {
  const stableId = identity.oid || identity.sub;
  if (!stableId) {
    throw new Error('Microsoft ID token did not include a stable subject identifier');
  }
  return stableId;
};

const validateIdTokenSignature = async (idToken, jwks) => {
  const [encodedHeader, encodedPayload, encodedSignature] = idToken.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error('ID token is malformed');
  }

  const header = decodeJwtSection(idToken, 0);
  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported Microsoft ID token algorithm: ${header.alg}`);
  }

  const jwk = (jwks.keys || []).find((candidate) =>
    candidate?.kid === header.kid &&
    candidate?.kty === 'RSA' &&
    (!candidate.use || candidate.use === 'sig')
  );

  if (!jwk) {
    throw new Error('Unable to find matching Microsoft signing key');
  }

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const verified = verifySignature(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`, 'utf8'),
    publicKey,
    decodeBase64Url(encodedSignature)
  );

  if (!verified) {
    throw new Error('Microsoft ID token signature verification failed');
  }
};

const getIdentityFromIdToken = async (idToken, query, config) => {
  if (!idToken) {
    throw new Error('Microsoft did not return an ID token');
  }

  try {
    const metadata = await getOpenIdConfiguration(config.tenant || 'common');
    const jwks = await getJsonWebKeys(metadata.jwks_uri);
    await validateIdTokenSignature(idToken, jwks);

    const identity = decodeJwtSection(idToken, 1);
    const expectedNonce = getCredentialTokenFromState(query);
    validateIdentityClaims(identity, expectedNonce, config, metadata);
    return identity;
  } catch (err) {
    throw new Error(`Failed to validate Microsoft ID token: ${err.message}`);
  }
};

OAuth.registerService(Microsoft.serviceName, 2, null, async (query) => {
  try {
    const config = await ServiceConfiguration.configurations.findOneAsync({
      service: Microsoft.serviceName
    });
    if (!config) {
      throw new ServiceConfiguration.ConfigError();
    }

    const tokens = await getTokens(query);
    const identity = await getIdentityFromIdToken(tokens.idToken, query, config);

    const serviceData = {
      id: getServiceIdentityId(identity),
      accessToken: tokens.accessToken,
      idToken: tokens.idToken,
      expiresAt: Date.now() + (1000 * parseInt(tokens.expiresIn, 10))
    };

    // Copy whitelisted fields from identity
    const fields = {};
    Microsoft.whitelistedFields.forEach(fieldName => {
      if (identity[fieldName]) {
        fields[fieldName] = identity[fieldName];
      }
    });

    Object.assign(serviceData, fields);

    // Include refresh token if present (only on first login)
    if (tokens.refreshToken) {
      serviceData.refreshToken = tokens.refreshToken;
    }

    const email = identity.email;
    if (!email) {
      throw new Error('Microsoft did not return an email claim');
    }

    return {
      serviceData: serviceData,
      options: {
        profile: {},
        emails: [{
          address: email,
          verified: true
        }]
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Log.error('[MS-OAUTH-SERVER] OAuth callback failed', {
      message,
      hasCode: !!query?.code,
      hasState: !!query?.state,
      hasError: !!query?.error,
      queryError: query?.error,
      queryErrorDescription: query?.error_description
    });
    throw new Meteor.Error('microsoft-oauth-failed', message);
  }
});
