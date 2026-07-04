import { expect } from 'chai';
import {
  buildConditionVisibilityTerms,
  buildParentRootSelector,
  createLessonFamilyResolver,
} from './tdfLessonFamilyResolver';

function cursor(rows: any[]) {
  return {
    async fetchAsync() {
      return rows;
    },
  };
}

describe('tdfLessonFamilyResolver', function() {
  it('builds child-to-parent selectors from indexed condition fields', function() {
    expect(buildParentRootSelector(['child-id', 'child.json'], ['child-id'])).to.deep.equal({
      $or: [
        { 'content.tdfs.tutor.setspec.condition': { $in: ['child-id', 'child.json'] } },
        { 'content.tdfs.tutor.setspec.conditionTdfIds': { $in: ['child-id'] } },
      ],
    });
  });

  it('builds dashboard visibility terms from root condition refs', function() {
    const terms = buildConditionVisibilityTerms([{
      content: {
        tdfs: {
          tutor: {
            setspec: {
              condition: ['condition-a.json', 42, ' '],
              conditionTdfIds: ['condition-a', 7, null],
            },
          },
        },
      },
    }]);

    expect(terms).to.deep.equal([
      { 'content.fileName': { $in: ['condition-a.json', '42'] } },
      { _id: { $in: ['condition-a', '7'] } },
    ]);
  });

  it('resolves condition child ids from explicit ids and filename refs', async function() {
    const findSelectors: any[] = [];
    const resolver = createLessonFamilyResolver({
      tdfs: {
        find(selector: any) {
          findSelectors.push(selector);
          if (selector._id?.$in?.includes('root')) {
            return cursor([{
              _id: 'root',
              content: {
                tdfs: {
                  tutor: {
                    setspec: {
                      condition: ['condition-a.json'],
                      conditionTdfIds: ['condition-b'],
                    },
                  },
                },
              },
            }]);
          }
          return cursor([{ _id: 'condition-a' }]);
        },
        async findOneAsync() {
          return null;
        },
      },
    });

    const childIds = await resolver.resolveConditionChildIdsForRootIds(['root']);

    expect(childIds).to.have.members(['condition-a', 'condition-b']);
    expect(findSelectors[1]).to.deep.equal({
      $or: [
        { _id: { $in: ['condition-a.json', 'condition-b'] } },
        { 'content.fileName': { $in: ['condition-a.json', 'condition-b'] } },
      ],
    });
  });

  it('maps child ids and filenames back to their root ids', function() {
    const resolver = createLessonFamilyResolver({
      tdfs: {
        find: () => cursor([]),
        async findOneAsync() {
          return null;
        },
      },
    });

    const childToRoot = resolver.buildChildToRootMap([{
      _id: 'root',
      content: {
        tdfs: {
          tutor: {
            setspec: {
              condition: ['condition-a.json'],
              conditionTdfIds: ['condition-b'],
            },
          },
        },
      },
    }], [{
      _id: 'condition-a',
      content: { fileName: 'condition-a.json' },
    }, {
      _id: 'condition-b',
      content: { fileName: 'condition-b.json' },
    }]);

    expect(childToRoot.get('condition-a.json')).to.equal('root');
    expect(childToRoot.get('condition-a')).to.equal('root');
    expect(childToRoot.get('condition-b')).to.equal('root');
    expect(childToRoot.get('condition-b.json')).to.equal('root');
  });
});
