import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { projectSparcAutoTutorInstructionalFacts, sparcAssessmentClusterKcs } from './sparcInstructionalControl';
import { progressiveDialogueFacts } from './sparcWorkingMemoryFacts';
import { replaySparcHistory } from './sparcStateReplay';
import { createSparcStateTransitionHistoryRecord } from './sparcStateTransitionHistory';
import type { SparcInstructionalControllerConfig, SparcWorkingMemoryFact } from './sparcSessionContracts';

const config: SparcInstructionalControllerConfig = {
  adapterId: 'sparc-autotutor-v1',
  policyId: 'progressive-scaffolding-v1',
  policyVersion: 1,
  parameters: { minimumProgress: 0.2 },
};

function fact(factType: string, slots: Record<string, unknown>): SparcWorkingMemoryFact {
  return { factType, slots };
}

function authoredFacts(extra: readonly SparcWorkingMemoryFact[] = []): SparcWorkingMemoryFact[] {
  return [
    fact('dialogue.thresholds', { coverageThreshold: 0.8, misconceptionThreshold: 0.2 }),
    fact('autotutor.expectation', { clusterKC: 'kc-a' }),
    fact('kcGraph.node', { clusterKC: 'kc-a', centrality: 0.5 }),
    ...extra,
  ];
}

function graphSelectionFacts(anchor: 'a' | 'd'): SparcWorkingMemoryFact[] {
  const ids = ['a', 'b', 'c', 'd'];
  const strengths: Readonly<Record<string, number>> = { ab: .9, ac: .1, ad: .2, bc: .3, bd: .1, cd: .9 };
  const strength = (a: string, b: string) => strengths[[a, b].sort().join('')]!;
  return [
    ...ids.map(id => fact('autotutor.expectation', { clusterKC: `kc-${id}` })),
    ...ids.map(id => fact('learningTarget.score', { clusterKC: `kc-${id}`, coverage: id === 'a' || id === 'd' ? .8 : .2 })),
    ...ids.map(id => fact('kcGraph.node', { clusterKC: `kc-${id}`, centrality: ids.filter(other => other !== id).reduce((sum, other) => sum + strength(id, other), 0) / 3 })),
    ...ids.flatMap(source => ids.filter(target => source !== target).map(target => fact('kcGraph.relationship', {
      sourceClusterKC: `kc-${source}`, targetClusterKC: `kc-${target}`, strength: strength(source, target),
    }))),
    fact('instructional.activeCycle', { cycleId: `cycle-${anchor}`, targetKind: 'expectation', targetId: `kc-${anchor}`,
      targetKey: `expectation:kc-${anchor}`, priorValue: .2, status: 'active' }),
  ];
}

