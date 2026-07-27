import { expect } from 'chai';
import { createSparcOpenRouterSession } from './sparcOpenRouterSession';

describe('SPARC OpenRouter session', function() {
  it('reuses an opaque id within a dialogue scope and rotates it when scope changes', function() {
    const generated = [
      'opaque-session-1',
      'opaque-session-2',
      'opaque-session-3',
      'opaque-session-4',
    ];
    const session = createSparcOpenRouterSession(() => generated.shift()!);
    const firstScope = { tdfId: 'tdf-a', attemptId: 'attempt-a', pageKey: 'page-a' };

    expect(session.sessionIdForScope(firstScope)).to.equal('opaque-session-1');
    expect(session.sessionIdForScope({ ...firstScope })).to.equal('opaque-session-1');
    expect(session.sessionIdForScope({ ...firstScope, pageKey: 'page-b' })).to.equal('opaque-session-2');
    expect(session.sessionIdForScope({ ...firstScope, attemptId: 'attempt-b' })).to.equal('opaque-session-3');
    expect(session.sessionIdForScope({ ...firstScope, tdfId: 'tdf-b' })).to.equal('opaque-session-4');
  });
});
