import { expect } from 'chai';
import type { AutoTutorRuntimeCapabilities } from '../../learning-components/units/autotutor/AutoTutorRuntimeCapabilities';
import {
  readAutoTutorConfig,
  readAutoTutorConfigWithOptions,
  validateGraduationAgainstScript,
} from '../../learning-components/units/autotutor/AutoTutorRuntimeConfig';

function createCapabilities(overrides: {
  session?: Record<string, unknown>;
  stim?: Record<string, unknown>;
} = {}): AutoTutorRuntimeCapabilities {
  const script = {
    id: 'script-1',
    topic: 'Means',
    learningGoal: 'Explain what a confidence interval estimates.',
    idealAnswer: 'It estimates the population mean.',
    expectations: [
      {
        id: 'expectation-1',
        proposition: 'A confidence interval estimates the population mean.',
        assertion: 'A confidence interval estimates the population mean.',
      },
    ],
    misconceptions: [
      {
        id: 'misconception-1',
        misconception: 'It estimates individual scores.',
        correction: 'It estimates a population parameter.',
        repairQuestion: 'Does it estimate individuals or the population mean?',
      },
    ],
    dialogPolicy: {
      requiredExpectations: ['expectation-1'],
    },
    summary: 'Confidence intervals estimate population parameters.',
  };
  const session = {
    currentUserId: 'user-1',
    currentTdfId: 'tdf-1',
    currentTdfName: 'Lesson',
    currentUnitNumber: 0,
    currentTdfFile: {
      tdfs: {
        tutor: {
          setspec: {
            openRouterApiKey: 'test-openrouter-key',
            openRouterModel: 'openai/test-model',
          },
        },
      },
    },
    currentTdfUnit: {
      unitname: 'AutoTutor Unit',
      autotutorsession: {
        cluster: 0,
        maxTurns: 5,
        graduation: {
          requiredExpectationCount: 1,
          maxActiveMisconceptions: 1,
        },
      },
    },
    ...overrides.session,
  };
  const stim = {
    display: { text: 'What does a confidence interval estimate?' },
    autoTutor: script,
    ...overrides.stim,
  };
  return {
    session: {
      getSessionValue: () => undefined,
      setSessionValue() {},
      getAutoTutorSessionSnapshot: () => session as any,
      publishAutoTutorState() {},
    },
    stimuli: {
      getStimCluster: () => ({ stims: [stim] }),
    },
    serverMethods: {
      getAutoTutorHistoryForUnit: async () => [],
    },
    history: {
      normalizeResult: (result) => result as any,
      writeResult: async () => undefined,
      writeAutoTutorTurn: async () => undefined,
      writeCanonicalHistory: async () => undefined,
    },
    aiProvider: {
      callOpenRouterJson: async (options) => ({
        value: options.intent.parse({}),
        rawContent: '{}',
        responseBody: {},
      }),
    },
    logger: {
      log() {},
    },
  };
}

describe('AutoTutor runtime config', function() {
  it('reads authored AutoTutor session config through explicit capabilities', function() {
    const config = readAutoTutorConfig(createCapabilities());

    expect(config.apiKey).to.equal('test-openrouter-key');
    expect(config.model).to.equal('openai/test-model');
    expect(config.prompt).to.equal('What does a confidence interval estimate?');
    expect(config.clusterIndex).to.equal(0);
    expect(config.turnLimit.maxTurns).to.equal(5);
    expect(config.graduation.requiredExpectationCount).to.equal(1);
  });

  it('prefers the saved profile OpenRouter key over the TDF key', function() {
    const config = readAutoTutorConfigWithOptions(createCapabilities(), {
      preferredOpenRouterApiKey: 'profile-openrouter-key',
    });

    expect(config.apiKey).to.equal('profile-openrouter-key');
  });

  it('uses the TDF OpenRouter key when no profile key is available', function() {
    const config = readAutoTutorConfigWithOptions(createCapabilities(), {
      preferredOpenRouterApiKey: '   ',
    });

    expect(config.apiKey).to.equal('test-openrouter-key');
  });

  it('fails clearly when neither profile nor TDF OpenRouter key is available', function() {
    const capabilities = createCapabilities({
      session: {
        currentTdfFile: {
          tdfs: {
            tutor: {
              setspec: {
                openRouterModel: 'openai/test-model',
              },
            },
          },
        },
      },
    });

    expect(() => readAutoTutorConfigWithOptions(capabilities))
      .to.throw('AutoTutor runtime requires OpenRouter API key from profile settings or tutor.setspec.openRouterApiKey');
  });

  it('clones the authored script before returning component runtime config', function() {
    const capabilities = createCapabilities();
    const config = readAutoTutorConfig(capabilities);
    const reread = readAutoTutorConfig(capabilities);

    config.script.expectations[0]!.proposition = 'changed';

    expect(reread.script.expectations[0]!.proposition)
      .to.equal('A confidence interval estimates the population mean.');
  });

  it('fails clearly when authored graduation exceeds script bounds', function() {
    const capabilities = createCapabilities({
      session: {
        currentTdfUnit: {
          unitname: 'AutoTutor Unit',
          autotutorsession: {
            cluster: 0,
            maxTurns: 5,
            graduation: {
              requiredExpectationCount: 2,
              maxActiveMisconceptions: 1,
            },
          },
        },
      },
    });
    const config = readAutoTutorConfig(capabilities);

    expect(() => validateGraduationAgainstScript(config))
      .to.throw('AutoTutor graduation.requiredExpectationCount cannot exceed 1 required expectations');
  });
});
