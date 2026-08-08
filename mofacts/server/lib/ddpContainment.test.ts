import { expect } from 'chai';
import { applyDdpContainment, inspectMeteor35RuntimeMode } from './ddpContainment';

describe('Meteor 3.5 DDP containment', function() {
  const containedEnv = {
    DDP_TRANSPORT: 'sockjs',
    METEOR_REACTIVITY_ORDER: 'changeStreams',
  };

  it('sets disconnect grace to zero and requires Change Streams', function() {
    const server = { options: { disconnectGracePeriod: 60_000 } };
    const mode = applyDdpContainment(server, containedEnv);
    expect(server.options.disconnectGracePeriod).to.equal(0);
    expect(mode).to.deep.equal({
      qualificationMode: false,
      reactivityOrder: 'changeStreams',
      transport: 'sockjs',
    });
  });

  it('accepts the isolated Change Streams qualification mode', function() {
    const server = { options: { disconnectGracePeriod: 60_000 } };
    const mode = applyDdpContainment(server, {
      ...containedEnv,
      MOFACTS_CHANGE_STREAMS_QUALIFICATION: 'true',
    });
    expect(mode).to.deep.equal({
      qualificationMode: true,
      reactivityOrder: 'changeStreams',
      transport: 'sockjs',
    });
  });

  it('rejects a transport outside the contained base release', function() {
    expect(() => applyDdpContainment(
      { options: {} },
      { ...containedEnv, DDP_TRANSPORT: 'uws' },
    )).to.throw('DDP_TRANSPORT must be sockjs');
  });

  it('rejects polling and mixed driver orders', function() {
    for (const reactivityOrder of ['polling', 'changeStreams,polling', 'changeStreams,oplog,polling']) {
      const result = inspectMeteor35RuntimeMode({
        ...containedEnv,
        METEOR_REACTIVITY_ORDER: reactivityOrder,
      });
      expect(result.mode).to.equal(undefined);
      expect(result.issues).to.deep.include({
        path: 'METEOR_REACTIVITY_ORDER',
        message: 'must be changeStreams; polling and all alternate drivers are prohibited',
      });
    }
  });

  it('rejects the obsolete Change Streams enablement gate', function() {
    const result = inspectMeteor35RuntimeMode({
      ...containedEnv,
      MOFACTS_CHANGE_STREAMS_ENABLED: 'true',
    });
    expect(result.mode).to.equal(undefined);
    expect(result.issues).to.deep.include({
      path: 'MOFACTS_CHANGE_STREAMS_ENABLED',
      message: 'is obsolete; Change Streams are required for every MoFaCTS process',
    });
  });

  it('rejects an invalid qualification gate value', function() {
    const result = inspectMeteor35RuntimeMode({
      ...containedEnv,
      MOFACTS_CHANGE_STREAMS_QUALIFICATION: 'yes',
    });
    expect(result.mode).to.equal(undefined);
    expect(result.issues.map((issue) => issue.path))
      .to.include('MOFACTS_CHANGE_STREAMS_QUALIFICATION');
  });

  it('fails when Meteor does not expose the required server option owner', function() {
    expect(() => applyDdpContainment(undefined, containedEnv))
      .to.throw('Meteor.server.options is unavailable');
  });
});
