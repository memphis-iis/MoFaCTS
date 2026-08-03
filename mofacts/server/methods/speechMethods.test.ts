import { strict as assert } from 'assert';
import { postGoogleApiJson } from './speechMethods';

describe('postGoogleApiJson', function() {
  it('posts JSON and returns the parsed response', async function() {
    let observedInit: RequestInit | undefined;
    const result = await postGoogleApiJson(
      'https://speech.googleapis.test/v1/recognize?key=secret',
      '{"audio":"payload"}',
      1000,
      (async (_url: string | URL | Request, init?: RequestInit) => {
        observedInit = init;
        return new Response('{"results":[{"ok":true}]}', { status: 200 });
      }) as typeof fetch
    );

    assert.equal(observedInit?.method, 'POST');
    assert.equal(observedInit?.body, '{"audio":"payload"}');
    assert.equal(new Headers(observedInit?.headers).get('Content-Type'), 'application/json; charset=utf-8');
    assert.deepEqual(result, { results: [{ ok: true }] });
  });

  it('reports HTTP failures without exposing a Google API key', async function() {
    await assert.rejects(
      postGoogleApiJson(
        'https://speech.googleapis.test/v1/recognize?key=secret',
        '{}',
        1000,
        (async () => new Response(
          '{"error":"request failed for ?key=AIza12345678901234567890"}',
          { status: 403 }
        )) as typeof fetch
      ),
      (error: unknown) => {
        assert.match(String(error), /Google API HTTP 403/);
        assert.doesNotMatch(String(error), /AIza12345678901234567890/);
        return true;
      }
    );
  });

  it('fails clearly when the provider response is not JSON', async function() {
    await assert.rejects(
      postGoogleApiJson(
        'https://speech.googleapis.test/v1/recognize?key=secret',
        '{}',
        1000,
        (async () => new Response('not-json', { status: 200 })) as typeof fetch
      ),
      /invalid JSON response/
    );
  });
});
