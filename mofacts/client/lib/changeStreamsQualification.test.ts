import { expect } from 'chai';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Random } from 'meteor/random';
import { Tdfs } from '../../common/Collections';
import {
  CHANGE_STREAMS_QUALIFICATION_COLLECTION,
  CHANGE_STREAMS_QUALIFICATION_METHODS,
  CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS,
  type ChangeStreamsQualificationDocument,
} from '../../tests/changeStreamsQualificationContract';

const qualificationCollection = new Mongo.Collection<ChangeStreamsQualificationDocument>(
  CHANGE_STREAMS_QUALIFICATION_COLLECTION,
);

type QualificationStatus = {
  enabled: boolean;
  reactivityOrder: string | null;
  release: string;
};

function callQualificationMethod<T>(name: string, ...args: unknown[]): Promise<T> {
  return (Meteor as any).callAsync(name, ...args) as Promise<T>;
}

function subscribe(name: string, ...args: unknown[]) {
  let handle: Meteor.SubscriptionHandle | undefined;
  const ready = new Promise<void>((resolve, reject) => {
    handle = Meteor.subscribe(name, ...args, {
      onReady: resolve,
      onError: reject,
    });
  });
  return {
    ready,
    stop() {
      handle?.stop();
    },
  };
}

async function waitFor(assertion: () => boolean, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Change Streams qualification condition did not pass within ${timeoutMs} ms`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

describe('Meteor 3.5 stable Change Streams qualification', function() {
  this.timeout(15_000);

  let scope = '';
  let enabled = false;
  const subscriptions: Array<{ stop(): void }> = [];

  beforeEach(async function() {
    const status = await callQualificationMethod<QualificationStatus>(
      CHANGE_STREAMS_QUALIFICATION_METHODS.status,
    );
    if (!status.enabled) {
      this.skip();
      return;
    }
    enabled = true;
    expect(status.reactivityOrder).to.equal('changeStreams');
    expect(status.release).to.equal('METEOR@3.5');
    scope = Random.id();
    await callQualificationMethod(CHANGE_STREAMS_QUALIFICATION_METHODS.seed, scope);
  });

  afterEach(async function() {
    for (const subscription of subscriptions.splice(0)) subscription.stop();
    if (enabled && scope) {
      await callQualificationMethod(CHANGE_STREAMS_QUALIFICATION_METHODS.reset, scope);
    }
    enabled = false;
    scope = '';
  });

  it('propagates bounded $in changes without exposing dotted secret fields', async function() {
    const ids = [`${scope}-one`, `${scope}-two`];
    const subscription = subscribe(
      CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.supported,
      scope,
      ids,
    );
    subscriptions.push(subscription);
    await subscription.ready;

    await waitFor(() => ids.every((id) => !!qualificationCollection.findOne(id)));
    for (const id of ids) {
      expect(qualificationCollection.findOne(id)?.nested.secret).to.equal(undefined);
    }

    await callQualificationMethod(
      CHANGE_STREAMS_QUALIFICATION_METHODS.write,
      scope,
      ids[0],
      'updated',
      1,
    );
    await waitFor(() => qualificationCollection.findOne(ids[0])?.value === 'updated');
    expect(qualificationCollection.findOne(ids[0])?.nested.secret).to.equal(undefined);
  });

  it('handles the production-shaped dotted projection without exposing siblings', async function() {
    const subscription = subscribe(
      CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.dottedProjection,
      scope,
    );
    subscriptions.push(subscription);
    await withTimeout(subscription.ready, 10_000, 'dotted projection subscription');

    const id = `${scope}-one`;
    await waitFor(() => !!qualificationCollection.findOne(id));
    const document = qualificationCollection.findOne(id);
    expect(document?.nested.visible).to.equal('visible-one');
    expect(document?.nested.secret).to.equal(undefined);
    expect(document?.value).to.equal(undefined);
  });

  it('delivers a write racing the initial snapshot exactly once', async function() {
    const subscription = subscribe(
      CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.snapshotRace,
      scope,
    );
    subscriptions.push(subscription);
    await subscription.ready;

    const id = `${scope}-during-snapshot`;
    await waitFor(() => qualificationCollection.find({ _id: id }).count() === 1);
    expect(qualificationCollection.findOne(id)?.nested.secret).to.equal(undefined);
  });

  it('keeps real TDF runtime secrets out of initial and reactive publication data', async function() {
    const id = await callQualificationMethod<string>(
      CHANGE_STREAMS_QUALIFICATION_METHODS.seedTdfSecrets,
      scope,
    );
    const subscription = subscribe(
      CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.tdfSecretProjection,
      scope,
    );
    subscriptions.push(subscription);
    await subscription.ready;

    await waitFor(() => !!(Tdfs as any).findOne(id));
    const initialSetSpec = (Tdfs as any).findOne(id)?.content?.tdfs?.tutor?.setspec;
    expect(initialSetSpec?.lessonname).to.equal('Change Streams secret projection qualification');
    expect(initialSetSpec?.speechAPIKey).to.equal(undefined);
    expect(initialSetSpec?.textToSpeechAPIKey).to.equal(undefined);
    expect(initialSetSpec?.openRouterApiKey).to.equal(undefined);

    await callQualificationMethod(
      CHANGE_STREAMS_QUALIFICATION_METHODS.updateTdfSecrets,
      scope,
    );
    await waitFor(
      () => (Tdfs as any).findOne(id)?.content?.tdfs?.tutor?.setspec?.lessonname
        === 'Updated Change Streams qualification',
    );
    const updatedSetSpec = (Tdfs as any).findOne(id)?.content?.tdfs?.tutor?.setspec;
    expect(updatedSetSpec?.speechAPIKey).to.equal(undefined);
    expect(updatedSetSpec?.textToSpeechAPIKey).to.equal(undefined);
    expect(updatedSetSpec?.openRouterApiKey).to.equal(undefined);
  });

  it('recovers after an injected ChangeStreamHistoryLost error', async function() {
    this.timeout(60_000);
    const id = `${scope}-history-loss`;
    const subscription = subscribe(
      CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.supported,
      scope,
      [id],
    );
    subscriptions.push(subscription);
    await subscription.ready;

    await callQualificationMethod(CHANGE_STREAMS_QUALIFICATION_METHODS.requestHistoryLoss);
    await withTimeout(
      callQualificationMethod(
        CHANGE_STREAMS_QUALIFICATION_METHODS.write,
        scope,
        id,
        'after-history-loss',
        5,
      ),
      30_000,
      'post-history-loss write fence',
    );
    await waitFor(
      () => qualificationCollection.findOne(id)?.value === 'after-history-loss',
      30_000,
    );
  });

  it('recovers its subscription and write fence after primary restart', async function() {
    this.timeout(60_000);
    const id = `${scope}-primary-restart`;
    const subscription = subscribe(
      CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.supported,
      scope,
      [id],
    );
    subscriptions.push(subscription);
    await subscription.ready;

    await callQualificationMethod(CHANGE_STREAMS_QUALIFICATION_METHODS.requestPrimaryRestart);
    await withTimeout(
      callQualificationMethod(
        CHANGE_STREAMS_QUALIFICATION_METHODS.write,
        scope,
        id,
        'after-primary-restart',
        6,
      ),
      30_000,
      'post-primary-restart write fence',
    );
    await waitFor(
      () => qualificationCollection.findOne(id)?.value === 'after-primary-restart',
      30_000,
    );
  });

  it('completes a login-shaped write fence that creates a new observer mid-method', async function() {
    const subscription = subscribe(
      CHANGE_STREAMS_QUALIFICATION_PUBLICATIONS.supported,
      scope,
      [`${scope}-fence`],
    );
    subscriptions.push(subscription);
    await subscription.ready;

    const id = await withTimeout(
      callQualificationMethod<string>(
        CHANGE_STREAMS_QUALIFICATION_METHODS.writeThenObserve,
        scope,
      ),
      5_000,
      'login-shaped write-fence method',
    );
    await waitFor(() => qualificationCollection.findOne(id)?.value === 'fence-write');
  });
});
