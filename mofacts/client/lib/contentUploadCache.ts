import { contentUploadSnapshotStore } from './contentUploadSnapshotStore';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Tracker } from 'meteor/tracker';
import {
  CONTENT_UPLOAD_CACHE_VERSION, CONTENT_UPLOAD_METADATA_COLLECTION,
  type ContentUploadMetadata, type ContentUploadSnapshot,
} from '../../common/lib/contentUploadMetadata';

// DDP-only collection: server publications send these records without persisting them in Mongo.
const metadata = new Mongo.Collection<ContentUploadMetadata>(CONTENT_UPLOAD_METADATA_COLLECTION);
export function startContentUploadCache(callbacks: {
  apply: (snapshot: ContentUploadSnapshot, source: 'local' | 'live' | 'clear') => void;
  error: (message: string) => void;
}) {
  const authenticatedUserId = Meteor.userId();
  if (!authenticatedUserId) throw new Error('Content Upload requires an authenticated user.');
  const userId: string = authenticatedUserId;
  let stopped = false;
  let subscription: Meteor.SubscriptionHandle | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hasLiveData = false;
  let lastSnapshotJson = '';
  let lastAppliedJson = '';
  function report(error: unknown) {
    if (!stopped) callbacks.error(error instanceof Error ? error.message : 'Content cache synchronization failed.');
  }
  function applySaved() {
    try {
      const saved = contentUploadSnapshotStore.read(userId!);
      if (saved && !stopped) {
        callbacks.apply(saved, 'local');
        lastAppliedJson = JSON.stringify(saved.records);
      }
    } catch (error) { report(error); }
  }
  applySaved();
  function connect() {
    hasLiveData = false;
    subscription?.stop();
    subscription = Meteor.subscribe('contentUploadMetadata', { onError: report });
  }
  connect();
  const computation = Tracker.autorun(() => {
    if (Meteor.userId() !== userId) {
      try { contentUploadSnapshotStore.remove(userId); } catch (error) { report(error); }
      callbacks.apply({ version: CONTENT_UPLOAD_CACHE_VERSION, userId, generatedAt: Date.now(), records: [] }, 'clear');
      stop();
      return;
    }
    if (!subscription?.ready()) return;
    const records = metadata.find({ userId }, { sort: { _id: 1 } }).fetch();
    const json = JSON.stringify(records);
    if (json === lastSnapshotJson && hasLiveData) return;
    lastSnapshotJson = json;
    hasLiveData = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (stopped || Meteor.userId() !== userId) return;
      const snapshot = { version: CONTENT_UPLOAD_CACHE_VERSION, userId, generatedAt: Date.now(), records };
      if (json !== lastAppliedJson) {
        callbacks.apply(snapshot, 'live');
        lastAppliedJson = json;
      }
      try {
        contentUploadSnapshotStore.write(userId, snapshot);
        callbacks.error('');
      } catch (error) { report(error); }
    }, 25);
  });
  function storageChanged(event: StorageEvent) {
    if (event.key !== null && event.key !== contentUploadSnapshotStore.key(userId)) return;
    if (event.newValue === null && !hasLiveData) {
      callbacks.apply({ version: CONTENT_UPLOAD_CACHE_VERSION, userId, generatedAt: Date.now(), records: [] }, 'clear');
    } else if (!hasLiveData) applySaved();
  }
  window.addEventListener('storage', storageChanged);
  function stop() {
    if (stopped) return;
    stopped = true;
    computation.stop();
    subscription?.stop();
    if (timer) clearTimeout(timer);
    window.removeEventListener('storage', storageChanged);
  }
  return { stop, retry() {
    try { contentUploadSnapshotStore.remove(userId); } catch (error) { report(error); }
    // Tracker.nonreactive prevents subscriptions from belonging to a UI helper computation.
    Tracker.nonreactive(connect);
    computation.invalidate();
  } };
}
