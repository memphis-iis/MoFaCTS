export { getCourse, getHistory };

function getCourse(course: any) {
  return {
    courseId: course.courseid,
    courseName: course.coursename,
    teacherUserId: course.teacheruserid,
    semester: course.semester,
    beginDate: course.begindate,
    endDate: course.enddate,
  };
}

function getHistory(history: any) {
  const normalizeOutcome = (value: unknown) => {
    const outcome = typeof value === 'string' ? value.trim() : '';
    if (!outcome) return '';
    const normalized = outcome.toLowerCase();
    if (normalized === 'correct') return 'CORRECT';
    if (normalized === 'incorrect' || normalized === 'timeout') return 'INCORRECT';
    if (normalized === 'study') return 'STUDY';
    return outcome;
  };

  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  const problemStartTime = history.problemStartTime ?? history.time;

  const resolveTransactionTime = () => {
    if (history.problemStartTime !== undefined && history.problemStartTime !== null) {
      return history.time;
    }
    if (normalizeOutcome(history.outcome) === 'STUDY') {
      return problemStartTime;
    }
    if (isFiniteNumber(problemStartTime) && isFiniteNumber(history.CFStartLatency) && history.CFStartLatency >= 0) {
      return problemStartTime + history.CFStartLatency;
    }
    return history.time;
  };

  const inferSelection = () => {
    if (history.selection) return history.selection;
    if (history.levelUnitType === 'Instruction') return 'instruction';
    if (history.CFVideoAction) return 'video';
    if (history.CFButtonOrder) return 'multiple choice';
    return 'answer';
  };

  const inferAction = () => {
    if (history.action) return history.action;
    if (history.levelUnitType === 'Instruction') return 'continue';
    if (history.CFVideoAction) return history.CFVideoAction;
    if (normalizeOutcome(history.outcome) === 'STUDY') return 'study';
    return 'respond';
  };

  const historyOutput = {
    eventId: history.eventId,
    'Selection': inferSelection(),
    'Action': inferAction(),
    'KC Category(Default)': '',
    'KC Category(Cluster)': '',
    'CF (Overlearning)': false,
    'CF (Note)': '',
    'itemid': history.itemId,
    'useridtdfid': history.userIdTDFId,
    'kcid': history.KCId,
    'responseduration': history.responseDuration,
    'probabilityestimate': history.probabilityEstimate,
    'typeofresponse': history.typeOfResponse,
    'responsevalue': history.responseValue,
    'displayedstimulus': JSON.stringify(history.displayedStimulus),
    'Anon Student Id': history.anonStudentId,
    'Session Id': history.sessionID,
    'Condition Namea': history.conditionNameA,
    'Condition Typea': history.conditionTypeA,
    'Condition Nameb': history.conditionNameB,
    'Condition Typeb': history.conditionTypeB,
    'Condition Namec': history.conditionNameC,
    'Condition Typec': history.conditionTypeC,
    'Condition Named': history.conditionNameD,
    'Condition Typed': history.conditionTypeD,
    'Condition Namee': history.conditionNameE,
    'Condition Typee': history.conditionTypeE,
    'Level (Unit)': history.levelUnit,
    'Level (Unitname)': history.levelUnitName,
    'Level (Unittype)': history.levelUnitType,
    'Problem Name': JSON.stringify(history.problemName),
    'Step Name': JSON.stringify(history.stepName),
    'Time': resolveTransactionTime(),
    'Problem Start Time': problemStartTime,
    'Input': history.input,
    'Outcome': normalizeOutcome(history.outcome),
    'Student Response Type': history.studentResponseType,
    'Student Response Subtype': history.studentResponseSubtype,
    'Tutor Response Type': history.tutorResponseType,
    'Tutor Response Subtype': "",
    'KC (Default)': history.KCDefault,
    'KC (Cluster)': history.KCCluster,
    'CF (Audio Input Enabled)': history.CFAudioInputEnabled,
    'CF (Audio Output Enabled)': history.CFAudioOutputEnabled,
    'CF (Display Order)': history.CFDisplayOrder,
    'CF (Stim File Index)': history.CFStimFileIndex,
    'CF (Set Shuffled Index)': history.CFSetShuffledIndex,
    'CF (Alternate Display Index)': history.CFAlternateDisplayIndex,
    'CF (Stimulus Version)': history.CFStimulusVersion,
    'CF (Correct Answer)': history.CFCorrectAnswer,
    'CF (Response Duration)': history.responseDuration,
    'CF (Start Latency)': history.CFStartLatency,
    'CF (End Latency)': history.CFEndLatency,
    'CF (Feedback Latency)': history.CFFeedbackLatency,
    'CF (Review Entry)': history.CFReviewEntry,
    'CF (Button Order)': history.CFButtonOrder,
    'CF (Item Removed)': history.CFItemRemoved,
    'CF (Entry Point)': history.entryPoint,
    'CF (Video TimeStamp)': history.CFVideoTimeStamp,
    'CF (Video Seek Start)': history.CFVideoSeekStart,
    'CF (Video Seek End)': history.CFVideoSeekEnd,
    'CF (Video Current Speed)': history.CFVideoCurrentSpeed,
    'CF (Video Current Volume)': history.CFVideoCurrentVolume,
    'CF (Video Previous Speed)': history.CFVideoPreviousSpeed,
    'CF (Video Previous Volume)': history.CFVideoPreviousVolume,
    'CF (Video Is Playing)': history.CFVideoIsPlaying,
    'Feedback Text': history.feedbackText,
    'Feedback Classification': history.feedbackType,
    'Event Type': history.eventType,
    'dynamicTagFields': history.dynamicTagFields,
    'recordedServerTime': history.recordedServerTime,
  };
  return historyOutput;
}
