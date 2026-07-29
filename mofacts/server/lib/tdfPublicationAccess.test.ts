import { expect } from 'chai';
import {
  createTdfPublicationAccessResolver,
  normalizeStimSetIds,
  type PublicationSelector,
} from './tdfPublicationAccess';

function cursor(rows: any[]) {
  return {
    async fetchAsync() {
      return rows;
    }
  };
}

describe('tdfPublicationAccess', function() {
  it('expands dashboard visibility to conditions from accessible roots', async function() {
    const findCalls: PublicationSelector[] = [];
    const resolver = createTdfPublicationAccessResolver({
      tdfs: {
        find(selector: PublicationSelector) {
          findCalls.push(selector);
          return cursor([
            {
              content: {
                tdfs: {
                  tutor: {
                    setspec: {
                      condition: ['cond-file', 'cond-7'],
                      conditionTdfIds: ['cond-id', '7']
                    }
                  }
                }
              }
            }
          ]);
        },
        async findOneAsync() {
          return null;
        }
      },
      users: {
        async findOneAsync() {
          return { accessedTDFs: ['accessed-root'] };
        }
      },
      roles: {
        async userIsInRoleAsync() {
          return false;
        }
      },
      async resolveAssignedRootTdfIdsForUser() {
        return ['assigned-root'];
      }
    });

    const selector = await resolver.resolveDashboardSelector('user-1');

    expect(findCalls[0]?.$or).to.deep.include({ ownerId: 'user-1' });
    expect(selector.$or).to.deep.include({ _id: { $in: ['assigned-root', 'accessed-root'] } });
    expect(selector.$or).to.deep.include({ _id: { $in: ['cond-id', '7'] } });
  });

  it('normalizes asset stimulus ids and reuses the per-user cache inside the ttl', async function() {
    let findCalls = 0;
    let findOneCalls = 0;
    let userCalls = 0;
    const findOptions: PublicationSelector[] = [];
    const resolver = createTdfPublicationAccessResolver({
      tdfs: {
        find(selector: PublicationSelector, options?: PublicationSelector) {
          findCalls += 1;
          findOptions.push(options || {});
          if (selector._id?.$in) {
            return cursor(selector._id.$in.map((id: string) => ({
              stimuliSetId: id === 'participant-cond-id' ? 404 : 202
            })));
          }
          return cursor([
            {
              stimuliSetId: 101,
              content: { tdfs: { tutor: { setspec: {
                condition: ['cond-file'],
                conditionTdfIds: ['cond-id'],
              } } } }
            }
          ]);
        },
        async findOneAsync() {
          findOneCalls += 1;
          return {
            stimuliSetId: 303,
            content: { tdfs: { tutor: { setspec: {
              condition: ['participant-cond'],
              conditionTdfIds: ['participant-cond-id'],
            } } } }
          };
        }
      },
      users: {
        async findOneAsync() {
          userCalls += 1;
          return {
            accessedTDFs: ['accessed-root'],
            profile: { experimentTarget: ' Target-A ' }
          };
        }
      },
      roles: {
        async userIsInRoleAsync() {
          return false;
        }
      },
      async resolveAssignedRootTdfIdsForUser() {
        return [];
      }
    });

    const first = await resolver.resolveAssetStimuliSetIds('user-1');
    const second = await resolver.resolveAssetStimuliSetIds('user-1');

    expect(first).to.deep.equal(normalizeStimSetIds([101, 202, 303, 404]));
    expect(second).to.deep.equal(first);
    expect(userCalls).to.equal(1);
    expect(findOneCalls).to.equal(1);
    expect(findCalls).to.equal(3);
    expect(findOptions[0]?.fields?.['content.tdfs.tutor.setspec.conditionTdfIds']).to.equal(1);
  });

  it('bounds cached entries by evicting the oldest user lookup', async function() {
    const userCalls: string[] = [];
    const resolver = createTdfPublicationAccessResolver({
      tdfs: {
        find() {
          return cursor([]);
        },
        async findOneAsync() {
          return null;
        }
      },
      users: {
        async findOneAsync(selector: PublicationSelector) {
          userCalls.push(selector._id);
          return { accessedTDFs: [] };
        }
      },
      roles: {
        async userIsInRoleAsync() {
          return false;
        }
      },
      async resolveAssignedRootTdfIdsForUser() {
        return [];
      }
    }, { maxCacheEntries: 1 });

    await resolver.resolveListingSelector('user-1');
    await resolver.resolveListingSelector('user-2');
    await resolver.resolveListingSelector('user-1');

    expect(userCalls).to.deep.equal(['user-1', 'user-2', 'user-1']);
  });
});
