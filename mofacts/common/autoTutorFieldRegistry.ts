import {
  booleanField,
  integerField,
  simpleField,
  stringField,
  type SectionFieldRegistry,
} from './fieldRegistrySectionCore.ts';

export const AUTOTUTOR_SESSION_FIELD_REGISTRY: SectionFieldRegistry = {
  cluster: simpleField(integerField(0, 4), {
    brief: 'AutoTutor stimulus cluster.',
    verbose: 'Stimulus cluster index whose first stim contains the AutoTutor prompt and structured curriculum script.'
  }),
  openRouterModel: simpleField(stringField('', 12), {
    brief: 'AutoTutor model override.',
    verbose: 'Optional OpenRouter model identifier used for this AutoTutor unit instead of the lesson default.'
  }),
  requireFinalAnswerPrompt: simpleField(booleanField(false, 4), {
    brief: 'Require final answer prompt.',
    verbose: 'When enabled, AutoTutor asks the learner for one final integrated answer before giving the summary. Disabled by default.'
  }),
  maxTurns: simpleField(integerField(20, 4), {
    brief: 'Maximum AutoTutor turns.',
    verbose: 'Maximum learner turns before the AutoTutor session ends. This is a session limit, not a graduation criterion.'
  }),
  graduation: simpleField({
    type: 'object',
    title: 'AutoTutor Graduation',
    additionalProperties: false,
    required: ['requiredExpectationCount', 'maxActiveMisconceptions'],
    properties: {
      requiredExpectationCount: {
        type: 'integer',
        minimum: 0,
      },
      maxActiveMisconceptions: {
        type: 'integer',
        minimum: 0,
        default: 0,
      },
    },
  }, {
    brief: 'AutoTutor graduation rule.',
    verbose: 'Completion threshold for the AutoTutor unit: required covered expectations and maximum active misconceptions.'
  }),
};


export const AUTOTUTOR_SESSION_DIRECT_RUNTIME_KEYS = Object.freeze([
  'cluster',
  'graduation',
  'maxTurns',
  'openRouterModel',
  'requireFinalAnswerPrompt',
]);
