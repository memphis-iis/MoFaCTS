import {
  enumStringField,
  GOOGLE_STT_LANGUAGE_CODES,
  GOOGLE_TTS_LANGUAGE_CODES,
  integerArrayField,
  legacyBooleanField,
  numberArrayField,
  simpleField,
  stringArrayField,
  stringField,
  textareaField,
  withGrid,
  type SectionFieldRegistry,
} from './fieldRegistrySectionCore.ts';

export const SETSPEC_FIELD_REGISTRY: SectionFieldRegistry = {
  lessonname: simpleField(stringField('', 12), {
    brief: 'Full display name for the lesson.',
    verbose: 'Full name shown to learners and in reporting.'
  }, {
    validation: {
      validators: [{ type: 'required', message: 'Lesson name is required' }],
      severity: 'error',
    },
  }),
  stimulusfile: simpleField(stringField('', 12), {
    brief: 'Filename of the stimulus JSON file.',
    verbose: 'Stimulus/content filename paired with this TDF.'
  }, {
    validation: {
      validators: [{ type: 'required', message: 'Stimulus file is required' }],
      severity: 'error',
    },
  }),
  name: simpleField(stringField('', 6), {
    brief: 'Short internal lesson name.',
    verbose: 'Short internal identifier used for tracking or exports.'
  }),
  experimentTarget: simpleField(stringField('', 6), {
    brief: 'Direct experiment URL target.',
    verbose: 'Path segment used for no-login experiment links.'
  }),
  userselect: simpleField(legacyBooleanField('false'), {
    brief: 'Show lesson on the learner dashboard.',
    verbose: 'When enabled, learners can pick this lesson directly from their dashboard.'
  }),
  allowRevisitUnit: simpleField(legacyBooleanField('false'), {
    brief: 'Allow revisiting the current unit from instructions.',
    verbose: 'When enabled at the lesson level, instruction screens expose the current-unit revisit path so a learner can return to the unit instead of only continuing forward.'
  }, {
    aliases: ['allowRevistUnit'],
  }),
  lfparameter: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Fuzzy matching threshold.',
    verbose: 'Edit-distance / fuzzy-match threshold used during answer evaluation.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 0, max: 1, message: 'Must be between 0 and 1' }],
      severity: 'error',
    },
  }),
  hintsEnabled: simpleField(legacyBooleanField(false), {
    brief: 'Enable syllable-based hints.',
    verbose: 'Turns hint-generation support on for qualifying prompt text.'
  }),
  tags: simpleField(stringArrayField('Tags', 'Tag'), {
    brief: 'Searchable category tags.',
    verbose: 'Lesson category tags used for organization and filtering.'
  }),
  shuffleclusters: simpleField(stringField('', 12), {
    brief: 'Shuffle cluster groups.',
    verbose: 'Space-delimited start-end ranges that are shuffled within their own group.'
  }, {
    validation: {
      validators: [
        {
          type: 'clusterRangeFormat',
          message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-3 4-7")',
        },
      ],
      severity: 'error',
      breaking: true,
    },
  }),
  swapclusters: simpleField(stringField('', 12), {
    brief: 'Swap cluster group order.',
    verbose: 'Space-delimited cluster ranges treated as shuffleable groups.'
  }, {
    validation: {
      validators: [
        {
          type: 'clusterRangeFormat',
          message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-3 4-7")',
        },
      ],
      severity: 'error',
      breaking: true,
    },
  }),
  enableAudioPromptAndFeedback: simpleField(legacyBooleanField('false'), {
    brief: 'Enable text-to-speech prompts and feedback.',
    verbose: 'Advertises and enables lesson audio prompt/feedback support.'
  }),
  speechAPIKey: simpleField(stringField('', 12), {
    brief: 'Speech recognition API key.',
    verbose: 'Google Speech API key used for speech recognition.'
  }),
  textToSpeechAPIKey: simpleField(stringField('', 12), {
    brief: 'Text-to-speech API key.',
    verbose: 'Google TTS API key used for lesson audio output.'
  }),
  openRouterApiKey: simpleField(stringField('', 12), {
    brief: 'OpenRouter API key.',
    verbose: 'OpenRouter API key used by AutoTutor units. The key is authored runtime configuration and is stripped from committed config content by the config sync script.'
  }),
  openRouterModel: simpleField(stringField('openai/gpt-4.1-mini', 12), {
    brief: 'Default OpenRouter model.',
    verbose: 'Default OpenRouter model identifier used by AutoTutor units unless a unit overrides it.'
  }),
  audioInputEnabled: simpleField(legacyBooleanField('false'), {
    brief: 'Enable speech recognition.',
    verbose: 'Enables microphone-based speech recognition for the lesson.'
  }),
  speechRecognitionLanguage: simpleField(enumStringField(GOOGLE_STT_LANGUAGE_CODES, 'en-US', 4), {
    brief: 'Speech-recognition language code.',
    verbose: 'Google Speech-to-Text language code used for microphone transcription, such as "en-US" or "es-ES".'
  }),
  audioInputSensitivity: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Speech detection threshold.',
    verbose: 'Approximate dB threshold used when deciding whether incoming audio counts as speech.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 20, max: 80, message: 'Must be between 20 and 80 dB' }],
      severity: 'warning',
    },
  }),
  audioPromptMode: simpleField(enumStringField(['silent', 'question', 'feedback', 'all'], 'silent', 4), {
    brief: 'Default TTS mode.',
    verbose: 'Default learner audio mode when opening the lesson.'
  }),
  textToSpeechLanguage: simpleField(enumStringField(GOOGLE_TTS_LANGUAGE_CODES, 'en-US', 4), {
    brief: 'Text-to-speech language code.',
    verbose: 'Google Text-to-Speech language code used for synthesized audio, such as "en-US" or "es-ES".'
  }),
  speechIgnoreOutOfGrammarResponses: simpleField(legacyBooleanField('false'), {
    brief: 'Ignore speech not in the answer set.',
    verbose: 'Discard speech transcripts that do not match the active grammar/answer set.'
  }),
  speechOutOfGrammarFeedback: simpleField(stringField('', 12), {
    brief: 'Message for ignored speech input.',
    verbose: 'Feedback shown when out-of-grammar speech is discarded.'
  }),
  audioPromptVoice: simpleField(stringField('', 6), {
    brief: 'Question voice ID.',
    verbose: 'Voice identifier used for spoken question prompts.'
  }),
  audioPromptFeedbackVoice: simpleField(stringField('', 6), {
    brief: 'Feedback voice ID.',
    verbose: 'Voice identifier used for spoken feedback prompts.'
  }),
  audioPromptQuestionSpeakingRate: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Question speaking rate.',
    verbose: 'Speech speed multiplier for question prompts.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }],
      severity: 'warning',
    },
  }),
  audioPromptFeedbackSpeakingRate: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Feedback speaking rate.',
    verbose: 'Speech speed multiplier for feedback prompts.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }],
      severity: 'warning',
    },
  }),
  audioPromptQuestionVolume: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Question TTS volume.',
    verbose: 'Volume adjustment in decibels for spoken question prompts.'
  }, {
    validation: {
      validators: [{ type: 'range', min: -6, max: 6, message: 'Must be between -6 and 6 dB' }],
      severity: 'warning',
    },
  }),
  audioPromptFeedbackVolume: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Feedback TTS volume.',
    verbose: 'Volume adjustment in decibels for spoken feedback prompts.'
  }, {
    validation: {
      validators: [{ type: 'range', min: -6, max: 6, message: 'Must be between -6 and 6 dB' }],
      severity: 'warning',
    },
  }),
  audioPromptSpeakingRate: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Legacy overall speaking rate.',
    verbose: 'Legacy lesson-wide speech speed multiplier.'
  }, {
    validation: {
      validators: [{ type: 'range', min: 0.25, max: 4.0, message: 'Must be between 0.25 and 4.0' }],
      severity: 'warning',
    },
  }),
  loadbalancing: simpleField(enumStringField(['max', 'min'], undefined, 4), {
    brief: 'Condition assignment mode.',
    verbose: 'Controls root-TDF experiment condition load balancing.'
  }),
  countcompletion: simpleField(
    withGrid(
      {
        anyOf: [
          { type: 'string', enum: ['beginning', 'end'] },
          { type: 'integer' },
          { type: 'boolean' },
        ],
      },
      4
    ),
    {
      brief: 'When participant counts increment.',
      verbose: 'Controls when condition completion counts are incremented.'
    }
  ),
  condition: simpleField(stringArrayField('Conditions', 'Condition'), {
    brief: 'Experiment condition file names.',
    verbose: 'Condition TDF filenames used by root experiments.'
  }),
  conditionTdfIds: simpleField({
    type: 'array',
    title: 'Condition TDF IDs',
    items: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      title: 'Condition TDF ID',
    },
  }, {
    brief: 'Resolved condition TDF IDs.',
    verbose: 'Server-resolved TDF IDs corresponding to condition filenames. Used by experiment dashboards and package workflows.'
  }, {
    surfaces: { learnerConfig: false },
  }),
  duedate: simpleField(stringField('', 4), {
    brief: 'Class practice due date.',
    verbose: 'Due date used by instructor reporting/class practice deadline UI.'
  }, {
    surfaces: { learnerConfig: false },
  }),
  showPageNumbers: simpleField(legacyBooleanField('false'), {
    brief: 'Show page numbers.',
    verbose: 'Controls whether page numbers are shown in the legacy lesson chrome.'
  }, {
    surfaces: { learnerConfig: false },
  }),
  recordInstructions: simpleField({
    anyOf: [
      { type: 'boolean' },
      { type: 'string', enum: ['true', 'false'] },
      {
        type: 'array',
        title: 'Instruction Unit Numbers',
        items: {
          anyOf: [{ type: 'integer' }, { type: 'string' }],
          title: 'Unit Number',
        },
      },
    ],
    options: { grid_columns: 4 },
  }, {
    brief: 'Record instruction viewing time.',
    verbose: 'Controls instruction-view logging. Supports true/false or an array of unit numbers whose instruction screens should be recorded.'
  }, {
    surfaces: { learnerConfig: false },
  }),
  randomizedDelivery: simpleField({
    type: 'array',
    title: 'Randomized Delivery',
    items: {
      anyOf: [{ type: 'integer' }, { type: 'string' }],
      title: 'Condition Count',
    },
  }, {
    brief: 'Retention interval condition count.',
    verbose: 'Legacy array-based count used to randomize delivery/x-condition selection.'
  }),
  prestimulusDisplay: simpleField(textareaField(''), {
    brief: 'Prestimulus prompt text.',
    verbose: 'Prompt text shown before the main stimulus appears.'
  }),
  tips: simpleField(stringArrayField('Tips', 'Tip'), {
    brief: 'Lesson tips shown on load.',
    verbose: 'Instructional tip strings displayed before or during lesson entry.'
  }),
  progressReporterParams: simpleField(numberArrayField('Progress Reporter Params', 'Value'), {
    brief: 'Progress report parameters.',
    verbose: 'Numeric parameters used by the legacy progress reporter calculations.'
  }),
  disableProgressReport: simpleField(legacyBooleanField('false'), {
    brief: 'Hide the progress report.',
    verbose: 'Disables learner progress report display when enabled.'
  }),
  experimentPasswordRequired: simpleField(legacyBooleanField('false'), {
    brief: 'Require an experiment password.',
    verbose: 'Adds a password gate before experiment entry.'
  }),
  simTimeout: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 4), {
    brief: 'Simulation time per trial.',
    verbose: 'Per-trial timing used by simulation/testing flows.'
  }),
  simCorrectProb: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'Simulation accuracy probability.',
    verbose: 'Probability of a correct response during simulated runs.'
  }),
};


