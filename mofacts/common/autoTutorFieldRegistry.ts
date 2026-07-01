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
  utteranceTemperature: simpleField({
    type: 'number',
    minimum: 0,
    maximum: 2,
    default: 0.45,
    options: { grid_columns: 4 },
  }, {
    brief: 'Tutor wording temperature.',
    verbose: 'OpenRouter temperature used for generated tutor messages. Scoring stays at a lower fixed temperature so the student model remains stable.'
  }, {
    runtime: {
      default: 0.45,
      coerce: 'number',
      validation: { kind: 'numberRange', min: 0, max: 2 },
    },
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
  'utteranceTemperature',
]);
