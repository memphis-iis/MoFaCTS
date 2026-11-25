import { strict as assert } from 'node:assert';
import { Meteor } from 'meteor/meteor';
import { MANUAL_DRAFT_VERIFICATIONS, PACKAGE_DELETION_VERIFICATION } from '../../common/securityAudit/verificationCatalog';
import { registeredMeteorMethodSurfaces } from '../securitySurfaces/registerMeteorMethods';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { expect } from 'chai';
import { createContentMethods } from './contentMethods';
import { DYNAMIC_ASSET_PUBLICATION_FIELDS } from '../publications';

function createContentDeps(overrides: Record<string, unknown> = {}) {
  const docs = [
    {
      _id: 'tdf-a',
      ownerId: 'user-a',
      stimuliSetId: '42',
      packageFile: 'package.zip',
      packageAssetId: 'asset-package',
      conditionCounts: [3],
      rawStimuliFile: { shouldNotReturn: true },
      stimuli: [{ shouldNotReturn: true }],
      content: {
        fileName: 'lesson-a.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Lesson A',
              userselect: 'false',
              condition: ['condition-a.json'],
              conditionTdfIds: ['condition-a'],
              stimulusfile: 'stim-a.json'
            },
            unit: [
              { learningsession: { stimulusfile: 'stim-extra.json' } }
            ]
          }
        }
      }
    },
    {
      _id: 'tdf-b',
      ownerId: 'user-a',
      stimuliSetId: 42,
      conditionCounts: [],
      content: {
        fileName: 'lesson-b.json',
        tdfs: {
          tutor: {
            setspec: {
              lessonname: 'Lesson B',
              userselect: 'true',
              condition: []
            },
            unit: []
          }
        }
      }
    }
  ];

  const deps = {
    ManualContentDrafts: {
      find: () => ({ fetchAsync: async () => [] }),
      findOneAsync: async () => null,
      updateAsync: async () => undefined,
      insertAsync: async () => undefined,
      removeAsync: async () => undefined
    },
    Tdfs: {
      find: (selector: any) => ({
        fetchAsync: async () => selector?._id?.$in
          ? docs.filter((doc) => selector._id.$in.includes(doc._id))
          : docs,
        countAsync: async () => docs.length
      }),
      findOneAsync: async () => null,
      updateAsync: async () => undefined,
      removeAsync: async () => undefined
    },
    DynamicAssets: {
      find: () => ({ fetchAsync: async () => [], countAsync: async () => 0 }),
      findOneAsync: async () => null,
      removeAsync: async () => undefined,
      collection: {
        rawCollection: () => ({
          aggregate: () => ({
            toArray: async () => [
              { _id: '42', count: 2 },
              { _id: 42, count: 1 }
            ]
          })
        }),
        updateAsync: async () => undefined
      }
    },
    storageBoundary: {},
    usersCollection: { findOneAsync: async () => null },
    UserUploadQuota: { findOneAsync: async () => null },
    AuditLog: { insertAsync: async () => undefined },
    serverConsole: () => undefined,
    isPlainRecord: (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value),
    cloneJsonLike: <T>(value: T) => JSON.parse(JSON.stringify(value)),
    normalizeCanonicalId: (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null,
    stimulusFilePolicy: { authorize: async () => true },
    getOrBuildCurrentPackageAsset: async () => ({ link: '/package.zip' }),
    parseLocalMediaReference: () => ({}),
    extractSrcFromHtml: () => [],
    getStimuliSetIdCandidates: () => [],
    findDynamicAssetsScopedBatch: async () => [],
    deleteTdfRuntimeData: async () => undefined,
    getMethodAuthorizationDeps: () => ({})
  };

  return { ...deps, ...overrides } as any;
}