export const UNIT_FIELD_REGISTRY: SectionFieldRegistry = {
  unitname: simpleField(stringField('', 6), {
    brief: 'Unit name for tracking.',
    verbose: 'Tracking/display name for this unit.'
  }),
  unitinstructions: simpleField(textareaField(''), {
    brief: 'Instructions shown before the unit.',
    verbose: 'HTML or text instructions shown before the unit begins.'
  }),
  unitinstructionsquestion: simpleField(textareaField(''), {
    brief: 'Question shown with instructions.',
    verbose: 'Supplemental instructions question/prompt text.'
  }),
  buttonorder: simpleField(enumStringField(['fixed', 'random'], 'fixed', 4), {
    brief: 'Button arrangement order.',
    verbose: 'Controls fixed vs randomized button order.'
  }),
  buttontrial: simpleField(legacyBooleanField('false'), {
    brief: 'Use the button-based answer UI.',
    verbose: 'Enable button-choice trials instead of typed responses.'
  }),
  buttonOptions: simpleField(textareaField(''), {
    brief: 'Button choices.',
    verbose: 'Comma-delimited list of button trial options.'
  }),
  instructionminseconds: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 4), {
    brief: 'Minimum instruction time.',
    verbose: 'Minimum number of seconds learners must remain on instructions.'
  }, {
    validation: {
      validators: [{ type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }],
      severity: 'error',
    },
  }),
  instructionmaxseconds: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'integer' }] }, 4), {
    brief: 'Maximum instruction time.',
    verbose: 'Maximum number of seconds learners may remain on instructions.'
  }, {
    validation: {
      validators: [{ type: 'nonNegativeInteger', message: 'Must be a non-negative integer' }],
      severity: 'error',
    },
  }),
  picture: simpleField(stringField('', 12), {
    brief: 'Instruction image filename.',
    verbose: 'Image shown alongside the instruction content.'
  }),
  continueButtonText: simpleField(stringField('', 6), {
    brief: 'Continue button label override.',
    verbose: 'Unit-level override for the continue button label.'
  }),
  countcompletion: simpleField(
    withGrid({ anyOf: [{ type: 'boolean' }, { type: 'string' }, { type: 'integer' }] }, 4),
    {
      brief: 'Increment participant count on this unit.',
      verbose: 'Unit-level completion-counting hook for experiments.'
    }
  ),
  recordInstructions: simpleField(legacyBooleanField('true'), {
    brief: 'Record this instruction screen.',
    verbose: 'Controls whether instruction viewing time is logged for this unit.'
  }, {
    surfaces: { learnerConfig: false },
  }),
  turkemailsubject: simpleField(stringField('', 12), {
    brief: 'MTurk reminder email subject.',
    verbose: 'Subject line used for Turk reminder messages.'
  }),
  turkemail: simpleField(textareaField(''), {
    brief: 'MTurk reminder email body.',
    verbose: 'Body text for Turk reminder messages.'
  }),
  turkbonus: simpleField(withGrid({ anyOf: [{ type: 'string' }, { type: 'number' }] }, 4), {
    brief: 'MTurk bonus amount.',
    verbose: 'Bonus amount associated with reaching this unit.'
  }),
  adaptive: simpleField(stringArrayField('Adaptive Targets', 'Adaptive Target'), {
    brief: 'Adaptive scheduling targets.',
    verbose: 'Adaptive unit directives such as "2,t".'
  }),
  adaptiveUnitTemplate: simpleField(integerArrayField('Adaptive Unit Templates', 'Unit Template Index'), {
    brief: 'Adaptive template indices.',
    verbose: 'Unit-template indices used when adaptive logic inserts new units.'
  }),
  adaptiveLogic: simpleField(
    {
      type: 'object',
      title: 'Adaptive Logic',
      propertyNames: { pattern: '^[0-9]+$' },
      patternProperties: {
        '^[0-9]+$': {
          type: 'array',
          title: 'Adaptive Rules',
          items: {
            type: 'string',
            title: 'Adaptive Rule',
          },
        },
      },
      additionalProperties: false,
    },
    {
      brief: 'Adaptive branching logic.',
      verbose: 'Maps unit indices to arrays of adaptive branching rules.'
    }
  ),
};


