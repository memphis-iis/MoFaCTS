import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalPilotOrigin, parsePilotCredentials } from './local-app.mjs';

test('local credentials preserve equals signs, CRLF and password whitespace', () => {
  assert.deepEqual(parsePilotCredentials('# ignored\r\nUNRELATED=value\r\nMOFACTS_AGENT_ADMIN_EMAIL=synthetic@example.invalid\r\nMOFACTS_AGENT_ADMIN_PASSWORD= value=with=equals \r\n'),
    { email: 'synthetic@example.invalid', password: ' value=with=equals ' });
});

test('missing, empty or duplicate credentials fail without exposing their values', () => {
  for (const text of ['', 'MOFACTS_AGENT_ADMIN_EMAIL=synthetic@example.invalid',
    'MOFACTS_AGENT_ADMIN_EMAIL=synthetic@example.invalid\nMOFACTS_AGENT_ADMIN_PASSWORD= ',
    'MOFACTS_AGENT_ADMIN_EMAIL=synthetic@example.invalid\nMOFACTS_AGENT_ADMIN_PASSWORD=private-example\nMOFACTS_AGENT_ADMIN_PASSWORD=another-example']) {
    assert.throws(() => parsePilotCredentials(text), error => !error.message.includes('private-example') && !error.message.includes('another-example'));
  }
});

test('authentication accepts only the canonical localhost origin', () => {
  assert.doesNotThrow(() => assertLocalPilotOrigin('http://localhost:3200/dataDownload'));
  for (const url of ['https://localhost:3200', 'http://localhost:3201', 'http://127.0.0.1:3200', 'http://localhost.example:3200', 'https://example.invalid']) {
    assert.throws(() => assertLocalPilotOrigin(url), /requires http:\/\/localhost:3200/);
  }
});
