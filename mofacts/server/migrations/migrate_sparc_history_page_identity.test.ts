import { expect } from 'chai';
import {
  migrateSparcHistoryIdentityValue,
  migrateSparcHistoryPageIdentity,
} from './migrate_sparc_history_page_identity';

describe('SPARC history page identity migration', function() {
  it('renames every nested document identity without changing unrelated values', function() {
    expect(migrateSparcHistoryIdentityValue({
      documentId: 'page-1',
      sourceAddress: { documentId: 'page-1', nodeId: 'answer' },
      stateTransition: {
        event: { source: { documentId: 'page-1', nodeId: 'answer' } },
        writes: [{ target: { documentId: 'page-1', nodeId: 'feedback' }, key: 'visible', value: true }],
      },
    }, 'canonical-page')).to.deep.equal({
      pageKey: 'canonical-page',
      sourceAddress: { pageKey: 'canonical-page', nodeId: 'answer' },
      stateTransition: {
        event: { source: { pageKey: 'canonical-page', nodeId: 'answer' } },
        writes: [{ target: { pageKey: 'canonical-page', nodeId: 'feedback' }, key: 'visible', value: true }],
      },
    });
  });

  it('rejects ambiguous rows that contain old and new identity fields', function() {
    expect(() => migrateSparcHistoryIdentityValue({ documentId: 'old', pageKey: 'new' }))
      .to.throw('[SPARC Migration] sparc contains both documentId and pageKey');
  });

  it('migrates matching rows and records completion only after no legacy rows remain', async function() {
    const rows = [{
      _id: 'history-1',
      TDFId: 'tdf-1',
      levelUnit: 0,
      sparc: {
        documentId: 'page-1',
        sourceAddress: { documentId: 'page-1', nodeId: 'answer' },
      },
    }];
    const updates: Array<{ selector: Record<string, unknown>; modifier: Record<string, unknown> }> = [];
    const settings: Array<{ selector: Record<string, unknown>; modifier: Record<string, unknown> }> = [];
    let readCount = 0;

    await migrateSparcHistoryPageIdentity({
      Histories: {
        find() {
          const result = readCount === 0 ? rows : [];
          readCount += 1;
          return { fetchAsync: async () => result };
        },
        async updateAsync(selector, modifier) {
          updates.push({ selector, modifier });
          return 1;
        },
      },
      Tdfs: {
        async findOneAsync() {
          return {
            _id: 'tdf-1',
            content: { tdfs: { tutor: { unit: [{ sparcsession: { pageId: 'canonical-page' } }] } } },
            rawStimuliFile: { setspec: { sparcPages: [{ pageId: 'canonical-page', display: {} }] } },
          };
        },
      },
      DynamicSettings: {
        async findOneAsync() { return null; },
        async upsertAsync(selector, modifier) {
          settings.push({ selector, modifier });
          return undefined;
        },
      },
      serverConsole() {},
    });

    expect(updates).to.have.length(1);
    expect(updates[0]?.modifier).to.deep.equal({
      $set: {
        sparc: {
          pageKey: 'canonical-page',
          sourceAddress: { pageKey: 'canonical-page', nodeId: 'answer' },
        },
      },
    });
    expect(settings).to.have.length(1);
  });
});
