import assert from 'node:assert/strict';
import { createVideoSessionUnitEngine } from './VideoUnitEngine.ts';

describe('video unit session identity', function() {
  it('establishes video identity before checkpoint history on fresh entry', function() {
    const session = new Map<string, unknown>();
    const engine = createVideoSessionUnitEngine({
      setSessionValue: (key, value) => session.set(key, value),
      log: () => undefined,
    });

    (engine.initImpl as () => void)();

    assert.equal(session.get('unitType'), 'video');
    assert.equal(session.get('unitType'), engine.unitType);
  });

  it('restores video identity after launch cleanup instead of retaining assessment identity', function() {
    const session = new Map<string, unknown>([['unitType', 'schedule']]);
    const engine = createVideoSessionUnitEngine({
      setSessionValue: (key, value) => session.set(key, value),
      log: () => undefined,
    });

    (engine.initImpl as () => void)();
    assert.equal(session.get('unitType'), 'video');

    session.set('unitType', undefined);
    (engine.initImpl as () => void)();

    assert.equal(session.get('unitType'), 'video');
  });
});
