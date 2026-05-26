import { expect } from 'chai';

import { applyAdaptiveAssessmentTemplateSchedule } from './assessmentAdaptiveSchedule';

describe('assessment adaptive schedule', function() {
  it('applies adaptive template schedule through the assessment-session owner', function() {
    const unit = {
      assessmentsession: {
        clusterlist: 'old',
      },
    };

    const applied = applyAdaptiveAssessmentTemplateSchedule({
      unit,
      schedule: [{ clusterIndex: 2 }, { clusterIndex: '4' }, { clusterIndex: 1 }],
    });

    expect(applied).to.equal(true);
    expect(unit.assessmentsession.clusterlist).to.equal('2 4 1');
  });

  it('leaves non-assessment adaptive templates to other owners', function() {
    const unit = {};

    expect(applyAdaptiveAssessmentTemplateSchedule({
      unit,
      schedule: [{ clusterIndex: 2 }],
    })).to.equal(false);
    expect(unit).to.deep.equal({});
  });

  it('fails clearly when adaptive assessment schedule items are malformed', function() {
    expect(() => applyAdaptiveAssessmentTemplateSchedule({
      unit: {
        unitname: 'Assessment Template',
        assessmentsession: {},
      },
      schedule: [{ clusterIndex: 'bad' }],
    })).to.throw(/invalid cluster index/);
  });
});
