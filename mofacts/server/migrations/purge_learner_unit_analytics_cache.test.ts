import { expect } from 'chai';
import { purgeLearnerUnitAnalyticsCache } from './purge_learner_unit_analytics_cache';

function createDeps(options: { completed?: boolean; dropError?: unknown } = {}) {
  const droppedNames: string[] = [];
  const writes: Array<{ selector: Record<string, unknown>; modifier: Record<string, unknown> }> = [];
  const logs: unknown[][] = [];
  return {
    droppedNames,
    writes,
    logs,
    deps: {
      database: {
        dropCollection: async (name: string) => {
          droppedNames.push(name);
          if (options.dropError) throw options.dropError;
          return true;
        },
      },
      DynamicSettings: {
        findOneAsync: async () => options.completed ? { key: 'migration.purgeLearnerUnitAnalyticsCache.v1' } : null,
        upsertAsync: async (selector: Record<string, unknown>, modifier: Record<string, unknown>) => {
          writes.push({ selector, modifier });
          return 1;
        },
      },
      serverConsole: (...args: unknown[]) => logs.push(args),
    },
  };
}

describe('purgeLearnerUnitAnalyticsCache', function() {
  it('drops a populated cache and records completion', async function() {
    const fixture = createDeps();
    expect(await purgeLearnerUnitAnalyticsCache(fixture.deps)).to.equal('dropped');
    expect(fixture.droppedNames).to.deep.equal(['learner_unit_analytics_cache']);
    expect(fixture.writes).to.have.length(1);
    expect(fixture.writes[0]?.modifier).to.deep.nested.include({ '$set.value.status': 'dropped' });
  });

  it('records an absent collection as complete', async function() {
    const fixture = createDeps({ dropError: { code: 26, codeName: 'NamespaceNotFound' } });
    expect(await purgeLearnerUnitAnalyticsCache(fixture.deps)).to.equal('not-present');
    expect(fixture.writes[0]?.modifier).to.deep.nested.include({ '$set.value.status': 'not-present' });
  });

  it('is idempotent after completion', async function() {
    const fixture = createDeps({ completed: true });
    expect(await purgeLearnerUnitAnalyticsCache(fixture.deps)).to.equal('already-complete');
    expect(fixture.droppedNames).to.deep.equal([]);
    expect(fixture.writes).to.deep.equal([]);
  });

  it('propagates cleanup failures without recording completion', async function() {
    const failure = new Error('drop failed');
    const fixture = createDeps({ dropError: failure });
    let caught: unknown;
    try {
      await purgeLearnerUnitAnalyticsCache(fixture.deps);
    } catch (error) {
      caught = error;
    }
    expect(caught).to.equal(failure);
    expect(fixture.writes).to.deep.equal([]);
  });
});
