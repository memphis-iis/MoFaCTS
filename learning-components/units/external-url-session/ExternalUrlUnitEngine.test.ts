import assert from 'node:assert/strict';
import { createExternalUrlUnitEngine } from './ExternalUrlUnitEngine';

function createMinimalDeps() {
  const session: Record<string, unknown> = {};
  return {
    setSessionValue(key: string, value: unknown) { session[key] = value; },
    getSession: () => session,
    log() {},
  };
}

describe('external-url unit engine (issue #238)', function() {
  // UnitEngineExtension is Record<string, unknown>, so runtime-only methods
  // (initImpl / completeExternalSession) need a typed view for the test.
  const asEngine = (e: ReturnType<typeof createExternalUrlUnitEngine>) =>
    e as unknown as {
      unitType: string;
      initImpl: () => Promise<void>;
      completeExternalSession: () => void;
      selectNextCard: (args: { clusterIndex: number }, extra: unknown) => Promise<void>;
      findCurrentCardInfo: () => { clusterIndex: number; whichStim: number };
      prepareNextTrial: () => Promise<{ selection: null; preparedAdvanceMode: string }>;
      cardAnswered: () => Promise<void>;
      isFinished: () => boolean;
    };
  it('registers the external-url unit type on the engine', function() {
    const engine = createExternalUrlUnitEngine(createMinimalDeps());
    assert.equal(asEngine(engine).unitType, 'external-url');
  });

  it('open-card: selectNextCard exposes the explicit checkpoint card', async function() {
    const deps = createMinimalDeps();
    const engine = createExternalUrlUnitEngine(deps);
    await asEngine(engine).initImpl();
    await asEngine(engine).selectNextCard({ clusterIndex: 0 }, {});
    assert.deepEqual(asEngine(engine).findCurrentCardInfo(), { clusterIndex: 0, whichStim: 0 });
    assert.equal(deps.getSession()['clusterIndex'], 0);
    assert.equal(deps.getSession()['testType'], 'd');
    // Not finished until the completion handoff.
    assert.equal(asEngine(engine).isFinished(), false);
  });

  it('no-op model update: cardAnswered leaves the engine state untouched', async function() {
    const deps = createMinimalDeps();
    const engine = createExternalUrlUnitEngine(deps);
    await asEngine(engine).initImpl();
    await asEngine(engine).selectNextCard({ clusterIndex: 0 }, {});
    await asEngine(engine).cardAnswered();
    assert.deepEqual(asEngine(engine).findCurrentCardInfo(), { clusterIndex: 0, whichStim: 0 });
    assert.equal(asEngine(engine).isFinished(), false);
  });

  it('complete -> advance: the completion handoff flips the isFinished gate', async function() {
    const deps = createMinimalDeps();
    const engine = createExternalUrlUnitEngine(deps);
    await asEngine(engine).initImpl();
    await asEngine(engine).selectNextCard({ clusterIndex: 0 }, {});
    assert.equal(asEngine(engine).isFinished(), false);
    // The runtime (#M3) calls this when the external page posts completion.
    asEngine(engine).completeExternalSession();
    assert.equal(asEngine(engine).isFinished(), true);
    assert.equal(engine.unitFinished(), true);
  });

  it('prepareNextTrial stays inert until completion', async function() {
    const deps = createMinimalDeps();
    const engine = createExternalUrlUnitEngine(deps);
    await asEngine(engine).initImpl();
    await asEngine(engine).selectNextCard({ clusterIndex: 0 }, {});
    const prepared = await asEngine(engine).prepareNextTrial();
    assert.deepEqual(prepared, { selection: null, preparedAdvanceMode: 'none' });
  });
});