describe('SPARC AutoTutor instructional projection', function() {
  it('assesses the current KC and strongest neighbors regardless of mastery', () => {
    assert.deepEqual([...sparcAssessmentClusterKcs(graphSelectionFacts('a'), 3)], ['kc-a', 'kc-b', 'kc-d']);
    assert.deepEqual([...sparcAssessmentClusterKcs(graphSelectionFacts('d'), 3)], ['kc-d', 'kc-c', 'kc-a']);
    const missing = graphSelectionFacts('a').filter(f => f.factType !== 'kcGraph.relationship');
    assert.throws(() => sparcAssessmentClusterKcs(missing, 3), /missing the KC relationship/);
  });
  it('uses the first uncovered chain KC regardless of centrality, need, anchor, or startup weights', function() {
    const facts = graphSelectionFacts('d');
    facts.push(fact('controller.targetSelectionPolicy', { startingKC: 'kc-a' }),
      fact('kcGraph.chain', { startingKC: 'kc-a', order: ['kc-a', 'kc-b', 'kc-c', 'kc-d'] }),
      fact('learningTarget.score', { clusterKC: 'kc-b', coverage: 0 }),
      fact('learningTarget.score', { clusterKC: 'kc-c', coverage: .79 }));
    const project = (source: readonly SparcWorkingMemoryFact[]) => projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'chain', config, facts: source, candidateOptions: { weights: { centralityWeight: 100 }, anchorClusterKC: 'kc-d' },
    });
    const result = project(facts);
    assert.equal(result.candidates.maximumExpectation?.targetId, 'kc-b');
    assert.equal(result.candidates.maximumExpectation?.structuralPriorityScore, undefined);
    const mastered = [...facts, fact('learningTarget.score', { clusterKC: 'kc-b', coverage: .8 })];
    assert.equal(project(JSON.parse(JSON.stringify(mastered))).candidates.maximumExpectation?.targetId, 'kc-c');
    const completed = [...mastered, fact('learningTarget.score', { clusterKC: 'kc-c', coverage: .8 })];
    assert.equal(project(completed).candidates.maximumExpectation, undefined);
    assert.throws(() => project(facts.filter(f => f.factType !== 'kcGraph.chain')), /one generated KC chain/);
    assert.throws(() => project([...facts.filter(f => f.factType !== 'controller.targetSelectionPolicy'),
      fact('controller.targetSelectionPolicy', { policy: 'kc-chain' })]), /startingKC on the unit/);
    assert.throws(() => project([...facts.filter(f => f.factType !== 'kcGraph.chain'),
      fact('kcGraph.chain', { startingKC: 'kc-a', order: ['kc-a', 'kc-b', 'kc-b', 'kc-d'] })]), /exactly once/);
  });

  it('retains misconception eligibility and an unfinished cycle while chain ranks remain stable', function() {
    const facts = graphSelectionFacts('d').filter(f => f.factType !== 'instructional.activeCycle');
    facts.push(fact('controller.targetSelectionPolicy', { startingKC: 'kc-a' }),
      fact('kcGraph.chain', { startingKC: 'kc-a', order: ['kc-a', 'kc-c', 'kc-b', 'kc-d'] }),
      fact('autotutor.misconception', { id: 'm' }), fact('diagnostic.misconceptionScore', { id: 'm', supportStrength: .8 }),
      fact('instructional.activeCycle', { cycleId: 'b', targetKind: 'expectation', targetId: 'kc-b', targetKey: 'expectation:kc-b', priorValue: .1, status: 'active' }));
    const result = projectSparcAutoTutorInstructionalFacts({ snapshotId: 'chain-resume', config, facts });
    assert.equal(result.candidates.maximumMisconception?.targetId, 'm');
    assert.equal(result.candidates.maximumExpectation?.targetId, 'kc-c');
    assert.equal(result.facts.find(f => f.factType === 'instructional.cycleStatus')?.slots?.continuable, true);
  });

  it('anchors the next target to the preceding KC without an injected candidate option', function() {
    for (const anchor of ['a', 'd'] as const) {
      const result = projectSparcAutoTutorInstructionalFacts({ snapshotId: `after-${anchor}`, config, facts: graphSelectionFacts(anchor) });
      assert.equal(result.candidates.maximumExpectation?.targetId, anchor === 'a' ? 'kc-b' : 'kc-c');
      assert.ok(result.candidates.expectations.every(candidate => candidate.anchorClusterKC === `kc-${anchor}`));
      assert.equal(result.candidates.expectations.find(candidate => candidate.targetId === (anchor === 'a' ? 'kc-b' : 'kc-c'))?.coherenceToAnchor, .9);
      assert.equal(result.facts.find(entry => entry.factType === 'instructional.cycleStatus')?.slots?.continuable, false);
    }
  });

  it('retains the last KC through a misconception cycle using saved tutor instruction', function() {
    const facts = graphSelectionFacts('a').filter(entry => entry.factType !== 'instructional.activeCycle');
    facts.push(
      fact('dialogue.utterance', { speaker: 'tutor', targetType: 'learningTarget', targetId: 'kc-a', text: 'Earlier question.' }),
      fact('dialogue.utterance', { speaker: 'tutor', targetType: 'learningTarget', targetId: 'kc-d', text: 'Most recent KC question.' }),
      fact('dialogue.utterance', { speaker: 'learner', targetType: 'learningTarget', targetId: 'kc-a', text: 'Learner content cannot change the anchor.' }),
      fact('dialogue.utterance', { speaker: 'tutor', targetType: 'feedback', targetId: 'kc-a', text: 'Feedback is not a new KC.' }),
      fact('dialogue.utterance', { speaker: 'tutor', targetType: 'misconception', targetId: 'm1', text: 'Repair this misconception.' }),
      fact('autotutor.misconception', { id: 'm1' }),
      fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: .1 }),
      fact('instructional.activeCycle', { cycleId: 'cycle-m1', targetKind: 'misconception', targetId: 'm1', targetKey: 'misconception:m1', priorValue: .8, status: 'active' }),
    );
    const result = projectSparcAutoTutorInstructionalFacts({ snapshotId: 'after-misconception', config, facts });
    assert.equal(result.candidates.maximumExpectation?.targetId, 'kc-c');
    assert.ok(result.candidates.expectations.every(candidate => candidate.anchorClusterKC === 'kc-d'));
  });

  it('uses the current cycle over older tutor output and preserves an explicit caller anchor', function() {
    const facts = [...graphSelectionFacts('d'), fact('dialogue.utterance', { speaker: 'tutor', targetType: 'learningTarget', targetId: 'kc-a', text: 'Older question.' })];
    const current = projectSparcAutoTutorInstructionalFacts({ snapshotId: 'current-cycle', config, facts });
    assert.equal(current.candidates.maximumExpectation?.targetId, 'kc-c');
    const explicit = projectSparcAutoTutorInstructionalFacts({ snapshotId: 'explicit-anchor', config, facts, candidateOptions: { anchorClusterKC: 'kc-a' } });
    assert.equal(explicit.candidates.maximumExpectation?.targetId, 'kc-b');
  });

  it('reconstructs the preceding KC from serialized question history without a saved focus field', function() {
    const question = createSparcStateTransitionHistoryRecord({
      core: { TDFId: 'anchor-lesson', userId: 'u', sessionID: 'anchor-session', levelUnit: 0 },
      transition: { transitionId: 'prior:primitive:question',
        event: { eventId: 'prior', type: 'document-loaded', time: 1, source: { pageKey: 'anchor-page', nodeId: 'root' } },
        writes: [{ target: { pageKey: 'anchor-page', nodeId: 'root' }, key: 'progressive-node-operation',
          value: { type: 'append-node', boxId: 'dialogue-flow', node: { id: 'prior:question', nodeType: 'atomic', atomType: 'dialogue-utterance',
            speaker: 'tutor', value: 'Recognize D.', targetType: 'learningTarget', targetId: 'kc-d', component: 'question', turnEventId: 'prior' } } }],
      },
    });
    const replay = replaySparcHistory(JSON.parse(JSON.stringify([question])));
    const facts = [...graphSelectionFacts('a').filter(entry => entry.factType !== 'instructional.activeCycle'), ...progressiveDialogueFacts(replay)];
    const result = projectSparcAutoTutorInstructionalFacts({ snapshotId: 'resumed', config, facts });
    assert.equal(result.candidates.maximumExpectation?.targetId, 'kc-c');
    assert.ok(result.candidates.expectations.every(candidate => candidate.anchorClusterKC === 'kc-d'));
  });

  it('does not choose a target when no cycle exists', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-1',
      config,
      facts: authoredFacts([fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.2 })]),
    });
    assert.equal(result.facts.some((entry) => entry.factType === 'instructional.activeCycle'), false);
    assert.equal(result.facts.find((entry) => entry.factType === 'instructional.cycleStatus')?.slots?.continuable, false);
    assert.ok(result.candidates.expectations.every(candidate => candidate.anchorClusterKC === undefined && candidate.coherenceToAnchor === 0 && candidate.frontierScore === 0));
  });

  it('derives meaningful expectation gain from the canonical cycle prior value', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-2',
      config,
      facts: authoredFacts([
        fact('instructional.activeCycle', {
          cycleId: 'cycle-a', targetKind: 'expectation', targetId: 'kc-a', targetKey: 'expectation:kc-a',
          stage: 'PUMP', priorValue: 0.2, startedAtTurn: 1, cycleTurnCount: 0, status: 'active',
        }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
      ]),
    });
    const progress = result.facts.find((entry) => entry.factType === 'instructional.progress');
    assert.equal(progress?.slots?.gain, 0.2);
    assert.equal(progress?.slots?.meaningfulGain, true);
    assert.equal(progress?.slots?.goalReached, false);
  });

  it('normalizes misconception repair gain in the improving direction', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-3',
      config,
      facts: authoredFacts([
        fact('autotutor.misconception', { id: 'm1' }),
        fact('instructional.activeCycle', {
          cycleId: 'cycle-m1', targetKind: 'misconception', targetId: 'm1', targetKey: 'misconception:m1',
          stage: 'PROMPT', priorValue: 0.8, startedAtTurn: 1, cycleTurnCount: 0, status: 'active',
        }),
        fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.6 }),
      ]),
    });
    const progress = result.facts.find((entry) => entry.factType === 'instructional.progress');
    assert.equal(progress?.slots?.gain, 0.2);
    assert.equal(progress?.slots?.meaningfulGain, true);
  });

  it('releases a misconception below its repair criterion', function() {
    const result = projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-4',
      config,
      facts: authoredFacts([
        fact('autotutor.misconception', { id: 'm1' }),
        fact('instructional.activeCycle', {
          cycleId: 'cycle-m1', targetKind: 'misconception', targetId: 'm1', targetKey: 'misconception:m1',
          stage: 'PROMPT', priorValue: 0.21, startedAtTurn: 1, cycleTurnCount: 1, status: 'active',
        }),
        fact('diagnostic.misconceptionScore', { id: 'm1', supportStrength: 0.19 }),
      ]),
    });
    assert.equal(result.facts.find((entry) => entry.factType === 'instructional.progress')?.slots?.goalReached, true);
    assert.equal(result.facts.find((entry) => entry.factType === 'instructional.cycleStatus')?.slots?.continuable, false);
  });

  it('rejects unsupported pre-canonical state without reinterpreting it', function() {
    assert.throws(() => projectSparcAutoTutorInstructionalFacts({
      snapshotId: 'snapshot-5',
      config,
      facts: authoredFacts([
        fact('instructionalTarget.active', {
          targetKind: 'expectation', targetId: 'kc-a', targetKey: 'expectation:kc-a', currentProgress: 0.2, status: 'active',
        }),
        fact('instructionalFocus.episode', {
          focusEpisodeId: 'legacy-cycle', targetKey: 'expectation:kc-a', startedAtTurn: 1, status: 'active',
        }),
        fact('scaffold.state', { focusEpisodeId: 'legacy-cycle', stage: 'PUMP' }),
        fact('learningTarget.score', { clusterKC: 'kc-a', coverage: 0.4 }),
      ]),
    }), /Pre-canonical SPARC instructional state is unsupported/);
  });
});
