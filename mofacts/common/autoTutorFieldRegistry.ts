import {
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
  graduation: simpleField({
    type: 'object',
    title: 'AutoTutor Graduation',
    additionalProperties: false,
    required: ['minExpectationScore', 'requireNoCurrentMisconceptions', 'maxTurns'],
    properties: {
      minExpectationScore: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        default: 1,
      },
      requireNoCurrentMisconceptions: {
        type: 'boolean',
        default: true,
      },
      maxTurns: {
        type: 'integer',
        minimum: 1,
        default: 20,
      },
    },
  }, {
    brief: 'AutoTutor graduation rule.',
    verbose: 'Completion threshold for the AutoTutor unit, including expectation score, misconception requirement, and maximum learner turns.'
  }),
};


export const AUTOTUTOR_SESSION_DIRECT_RUNTIME_KEYS = Object.freeze([
  'cluster',
  'graduation',
  'openRouterModel',
]);