export const LEARNING_SESSION_FIELD_REGISTRY: SectionFieldRegistry = {
  clusterlist: simpleField(stringField('', 12), {
    brief: 'Cluster range list.',
    verbose: 'Space-delimited cluster ranges used by the learning session.'
  }, {
    validation: {
      validators: [
        { type: 'clusterlistFormat', message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-6 12-17")' },
        { type: 'clusterlistBounds', message: 'Cluster index out of bounds' },
      ],
      severity: 'error',
      breaking: true,
    },
  }),
  unitMode: simpleField(stringField('', 4), {
    brief: 'Item-selection algorithm.',
    verbose: 'Unit engine mode used when selecting the next learning item.'
  }),
  calculateProbability: simpleField(textareaField(''), {
    brief: 'Custom probability function.',
    verbose: 'JavaScript function body used to customize item probability calculations.'
  }),
  stimulusfile: simpleField(stringField('', 12), {
    brief: 'Learning-session stimulus file.',
    verbose: 'Optional learning-session-level stimulus filename used by content lookup workflows.'
  }, {
    surfaces: { learnerConfig: false },
  }),
};


export const ASSESSMENT_CONDITION_TEMPLATES_FIELD_REGISTRY: SectionFieldRegistry = {
  groupnames: simpleField(stringField('', 6), {
    brief: 'Condition group letters.',
    verbose: 'Space-delimited group labels such as "A B C".'
  }),
  clustersrepeated: simpleField(stringField('', 6), {
    brief: 'Cluster repetitions per group.',
    verbose: 'Space-delimited counts for how many times clusters repeat per group.'
  }),
  templatesrepeated: simpleField(stringField('', 6), {
    brief: 'Template repetition counts.',
    verbose: 'Space-delimited counts for how many times each group template repeats.'
  }),
  group: simpleField({
    anyOf: [
      { type: 'string', title: 'Group Templates' },
      {
        type: 'array',
        title: 'Group Templates',
        items: {
          type: 'string',
          title: 'Group Template',
        },
      },
    ],
  }, {
    brief: 'Group trial templates.',
    verbose: 'Trial specifications per group. Supports a single string or an array of strings.'
  }),
  initialpositions: simpleField(stringField('', 12), {
    brief: 'Initial template positions.',
    verbose: 'Space-delimited initial schedule positions such as "A_1 A_2 B_1".'
  }),
};


export const ASSESSMENT_SESSION_FIELD_REGISTRY: SectionFieldRegistry = {
  clusterlist: simpleField(stringField('', 12), {
    brief: 'Cluster range list.',
    verbose: 'Space-delimited cluster ranges used by the assessment session.'
  }, {
    validation: {
      validators: [
        { type: 'clusterlistFormat', message: 'Invalid format. Use "start-end" pairs separated by spaces (e.g., "0-6 12-17")' },
        { type: 'clusterlistBounds', message: 'Cluster index out of bounds' },
      ],
      severity: 'error',
      breaking: true,
    },
  }),
  randomizegroups: simpleField(legacyBooleanField('false'), {
    brief: 'Randomize within groups.',
    verbose: 'Randomize order within each assessment condition group.'
  }),
  permutefinalresult: simpleField(stringField('', 12), {
    brief: 'Permute final schedule ranges.',
    verbose: 'Space-delimited final-result ranges to permute independently.'
  }),
  swapfinalresult: simpleField(stringField('', 12), {
    brief: 'Swap final schedule ranges.',
    verbose: 'Space-delimited final-result ranges treated as swappable blocks.'
  }),
  assignrandomclusters: simpleField(legacyBooleanField('false'), {
    brief: 'Re-randomize cluster assignment.',
    verbose: 'Randomize cluster assignment before schedule creation.'
  }),
  initialpositions: simpleField(stringField('', 12), {
    brief: 'Initial positions.',
    verbose: 'Initial assessment template positions.'
  }),
  randomchoices: simpleField(stringField('', 6), {
    brief: 'Random choice count or range.',
    verbose: 'Random-choice selector used when a group template asks for a random item.'
  }),
};


export const VIDEO_SESSION_FIELD_REGISTRY: SectionFieldRegistry = {
  videosource: simpleField(stringField('', 12), {
    brief: 'Video URL or source.',
    verbose: 'Source URL or file for the video session.'
  }, {
    validation: {
      validators: [{ type: 'url', message: 'Must be a valid URL' }],
      severity: 'warning',
    },
  }),
  questions: simpleField({
    anyOf: [
      { type: 'string', title: 'Question Clusters' },
      integerArrayField('Question Clusters', 'Cluster Index'),
    ],
  }, {
    brief: 'Question cluster indices.',
    verbose: 'Question cluster indices or a range string used by the video session.'
  }),
  questiontimes: simpleField(integerArrayField('Question Times', 'Question Time'), {
    brief: 'Question checkpoint times.',
    verbose: 'Timestamps where video questions should appear.'
  }),
  checkpointBehavior: simpleField(enumStringField(['pause', 'adaptive', 'none'], undefined, 4), {
    brief: 'Checkpoint mode.',
    verbose: 'Controls how video checkpoints are interpreted.'
  }),
  checkpoints: simpleField({
    type: 'array',
    title: 'Checkpoints',
    items: {
      type: 'object',
      title: 'Checkpoint',
      properties: {
        time: {
          type: 'number',
          title: 'Checkpoint time',
          description: 'Video timestamp, in seconds, when this checkpoint question should appear.',
        },
      },
      required: ['time'],
      additionalProperties: false,
    },
  }, {
    brief: 'Explicit checkpoint definitions.',
    verbose: 'Checkpoint timestamps used by adaptive video flows.'
  }),
  preventScrubbing: simpleField(legacyBooleanField('false'), {
    brief: 'Prevent scrubbing ahead in the video.',
    verbose: 'Disallow learner seeking/scrubbing beyond the allowed point.'
  }),
  rewindOnIncorrect: simpleField(legacyBooleanField('false'), {
    brief: 'Rewind after incorrect answers.',
    verbose: 'Rewind the video after an incorrect checkpoint answer.'
  }),
  repeatQuestionsSinceCheckpoint: simpleField(legacyBooleanField('false'), {
    brief: 'Repeat questions since the last checkpoint.',
    verbose: 'Repeat checkpoint questions after rewinding to the previous anchor.'
  }),
  unitMode: simpleField(stringField('', 4), {
    brief: 'Video-session selection algorithm.',
    verbose: 'Learning engine unit mode used by mixed video/question sessions.'
  }),
  calculateProbability: simpleField(textareaField(''), {
    brief: 'Custom probability function.',
    verbose: 'Probability function used by adaptive video question selection.'
  }),
  adaptiveLogic: simpleField({
    anyOf: [
      {
        type: 'array',
        title: 'Adaptive Logic Rules',
        items: {
          type: 'string',
          title: 'Adaptive Logic Rule',
        },
      },
      {
        type: 'object',
        title: 'Adaptive Logic',
        additionalProperties: true,
      },
    ],
  }, {
    brief: 'Adaptive video question logic.',
    verbose: 'Adaptive logic rules used by video sessions to select or insert questions/checkpoints.'
  }, {
    surfaces: { learnerConfig: false },
  }),
  displayText: simpleField(textareaField(''), {
    brief: 'Supplemental video text.',
    verbose: 'Display text associated with the video session.'
  }),
};


export const SETSPEC_DIRECT_RUNTIME_KEYS = Object.freeze([
  'allowRevisitUnit',
  'audioInputEnabled',
  'audioInputSensitivity',
  'audioPromptFeedbackVolume',
  'audioPromptFeedbackVoice',
  'audioPromptMode',
  'audioPromptQuestionSpeakingRate',
  'audioPromptQuestionVolume',
  'audioPromptSpeakingRate',
  'audioPromptVoice',
  'condition',
  'conditionTdfIds',
  'countcompletion',
  'disableProgressReport',
  'duedate',
  'enableAudioPromptAndFeedback',
  'experimentPasswordRequired',
  'loadbalancing',
  'prestimulusDisplay',
  'progressReporterParams',
  'randomizedDelivery',
  'recordInstructions',
  'showPageNumbers',
  'speechRecognitionLanguage',
  'speechIgnoreOutOfGrammarResponses',
  'speechOutOfGrammarFeedback',
  'textToSpeechAPIKey',
  'textToSpeechLanguage',
  'tips',
]);


export const UNIT_DIRECT_RUNTIME_KEYS = Object.freeze([
  'adaptive',
  'adaptiveLogic',
  'adaptiveUnitTemplate',
  'buttonOptions',
  'buttonorder',
  'buttontrial',
  'continueButtonText',
  'countcompletion',
  'instructionmaxseconds',
  'instructionminseconds',
  'picture',
  'recordInstructions',
  'turkbonus',
  'turkemail',
  'turkemailsubject',
  'unitinstructions',
  'unitinstructionsquestion',
  'unitname',
]);


export const LEARNING_SESSION_DIRECT_RUNTIME_KEYS = Object.freeze([
  'calculateProbability',
  'clusterlist',
  'stimulusfile',
  'unitMode',
]);


export const ASSESSMENT_SESSION_DIRECT_RUNTIME_KEYS = Object.freeze([
  'assignrandomclusters',
  'clusterlist',
  'conditiontemplatesbygroup',
  'initialpositions',
  'permutefinalresult',
  'randomchoices',
  'randomizegroups',
  'swapfinalresult',
]);


export const VIDEO_SESSION_DIRECT_RUNTIME_KEYS = Object.freeze([
  'adaptiveLogic',
  'calculateProbability',
  'checkpointBehavior',
  'checkpoints',
  'displayText',
  'preventScrubbing',
  'questiontimes',
  'questions',
  'repeatQuestionsSinceCheckpoint',
  'rewindOnIncorrect',
  'unitMode',
  'videosource',
]);
