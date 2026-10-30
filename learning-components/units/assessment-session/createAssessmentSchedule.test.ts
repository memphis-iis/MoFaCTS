import { strict as assert } from 'node:assert';
import { createAssessmentSchedule } from './createAssessmentSchedule';
import { multipleGroupsMatchingTemplateAndClusterRepeats } from './__fixtures__/assessmentScheduleFixtures';

const dependencies = {
  getSessionValue: (key: string) => key === 'currentTdfFile' ? { isMultiTdf: false } : undefined,
  getStimCount: () => 4,
};

function withRandomDraws<T>(draws: number[], work: () => T) {
  const original = Math.random;
  let used = 0;
  Math.random = () => {
    const draw = draws[used++];
    if (draw === undefined) throw new Error('Unexpected random draw in assessment schedule');
    return draw;
  };
  try {
    return { value: work(), used };
  } finally {
    Math.random = original;
  }
}

function assessmentUnit(final: { permutefinalresult?: string; swapfinalresult?: string } = {}) {
  const fixture = multipleGroupsMatchingTemplateAndClusterRepeats;
  return { buttontrial: 'false', assessmentsession: {
    assignrandomclusters: 'false', randomizegroups: 'false', initialpositions: '', randomchoices: '',
    clusterlist: fixture.clusterlist, conditiontemplatesbygroup: fixture.conditiontemplatesbygroup, ...final,
  } };
}

describe('assessment final cluster permutation', function() {
  it('reorders assembled questions through the shared shuffle-then-swap mapping', function() {
    const unit = assessmentUnit({ permutefinalresult: '0-3', swapfinalresult: '0-1 2-3' });
    const result = withRandomDraws([0, 0, 0, 0, 0, 0], () => createAssessmentSchedule({}, 2, unit, dependencies));
    assert.equal(result.used, 6);
    assert.deepEqual(result.value.q.map((question: any) => [question.clusterIndex, question.testType, question.whichStim]), [
      [2, 'd', 1], [0, 'd', 0], [1, 'h', 0], [2, 's', 0],
    ]);
    assert.equal(result.value.unitNumber, 2);
    assert.equal(result.value.isButtonTrial, false);
  });

  it('preserves default blank-range splitting and its existing random draw', function() {
    const result = withRandomDraws([.5], () => createAssessmentSchedule({}, 2, assessmentUnit(), dependencies));
    assert.equal(result.used, 1);
    assert.deepEqual(result.value.q.map((question: any) => question.testType), ['d', 'h', 's', 'd']);
  });

  it('does not invoke final mapping or consume random values for an empty schedule', function() {
    const unit = { assessmentsession: { clusterlist: '' } };
    const result = withRandomDraws([], () => createAssessmentSchedule({}, 0, unit, dependencies));
    assert.deepEqual(result.value.q, []);
    assert.equal(result.used, 0);
  });

  function twoPracticeBlocks(secondOffset: number) {
    return { assessmentsession: {
      conditiontemplatesbygroup: { groupnames: 'A', clustersrepeated: '2', templatesrepeated: '10',
        group: Array.from({ length: 10 }, () => `0,t,d,0 0,t,d,${secondOffset}`).join(' ') },
      initialpositions: Array.from({ length: 2 }, () => Array.from({ length: 10 }, (_value, i) => `A_${i + 1}`).join(' ')).join(' '),
      clusterlist: '0-9', permutefinalresult: '0-9 10-19', assignrandomclusters: 'false', randomizegroups: 'false',
    } };
  }

  it('preserves one appearance of every word in each independently shuffled practice block', function() {
    const schedule = createAssessmentSchedule({}, 0, twoPracticeBlocks(10), dependencies);
    assert.equal(schedule.q.length, 20);
    for (const block of [schedule.q.slice(0, 10), schedule.q.slice(10)]) {
      assert.deepEqual(block.map((q: any) => q.clusterIndex).sort((a: number, b: number) => a - b), Array.from({ length: 10 }, (_value, i) => i));
    }
  });

  it('rejects overlapping repeated templates before a sparse schedule can deliver duplicate last-item trials', function() {
    assert.throws(() => createAssessmentSchedule({}, 0, twoPracticeBlocks(0), dependencies), /position 0 is assigned more than once/);
  });

  it('rejects a missing schedule position instead of compacting away the hole', function() {
    const unit = { assessmentsession: { clusterlist: '0-0', initialpositions: 'A_1 A_1',
      conditiontemplatesbygroup: { groupnames: 'A', clustersrepeated: '1', templatesrepeated: '1', group: '0,t,d,0' } } };
    assert.throws(() => createAssessmentSchedule({}, 0, unit, dependencies), /position 1 is unassigned/);
  });
});
