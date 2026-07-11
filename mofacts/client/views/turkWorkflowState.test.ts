import { expect } from 'chai';
import {
  formatTurkExperimentLabel,
  normalizeTurkWorkflowExperiments,
} from './turkWorkflowState';

describe('turkWorkflowState', function() {
  it('normalizes only experiment-target TDFs into workflow options', function() {
    const experiments = normalizeTurkWorkflowExperiments([
      {
        _id: 'tdf-123456789',
        content: {
          fileName: 'lesson.xml',
          tdfs: { tutor: { setspec: { lessonname: 'Lesson', experimentTarget: 'mturk' } } },
        },
      },
      {
        _id: 'tdf-no-target',
        content: {
          fileName: 'other.xml',
          tdfs: { tutor: { setspec: { lessonname: 'Other', experimentTarget: '' } } },
        },
      },
      { _id: 'broken' },
    ]);

    expect(experiments).to.deep.equal([{
      _id: 'tdf-123456789',
      selectorKey: 'tdf-123456789',
      fileName: 'lesson.xml',
      lessonName: 'Lesson',
      displayLabel: 'lesson.xml (tdf-1234)',
    }]);
  });

  it('formats labels with the short TDF id', function() {
    expect(formatTurkExperimentLabel('lesson.xml', 'abcdef123456')).to.equal('lesson.xml (abcdef12)');
  });
});
