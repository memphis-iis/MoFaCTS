import { expect } from 'chai';
import { validateAutoTutorContent } from './autoTutorContract';
import { SPARC_INSTRUCTIONAL_POLICY_IDS } from '../../../learning-components/runtime/sparcInstructionalPolicies';

function buildValidSparcAutoTutorTdf() {
  return {
    tutor: {
      unit: [
        {
          unitname: 'SPARC AutoTutor',
          sparcsession: {
            pageId: 'sparc-session-demo',
            clusterlist: '0',
          },
        },
      ],
    },
  };
}

function buildValidSparcAutoTutorStimuli() {
  return {
    setspec: {
      clusters: [
        {
          clusterKC: 'autotutor.demo.kc.e1',
          stims: [
            {
              clusterKC: 'autotutor.demo.kc.e1',
              text: 'A confidence interval procedure has long-run coverage.',
            },
          ],
        },
      ],
      sparcPages: [
        {
          pageId: 'sparc-session-demo',
          display: {
            schema: 'tutorscript-sparc/2.0',
            unitType: 'sparc-autotutor-dialogue',
            instructionalController: {
              adapterId: 'sparc-autotutor-v1',
              policyId: 'progressive-scaffolding-v1',
              policyVersion: 1,
              parameters: { minimumProgress: 0.05 },
            },
            nodes: [
              {
                id: 'learner-response-input',
                nodeType: 'atomic',
                atomType: 'text-input',
              },
            ],
            clusterTargets: [
              {
                clusterIndex: 0,
                clusterKC: 'autotutor.demo.kc.e1',
              },
            ],
            workingMemoryFacts: [{ factType: 'dialogue.source', slots: { topic: 'Confidence intervals' } }],
            autoTutorTargets: {
              expectations: [
                {
                  clusterKC: 'autotutor.demo.kc.e1',
                  text: 'A confidence interval procedure has long-run coverage.',
                },
              ],
              misconceptions: [
                {
                  id: 'M1',
                  text: 'A confidence interval assigns probability to the fixed parameter.',
                },
              ],
            },
          },
        },
      ],
    },
  };
}

