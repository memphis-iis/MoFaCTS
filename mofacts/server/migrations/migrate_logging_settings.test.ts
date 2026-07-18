import { expect } from 'chai';
import {
  CLIENT_VERBOSITY_SETTING,
  SERVER_VERBOSITY_SETTING,
} from '../../common/loggingSettings';
import { migrateLoggingSettings } from './migrate_logging_settings';

type Document = { _id: string; key: string; value: unknown };

function matches(document: Document, selector: any): boolean {
  if (selector.$or) {
    return selector.$or.some((candidate: any) => matches(document, candidate));
  }
  if (selector._id && typeof selector._id === 'string' && document._id !== selector._id) {
    return false;
  }
  if (selector._id?.$ne && document._id === selector._id.$ne) {
    return false;
  }
  if (selector.key && document.key !== selector.key) {
    return false;
  }
  return true;
}

function createCollection(initialDocuments: Document[]) {
  const documents = [...initialDocuments];
  return {
    documents,
    find(selector: any) {
      return {
        async fetchAsync() {
          return documents.filter((document) => matches(document, selector));
        },
      };
    },
    async upsertAsync(selector: Record<string, unknown>, modifier: Record<string, unknown>) {
      const id = String(selector._id);
      const fields = modifier.$set as Omit<Document, '_id'>;
      const index = documents.findIndex((document) => document._id === id);
      const next = { _id: id, ...fields };
      if (index === -1) documents.push(next);
      else documents[index] = next;
      return 1;
    },
    async removeAsync(selector: any) {
      const before = documents.length;
      for (let index = documents.length - 1; index >= 0; index -= 1) {
        if (matches(documents[index]!, selector)) documents.splice(index, 1);
      }
      return before - documents.length;
    },
  };
}

describe('logging settings migration', function() {
  it('preserves agreeing values, removes duplicate key documents, and is idempotent', async function() {
    const collection = createCollection([
      { _id: 'old-client-a', key: CLIENT_VERBOSITY_SETTING.key, value: 2 },
      { _id: 'old-client-b', key: CLIENT_VERBOSITY_SETTING.key, value: '2' },
      { _id: 'unrelated', key: 'customTheme', value: 'theme' },
    ]);

    const first = await migrateLoggingSettings(collection);
    expect(first).to.deep.equal({
      clientVerbosityLevel: 2,
      serverVerbosityLevel: 1,
      removedDuplicateDocuments: 2,
    });
    expect(collection.documents).to.deep.include({
      _id: CLIENT_VERBOSITY_SETTING.id,
      key: CLIENT_VERBOSITY_SETTING.key,
      value: 2,
    });
    expect(collection.documents).to.deep.include({
      _id: SERVER_VERBOSITY_SETTING.id,
      key: SERVER_VERBOSITY_SETTING.key,
      value: 1,
    });
    expect(collection.documents).to.deep.include({
      _id: 'unrelated',
      key: 'customTheme',
      value: 'theme',
    });

    const second = await migrateLoggingSettings(collection);
    expect(second.removedDuplicateDocuments).to.equal(0);
  });

  it('rejects conflicting duplicates before changing any setting document', async function() {
    const initial = [
      { _id: 'old-client-a', key: CLIENT_VERBOSITY_SETTING.key, value: 1 },
      { _id: 'old-client-b', key: CLIENT_VERBOSITY_SETTING.key, value: 2 },
    ];
    const collection = createCollection(initial);

    try {
      await migrateLoggingSettings(collection);
      expect.fail('Expected conflicting duplicates to fail');
    } catch (error: any) {
      expect(error.message).to.contain('Conflicting clientVerbosityLevel');
    }
    expect(collection.documents).to.deep.equal(initial);
  });
});
