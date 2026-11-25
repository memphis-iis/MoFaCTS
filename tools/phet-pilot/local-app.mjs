// Shared setup for synthetic localhost tests; never used by a learner host.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../mofacts/package.json', import.meta.url));
const credentialsFile = fileURLToPath(new URL('../../deploy/local-hotfix/agent-secrets.env', import.meta.url));
export const LOCAL_APP_URL = 'http://localhost:3200';

export function parsePilotCredentials(text) {
  const keys = ['MOFACTS_AGENT_ADMIN_EMAIL', 'MOFACTS_AGENT_ADMIN_PASSWORD'];
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    const key = line.slice(0, separator);
    if (!keys.includes(key)) continue;
    if (values.has(key)) throw new Error(`Duplicate local pilot credential: ${key}`);
    values.set(key, line.slice(separator + 1));
  }
  if (keys.some(key => !values.get(key)?.trim())) throw new Error('Configure both canonical local pilot credentials');
  return { email: values.get(keys[0]), password: values.get(keys[1]) };
}

export function assertLocalPilotOrigin(url) {
  if (new URL(url).origin !== LOCAL_APP_URL) throw new Error('Pilot authentication requires http://localhost:3200');
}

export function launchLocalPilotBrowser() {
  return require('playwright').chromium.launch({ channel: 'chromium', headless: true });
}

export async function signInLocalPilot(page) {
  await page.goto(LOCAL_APP_URL);
  assertLocalPilotOrigin(page.url());
  await page.waitForFunction(() => window.Meteor?.loginWithPassword, null, { timeout: 60000 });
  const credentials = parsePilotCredentials(await readFile(credentialsFile, 'utf8'));
  await page.evaluate(({ email, password }) => new Promise((resolve, reject) =>
    Meteor.loginWithPassword(email, password, error => error ? reject(Error(error.reason)) : resolve())), credentials);
}
