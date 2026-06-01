import { expect } from 'chai';
import {
  buildAdaptiveOutcomes,
  evaluateAdaptiveRule,
  getAdaptiveScheduleQuestions,
} from '../../learning-components/units/shared/adaptiveRuleEvaluation';

describe('adaptive rule evaluation', function() {
  it('evaluates adaptive conditions and schedules component-owned question actions', function() {
    const result = evaluateAdaptiveRule(
      'IF C2S0 AND true THEN AT 12 CHECKPOINT (C3S1,C4S2)',
      { '2:0': true },
    );

    expect(result).to.deep.equal({
      condition: 'C2S0 AND true',
      conditionExpression: 'true&&true',
      actions: '12  (C3S1,C4S2)',
      conditionResult: true,
      questions: [3, 4],
      schedule: [
        { clusterIndex: 3, stimIndex: 1, isCheckpoint: true },
        { clusterIndex: 4, stimIndex: 2, isCheckpoint: true },
      ],
      when: 12,
      checkpoints: [
        { clusterIndex: 3, stimIndex: 1, time: 12 },
        { clusterIndex: 4, stimIndex: 2, time: 12 },
      ],
    });
  });

  it('returns a false condition without scheduling actions', function() {
    const result = evaluateAdaptiveRule('IF C2S0 THEN C3S1', { '2:0': false });

    expect(result).to.deep.equal({
      condition: 'C2S0',
      conditionExpression: 'false',
      actions: 'C3S1',
      conditionResult: false,
    });
  });

  it('fails clearly for invalid adaptive tokens and schedule items', function() {
    expect(() => evaluateAdaptiveRule('IF C2S0 THEN nope', { '2:0': true }))
      .to.throw('Invalid action: nope');
    expect(() => evaluateAdaptiveRule('IF bad THEN C3S1', {}))
      .to.throw('Invalid token: bad');
    expect(() => getAdaptiveScheduleQuestions([{ clusterIndex: 'bad' }]))
      .to.throw('Adaptive rule produced a scheduled question without a valid clusterIndex');
  });

  it('normalizes adaptive history rows and fills unseen stimuli defaults', function() {
    expect(buildAdaptiveOutcomes({
      rows: [
        { stimulusKC: 20001, outcome: 'correct' },
        { stimulusKC: 20003, outcome: 'incorrect' },
      ],
      currentStimuliSet: [
        { clusterKC: 10002, stimulusKC: 20001 },
        { clusterKC: 10002, stimulusKC: 20002 },
        { clusterKC: 10003, stimulusKC: 20003 },
        { clusterKC: 10004, stimulusKC: 20004 },
        { clusterKC: 'bad' },
      ],
      kcMultiple: 10000,
    })).to.deep.equal({
      '2:0': true,
      '2:1': false,
      '3:0': false,
      '4:0': false,
    });
  });

  it('keeps condition-side stimulus slots distinct within the same cluster', function() {
    const adaptiveOutcomes = buildAdaptiveOutcomes({
      rows: [
        { stimulusKC: 'stim-a', outcome: 'correct' },
        { stimulusKC: 'stim-b', outcome: 'incorrect' },
      ],
      currentStimuliSet: [
        { clusterKC: 10002, stimulusKC: 'stim-a' },
        { clusterKC: 10002, stimulusKC: 'stim-b' },
      ],
      kcMultiple: 10000,
    });

    expect(evaluateAdaptiveRule('IF C2S0 THEN C3S1', adaptiveOutcomes).conditionResult).to.equal(true);
    expect(evaluateAdaptiveRule('IF C2S1 THEN C3S1', adaptiveOutcomes).conditionResult).to.equal(false);
  });
});
