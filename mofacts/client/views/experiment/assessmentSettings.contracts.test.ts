import { expect } from 'chai';
import { createAssessmentSchedule } from '../../../../learning-components/units/assessment-session/createAssessmentSchedule';
import { loadAssessmentSettings } from '../../../../learning-components/units/assessment-session/assessmentSettings';

function deps(overrides: Record<string, unknown> = {}) {
  const values = {
    currentTdfFile: { isMultiTdf: false },
    currentUnitNumber: 0,
    subTdfIndex: 0,
    ...overrides,
  };
  return {
    getSessionValue: (key: string) => values[key as keyof typeof values],
    getStimCount: () => 4,
  };
}

function assessmentUnit(conditiontemplatesbygroup: Record<string, unknown>, clusterlist = '0-1') {
  return {
    buttontrial: 'false',
    assessmentsession: {
      assignrandomclusters: 'false',
      randomizegroups: 'false',
      initialpositions: '',
      randomchoices: '',
      clusterlist,
      conditiontemplatesbygroup,
    },
  };
}

describe('assessment schedule settings parser', function() {
  it('creates a stable schedule from grouped assessment templates', function() {
    const unit = assessmentUnit({
      groupnames: 'A',
      clustersrepeated: '2',
      templatesrepeated: '1',
      initialpositions: 'A1',
      group: '0,t,d,0 1,b,h,1',
    });

    const schedule = createAssessmentSchedule({}, 2, unit, deps());

    expect(schedule.unitNumber).to.equal(2);
    expect(schedule.isButtonTrial).to.equal(false);
    expect(schedule.q).to.deep.equal([
      {
        testType: 'd',
        clusterIndex: 0,
        condition: 'A-0',
        whichStim: 0,
        forceButtonTrial: false,
      },
      {
        testType: 'h',
        clusterIndex: 0,
        condition: 'A-0',
        whichStim: 1,
        forceButtonTrial: true,
      },
    ]);
  });

  it('fails when group names and group bodies do not match', function() {
    const unit = assessmentUnit({
      groupnames: 'A B',
      clustersrepeated: '1 1',
      templatesrepeated: '1 1',
      initialpositions: 'A1 B1',
      group: ['0,t,d,0'],
    });

    expect(() => loadAssessmentSettings({}, unit, deps())).to.throw(
      'conditiontemplatesbygroup.groupnames has 2 entries but conditiontemplatesbygroup.group has 1',
    );
  });

  it('fails when a group body does not match template size times template count', function() {
    const unit = assessmentUnit({
      groupnames: 'A',
      clustersrepeated: '2',
      templatesrepeated: '2',
      initialpositions: 'A1 A2',
      group: '0,t,d,0 1,t,d,1',
    });

    expect(() => loadAssessmentSettings({}, unit, deps())).to.throw(
      'Assessment group "A" has 2 template entries but expected 4',
    );
  });

  it('fails when clusterlist is exhausted before scheduled templates are assigned', function() {
    const unit = assessmentUnit({
      groupnames: 'A',
      clustersrepeated: '1',
      templatesrepeated: '2',
      initialpositions: 'A1 A2',
      group: '0,t,d,0 0,t,d,0',
    }, '0-0');

    expect(() => createAssessmentSchedule({}, 0, unit, deps())).to.throw(
      'requires a cluster number, but clusterlist is exhausted',
    );
  });
});
