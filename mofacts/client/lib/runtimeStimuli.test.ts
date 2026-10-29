import { expect } from 'chai';
import sinon from 'sinon';
import { Session } from 'meteor/session';
import { Tracker } from 'meteor/tracker';
import { clearRuntimeStimulusCache, getStimCluster, getStimCount } from './runtimeStimuli';

const sessionKeys = ['currentTdfFile', 'currentTdfDoc', 'currentTdfId', 'currentStimuliSet', 'currentStimuliSetId', 'clusterMapping'] as const;

function authoredCluster(id: string) {
  return { clusterKC: id, stims: [{ stimulusKC: `${id}.item`, response: { correctResponse: id } }] };
}

function lesson(clusters: unknown[]) {
  return { stimuliSetId: 'synthetic-set', rawStimuliFile: { setspec: { clusters } } };
}

describe('mapped runtime stimulus retrieval', function() {
  let previous: Record<string, unknown>;
  beforeEach(function() {
    clearRuntimeStimulusCache();
    previous = Object.fromEntries(sessionKeys.map(key => [key, Session.get(key)]));
    Session.set('currentTdfFile', lesson([authoredCluster('first'), authoredCluster('second')]));
    Session.set('currentTdfDoc', null);
    Session.set('currentTdfId', 'synthetic-lesson');
    Session.set('currentStimuliSet', []);
    Session.set('currentStimuliSetId', 'synthetic-set');
    Session.set('clusterMapping', [1, 0]);
  });
  afterEach(function() {
    clearRuntimeStimulusCache();
    sinon.restore();
    for (const key of sessionKeys) Session.set(key, previous[key]);
  });

  it('retrieves the authored cluster and item identity selected by a shuffled mapping', function() {
    const cluster = getStimCluster(0);
    expect(cluster).to.deep.include({ shufIndex: 0, clusterIndex: 1, clusterKC: 'second' });
    expect(cluster.stims[0]).to.include({ stimulusKC: 'second.item', clusterKC: 'second', correctResponse: 'second' });
    expect(getStimCluster(1)).to.deep.include({ shufIndex: 1, clusterIndex: 0, clusterKC: 'first' });
    expect(Session.get('clusterMapping')).to.deep.equal([1, 0]);
  });

  it('rejects missing and malformed mapping records without generating replacement content or mapping', function() {
    for (const mapping of [null, '', {}, []]) {
      Session.set('clusterMapping', mapping);
      expect(() => getStimCluster(0)).to.throw('requires an initialized cluster mapping');
      expect(Session.get('clusterMapping')).to.deep.equal(mapping);
    }
    for (const mapping of [[0, 0], [0], [0, 2], [0, -1], [0, 1.5], [0, '1']]) {
      Session.set('clusterMapping', mapping);
      expect(() => getStimCluster(0)).to.throw('Invalid cluster mapping');
      expect(Session.get('clusterMapping')).to.deep.equal(mapping);
    }
  });

  it('rejects invalid requested indexes instead of retrieving another cluster', function() {
    for (const index of [-1, 2, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '0']) {
      expect(() => getStimCluster(index as number)).to.throw('Requested shuffled cluster index');
    }
  });

  it('rejects a missing authored cluster even when the permutation has the expected length', function() {
    const sparseClusters = new Array<unknown>(2);
    sparseClusters[0] = authoredCluster('first');
    const readSession = Session.get.bind(Session);
    sinon.stub(Session, 'get').callsFake((key: string) => key === 'currentTdfFile' ? lesson(sparseClusters) : readSession(key));
    expect(() => getStimCluster(0)).to.throw('references a missing raw stimulus cluster');
  });

  it('preserves a real authored empty cluster and an empty deck count', function() {
    Session.set('currentTdfFile', lesson([{ clusterKC: 'empty-authored-cluster', stims: [] }]));
    Session.set('clusterMapping', [0]);
    expect(getStimCluster()).to.deep.equal({ shufIndex: 0, clusterIndex: 0, clusterKC: 'empty-authored-cluster', stims: [] });
    Session.set('currentTdfFile', lesson([]));
    Session.set('clusterMapping', []);
    expect(getStimCount()).to.equal(0);
    expect(() => getStimCluster()).to.throw('requires an initialized cluster mapping');
  });

  it('interprets and validates once across base and adaptive engine style cluster traversals', function() {
    const count = 80;
    Session.set('currentTdfFile', lesson(Array.from({ length: count }, (_, index) => authoredCluster(`cluster-${index}`))));
    Session.set('clusterMapping', Array.from({ length: count }, (_, index) => count - index - 1));
    const readSession = Session.get.bind(Session);
    let interpretations = 0;
    let mappingEntryReads = 0;
    sinon.stub(Session, 'get').callsFake((key: string) => {
      const value = readSession(key);
      if (key === 'currentTdfFile') {
        value.rawStimuliFile.setspec.clusters = new Proxy(value.rawStimuliFile.setspec.clusters, {
          get(target, property, receiver) {
            if (property === 'map') interpretations += 1;
            return Reflect.get(target, property, receiver);
          },
        });
      }
      if (key === 'clusterMapping' && Array.isArray(value)) {
        return new Proxy(value, {
          get(target, property, receiver) {
            if (typeof property === 'string' && /^\d+$/.test(property)) mappingEntryReads += 1;
            return Reflect.get(target, property, receiver);
          },
        });
      }
      return value;
    });

    expect(getStimCount()).to.equal(count);
    for (let index = 0; index < count; index += 1) {
      expect(getStimCluster(index).clusterKC).to.equal(`cluster-${count - index - 1}`);
    }
    const adaptiveClusters = [];
    const adaptiveClusterCount = getStimCount();
    for (let index = 0; index < adaptiveClusterCount; index += 1) {
      adaptiveClusters.push(getStimCluster(index));
    }
    expect(adaptiveClusters).to.have.length(count);

    expect(interpretations).to.equal(1);
    // One complete permutation validation plus one mapped entry per lookup in
    // each engine traversal; no deck-sized work is repeated per cluster.
    expect(mappingEntryReads).to.equal(count * 3);
    Session.set('clusterMapping', Array.from({ length: count }, (_, index) => index));
    expect(getStimCluster(0).clusterKC).to.equal('cluster-0');
    expect(interpretations).to.equal(1);
    expect(mappingEntryReads).to.equal(count * 4 + 1);
    Session.set('currentTdfFile', lesson(Array.from({ length: count }, (_, index) => authoredCluster(`updated-${index}`))));
    expect(getStimCluster(0).clusterKC).to.equal('updated-0');
    expect(interpretations).to.equal(2);
    expect(mappingEntryReads).to.equal(count * 5 + 2);
  });

  it('evicts replaced source and mapping snapshots immediately before Tracker flush', function() {
    expect(getStimCluster(0).clusterKC).to.equal('second');
    Session.set('clusterMapping', [0, 1]);
    expect(getStimCluster(0).clusterKC).to.equal('first');

    Session.set('currentTdfFile', lesson([authoredCluster('replacement'), authoredCluster('second')]));
    expect(getStimCluster(0).clusterKC).to.equal('replacement');
    Session.set('currentStimuliSet', [{ customRuntimeValue: 'replaced' }]);
    expect(getStimCluster(0).stims[0]).to.include({ customRuntimeValue: 'replaced' });

    Session.set('clusterMapping', [0, 0]);
    expect(() => getStimCluster(0)).to.throw('Invalid cluster mapping');
    Session.set('clusterMapping', [1, 0]);
    expect(getStimCluster(0).clusterKC).to.equal('second');
    Session.set('currentTdfFile', {});
    expect(() => getStimCount()).to.throw('missing rawStimuliFile.setspec.clusters');
    Session.set('currentTdfFile', lesson([authoredCluster('repaired'), authoredCluster('second')]));
    expect(getStimCluster(1).clusterKC).to.equal('repaired');
  });

  it('isolates returned cluster and nested item mutations from later reads and source data', function() {
    Session.set('currentTdfFile', lesson([{
      clusterKC: 'one', stims: [{
        stimulusKC: 'item', response: { correctResponse: 'answer', incorrectResponses: ['other'] },
        display: { text: 'authored prompt' }, alternateDisplays: [{ text: 'alternate' }],
      }],
    }]));
    Session.set('clusterMapping', [0]);
    const returned = getStimCluster(0);
    returned.clusterKC = 'mutated';
    returned.stims[0]!.display.text = 'mutated prompt';
    returned.stims[0]!.incorrectResponses.push('mutated response');
    returned.stims[0]!.alternateDisplays[0].text = 'mutated alternate';
    returned.stims.push({ stimulusKC: 'extra' });

    const later = getStimCluster(0);
    expect(later.clusterKC).to.equal('one');
    expect(later.stims).to.have.length(1);
    expect(later.stims[0]!.display.text).to.equal('authored prompt');
    expect(later.stims[0]!.incorrectResponses).to.deep.equal(['other']);
    expect(later.stims[0]!.alternateDisplays[0].text).to.equal('alternate');
    expect(Session.get('currentTdfFile').rawStimuliFile.setspec.clusters[0].stims[0].display.text).to.equal('authored prompt');
    const detachedMapping = Session.get('clusterMapping');
    detachedMapping[0] = 100;
    expect(getStimCluster(0).clusterKC).to.equal('one');
  });

  it('discards failed interpretation and validation snapshots instead of reusing failed reads', function() {
    const readSession = sinon.spy(Session, 'get');
    Session.set('currentTdfFile', lesson([{ clusterKC: 'broken-cluster' }]));
    expect(() => getStimCount()).to.throw('missing stims');
    expect(() => getStimCount()).to.throw('missing stims');
    expect(readSession.getCalls().filter(call => call.args[0] === 'currentTdfFile')).to.have.length(2);

    Session.set('currentTdfFile', lesson([authoredCluster('first'), authoredCluster('second')]));
    Session.set('clusterMapping', [0, 0]);
    expect(() => getStimCluster(0)).to.throw('Invalid cluster mapping');
    expect(() => getStimCluster(0)).to.throw('Invalid cluster mapping');
    expect(readSession.getCalls().filter(call => call.args[0] === 'currentTdfFile')).to.have.length(4);
    expect(readSession.getCalls().filter(call => call.args[0] === 'clusterMapping')).to.have.length(2);
  });

  it('keeps its owner independent of a caller computation and preserves caller reactivity', function() {
    const readSession = sinon.spy(Session, 'get');
    const computation = Tracker.autorun(() => { getStimCount(); });
    computation.stop();
    expect(getStimCount()).to.equal(2);
    expect(readSession.getCalls().filter(call => call.args[0] === 'currentTdfFile')).to.have.length(1);

    let renders = 0;
    const listener = Tracker.autorun(() => { getStimCount(); renders += 1; });
    Session.set('currentTdfFile', lesson([authoredCluster('new')]));
    expect(listener.invalidated).to.equal(true);
    expect(getStimCount()).to.equal(1);
    Tracker.flush();
    expect(renders).to.equal(2);
    listener.stop();
  });

  it('releases launch-owned snapshots on explicit cleanup even when source values are unchanged', function() {
    const readSession = sinon.spy(Session, 'get');
    expect(getStimCluster(0).clusterKC).to.equal('second');
    clearRuntimeStimulusCache();
    expect(getStimCluster(0).clusterKC).to.equal('second');
    expect(readSession.getCalls().filter(call => call.args[0] === 'currentTdfFile')).to.have.length(2);
    expect(readSession.getCalls().filter(call => call.args[0] === 'clusterMapping')).to.have.length(2);
  });
});
