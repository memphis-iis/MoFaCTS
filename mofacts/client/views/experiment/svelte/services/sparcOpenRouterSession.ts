export type SparcOpenRouterDialogueScope = Readonly<{
  tdfId?: unknown;
  attemptId?: unknown;
  pageKey?: unknown;
}>;

function scopePart(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function scopeKey(scope: SparcOpenRouterDialogueScope): string {
  return JSON.stringify([
    scopePart(scope.tdfId),
    scopePart(scope.attemptId),
    scopePart(scope.pageKey),
  ]);
}

export function createOpaqueSparcOpenRouterSessionId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('SPARC OpenRouter prefix caching requires a cryptographically secure random source');
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

export function createSparcOpenRouterSession(
  createSessionId: () => string = createOpaqueSparcOpenRouterSessionId,
): {
  sessionIdForScope: (scope: SparcOpenRouterDialogueScope) => string;
} {
  let activeScopeKey: string | undefined;
  let activeSessionId: string | undefined;
  return {
    sessionIdForScope(scope) {
      const nextScopeKey = scopeKey(scope);
      if (activeScopeKey !== nextScopeKey || !activeSessionId) {
        activeScopeKey = nextScopeKey;
        activeSessionId = createSessionId();
      }
      return activeSessionId;
    },
  };
}
