import {
  booleanField,
  createClosedObjectSchema,
  simpleField,
  stringArrayField,
  stringField,
  textareaField,
  withGrid,
  type SectionFieldRegistry,
} from './fieldRegistrySectionCore.ts';

export const STIM_CLUSTER_FIELD_REGISTRY: SectionFieldRegistry = {
  imageStimulus: simpleField(stringField('', 12), {
    brief: 'Cluster image stimulus.',
    verbose: 'Cluster-level image asset used when stims inherit the shared image.'
  }, {
    validation: {
      validators: [{ type: 'mediaExists', mediaType: 'image', message: 'Cluster image file not found' }],
      severity: 'warning',
    },
  }),
  audioStimulus: simpleField(stringField('', 12), {
    brief: 'Cluster audio stimulus.',
    verbose: 'Cluster-level audio asset used when stims inherit the shared audio.'
  }, {
    validation: {
      validators: [{ type: 'mediaExists', mediaType: 'audio', message: 'Cluster audio file not found' }],
      severity: 'warning',
    },
  }),
  videoStimulus: simpleField(stringField('', 12), {
    brief: 'Cluster video stimulus.',
    verbose: 'Cluster-level video asset used when stims inherit the shared video.'
  }, {
    validation: {
      validators: [{ type: 'urlOrMediaExists', mediaType: 'video', message: 'Cluster video not found and not a valid URL' }],
      severity: 'warning',
    },
  }),
};


export const STIM_DISPLAY_FIELD_REGISTRY: SectionFieldRegistry = {
  text: simpleField(textareaField(''), {
    brief: 'Question/stimulus text.',
    verbose: 'Main question or stimulus text displayed to the learner. HTML is supported for formatting.'
  }),
  clozeText: simpleField(textareaField(''), {
    brief: 'Cloze sentence text.',
    verbose: 'Question text with a blank for fill-in. Use with clozeStimulus for the answer word.'
  }),
  clozeStimulus: simpleField(stringField('', 12), {
    brief: 'Cloze answer token.',
    verbose: 'The answer word to insert in the clozeText blank. Paired with clozeText for fill-in-the-blank questions.'
  }),
  imgSrc: simpleField(stringField('', 12), {
    brief: 'Stim image filename.',
    verbose: 'Filename of the image to display as the stimulus. Accepted formats include JPEG, PNG, GIF, WebP, and SVG; the file must be uploaded in the same package.'
  }, {
    validation: {
      validators: [{ type: 'mediaExists', mediaType: 'image', message: 'Image file not found' }],
      severity: 'warning',
    },
  }),
  audioSrc: simpleField(stringField('', 12), {
    brief: 'Stim audio filename.',
    verbose: 'Filename of the audio to play as the stimulus. Accepted formats include MP3, WAV, OGG, and M4A; the file must be uploaded in the same package.'
  }, {
    validation: {
      validators: [{ type: 'mediaExists', mediaType: 'audio', message: 'Audio file not found' }],
      severity: 'warning',
    },
  }),
  videoSrc: simpleField(stringField('', 12), {
    brief: 'Stim video URL or filename.',
    verbose: 'URL or filename of the video to display. Accepted formats include MP4, WebM, and OGG; values can be external URLs or uploaded local files.'
  }, {
    validation: {
      validators: [{ type: 'urlOrMediaExists', mediaType: 'video', message: 'Video file not found and not a valid URL' }],
      severity: 'warning',
    },
  }),
  h5p: simpleField({
    type: 'object',
    title: 'H5P display',
    required: ['sourceType', 'completionPolicy'],
    additionalProperties: false,
    properties: {
      sourceType: {
        type: 'string',
        enum: ['external-embed', 'self-hosted'],
        default: 'external-embed',
      },
      embedUrl: {
        type: 'string',
        default: '',
      },
      completionPolicy: {
        type: 'string',
        enum: ['viewed', 'manual-continue', 'xapi-completed', 'xapi-passed'],
        default: 'manual-continue',
      },
      preferredHeight: {
        type: 'number',
        minimum: 1,
      },
      scorePolicy: {
        type: 'string',
        enum: ['correct-if-passed', 'correct-if-full-score', 'record-only'],
      },
      contentId: {
        type: 'string',
      },
      packageAssetId: {
        type: 'string',
      },
      library: {
        type: 'string',
      },
    },
  }, {
    brief: 'H5P interactive display.',
    verbose: 'H5P activity metadata for learner display. Phase 1 supports passive external iframe embeds only.'
  }, {
    validation: {
      validators: [{ type: 'h5pDisplayConfig', message: 'Invalid H5P display configuration' }],
      severity: 'error',
      breaking: true,
    },
  }),
  attribution: simpleField(createClosedObjectSchema('Attribution', {
    creatorName: simpleField(stringField('', 12), {
      brief: 'Attribution creator name.',
      verbose: 'Visible creator/author name shown with licensed media.'
    }),
    sourceName: simpleField(stringField('Wikimedia Commons', 12), {
      brief: 'Attribution source label.',
      verbose: 'Visible source label shown in the attribution caption.'
    }),
    sourceUrl: simpleField(stringField('', 12), {
      brief: 'Attribution source URL.',
      verbose: 'Source page opened when the learner clicks the attribution caption.'
    }, {
      validation: {
        validators: [{ type: 'url', message: 'Must be a valid URL' }],
        severity: 'warning',
      },
    }),
    licenseName: simpleField(stringField('', 12), {
      brief: 'Attribution license name.',
      verbose: 'Visible license label shown in the attribution caption.'
    }),
    licenseUrl: simpleField(stringField('', 12), {
      brief: 'Attribution license URL.',
      verbose: 'Optional license detail URL for the attributed media.'
    }, {
      validation: {
        validators: [{ type: 'url', message: 'Must be a valid URL' }],
        severity: 'warning',
      },
    }),
  }), {
    brief: 'Prompt media attribution.',
    verbose: 'Creator, source, and license metadata rendered as a linked caption for the prompt media.'
  }),
};


