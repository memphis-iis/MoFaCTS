import { expect } from 'chai';
import { migrateSparcAuthoredPageIdentityValue } from './migrate_sparc_authored_page_identity';

describe('SPARC authored page identity migration', function() {
  it('removes the redundant display identity and derives nested page keys from pageId', function() {
    expect(migrateSparcAuthoredPageIdentityValue({
      setspec: {
        sparcPages: [{
          pageId: 'page-1',
          display: {
            documentId: 'old-document-name',
            productionRules: [{
              when: [{
                factType: 'interface-event',
                slots: { documentId: { type: 'bind', variable: 'documentId' } },
              }],
              then: [{
                write: {
                  target: { documentId: 'old-document-name', nodeId: 'feedback' },
                  key: 'visible',
                  value: true,
                },
              }],
            }],
          },
        }],
      },
    })).to.deep.equal({
      setspec: {
        sparcPages: [{
          pageId: 'page-1',
          display: {
            productionRules: [{
              when: [{
                factType: 'interface-event',
                slots: { pageKey: { type: 'bind', variable: 'pageKey' } },
              }],
              then: [{
                write: {
                  target: { pageKey: 'page-1', nodeId: 'feedback' },
                  key: 'visible',
                  value: true,
                },
              }],
            }],
          },
        }],
      },
    });
  });

  it('rejects duplicate page ids rather than choosing one', function() {
    expect(() => migrateSparcAuthoredPageIdentityValue({
      setspec: {
        sparcPages: [
          { pageId: 'duplicate', display: {} },
          { pageId: 'duplicate', display: {} },
        ],
      },
    })).to.throw('[SPARC Migration] duplicate sparcPages pageId duplicate');
  });
});
