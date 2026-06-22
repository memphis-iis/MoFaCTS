import { expect } from 'chai';
import { reconstructLearningStateFromHistory } from './historyReconstruction';

describe('history reconstruction', function() {
  it('replays learning history into deterministic cluster, stimulus, and response aggregates', function() {
    const result = reconstructLearningStateFromHistory([
      {
        time: 3000,
        outcome: 'incorrect',
        stimuliSetId: 'set-a',
        clusterKC: 2000,
        stimulusKC: 'KC-2',
        KCCluster: 2000,
        KCId: 'KC-2',
        CFCorrectAnswer: 'Beta',
        CFEndLatency: 300,
        CFFeedbackLatency: 50,
      },
      {
        time: 1000,
        outcome: 'study',
        stimuliSetId: 'set-a',
        clusterKC: 1000,
        stimulusKC: 'KC-1',
        KCCluster: 1000,
        KCId: 'KC-1',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 200,
        CFFeedbackLatency: 100,
      },
      {
        time: 2000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        clusterKC: 1000,
        stimulusKC: 'KC-1',
        KCCluster: 1000,
        KCId: 'KC-1',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 400,
        CFFeedbackLatency: 100,
        instructionQuestionResult: true,
      },
    ]);

    expect(result.orderedRows.map((row) => row.time)).to.deep.equal([1000, 2000, 3000]);
    expect(result.numQuestionsAnswered).to.equal(2);
    expect(result.numQuestionsAnsweredCurrentSession).to.equal(2);
    expect(result.numCorrectAnswers).to.equal(1);
    expect(result.overallOutcomeHistory).to.deep.equal([1, 0]);
    expect(result.overallStudyHistory).to.deep.equal([1, 0, 0]);

    const cluster1000 = result.clusterState['1000'];
    const cluster2000 = result.clusterState['2000'];
    const stimulusKC1 = result.stimulusState['KC-1'];
    const responseAlpha = result.responseState.Alpha;

    expect(cluster1000).to.not.equal(undefined);
    expect(cluster2000).to.not.equal(undefined);
    expect(stimulusKC1).to.not.equal(undefined);
    expect(responseAlpha).to.not.equal(undefined);

    expect(cluster1000!).to.deep.include({
      firstSeen: 1000,
      lastSeen: 2000,
      priorStudy: 1,
      priorCorrect: 1,
      priorIncorrect: 0,
      allTimeCorrect: 1,
      allTimeIncorrect: 0,
      totalPracticeDuration: 800,
      allTimeTotalPracticeDuration: 800,
      trialsSinceLastSeen: 1,
      hasBeenIntroduced: true,
      otherPracticeTime: 350,
      instructionQuestionResult: true,
    });
    expect(cluster1000!.outcomeStack).to.deep.equal([1]);

    expect(cluster2000!).to.deep.include({
      firstSeen: 3000,
      lastSeen: 3000,
      priorStudy: 0,
      priorCorrect: 0,
      priorIncorrect: 1,
      allTimeCorrect: 0,
      allTimeIncorrect: 1,
      totalPracticeDuration: 350,
      allTimeTotalPracticeDuration: 350,
      trialsSinceLastSeen: 0,
      hasBeenIntroduced: true,
      otherPracticeTime: 0,
    });
    expect(cluster2000!.outcomeStack).to.deep.equal([0]);

    expect(stimulusKC1!).to.deep.include({
      firstSeen: 1000,
      lastSeen: 2000,
      priorStudy: 1,
      priorCorrect: 1,
      priorIncorrect: 0,
      allTimeCorrect: 1,
      allTimeIncorrect: 0,
      curSessionPriorCorrect: 1,
      curSessionPriorIncorrect: 0,
      timesSeen: 2,
      totalPracticeDuration: 800,
      allTimeTotalPracticeDuration: 800,
      hasBeenIntroduced: true,
      otherPracticeTime: 350,
      instructionQuestionResult: true,
    });
    expect(stimulusKC1!.outcomeStack).to.deep.equal([1]);

    expect(responseAlpha!).to.deep.include({
      firstSeen: 1000,
      lastSeen: 2000,
      priorStudy: 1,
      priorCorrect: 1,
      priorIncorrect: 0,
      allTimeCorrect: 1,
      allTimeIncorrect: 0,
      totalPracticeDuration: 800,
      allTimeTotalPracticeDuration: 800,
      instructionQuestionResult: true,
    });
    expect(responseAlpha!.outcomeStack).to.deep.equal([1]);
  });

  it('only counts other-practice time after an item has been introduced', function() {
    const result = reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        clusterKC: 'cluster-a',
        stimulusKC: 'stim-a',
        KCCluster: 'cluster-a',
        KCId: 'stim-a',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 100,
        CFFeedbackLatency: 100,
      },
      {
        time: 2000,
        outcome: 'incorrect',
        stimuliSetId: 'set-a',
        clusterKC: 'cluster-a',
        stimulusKC: 'stim-a',
        KCCluster: 'cluster-a',
        KCId: 'stim-a',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 50,
        CFFeedbackLatency: 50,
      },
      {
        time: 3000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        clusterKC: 'cluster-b',
        stimulusKC: 'stim-b',
        KCCluster: 'cluster-b',
        KCId: 'stim-b',
        CFCorrectAnswer: 'Beta',
        CFEndLatency: 70,
        CFFeedbackLatency: 30,
      },
    ]);

    expect(result.clusterState['cluster-a']?.otherPracticeTime).to.equal(100);
    expect(result.clusterState['cluster-b']?.otherPracticeTime).to.equal(0);
    expect(result.stimulusState['stim-a']?.otherPracticeTime).to.equal(100);
    expect(result.stimulusState['stim-b']?.otherPracticeTime).to.equal(0);
  });

  it('uses explicit stimulus identity for replay state keys', function() {
    const result = reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 100,
        CFFeedbackLatency: 100,
      },
    ]);

    expect(result.clusterState['cluster-a']).to.not.equal(undefined);
    expect(result.stimulusState['stim-a']).to.not.equal(undefined);
  });

  it('replays SPARC model-linked history rows through shared model-practice fields', function() {
    const result = reconstructLearningStateFromHistory([
      {
        eventType: 'sparc',
        levelUnitType: 'model',
        time: 1000,
        problemStartTime: 500,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        KCId: 'stim-a',
        KCDefault: 'stim-a',
        KCCluster: 'cluster-a',
        responseKey: 'Alpha',
        responseDuration: 375,
        responseValue: 'Alpha',
        sparc: {
          documentId: 'doc-1',
          practiceObservation: {
            observationId: 'obs-1',
            sourceAddress: {
              documentId: 'doc-1',
              nodeId: 'widget-1',
            },
            time: 1000,
            problemStartTime: 500,
            outcome: 'correct',
            responseValue: 'Alpha',
          },
        },
      },
    ]);

    expect(result.numQuestionsAnswered).to.equal(1);
    expect(result.numCorrectAnswers).to.equal(1);
    expect(result.overallOutcomeHistory).to.deep.equal([1]);
    expect(result.clusterState['cluster-a']?.priorCorrect).to.equal(1);
    expect(result.clusterState['cluster-a']?.totalPracticeDuration).to.equal(375);
    expect(result.stimulusState['stim-a']?.timesSeen).to.equal(1);
    expect(result.responseState.Alpha?.priorCorrect).to.equal(1);
    expect(result.responseState.Alpha?.totalPracticeDuration).to.equal(375);
  });

  it('replays response-less SPARC model-practice rows when explicitly enabled', function() {
    const result = reconstructLearningStateFromHistory([
      {
        eventType: 'sparc',
        levelUnitType: 'model',
        time: 1000,
        problemStartTime: 500,
        outcome: 'correct',
        stimulusKC: 'fractions.lcd',
        clusterKC: 'fractions.addition',
        KCId: 'fractions.lcd',
        KCDefault: 'fractions.lcd',
        KCCluster: 'fractions.addition',
        responseValue: '12',
        sparc: {
          documentId: 'sparc-fractions-addition',
          practiceObservation: {
            observationId: 'obs-1',
          },
        },
      },
    ], { allowResponseLessModelPractice: true });

    expect(result.numQuestionsAnswered).to.equal(1);
    expect(result.numCorrectAnswers).to.equal(1);
    expect(result.overallOutcomeHistory).to.deep.equal([1]);
    expect(result.clusterState['fractions.addition']?.priorCorrect).to.equal(1);
    expect(result.clusterState['fractions.addition']?.totalPracticeDuration).to.equal(0);
    expect(result.stimulusState['fractions.lcd']?.timesSeen).to.equal(1);
    expect(result.stimulusState['fractions.lcd']?.totalPracticeDuration).to.equal(0);
    expect(result.responseState).to.deep.equal({});
  });

  it('normalizes semantic cluster identity while reconstructing shared progress', function() {
    const result = reconstructLearningStateFromHistory([
      {
        eventType: '',
        levelUnitType: 'model',
        time: 1000,
        problemStartTime: 500,
        outcome: 'correct',
        stimulusKC: 'stim-a',
        clusterKC: ' Fractions.LCD ',
        KCId: 'stim-a',
        KCDefault: 'stim-a',
        KCCluster: 'fractions.lcd',
        responseKey: 'Alpha',
        responseDuration: 375,
      },
    ]);

    expect(result.clusterState['fractions.lcd']?.priorCorrect).to.equal(1);
    expect(result.clusterState[' Fractions.LCD ']).to.equal(undefined);
  });

  it('still rejects response-less SPARC model-practice rows by default', function() {
    expect(() => reconstructLearningStateFromHistory([
      {
        eventType: 'sparc',
        levelUnitType: 'model',
        time: 1000,
        outcome: 'correct',
        stimulusKC: 'fractions.lcd',
        clusterKC: 'fractions.addition',
        responseDuration: 375,
      },
    ])).to.throw('responseKey or CFCorrectAnswer');
  });

  it('rejects mismatched explicit identity aliases', function() {
    expect(() => reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        KCCluster: 'cluster-a',
        KCId: 'cluster-a',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 100,
        CFFeedbackLatency: 100,
      },
    ])).to.throw('KCId must equal stimulusKC');
  });

  it('rejects alias-only identity rows instead of reconstructing with hidden compatibility', function() {
    expect(() => reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        KCCluster: 'cluster-a',
        KCId: 'stim-a',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 100,
        CFFeedbackLatency: 100,
      },
    ])).to.throw('Missing required field clusterKC');
  });

  it('rejects mismatched shared and legacy response keys', function() {
    expect(() => reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        CFCorrectAnswer: 'Alpha',
        responseKey: 'Beta',
        responseDuration: 100,
      },
    ])).to.throw('responseKey must equal CFCorrectAnswer');
  });

  it('rejects mismatched shared duration fields', function() {
    expect(() => reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        stimulusKC: 'stim-a',
        clusterKC: 'cluster-a',
        responseKey: 'Alpha',
        responseDuration: 100,
        practiceDurationMs: 101,
      },
    ])).to.throw('practiceDurationMs must equal responseDuration');
  });

  it('fails closed when required replay fields are missing', function() {
    expect(() => reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        clusterKC: 1000,
        stimulusKC: 'KC-1',
      },
    ])).to.throw('CFCorrectAnswer');
  });

  it('does not append test trials to overallStudyHistory', function() {
    const result = reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        stimuliSetId: 'set-a',
        clusterKC: 1000,
        stimulusKC: 'KC-1',
        KCCluster: 1000,
        KCId: 'KC-1',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 0,
        CFFeedbackLatency: -1,
      },
    ]);

    expect(result.overallOutcomeHistory).to.deep.equal([1]);
    expect(result.overallStudyHistory).to.deep.equal([]);
  });
});