describe('AutoTutor content contract', function() {
  it('requires exactly one valid authored category for every target in the new dynamic family', function() {
    for (const policyId of ['dynamic-instruction-agent-v2', 'dynamic-instruction-student-v2']) {
      const stimuli = buildValidSparcAutoTutorStimuli();
      const display = stimuli.setspec.sparcPages[0]!.display;
      display.instructionalController.policyId = policyId;
      const validate = () => validateAutoTutorContent({ tdf: buildValidSparcAutoTutorTdf(), stimuli });
      expect(validate().valid, policyId).to.equal(false);
      expect(validate().errors.join(' ')).to.contain('requires category');
      Object.assign(display.autoTutorTargets.expectations[0]!, { category: 'model-rule' });
      Object.assign(display.autoTutorTargets.misconceptions[0]!, { category: 'fact-model' });
      expect(validate()).to.deep.equal({ valid: true, errors: [] });
      display.workingMemoryFacts[0]!.slots.topic = '';
      expect(validate().errors.join(' ')).to.contain('dialogue.source');
      display.workingMemoryFacts[0]!.slots.topic = 'Confidence intervals';
      Object.assign(display.autoTutorTargets.expectations[0]!, { category: 'principle' });
      expect(validate().valid, policyId).to.equal(false);
    }
  });

  it('accepts a runtime-owned SPARC AutoTutor TDF and stimulus pair', function() {
    const result = validateAutoTutorContent({
      tdf: buildValidSparcAutoTutorTdf(),
      stimuli: buildValidSparcAutoTutorStimuli(),
    });

    expect(result).to.deep.equal({ valid: true, errors: [] });
  });

  it('accepts exactly the three supported instructional policies', function() {
    const policies = ['progressive-scaffolding-v1', 'dynamic-instruction-agent-v2', 'dynamic-instruction-student-v2'];
    expect(SPARC_INSTRUCTIONAL_POLICY_IDS).to.deep.equal(policies);
    for (const policyId of policies) {
      const stimuli = buildValidSparcAutoTutorStimuli();
      const display = stimuli.setspec.sparcPages[0]!.display;
      display.instructionalController.policyId = policyId;
      Object.assign(display.autoTutorTargets.expectations[0]!, { category: 'model-rule' });
      Object.assign(display.autoTutorTargets.misconceptions[0]!, { category: 'fact-model' });
      expect(validateAutoTutorContent({ tdf: buildValidSparcAutoTutorTdf(), stimuli }), policyId)
        .to.deep.equal({ valid: true, errors: [] });
    }
  });

  it('rejects retired and unknown policies even when the target content is valid', function() {
    for (const policyId of ['student-selected-v2', 'agent-selected-v1', 'oet-boltzmann-v2',
      'dynamic-instruction-agent-v1', 'dynamic-instruction-student-v1', 'unknown-policy']) {
      const stimuli = buildValidSparcAutoTutorStimuli();
      const display = stimuli.setspec.sparcPages[0]!.display;
      display.instructionalController.policyId = policyId;
      Object.assign(display.autoTutorTargets.expectations[0]!, { category: 'model-rule' });
      Object.assign(display.autoTutorTargets.misconceptions[0]!, { category: 'fact-model' });
      const result = validateAutoTutorContent({ tdf: buildValidSparcAutoTutorTdf(), stimuli });
      expect(result.valid, policyId).to.equal(false);
      expect(result.errors.join(' ')).to.contain('registered policy');
    }
  });

  it('rejects authored production rules in runtime-owned SPARC AutoTutor content', function() {
    const stimuli = buildValidSparcAutoTutorStimuli();
    const display = stimuli.setspec.sparcPages[0]!.display as Record<string, unknown>;
    display.productionRules = [];

    const result = validateAutoTutorContent({
      tdf: buildValidSparcAutoTutorTdf(),
      stimuli,
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include('setspec.sparcPages[0].display.productionRules is runtime-owned and must be omitted');
  });

  it('rejects forbidden legacy target fields in SPARC AutoTutor content', function() {
    const stimuli = buildValidSparcAutoTutorStimuli();
    (stimuli.setspec.sparcPages[0]!.display.clusterTargets[0] as Record<string, unknown>).KCDefault = 'legacy';

    const result = validateAutoTutorContent({
      tdf: buildValidSparcAutoTutorTdf(),
      stimuli,
    });

    expect(result.valid).to.equal(false);
    expect(result.errors).to.include('setspec.sparcPages[0].display.clusterTargets[0].KCDefault is not allowed in SPARC AutoTutor target data');
  });

  it('rejects retired selectors even when mixed with supported content or templates', function() {
    for (const field of ['unit', 'unitTemplate']) {
      const tdf = { tutor: { [field]: [{ autotutorsession: {}, sparcsession: { pageId: 'sparc-session-demo' } }] } };
      const result = validateAutoTutorContent({ tdf });
      expect(result.valid).to.equal(false);
      expect(result.errors.join(' ')).to.contain('standalone AutoTutor has been removed');
    }
    expect(validateAutoTutorContent({
      tdf: { tutor: { setspec: { unitTemplate: [{ autotutorsession: {} }] } } },
    }).valid).to.equal(false);
  });

  it('rejects original stimulus scripts without rejecting SPARC targets', function() {
    const stimuli = buildValidSparcAutoTutorStimuli();
    expect(validateAutoTutorContent({ tdf: buildValidSparcAutoTutorTdf(), stimuli }).valid).to.equal(true);
    Object.assign(stimuli.setspec.clusters[0]!.stims[0]!, { autoTutor: {} });
    expect(validateAutoTutorContent({ tdf: buildValidSparcAutoTutorTdf(), stimuli }).errors.join(' '))
      .to.contain('standalone AutoTutor has been removed');
  });
});
