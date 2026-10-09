const API_ROOT = 'https://api.prolific.com/api/v1/';

export class ProlificApiError extends Error {
  constructor(public status: number, public uncertain: boolean, key?: string) {
    super(key || (status === 401 || status === 403 ? 'prolific.connectionFailed' : 'prolific.remoteFailed'));
  }
}

/** No automatic mutation retries: a lost response may already have spent money. */
export async function prolificRequest(token: string, path: string, body?: unknown, request = fetch, method?: 'PATCH'): Promise<any> {
  if (!/^[a-z][a-z0-9_/?=&%.-]*$/i.test(path) || path.includes('..')) throw new Error('Invalid Prolific API path');
  let response: Response;
  try {
    response = await request(API_ROOT + path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
  } catch {
    throw new ProlificApiError(0, body !== undefined);
  }
  if (response.status === 204) return null;
  let parsed: any;
  try {
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Oversized Prolific response'); }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks).toString('utf8');
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new ProlificApiError(response.status, body !== undefined && (response.ok || response.status >= 500));
  }
  if (!response.ok) {
    // Inspect only bounded provider error fields. Never expose their contents.
    const detail = JSON.stringify({ detail: parsed?.detail, error: parsed?.error, email: parsed?.email }).toLowerCase();
    const testRequest = path === 'researchers/participants/' || path.endsWith('/test-study');
    let key: string | undefined;
    if (testRequest && /(?:feature|test(?:ing)?).{0,80}(?:not enabled|not available|disabled)/.test(detail)) key = 'prolific.testingUnavailable';
    else if (path === 'researchers/participants/' && /email.{0,100}(?:already|registered|exists)/.test(detail)) key = 'prolific.testEmailUsed';
    else if (path.endsWith('/test-study') && /(?:no|at least one|missing).{0,60}test participant/.test(detail)) key = 'prolific.testParticipantRequired';
    throw new ProlificApiError(response.status, body !== undefined && response.status >= 500, key);
  }
  return parsed;
}

export function prolificPage(data: any): { results: any[]; hasMore: boolean } {
  if (!data || !Array.isArray(data.results)) throw new Error('prolific.remoteFailed');
  return { results: data.results, hasMore: Boolean(data._links?.next?.href || data.next) };
}
