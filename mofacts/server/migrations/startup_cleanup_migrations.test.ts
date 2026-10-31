import assert from 'node:assert/strict';
import { runStartupCleanupMigrations } from './startup_cleanup_migrations';

describe('startup cleanup without retired course-assignment conversion', () => {
  it('starts with an unfinished course checkpoint without reading or rewriting it', async () => {
    const courseCheckpoint = { key: 'migration.courseAssignmentContract.v2', value: { phase: 'stage-order' } };
    const reads: string[] = [];
    await runStartupCleanupMigrations({
      DynamicSettings: {
        async findOneAsync(selector) {
          reads.push(String(selector.key));
          if (selector.key === courseCheckpoint.key) throw new Error('Retired checkpoint was read');
          return { value: { completedAt: '2026-10-30T00:00:00Z' } };
        },
        async removeAsync() { throw new Error('Startup unexpectedly deleted settings'); },
        async upsertAsync() { throw new Error('Startup unexpectedly changed settings'); },
      },
      usersCollection: {
        async findOneAsync() { throw new Error('Completed cleanup unexpectedly read users'); },
        async updateAsync() { throw new Error('Completed cleanup unexpectedly changed users'); },
      },
      serverConsole() {},
      async updateActiveThemeDocument() { throw new Error('Completed cleanup unexpectedly changed theme'); },
    });
    assert.equal(reads.length, 3);
    assert.equal(reads.includes(courseCheckpoint.key), false);
  });
});
