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
  it('normalizes asset stimulus ids and reads current permissions on each subscription', async function() {
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
      }
    });

    const first = await resolver.resolveAssetStimuliSetIds('user-1');
    const second = await resolver.resolveAssetStimuliSetIds('user-1');

    expect(first).to.deep.equal(normalizeStimSetIds([101, 202, 303, 404]));
    expect(second).to.deep.equal(first);
    expect(userCalls).to.equal(2);
    expect(findOneCalls).to.equal(2);
    expect(findCalls).to.equal(6);
    expect(findOptions[0]?.fields?.['content.tdfs.tutor.setspec.conditionTdfIds']).to.equal(1);
  });

  it('observes a changed grant when the same user subscribes again', async function() {
    let granted = true;
    const resolver = createTdfPublicationAccessResolver({
      tdfs: {
        find() {
          return cursor(granted ? [{ stimuliSetId: 123 }] : []);
        },
        async findOneAsync() {
          return null;
        }
      },
      users: {
        async findOneAsync() {
          return { accessedTDFs: [] };
        }
      },
      roles: {
        async userIsInRoleAsync() {
          return false;
        }
      }
    });

    expect(await resolver.resolveAssetStimuliSetIds('user-1')).to.deep.equal(normalizeStimSetIds([123]));
    granted = false;
    expect(await resolver.resolveAssetStimuliSetIds('user-1')).to.deep.equal([]);
  });
});
