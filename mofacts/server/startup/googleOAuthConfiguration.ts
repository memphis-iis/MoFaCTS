import { isOAuthCredentialValue } from '../../common/oauthConfiguration.ts';

type GoogleServiceSelector = { service: 'google' };
type GoogleServiceCredentials = { clientId: string; secret: string };
type GoogleServiceConfigurations = {
  upsertAsync: (selector: GoogleServiceSelector, modifier: { $set: GoogleServiceCredentials }) => Promise<unknown>;
  removeAsync: (selector: GoogleServiceSelector) => Promise<unknown>;
};

export async function syncGoogleOAuthConfiguration(
  configurations: GoogleServiceConfigurations,
  settings: unknown,
): Promise<boolean> {
  const google = settings as { clientId?: unknown; secret?: unknown } | null | undefined;
  const selector = { service: 'google' } as const;
  const clientId = google?.clientId;
  const secret = google?.secret;
  if (!isOAuthCredentialValue(clientId) || !isOAuthCredentialValue(secret)) {
    // The private settings file owns this provider. Clear an obsolete row on startup.
    await configurations.removeAsync(selector);
    return false;
  }
  await configurations.upsertAsync(selector, { $set: { clientId, secret } });
  return true;
}