describe('contentMethods content upload summaries', function() {
  it('checks the archive owner before touching any family data', async function() {
    const inspected: string[] = [];
    const methods = createContentMethods(createContentDeps({
      DynamicAssets: { findOneAsync: async () => ({ _id: 'archive', userId: 'other' }) },
      Tdfs: { find: () => { inspected.push('family'); throw Error('Unexpected family access'); } },
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
    }));
    await assert.rejects(
      () => methods.deletePackageFile.call({ userId: 'owner' }, 'archive', { wholeFamily: true }),
      (error: any) => error.error === 403,
    );
    assert.deepEqual(inspected, []);
  });
  it('toggles study visibility while keeping locked and previously listed conditions out of the public list', async function() {
    const tdfs = new Mongo.Collection<any>('visibility' + Random.id());
    const methods = createContentMethods(createContentDeps({
      Tdfs: tdfs,
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async (userId: string) => userId === 'admin' }),
    }));
    const toggle = (id: string, value: boolean) => methods.setTdfUserSelect.call({ userId: 'owner' }, id, value);
    const listed = () => tdfs.find({ 'content.tdfs.tutor.setspec.userselect': 'true' }).mapAsync(doc => doc._id);
    try {
      await tdfs.insertAsync({ _id: 'root', ownerId: 'owner', content: { tdfs: { tutor: { setspec: {
        condition: ['condition.json'], conditionTdfIds: ['child'], userselect: 'false',
      } } } } });
      await tdfs.insertAsync({ _id: 'child', ownerId: 'owner', content: { tdfs: { tutor: { unit: [{}],
        setspec: { userselect: 'true', aiVisibilityLockReason: 'missing attribution' },
      } } } });
      for (const userId of ['outsider', 'admin']) {
        await assert.rejects(methods.setTdfUserSelect.call({ userId }, 'root', true),
          (error: any) => error.error === 'not-authorized');
      }
      await toggle('root', true);
      assert.deepEqual(await listed(), ['root']);
      await assert.rejects(toggle('child', true), (error: any) => error.error === 'tdf-condition-visibility');
      const child = await tdfs.findOneAsync('child');
      assert.equal(child.content.tdfs.tutor.setspec.aiVisibilityLockReason, 'missing attribution');
      await toggle('root', false);
      assert.deepEqual(await listed(), []);
      assert.equal((await tdfs.findOneAsync('child')).tdfRevision, child.tdfRevision);
      await tdfs.updateAsync('root', { $set: { 'content.tdfs.tutor.setspec.aiVisibilityLockReason': 'private' } });
      await assert.rejects(toggle('root', true), (error: any) => error.error === 'tdf-public-locked');
    } finally {
      await tdfs.rawCollection().drop();
    }
  });

  it('updates and removes only an existing manual draft owned by the caller', async function() {
    const drafts = (globalThis as any).ManualContentDrafts as Mongo.Collection<any>;
    const methods = (Meteor as any).server.method_handlers;
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw new Error('Expected installed draft methods');
    for (const verification of MANUAL_DRAFT_VERIFICATIONS) {
      const rows: typeof observed.surfaces = observed.surfaces.filter(row => row.name === verification.method);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.verification, verification);
      assert.deepEqual(rows[0]?.policy, { kind: 'manual-draft', operation: 'owner' });
    }
    const owner = { userId: Random.id() };
    const other = { userId: Random.id() };
    let draftId: string | undefined;
    const state = { lessonName: 'Revised' };
    const missing = (err: any) => err.error === 404;
    try {
      await Meteor.users.insertAsync({ _id: owner.userId, profile: { displayName: 'Synthetic author' } } as any);
      const created = await methods.saveManualContentDraft.call(owner, { state, ownerId: other.userId });
      assert.equal(typeof created.draftId, 'string');
      draftId = created.draftId as string;
      const payload = { draftId, state };
      for (const [name, arg] of [['getManualContentDraft', draftId], ['saveManualContentDraft', payload], ['deleteManualContentDraft', draftId]] as const) {
        await assert.rejects(methods[name].call({}, arg), (err: any) => err.error === 401);
      }
      assert.equal((await drafts.findOneAsync(draftId)).ownerId, owner.userId);
      await assert.rejects(methods.getManualContentDraft.call(other, draftId), missing);
      await assert.rejects(methods.saveManualContentDraft.call(other, payload), missing);
      await assert.rejects(methods.deleteManualContentDraft.call(other, draftId), missing);
      await methods.saveManualContentDraft.call(owner, payload);
      assert.equal((await methods.getManualContentDraft.call(owner, draftId)).lessonName, 'Revised');
      await drafts.updateAsync(draftId, { $set: { draftType: 'other-kind' } });
      await assert.rejects(methods.saveManualContentDraft.call(owner, payload), missing);
      await assert.rejects(methods.deleteManualContentDraft.call(owner, draftId), missing);
      await drafts.updateAsync(draftId, { $set: { draftType: 'manual-content-creator' } });
      assert.deepEqual(await methods.deleteManualContentDraft.call(owner, draftId), { deleted: true });
      await assert.rejects(methods.deleteManualContentDraft.call(owner, draftId), missing);
      await assert.rejects(methods.saveManualContentDraft.call(owner, payload), missing);
    } finally {
      if (draftId) await drafts.removeAsync({ _id: draftId });
      await Meteor.users.removeAsync({ _id: owner.userId });
    }
  });

  it('waits for the stimulus file access decision', async function() {
    const methods = createContentMethods(createContentDeps({
      Tdfs: { findOneAsync: async () => ({ rawStimuliFile: {}, content: { tdfs: { tutor: { setspec: { stimulusfile: 'test.json' } } } } }) },
      stimulusFilePolicy: { authorize: async () => false },
    }));
    let denied;
    try { await methods.getStimuliFileForTdf.call({ userId: 'learner' }, 'lesson'); } catch (err) { denied = err; }
    expect(denied).to.include({ error: 403 });
  });

  it('keeps asset publications limited to fields needed by client link and metadata views', function() {
    expect(DYNAMIC_ASSET_PUBLICATION_FIELDS).to.deep.equal({
      _id: 1,
      _downloadRoute: 1,
      _collectionName: 1,
      public: 1,
      name: 1,
      fileName: 1,
      type: 1,
      size: 1,
      uploadedAt: 1,
      userId: 1,
      path: 1,
      meta: 1,
      ext: 1,
      extension: 1,
      extensionWithDot: 1,
      isImage: 1,
      isAudio: 1,
      isVideo: 1,
      versions: 1
    });
  });

  it('preserves the routing fields consumed by the real FilesCollection link formatter', function() {
    const original = {
      _id: 'preview-asset', name: 'practice-cycle.png', extension: 'png',
      _downloadRoute: '/cdn/storage', _collectionName: 'Assets', public: false,
      versions: { original: { extension: 'png' } },
    };
    for (const isPublic of [false, true]) {
      const stored: Record<string, unknown> = { ...original, public: isPublic };
      const projected = Object.fromEntries(Object.keys(DYNAMIC_ASSET_PUBLICATION_FIELDS)
        .filter(key => Object.hasOwn(stored, key)).map(key => [key, stored[key]]));
      const link = (globalThis as any).DynamicAssets.link(projected);
      const expectedPath = isPublic
        ? '/cdn/storage/preview-asset.png'
        : '/cdn/storage/Assets/preview-asset/original/preview-asset.png';
      expect(new URL(link).pathname).to.equal(expectedPath);
      expect(link).not.to.include('undefined');
    }
  });

  it('deletes only package-bound media with no surviving lesson reference', async function() {
    const observed = registeredMeteorMethodSurfaces();
    if (observed.state !== 'observed') throw Error(observed.reason);
    const binding = observed.surfaces.find(({ name }) => name === 'deletePackageFile');
    assert.equal(binding?.verification, PACKAGE_DELETION_VERIFICATION);
    const tdfs = new Mongo.Collection<any>('packageDeletionLessons' + Random.id());
    const assets = new Mongo.Collection<any>('packageDeletionAssets' + Random.id());
    const makeMedia = (id: string, name: string, target = 'lesson', setId: string | number = 88) => ({
      _id: id, name, userId: 'collaborator',
      meta: { uploadPurpose: 'content-media', tdfId: target, stimuliSetId: setId },
    });
    const methods = createContentMethods(createContentDeps({
      Tdfs: tdfs, DynamicAssets: assets,
      getMethodAuthorizationDeps: () => ({ userIsInRoleAsync: async () => false }),
    }));

    try {
      await tdfs.insertAsync({ _id: 'lesson', ownerId: 'owner', stimuliSetId: 88, packageAssetId: 'archive' });
      await tdfs.insertAsync({ _id: 'condition', ownerId: 'owner', stimuliSetId: 89, packageAssetId: 'archive' });
      await tdfs.insertAsync({ _id: 'neighbor-scope', ownerId: 'other', stimuliSetId: '89' });
      await tdfs.insertAsync({
        _id: 'other', ownerId: 'other', stimuliSetId: 98,
        content: { tdfs: { tutor: { setspec: { lessonHelp: '<img src="/dynamic-assets/shared-id/photo.png">' } } } },
        rawStimuliFile: { setspec: { clusters: [{ stims: [{ audioStimulus: 'same name.wav' }] }] } },
      });
      for (const asset of [
        { _id: 'archive', userId: 'owner', ext: 'zip', meta: { uploadPurpose: 'package' } },
        makeMedia('delete-me', 'other.png'),
        makeMedia('shared-id', 'photo.png'),
        makeMedia('same-name', 'same name.wav'),
        makeMedia('sibling-scope', 'condition.png', 'condition', 89),
        makeMedia('unrelated-id', 'other.png', 'other', 98),
        makeMedia('mismatched-scope', 'scope.png', 'lesson', '88'),
        { _id: 'legacy-scope-only', name: 'other.png', meta: { stimuliSetId: 88 } },
      ]) await assets.insertAsync(asset);

      await assert.rejects(
        methods.deletePackageFile.call({ userId: 'owner' }, 'archive'),
        (error: any) => error.error === 'whole-family-confirmation-required',
      );
      await assert.rejects(
        methods.deletePackageFile.call({ userId: 'collaborator' }, 'archive', { wholeFamily: true }),
        (error: any) => error.error === 403,
      );
      assert.equal(await tdfs.find({ packageAssetId: 'archive' }).countAsync(), 2);
      assert.deepEqual(await methods.deletePackageFile.call({ userId: 'owner' }, 'archive', { wholeFamily: true }),
        { deletedCount: 2 });
      assert.equal(await tdfs.find({ packageAssetId: 'archive' }).countAsync(), 0);
      assert.deepEqual((await assets.find({}).mapAsync(asset => asset._id)).sort(), [
        'legacy-scope-only', 'mismatched-scope', 'same-name', 'shared-id', 'sibling-scope', 'unrelated-id',
      ]);
    } finally {
      await tdfs.removeAsync({});
      await assets.removeAsync({});
    }
  });
});
