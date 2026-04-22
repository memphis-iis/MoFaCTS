import { expect } from 'chai';
import { reconstructLearningStateFromHistory } from './historyReconstruction';

describe('history reconstruction', function() {
  it('replays learning history into deterministic cluster, stimulus, and response aggregates', function() {
    const result = reconstructLearningStateFromHistory([
      {
        time: 3000,
        outcome: 'incorrect',
        KCCluster: 2000,
        KCId: 'KC-2',
        CFCorrectAnswer: 'Beta',
        CFEndLatency: 300,
        CFFeedbackLatency: 50,
      },
      {
        time: 1000,
        outcome: 'study',
        KCCluster: 1000,
        KCId: 'KC-1',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 200,
        CFFeedbackLatency: 100,
      },
      {
        time: 2000,
        outcome: 'correct',
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
        KCCluster: 'cluster-a',
        KCId: 'stim-a',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 100,
        CFFeedbackLatency: 100,
      },
      {
        time: 2000,
        outcome: 'incorrect',
        KCCluster: 'cluster-a',
        KCId: 'stim-a',
        CFCorrectAnswer: 'Alpha',
        CFEndLatency: 50,
        CFFeedbackLatency: 50,
      },
      {
        time: 3000,
        outcome: 'correct',
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

  it('fails closed when required replay fields are missing', function() {
    expect(() => reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
        KCCluster: 1000,
        KCId: 'KC-1',
      },
    ])).to.throw('CFCorrectAnswer');
  });

  it('does not append test trials to overallStudyHistory', function() {
    const result = reconstructLearningStateFromHistory([
      {
        time: 1000,
        outcome: 'correct',
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
