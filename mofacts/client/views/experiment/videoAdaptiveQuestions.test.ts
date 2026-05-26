import { expect } from 'chai';
import {
  type AdaptiveVideoUnit,
  appendAdaptiveVideoCheckpoints,
  appendAdaptiveVideoQuestions,
  applyAdaptiveVideoTemplateSchedule,
  requireAdaptiveVideoSession,
} from './videoAdaptiveQuestions';

describe('video adaptive questions', function() {
  it('requires a video-session target for adaptive unit mutation', function() {
    expect(() => requireAdaptiveVideoSession(null)).to.throw(/target unit is missing/);
    expect(() => requireAdaptiveVideoSession({ unitname: 'card unit' })).to.throw(/has no videosession/);
    expect(requireAdaptiveVideoSession({ videosession: { questions: [] } })).to.deep.equal({ questions: [] });
  });

  it('appends adaptive questions with the rule time', function() {
    const videoSession = {};

    appendAdaptiveVideoQuestions(videoSession, [3, '4'], '12.5', 'IF true THEN AT 12.5 C3');

    expect(videoSession).to.deep.equal({
      questions: [3, 4],
      questiontimes: [12.5, 12.5],
    });
  });

  it('fails clearly when adaptive question inserts are malformed', function() {
    expect(() => appendAdaptiveVideoQuestions({}, [1], undefined, 'rule')).to.throw(/without a valid AT time/);
    expect(() => appendAdaptiveVideoQuestions({}, ['bad'], 10, 'rule')).to.throw(/invalid question index/);
  });

  it('deduplicates and sorts adaptive checkpoint times', function() {
    const videoSession = {
      checkpointBehavior: 'adaptive',
      checkpoints: [{ time: 30 }],
    };

    appendAdaptiveVideoCheckpoints(videoSession, [{ time: '10' }, { time: 30 }]);

    expect(videoSession.checkpoints).to.deep.equal([
      { time: 10 },
      { time: 30 },
    ]);
  });

  it('applies adaptive template schedule through the video-session owner', function() {
    const unit: AdaptiveVideoUnit = {
      videosession: {
        questions: [],
        questiontimes: [30, 10, 20],
        checkpointBehavior: 'adaptive',
      },
    };

    const applied = applyAdaptiveVideoTemplateSchedule({
      unit,
      schedule: [{ clusterIndex: 2 }, { clusterIndex: 1 }],
      adaptiveQuestionTimes: [12, 24],
      adaptiveCheckpoints: [{ time: 24 }],
    });

    expect(applied).to.equal(true);
    const videoSession = requireAdaptiveVideoSession(unit);
    expect(videoSession.questions).to.deep.equal([1, 2]);
    expect(videoSession.questiontimes).to.deep.equal([30, 10, 20, 12, 24]);
    expect(videoSession.checkpoints).to.deep.equal([{ time: 24 }]);
  });
});
