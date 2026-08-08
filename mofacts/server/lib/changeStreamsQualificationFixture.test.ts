import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { Roles } from 'meteor/alanning:roles';
import { expect } from 'chai';
import { access, writeFile } from 'node:fs/promises';
import { DynamicSettings, Tdfs } from '../../common/Collections';
import { SERVER_VERBOSITY_SETTING } from '../../common/loggingSettings';
import { TDF_RUNTIME_SECRET_EXCLUSION_FIELDS } from '../publications';
import {
  CHANGE_STREAMS_QUALIFICATION_COLLECTION,
  CHANGE_STREAMS_QUALIFICATION_METHODS,
  CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS,
  type ChangeStreamsQualificationDocument,
} from '../../tests/changeStreamsQualificationContract';

const qualificationCollection = new Mongo.Collection<ChangeStreamsQualificationDocument>(
  CHANGE_STREAMS_QUALIFICATION_COLLECTION,
);

const observerHandles = new Map<string, { stop(): void }>();

function requireQualificationMode() {
  if (
    process.env.MOFACTS_CHANGE_STREAMS_QUALIFICATION !== 'true'
    || process.env.METEOR_REACTIVITY_ORDER !== 'changeStreams'
  ) {
    throw new Meteor.Error(
      'qualification-disabled',
      'Meteor 3.5 Change Streams qualification mode is not active',
    );
  }
}

function requireScope(value: unknown) {
  if (typeof value !== 'string' || !value) {
    throw new Meteor.Error('invalid-qualification-scope', 'Qualification scope must be a non-empty string');
  }
  return value;
}

