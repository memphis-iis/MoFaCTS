import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { buildSparcVideoCatalog } from './sparcVideoCatalogBuilder';

describe('SPARC limited video catalog preparation', () => {
  it('prepares only the first five authored targets and rejects invalid limits before any calls', async () => {
    const originalCall = Meteor.callAsync;
    const prepared: string[] = [];
    const messages: string[] = [];
    let calls = 0;
    Meteor.callAsync = (async (method: string, ...args: unknown[]) => {
      calls++;
      if (method === 'getSparcVideoCatalogTargets') return Array.from({ length: 7 }, (_, index) => ({
        id: `target-${index + 1}`, targetId: `KC ${index + 1}`, text: 'An authored target.', topic: 'Biology', language: 'en',
      }));
      if (method === 'prepareSparcVideoCatalogTarget') {
        prepared.push(args[1] as string);
        return args[1] === 'target-2' ? { status: 'failed', reason: 'No matching video' } : { status: 'complete', ranges: [{ firstCaptionId: 0, lastCaptionId: 0 }] };
      }
      if (method === 'saveSparcVideoCatalogPassages') return { passages: 1 };
      throw new Error(`Unexpected method: ${method}`);
    }) as typeof Meteor.callAsync;
    try {
      for (const limit of [0, -1, 1.5, NaN, 1001]) {
        await assert.rejects(buildSparcVideoCatalog('lesson', () => {}, () => true, limit), /KC limit/);
      }
      assert.equal(calls, 0);
      await buildSparcVideoCatalog('lesson', message => messages.push(message), () => true, 5);
      assert.deepEqual(prepared, ['target-1', 'target-2', 'target-3', 'target-4', 'target-5']);
      assert.match(messages.at(-1)!, /4 targets processed, 1 failed, 4 passage associations/);
      assert.match(messages.at(-1)!, /KC 2: No matching video/);
      assert.equal(messages.filter(message => /^\d\/5 /.test(message)).length, 5);
    } finally { Meteor.callAsync = originalCall; }
  });
});
