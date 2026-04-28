export const curSemester = 'SU_2022';
export const INVALID = 'invalid';
export const ENTER_KEY = 13;
export const KC_MULTIPLE = 10000;
export const STIM_PARAMETER = '0,.7';
export const MODEL_UNIT = 'model';
export const SCHEDULE_UNIT = 'schedule';
export const VIDEO_UNIT = 'video';
// Define an ordering for the fields and the column name we'll put in the
// output file. Note that these names must match the fields used in populate
// record.
export const outputFields = [
  'Anon Student Id', // username
  'Session Id',
  'Condition Namea', // new field? always == 'tdf file'************
  'Condition Typea', // selectedTdf
  'Condition Nameb', // new field? always == 'xcondition'************
  'Condition Typeb', // xcondition
  'Condition Namec', // new field? always == 'schedule condition" ***********
  'Condition Typec', // schedCondition
  'Condition Named', // new field? always == 'how answered'*******
  'Condition Typed', // howAnswered
  // "Condition Namee", //new field? always == 'button trial'***********
  // "Condition Typee", //wasButtonTrial
  'Level (Unit)', // unit
  'Level (Unitname)', // unitname
  'Level (Unittype)',
  'Problem Name', // questionValue
  'Step Name', // new field repeats questionValue
  'Time',
  'Problem Start Time',
  'Selection',
  'Action',
  'Input', // userAnswer
  'Outcome', // answerCorrect recoded as CORRECT or INCORRECT
  'Student Response Type', // trialType
  'Student Response Subtype', // qtype
  'Tutor Response Type', // trialType
  'Tutor Response Subtype', // qtype
  'Feedback Classification',
  'Feedback Text',
  'KC (Default)',
  'KC Category(Default)',
  'KC (Cluster)',
  'KC Category(Cluster)',
  'CF (Audio Input Enabled)',
  'CF (Audio Output Enabled)',
  'CF (Display Order)', // questionIndex
  'CF (Stim File Index)', // clusterIndex
  'CF (Set Shuffled Index)', // shufIndex
  'CF (Alternate Display Index)', // index of which alternate display used, if applicable
  'CF (Stimulus Version)', // whichStim
  'CF (Correct Answer)', // CF correctAnswer
  'CF (Overlearning)', // CF isOverlearning
  'CF (Response Duration)',
  'CF (Start Latency)', // startLatency check first trial discrepancy********
  'CF (End Latency)', // endLatency
  'CF (Feedback Latency)', // time from user answer to end of feedback
  'CF (Review Entry)', // forceCorrectFeedback
  'CF (Button Order)', // CF buttonOrder
  'CF (Item Removed)', // item was reported by the user as wrong
  'CF (Note)', // CF note
  'CF (Entry Point)',
  'CF (Video TimeStamp)',
  'CF (Video Seek Start)',
  'CF (Video Seek End)',
  'CF (Video Current Speed)',
  'CF (Video Current Volume)',
  'CF (Video Previous Speed)',
  'CF (Video Previous Volume)',
  'CF (Video Is Playing)',
  'Event Type',
];

// Map of numeric codes to history field names for DDP payload compression.
// This reduces JSON payload size by ~50% during transmission.
export const HISTORY_KEY_MAP: Record<string, string> = {
  '01': 'itemId',
  '02': 'KCId',
  '03': 'userId',
  '04': 'TDFId',
  '05': 'outcome',
  '06': 'probabilityEstimate',
  '07': 'typeOfResponse',
  '08': 'responseValue',
  '09': 'displayedStimulus',
  '10': 'sectionId',
  '11': 'teacherId',
  '12': 'anonStudentId',
  '13': 'sessionID',
  '14': 'conditionNameA',
  '15': 'conditionTypeA',
  '16': 'conditionNameB',
  '17': 'conditionTypeB',
  '18': 'conditionNameC',
  '19': 'conditionTypeC',
  '20': 'conditionNameD',
  '21': 'conditionTypeD',
  '22': 'conditionNameE',
  '23': 'conditionTypeE',
  '24': 'responseDuration',
  '25': 'levelUnit',
  '26': 'levelUnitName',
  '27': 'levelUnitType',
  '28': 'problemName',
  '29': 'stepName',
  '30': 'time',
  '31': 'problemStartTime',
  '32': 'selection',
  '33': 'action',
  '34': 'input',
  '35': 'studentResponseType',
  '36': 'studentResponseSubtype',
  '37': 'tutorResponseType',
  '38': 'KCDefault',
  '39': 'KCCategoryDefault',
  '40': 'KCCluster',
  '41': 'KCCategoryCluster',
  '42': 'CFAudioInputEnabled',
  '43': 'CFAudioOutputEnabled',
  '44': 'CFDisplayOrder',
  '45': 'CFStimFileIndex',
  '46': 'CFSetShuffledIndex',
  '47': 'CFAlternateDisplayIndex',
  '48': 'CFStimulusVersion',
  '49': 'CFCorrectAnswer',
  '50': 'CFOverlearning',
  '51': 'CFResponseTime',
  '52': 'CFStartLatency',
  '53': 'CFEndLatency',
  '54': 'CFFeedbackLatency',
  '55': 'CFReviewEntry',
  '56': 'CFButtonOrder',
  '57': 'CFItemRemoved',
  '58': 'CFNote',
  '59': 'feedbackText',
  '60': 'feedbackType',
  '61': 'instructionQuestionResult',
  '62': 'entryPoint',
  '63': 'eventType',
  '64': 'CFVideoTimeStamp',
  '65': 'CFVideoSeekStart',
  '66': 'CFVideoSeekEnd',
  '67': 'CFVideoCurrentSpeed',
  '68': 'CFVideoCurrentVolume',
  '69': 'CFVideoPreviousSpeed',
  '70': 'CFVideoPreviousVolume',
  '71': 'CFVideoIsPlaying',
  '72': 'CFVideoAction'
};
