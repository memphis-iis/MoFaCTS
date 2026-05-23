import {
  booleanField,
  enumStringField,
  integerField,
  simpleField,
  stringField,
  type SectionFieldRegistry,
} from './fieldRegistrySectionCore.ts';

export const DELIVERY_DISPLAY_SETTINGS_FIELD_REGISTRY: SectionFieldRegistry = {
  stimuliPosition: simpleField(enumStringField(['top', 'left'], 'top', 4), {
    brief: 'Prompt placement.',
    verbose: 'Position of the prompt relative to the response area. Options are "top" or "left"; default is "top".'
  }, {
    runtime: {
      default: 'top',
      coerce: 'none',
      validation: { kind: 'enum', values: ['top', 'left'] },
    },
  }),
  isVideoSession: simpleField(booleanField(false, 4), {
    brief: 'Flag the unit as a video session.',
    verbose: 'Runtime marker for video-session rendering and controls.'
  }, {
    appliesToUnitTypes: ['video'],
    surfaces: {
      schema: false,
      learnerConfig: false,
      editor: false,
    },
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  videoUrl: simpleField(stringField('', 12), {
    brief: 'Resolved video URL.',
    verbose: 'Runtime-resolved video URL passed into the Svelte video session UI.'
  }, {
    appliesToUnitTypes: ['video'],
    surfaces: {
      schema: false,
      learnerConfig: false,
      editor: false,
    },
    runtime: {
      default: '',
      coerce: 'none',
      validation: { kind: 'string' },
    },
  }),
  displayCorrectFeedback: simpleField(booleanField(true, 4), {
    brief: 'Show correct feedback',
    verbose: 'When enabled, learners see feedback after correct answers. When disabled, correct answers still count as correct, but no correct-answer feedback is displayed or spoken.'
  }, {
    runtime: {
      default: true,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayIncorrectFeedback: simpleField(booleanField(true, 4), {
    brief: 'Show incorrect feedback',
    verbose: 'When enabled, learners see feedback after incorrect answers and timeouts. When disabled, incorrect outcomes still count as incorrect, but no incorrect-answer feedback is displayed or spoken.'
  }, {
    runtime: {
      default: true,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  correctLabelText: simpleField(stringField('Correct.', 6), {
    brief: 'Correct feedback label',
    verbose: 'Text used for the leading outcome label on correct-answer feedback. This label does not replace evaluator explanations such as close-enough or phonetic-match messages.'
  }, {
    runtime: {
      default: 'Correct.',
      coerce: 'none',
      validation: { kind: 'stringMaxLengthNonEmpty', max: 100 },
    },
  }),
  incorrectLabelText: simpleField(stringField('Incorrect.', 6), {
    brief: 'Incorrect feedback label',
    verbose: 'Text used for the leading outcome label on incorrect-answer and timeout feedback. This label does not replace evaluator explanations or correct-answer wording.'
  }, {
    runtime: {
      default: 'Incorrect.',
      coerce: 'none',
      validation: { kind: 'stringMaxLengthNonEmpty', max: 100 },
    },
  }),
  correctColor: simpleField(stringField('var(--success-color)', 4), {
    brief: 'Correct feedback color',
    verbose: 'CSS color value used for correct-answer feedback text. Supported values are hex colors such as "#00ff00" or CSS custom properties such as "var(--success-color)".'
  }, {
    runtime: {
      default: 'var(--success-color)',
      coerce: 'none',
      validation: { kind: 'color' },
    },
  }),
  incorrectColor: simpleField(stringField('var(--alert-color)', 4), {
    brief: 'Incorrect feedback color',
    verbose: 'CSS color value used for incorrect-answer and timeout feedback text. Supported values are hex colors such as "#ff0000" or CSS custom properties such as "var(--alert-color)".'
  }, {
    runtime: {
      default: 'var(--alert-color)',
      coerce: 'none',
      validation: { kind: 'color' },
    },
  }),
  displayUserAnswerInFeedback: simpleField(
    {
      anyOf: [
        { type: 'boolean' },
        { type: 'string', enum: ['onCorrect', 'onIncorrect'] },
      ],
      default: 'onIncorrect',
      options: { grid_columns: 4 },
    },
    {
      brief: 'Show learner answer in feedback',
      verbose: 'Controls when the learner’s submitted answer is included in feedback. Use "onIncorrect" to show it only after incorrect answers, "onCorrect" only after correct answers, true to show it for both, or false to never show it.'
    },
    {
      runtime: {
        default: 'onIncorrect',
        coerce: 'boolean',
        validation: { kind: 'booleanOrEnum', values: ['onCorrect', 'onIncorrect'] },
      },
    }
  ),
  feedbackLayout: simpleField(enumStringField(['stacked', 'inline'], 'stacked', 4), {
    brief: 'Feedback layout',
    verbose: 'Controls how selected feedback pieces are arranged visually. Use "stacked" to place pieces on separate lines, or "inline" to keep them in one line when space allows. This setting does not change spoken or logged feedback text.'
  }, {
    runtime: {
      default: 'stacked',
      coerce: 'none',
      validation: { kind: 'enum', values: ['stacked', 'inline'] },
    },
  }),
  displayCorrectAnswerInIncorrectFeedback: simpleField(booleanField(true, 4), {
    brief: 'Show correct answer after incorrect feedback',
    verbose: 'When enabled, incorrect-answer feedback includes the expected correct answer after the outcome label and evaluator explanation, when a text answer is available.'
  }, {
    runtime: {
      default: true,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayPerformance: simpleField(booleanField(false, 4), {
    brief: 'Show learner performance stats.',
    verbose: 'Render the performance/status block during the lesson.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayTimeoutBar: simpleField(booleanField(false, 4), {
    brief: 'Show timeout bar.',
    verbose: 'Render timeout progress as a visual bar. The numeric countdown is controlled separately by displayTimeoutCountdown.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayTimeoutCountdown: simpleField(booleanField(false, 4), {
    brief: 'Show numeric timeout countdown.',
    verbose: 'Render timeout text such as time remaining or continuing countdown. The visual progress bar is controlled separately by displayTimeoutBar.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  choiceButtonCols: simpleField(integerField(1, 4), {
    brief: 'Number of button columns.',
    verbose: 'Number of columns for multiple-choice button layout. Default is 1.'
  }, {
    runtime: {
      default: 1,
      coerce: 'number',
      validation: { kind: 'integerRange', min: 1, max: 4 },
    },
  }),
  inputPlaceholderText: simpleField(stringField('Type your answer here...', 12), {
    brief: 'Answer input hint text',
    verbose: 'Faint helper text shown inside the learner answer field before the learner starts typing. Default is "Type your answer here...".'
  }, {
    runtime: {
      default: 'Type your answer here...',
      coerce: 'none',
      validation: { kind: 'stringMaxLength', max: 100 },
    },
  }),
  continueButtonText: simpleField(stringField('Continue', 6), {
    brief: 'Continue button text.',
    verbose: 'Text shown on Continue controls used by video and timed-display lesson navigation. Default is "Continue".'
  }, {
    appliesToUnitTypes: ['learning', 'assessment', 'video', 'instructions'],
    runtime: {
      default: 'Continue',
      coerce: 'none',
      validation: { kind: 'stringMaxLength', max: 100 },
    },
  }),
  skipStudyButtonText: simpleField(stringField('Skip', 6), {
    brief: 'Skip study button text.',
    verbose: 'Label shown on the Skip Study button when study skipping is enabled. Default is "Skip".'
  }, {
    appliesToUnitTypes: ['learning', 'assessment'],
    runtime: {
      default: 'Skip',
      coerce: 'none',
      validation: { kind: 'stringMaxLength', max: 100 },
    },
  }),
  caseSensitive: simpleField(booleanField(false, 4), {
    brief: 'Use case-sensitive answer matching.',
    verbose: 'Compare typed answers with case preserved.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  displayQuestionNumber: simpleField(booleanField(false, 4), {
    brief: 'Show the question number.',
    verbose: 'Render the current question number in the lesson UI.'
  }, {
    runtime: {
      default: false,
      coerce: 'boolean',
      validation: { kind: 'boolean' },
    },
  }),
  experimentLoginText: simpleField(stringField('', 12), {
    brief: 'Experiment login prompt.',
    verbose: 'Prompt text shown in the experiment login username field. This is read from tutor.deliverySettings during experiment launch.'
  }, {
    surfaces: {
      learnerConfig: false,
      runtime: false,
    },
    appliesToUnitTypes: ['instructions'],
  }),
};
