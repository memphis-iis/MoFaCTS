import { expect } from 'chai';
import {
  installStrictMongoReactivity,
  installStrictMongoReactivityOnConnection,
} from './strictMongoReactivity';

describe('strict Mongo Change Streams reactivity', function() {
  it('requires a Change Streams-only process configuration', function() {
    expect(() => installStrictMongoReactivity(
      { METEOR_REACTIVITY_ORDER: 'changeStreams,polling' },
      { Connection: { prototype: { _observeChanges: async () => ({ stop() {} }) } } },
    )).to.throw('METEOR_REACTIVITY_ORDER=changeStreams');
  });

  it('fails closed when Meteor cannot select a Change Streams driver', async function() {
    const prototype = {
      _selectReactivityDriver: async (_configuredOrder: string[], _driverChecks: Record<string, unknown>) => ({}),
      _observeChanges: async () => ({ stop() {} }),
    };
    installStrictMongoReactivityOnConnection(prototype);

    let error: Error | undefined;
    try {
      await prototype._selectReactivityDriver?.(['changeStreams'], {});
    } catch (caught) {
      error = caught as Error;
    }

    expect(error?.message).to.equal(
      'No Change Streams observer driver is available for this reactive cursor; polling fallback is prohibited',
    );
  });

  it('rejects any alternate driver order before delegating to Meteor', async function() {
    let invoked = false;
    const prototype = {
      _selectReactivityDriver: async (_configuredOrder: string[], _driverChecks: Record<string, unknown>) => {
        invoked = true;
        return { driverClass: class ChangeStreamsDriver {} };
      },
      _observeChanges: async () => ({ stop() {} }),
    };
    installStrictMongoReactivityOnConnection(prototype);

    let error: Error | undefined;
    try {
      await prototype._selectReactivityDriver?.(['changeStreams', 'polling'], {});
    } catch (caught) {
      error = caught as Error;
    }

    expect(invoked).to.equal(false);
    expect(error?.message).to.include('alternate Mongo reactivity drivers are not permitted');
  });

  it('keeps Meteor selection when Change Streams are available', async function() {
    const driverClass = class ChangeStreamsDriver {};
    const prototype = {
      _selectReactivityDriver: async (_configuredOrder: string[], _driverChecks: Record<string, unknown>) => ({ driverClass }),
      _observeChanges: async () => ({ stop() {} }),
    };
    installStrictMongoReactivityOnConnection(prototype);

    const selection = await prototype._selectReactivityDriver?.(['changeStreams'], {});
    expect(selection?.driverClass).to.equal(driverClass);
  });
});