export const STIM_RESPONSE_FIELD_REGISTRY: SectionFieldRegistry = {
  correctResponse: simpleField(stringField('', 12), {
    brief: 'Expected correct response.',
    verbose: 'The exact answer the learner should provide. Used for answer evaluation and feedback.'
  }, {
    validation: {
      validators: [
        { type: 'required', message: 'Correct response is required' },
        { type: 'invisibleUnicode', message: 'Contains invisible characters (U+0080-U+00FF) that will be stripped' },
      ],
      severity: 'error',
    },
  }),
  incorrectResponses: simpleField(stringArrayField('Incorrect Responses', 'Incorrect Response'), {
    brief: 'Common incorrect responses.',
    verbose: 'Array of common incorrect answers. Optional, but useful for multiple-choice distractors and speech-recognition grammar support.'
  }, {
    validation: {
      validators: [
        { type: 'invisibleUnicodeArray', message: 'Contains invisible characters (U+0080-U+00FF) that will be stripped' },
        { type: 'mcRequiresIncorrect', message: 'Multiple choice questions should have incorrect responses defined' },
      ],
      severity: 'warning',
    },
  }),
};


export const STIM_FIELD_REGISTRY: SectionFieldRegistry = {
  parameter: simpleField(stringField('', 6), {
    brief: 'Stimulus parameter metadata.',
    verbose: 'Comma-separated optional parameters for advanced scoring algorithms. The second value is reserved for the item-specific optimal difficulty threshold.'
  }, {
    validation: {
      validators: [{ type: 'parameterFormat', message: 'Parameter should be "number,number" format (e.g., "0,.7")' }],
      severity: 'warning',
    },
  }),
  optimalProb: simpleField(withGrid({ anyOf: [{ type: 'number' }, { type: 'string' }] }, 4), {
    brief: 'Stimulus optimum probability override.',
    verbose: 'Item-specific optimum probability used by the learning model.'
  }, {
    validation: {
      validators: [{ type: 'numeric', message: 'optimalProb must be a number' }],
      severity: 'error',
    },
  }),
  speechHintExclusionList: simpleField(stringField('', 12), {
    brief: 'Speech-hint exclusion list.',
    verbose: 'Comma-delimited words to exclude from speech-recognition matching, helping prevent false positives for common words.'
  }),
  autoTutor: simpleField({
    type: 'object',
    title: 'AutoTutor Script',
    additionalProperties: false,
    required: ['id', 'topic', 'learningGoal', 'idealAnswer', 'expectations', 'misconceptions', 'dialogPolicy', 'summary'],
    properties: {
      id: stringField('', 6),
      topic: stringField('', 6),
      learningGoal: textareaField(''),
      idealAnswer: textareaField(''),
      expectations: {
        type: 'array',
        title: 'Expectations',
        minItems: 1,
        items: {
          type: 'object',
          title: 'Expectation',
          additionalProperties: false,
          required: ['id', 'label', 'proposition', 'hints', 'prompts', 'assertion'],
          properties: {
            id: stringField('', 4),
            label: stringField('', 6),
            proposition: textareaField(''),
            acceptableVariants: stringArrayField('Acceptable Variants', 'Acceptable Variant'),
            commonPartialAnswers: stringArrayField('Common Partial Answers', 'Common Partial Answer'),
            hints: stringArrayField('Hints', 'Hint'),
            prompts: {
              type: 'array',
              title: 'Prompts',
              items: {
                type: 'object',
                title: 'Prompt',
                additionalProperties: false,
                required: ['stem', 'target'],
                properties: {
                  stem: textareaField(''),
                  target: stringField('', 12),
                },
              },
            },
            assertion: textareaField(''),
          },
        },
      },
      misconceptions: {
        type: 'array',
        title: 'Misconceptions',
        items: {
          type: 'object',
          title: 'Misconception',
          additionalProperties: false,
          required: ['id', 'label', 'misconception', 'detectionCues', 'contrastWithExpectations', 'correction', 'repairQuestion'],
          properties: {
            id: stringField('', 4),
            label: stringField('', 6),
            misconception: textareaField(''),
            detectionCues: stringArrayField('Detection Cues', 'Detection Cue'),
            contrastWithExpectations: stringArrayField('Contrasted Expectations', 'Expectation ID'),
            correction: textareaField(''),
            repairQuestion: textareaField(''),
          },
        },
      },
      dialogPolicy: {
        type: 'object',
        title: 'Dialogue Policy',
        additionalProperties: false,
        required: ['allowAnyOrder', 'requiredExpectations', 'completionRule'],
        properties: {
          allowAnyOrder: booleanField(true, 4),
          requiredExpectations: stringArrayField('Required Expectations', 'Expectation ID'),
          optionalExpectations: stringArrayField('Optional Expectations', 'Expectation ID'),
          ifStudentIsClose: textareaField(''),
          ifStudentIsWrong: textareaField(''),
          ifStudentIsStuck: textareaField(''),
          completionRule: textareaField(''),
        },
      },
      summary: textareaField(''),
    },
  }, {
    brief: 'AutoTutor curriculum script.',
    verbose: 'Structured AutoTutor script for the first stim in a referenced AutoTutor cluster, including expectations, misconceptions, prompts, corrections, and summary.'
  }),
  alternateDisplays: simpleField({
    type: 'array',
    title: 'Alternate Displays',
    items: createClosedObjectSchema('Alternate Display', STIM_DISPLAY_FIELD_REGISTRY),
  }, {
    brief: 'Alternate display variants.',
    verbose: 'Array of alternate display objects, such as clozeText/clozeStimulus pairs, that provide additional question variations for the same item.'
  }),
};


export const STIM_CLUSTER_DIRECT_RUNTIME_KEYS = Object.freeze([
  'audioStimulus',
  'imageStimulus',
  'videoStimulus',
]);


export const STIM_DIRECT_RUNTIME_KEYS = Object.freeze([
  'alternateDisplays',
  'autoTutor',
  'optimalProb',
  'parameter',
  'speechHintExclusionList',
]);


export const STIM_DISPLAY_DIRECT_RUNTIME_KEYS = Object.freeze([
  'audioSrc',
  'attribution',
  'clozeStimulus',
  'clozeText',
  'h5p',
  'imgSrc',
  'text',
  'videoSrc',
]);


export const STIM_RESPONSE_DIRECT_RUNTIME_KEYS = Object.freeze([
  'correctResponse',
  'incorrectResponses',
]);