async function writeQualificationMarker(envName: string) {
  requireQualificationMode();
  const markerPath = String(process.env[envName] || '').trim();
  if (!markerPath) {
    throw new Meteor.Error(
      'qualification-marker-missing',
      `${envName} is required for the externally coordinated qualification case`,
    );
  }
  await writeFile(markerPath, 'ready\n', { encoding: 'utf8', flag: 'wx' });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      await access(markerPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Meteor.Error(
    'qualification-action-timeout',
    `${envName} was requested but not acknowledged within 45000 ms`,
  );
}

async function waitForQualificationCondition(assertion: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Change Streams qualification condition did not pass within ${timeoutMs} ms`);
}

Meteor.methods({
  [CHANGE_STREAMS_QUALIFICATION_METHODS.status]() {
    return {
      enabled: process.env.MOFACTS_CHANGE_STREAMS_QUALIFICATION === 'true',
      reactivityOrder: process.env.METEOR_REACTIVITY_ORDER || null,
      release: Meteor.release,
    };
  },

  async [CHANGE_STREAMS_QUALIFICATION_METHODS.reset](rawScope: unknown) {
    requireQualificationMode();
    const scope = requireScope(rawScope);
    observerHandles.get(scope)?.stop();
    observerHandles.delete(scope);
    await qualificationCollection.removeAsync({ scope });
    await (Tdfs as any).removeAsync({ _id: `${scope}-secret-tdf` });
  },

  async [CHANGE_STREAMS_QUALIFICATION_METHODS.seed](rawScope: unknown) {
    requireQualificationMode();
    const scope = requireScope(rawScope);
    await qualificationCollection.removeAsync({ scope });
    await Promise.all([
      qualificationCollection.insertAsync({
        _id: `${scope}-one`,
        scope,
        value: 'one',
        rank: 1,
        nested: { visible: 'visible-one', secret: 'secret-one' },
      }),
      qualificationCollection.insertAsync({
        _id: `${scope}-two`,
        scope,
        value: 'two',
        rank: 2,
        nested: { visible: 'visible-two', secret: 'secret-two' },
      }),
      qualificationCollection.insertAsync({
        _id: `${scope}-three`,
        scope,
        value: 'three',
        rank: 3,
        nested: { visible: 'visible-three', secret: 'secret-three' },
      }),
    ]);
  },

  async [CHANGE_STREAMS_QUALIFICATION_METHODS.write](
    rawScope: unknown,
    id: unknown,
    value: unknown,
    rank?: unknown,
  ) {
    requireQualificationMode();
    const scope = requireScope(rawScope);
    if (typeof id !== 'string' || !id || typeof value !== 'string') {
      throw new Meteor.Error('invalid-qualification-write', 'Qualification write arguments are invalid');
    }
    const numericRank = typeof rank === 'number' ? rank : undefined;
    await qualificationCollection.upsertAsync(
      { _id: id, scope },
      {
        $set: {
          value,
          ...(numericRank === undefined ? {} : { rank: numericRank }),
          nested: { visible: `visible-${value}`, secret: `secret-${value}` },
        },
      },
    );
  },

  async [CHANGE_STREAMS_QUALIFICATION_METHODS.writeThenObserve](rawScope: unknown) {
    requireQualificationMode();
    const scope = requireScope(rawScope);
    const id = `${scope}-fence`;
    const observerKey = `${scope}-new-observer`;

    await qualificationCollection.upsertAsync(
      { _id: id, scope },
      {
        $set: {
          value: 'fence-write',
          observerKey,
          nested: { visible: 'visible-fence', secret: 'secret-fence' },
        },
      },
    );

    observerHandles.get(scope)?.stop();
    const handle = await qualificationCollection.find({ scope, observerKey }).observeChanges({
      added() {},
    });
    observerHandles.set(scope, handle);

    return id;
  },

  async [CHANGE_STREAMS_QUALIFICATION_METHODS.requestHistoryLoss]() {
    await writeQualificationMarker('MOFACTS_CHANGE_STREAMS_HISTORY_LOSS_MARKER');
  },

  async [CHANGE_STREAMS_QUALIFICATION_METHODS.requestPrimaryRestart]() {
    await writeQualificationMarker('MOFACTS_CHANGE_STREAMS_PRIMARY_RESTART_MARKER');
  },

  async [CHANGE_STREAMS_QUALIFICATION_METHODS.seedTdfSecrets](rawScope: unknown) {
    requireQualificationMode();
    const scope = requireScope(rawScope);
    const id = `${scope}-secret-tdf`;
    await (Tdfs as any).upsertAsync(
      { _id: id },
      {
        $set: {
          ownerId: scope,
          content: {
            fileName: `${id}.json`,
            tdfs: {
              tutor: {
                setspec: {
                  lessonname: 'Change Streams secret projection qualification',
                  speechAPIKey: 'qualification-speech-secret',
                  textToSpeechAPIKey: 'qualification-tts-secret',
                  openRouterApiKey: 'qualification-openrouter-secret',
                },
              },
            },
          },
        },
      },
    );
    return id;
  },

  async [CHANGE_STREAMS_QUALIFICATION_METHODS.updateTdfSecrets](rawScope: unknown) {
    requireQualificationMode();
    const scope = requireScope(rawScope);
    await (Tdfs as any).updateAsync(
      { _id: `${scope}-secret-tdf` },
      {
        $set: {
          'content.tdfs.tutor.setspec.lessonname': 'Updated Change Streams qualification',
          'content.tdfs.tutor.setspec.speechAPIKey': 'updated-qualification-speech-secret',
          'content.tdfs.tutor.setspec.textToSpeechAPIKey': 'updated-qualification-tts-secret',
          'content.tdfs.tutor.setspec.openRouterApiKey': 'updated-qualification-openrouter-secret',
        },
      },
    );
  },
});

Meteor.publish(CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.supported, function(
  rawScope: unknown,
  ids: unknown,
) {
  requireQualificationMode();
  const scope = requireScope(rawScope);
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new Meteor.Error('invalid-qualification-ids', 'Qualification ids must be strings');
  }
  return qualificationCollection.find(
    { scope, _id: { $in: ids } },
    { fields: { 'nested.secret': 0 } },
  );
});

Meteor.publish(CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.dottedProjection, function(
  rawScope: unknown,
) {
  requireQualificationMode();
  const scope = requireScope(rawScope);
  return qualificationCollection.find(
    { scope },
    { fields: { 'nested.visible': 1 } },
  );
});

Meteor.publish(CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.snapshotRace, function(
  rawScope: unknown,
) {
  requireQualificationMode();
  const scope = requireScope(rawScope);
  setTimeout(() => {
    void qualificationCollection.insertAsync({
      _id: `${scope}-during-snapshot`,
      scope,
      value: 'during-snapshot',
      rank: 4,
      nested: { visible: 'visible-snapshot', secret: 'secret-snapshot' },
    });
  }, 0);
  return qualificationCollection.find({ scope }, { fields: { 'nested.secret': 0 } });
});

Meteor.publish(CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.tdfSecretProjection, function(
  rawScope: unknown,
) {
  requireQualificationMode();
  const scope = requireScope(rawScope);
  return Tdfs.find(
    { _id: `${scope}-secret-tdf` },
    { fields: TDF_RUNTIME_SECRET_EXCLUSION_FIELDS },
  );
});

const describeChangeStreamsQualification = (
  process.env.MOFACTS_CHANGE_STREAMS_QUALIFICATION === 'true'
  && process.env.METEOR_REACTIVITY_ORDER === 'changeStreams'
)
  ? describe
  : describe.skip;

describeChangeStreamsQualification('Meteor 3.5 real publication qualification', function() {
  this.timeout(30_000);

  it('observes the real exact-id server verbosity setting through initial and changed states', async function() {
    const DynamicSettingsAny = DynamicSettings as any;
    const original = await DynamicSettingsAny.findOneAsync({ _id: SERVER_VERBOSITY_SETTING.id });
    if (!original) {
      await DynamicSettingsAny.insertAsync({
        _id: SERVER_VERBOSITY_SETTING.id,
        key: SERVER_VERBOSITY_SETTING.key,
        value: SERVER_VERBOSITY_SETTING.defaultValue,
      });
    }
    const initialDocument = original || {
      key: SERVER_VERBOSITY_SETTING.key,
      value: SERVER_VERBOSITY_SETTING.defaultValue,
    };

    let initialValue: unknown;
    let changedValue: unknown;
    const handle = await DynamicSettings.find(
      { _id: SERVER_VERBOSITY_SETTING.id },
      { fields: { value: 1 } },
    ).observeChanges({
      added(_id: string, fields: { value?: unknown }) {
        initialValue = fields.value;
      },
      changed(_id: string, fields: { value?: unknown }) {
        if (Object.prototype.hasOwnProperty.call(fields, 'value')) changedValue = fields.value;
      },
    });

    const nextValue = initialDocument.value === 2 ? 1 : 2;
    try {
      await waitForQualificationCondition(() => initialValue === initialDocument.value);
      await DynamicSettingsAny.updateAsync(
        { _id: SERVER_VERBOSITY_SETTING.id },
        { $set: { value: nextValue } },
      );
      await waitForQualificationCondition(() => changedValue === nextValue);
    } finally {
      handle.stop();
      await DynamicSettingsAny.updateAsync(
        { _id: SERVER_VERBOSITY_SETTING.id },
          { $set: { value: initialDocument.value } },
      );
    }
  });

  it('fails closed instead of polling for a skip/limit observer', async function() {
    const scope = `strict-driver-${Random.id()}`;
    try {
      await qualificationCollection.insertAsync({
        _id: `${scope}-one`,
        scope,
        value: 'one',
        rank: 1,
        nested: { visible: 'visible-one', secret: 'secret-one' },
      });

      let error: Error | undefined;
      try {
        await qualificationCollection.find({ scope }, { skip: 1, limit: 1 }).observeChanges({
          added() {},
        });
      } catch (caught) {
        error = caught as Error;
      }

      expect(error?.message).to.equal(
        'No Change Streams observer driver is available for this reactive cursor; polling fallback is prohibited',
      );
    } finally {
      await qualificationCollection.removeAsync({ scope });
    }
  });

  it('publishes the real filteredUsers page as a non-reactive snapshot', async function() {
    const prefix = `qualification-user-${Random.id()}`;
    const adminId = `${prefix}-admin-id`;
    const ids = [`${prefix}-b-id`, `${prefix}-c-id`, `${prefix}-d-id`];
    const firstId = `${prefix}-a-id`;
    const MeteorUsersAny = Meteor.users as any;
    const seen = new Set<string>();

    try {
      await MeteorUsersAny.insertAsync({
        _id: adminId,
        username: `qualification-admin-${Random.id()}`,
      });
      await Roles.createRoleAsync('admin', { unlessExists: true });
      await Roles.addUsersToRolesAsync(adminId, 'admin');
      await Promise.all(ids.map((id, index) => MeteorUsersAny.insertAsync({
        _id: id,
        username: `${prefix}-${String.fromCharCode(98 + index)}`,
        email_canonical: `${id}@example.invalid`,
        emails: [{ address: `${id}@example.invalid`, verified: false }],
      })));

      const handler = (Meteor as any).server.publish_handlers.filteredUsers;
      if (typeof handler !== 'function') {
        throw new Error('filteredUsers publication handler is unavailable');
      }
      await handler.call({
        userId: adminId,
        ready() {},
        added(collectionName: string, id: string) {
          if (collectionName === 'filtered_user_page_ids') seen.add(id);
        },
      }, prefix, 0, 2);

      expect([...seen].sort()).to.deep.equal(ids.slice(0, 2).sort());

      await MeteorUsersAny.insertAsync({
        _id: firstId,
        username: `${prefix}-a`,
        email_canonical: `${firstId}@example.invalid`,
        emails: [{ address: `${firstId}@example.invalid`, verified: false }],
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect([...seen].sort()).to.deep.equal(ids.slice(0, 2).sort());
    } finally {
      await Roles.removeUsersFromRolesAsync(adminId, 'admin');
      await MeteorUsersAny.removeAsync({ _id: { $in: [adminId, ...ids, firstId] } });
    }
  });
});
