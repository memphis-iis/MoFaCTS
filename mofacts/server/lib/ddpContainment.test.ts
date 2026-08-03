import { expect } from 'chai';
import { applyDdpContainment, inspectMeteor35RuntimeMode } from './ddpContainment';

describe('Meteor 3.5 DDP containment', function() {
  const containedEnv = {
    DDP_TRANSPORT: 'sockjs',
    METEOR_REACTIVITY_ORDER: 'polling',
  };

  it('sets disconnect grace to zero on the public server options owner', function() {
    const server = { options: { disconnectGracePeriod: 60_000 } };
    const mode = applyDdpContainment(server, containedEnv);
    expect(server.options.disconnectGracePeriod).to.equal(0);
    expect(mode).to.deep.equal({
      changeStreamsEnabled: false,
      qualificationMode: false,
      reactivityOrder: 'polling',
      transport: 'sockjs',
    });
  });

  it('accepts Change Streams for the hotfix localhost runtime', function() {
    const server = { options: { disconnectGracePeriod: 60_000 } };
    const mode = applyDdpContainment(server, {
      ...containedEnv,
      MOFACTS_CHANGE_STREAMS_ENABLED: 'true',
      METEOR_REACTIVITY_ORDER: 'changeStreams,polling',
    });
    expect(server.options.disconnectGracePeriod).to.equal(0);
    expect(mode).to.deep.equal({
      changeStreamsEnabled: true,
      qualificationMode: false,
      reactivityOrder: 'changeStreams,polling',
      transport: 'sockjs',
    });
  });

  it('accepts the exact isolated Change Streams qualification mode', function() {
    const server = { options: { disconnectGracePeriod: 60_000 } };
    const mode = applyDdpContainment(server, {
      ...containedEnv,
      MOFACTS_CHANGE_STREAMS_ENABLED: 'true',
      MOFACTS_CHANGE_STREAMS_QUALIFICATION: 'true',
      METEOR_REACTIVITY_ORDER: 'changeStreams,polling',
    });
    expect(server.options.disconnectGracePeriod).to.equal(0);
    expect(mode).to.deep.equal({
      changeStreamsEnabled: true,
      qualificationMode: true,
      reactivityOrder: 'changeStreams,polling',
      transport: 'sockjs',
    });
  });

  it('rejects a transport outside the contained base release', function() {
    expect(() => applyDdpContainment(
      { options: {} },
      { ...containedEnv, DDP_TRANSPORT: 'uws' },
    )).to.throw('DDP_TRANSPORT must be sockjs');
  });

  it('rejects Change Streams without the explicit enablement gate', function() {
    expect(() => applyDdpContainment(
      { options: {} },
      { ...containedEnv, METEOR_REACTIVITY_ORDER: 'changeStreams,polling' },
    )).to.throw('METEOR_REACTIVITY_ORDER must be polling unless Change Streams are explicitly enabled');
  });

  it('rejects an enablement gate that does not select Change Streams', function() {
    expect(() => applyDdpContainment(
      { options: {} },
      { ...containedEnv, MOFACTS_CHANGE_STREAMS_ENABLED: 'true' },
    )).to.throw('METEOR_REACTIVITY_ORDER must be changeStreams,polling');
  });

  it('rejects qualification unless Change Streams are explicitly enabled', function() {
    const result = inspectMeteor35RuntimeMode({
      ...containedEnv,
      MOFACTS_CHANGE_STREAMS_QUALIFICATION: 'true',
    });
    expect(result.mode).to.equal(undefined);
    expect(result.issues).to.deep.include({
      path: 'MOFACTS_CHANGE_STREAMS_ENABLED',
      message: 'must be true when Change Streams qualification is enabled',
    });
  });

  it('rejects Meteor driver orders that include oplog', function() {
    const result = inspectMeteor35RuntimeMode({
      ...containedEnv,
      MOFACTS_CHANGE_STREAMS_ENABLED: 'true',
      METEOR_REACTIVITY_ORDER: 'changeStreams,oplog,polling',
    });
    expect(result.mode).to.equal(undefined);
    expect(result.issues.map((issue) => issue.path)).to.include('METEOR_REACTIVITY_ORDER');
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

  it('rejects an invalid Change Streams enablement value', function() {
    const result = inspectMeteor35RuntimeMode({
      ...containedEnv,
      MOFACTS_CHANGE_STREAMS_ENABLED: 'yes',
    });
    expect(result.mode).to.equal(undefined);
    expect(result.issues.map((issue) => issue.path))
      .to.include('MOFACTS_CHANGE_STREAMS_ENABLED');
  });

  it('fails when Meteor does not expose the required server option owner', function() {
    expect(() => applyDdpContainment(undefined, containedEnv))
      .to.throw('Meteor.server.options is unavailable');
  });
});
