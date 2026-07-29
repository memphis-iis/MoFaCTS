import { strict as assert } from 'node:assert';

import { createExperimentTargetFamilyResolver } from './experimentTargetFamilyResolver';

function resolverFor(documents: any[]) {
  return createExperimentTargetFamilyResolver({
    Tdfs: {
      find(selector: any, options: any = {}) {
        return {
          async fetchAsync() {
            let matches = documents;
            const clauses = selector?.$and || [];
            const target = clauses.find((clause: any) => clause['content.tdfs.tutor.setspec.experimentTarget'])
              ?.["content.tdfs.tutor.setspec.experimentTarget"];
            if (target) matches = matches.filter((doc) => doc?.content?.tdfs?.tutor?.setspec?.experimentTarget === target);
            if (clauses.some((clause: any) => clause.tdfAvailability === 'available')) {
              matches = matches.filter((doc) => doc.tdfAvailability === 'available');
            }
            if (selector?._id?.$in) matches = matches.filter((doc) => selector._id.$in.includes(doc._id));
            if (selector?.ownerId) matches = matches.filter((doc) => doc.ownerId === selector.ownerId);
            if (selector?.tdfAvailability) matches = matches.filter((doc) => doc.tdfAvailability === selector.tdfAvailability);
            return options.limit ? matches.slice(0, options.limit) : matches;
          },
        };
      },
    },
  });
}

function ordinary(id: string, target: string) {
  return {
    _id: id,
    ownerId: 'owner-a',
    tdfAvailability: 'available',
    content: { fileName: `${id}.json`, tdfs: { tutor: { setspec: { experimentTarget: target }, unit: [{}] } } },
  };
}

describe('experimentTargetFamilyResolver', function() {
  it('returns one available ordinary TDF', async function() {
    const family = await resolverFor([ordinary('root-a', 'study-a')])(' STUDY-A ');
    assert.deepEqual(family?.tdfIds, ['root-a']);
  });

  it('returns canonical children in root order', async function() {
    const root = {
      _id: 'root-a', ownerId: 'owner-a', tdfAvailability: 'available',
      content: { fileName: 'root.json', tdfs: { tutor: { setspec: {
        experimentTarget: 'study-a',
        condition: ['b.json', 'a.json'],
        conditionTdfIds: ['child-b', 'child-a'],
      } } } },
    };
    const childA = { ...ordinary('child-a', ''), content: { ...ordinary('child-a', '').content, fileName: 'a.json' } };
    const childB = { ...ordinary('child-b', ''), content: { ...ordinary('child-b', '').content, fileName: 'b.json' } };
    const family = await resolverFor([root, childA, childB])('study-a');
    assert.deepEqual(family?.tdfIds, ['root-a', 'child-b', 'child-a']);
  });

  it('rejects duplicate targets, repair-required roots, and misaligned children', async function() {
    await assert.rejects(() => resolverFor([ordinary('a', 'study'), ordinary('b', 'study')])('study'), /accessible lesson/);
    const repair = { ...ordinary('repair', 'study'), tdfAvailability: 'repair-required' };
    assert.equal(await resolverFor([repair])('study'), null);
    const root = {
      _id: 'root', ownerId: 'owner-a', tdfAvailability: 'available',
      content: { fileName: 'root.json', tdfs: { tutor: { setspec: {
        experimentTarget: 'study', condition: ['expected.json'], conditionTdfIds: ['child'],
      } } } },
    };
    const child = { ...ordinary('child', ''), content: { ...ordinary('child', '').content, fileName: 'wrong.json' } };
    await assert.rejects(() => resolverFor([root, child])('study'), /missing or misaligned/);
  });
});
