// Plyr loaded from CDN in index.html
import { Session } from 'meteor/session';
import { extractDelimFields, rangeVal } from './currentTestingHelpers';
import { ExperimentStateStore } from './state/experimentStateStore';
import { clientConsole } from './clientLogger';
import { UiSettingsStore } from './state/uiSettingsStore';

import { legacyTrim } from '../../common/underscoreCompat';

const MeteorAny = Meteor as any;
const PlyrAny = (globalThis as any).Plyr;

export let playerController: any;

async function newQuestionHandler() {
  return;
}

function getUnitEngine() {
  return Session.get('unitEngine');
}

class PlayerController {
  [key: string]: any;
  player: any;
  currentCheckpointIndex = 0;  
  maxAllowedTime = 0;         
  allowSeeking = false;       

  lastVolume: any;
  lastSpeed: any;
  lastTimeIndex = 0;
  lastlogicIndex = 0;
  nextTimeIndex = 0;
  nextTime = 0;
  seekStart: any;
  loggingSeek = false;
  fullscreenUser = false;
  questioningComplete = false;

  // Checkpoint-related properties
  preventScrubbing = false;
  rewindOnIncorrect = false;
  checkpointBehavior = 'none';
  repeatQuestionsSinceCheckpoint = false;
  checkpoints: any[] = [];
  completedQuestions = new Set<any>();
  questionsToRepeat: any[] = [];

  times: any[] = [];
  questions: any[] = [];

  constructor(playerElement: any, times: any[], questions: any[], points: any[]) {
    const videoSession = (Session.get('currentTdfUnit') as any).videosession;
    this.preventScrubbing = videoSession.preventScrubbing || false;
    this.rewindOnIncorrect = videoSession.rewindOnIncorrect || false;
    this.checkpointBehavior = videoSession.checkpointBehavior || 'none'
    this.repeatQuestionsSinceCheckpoint = videoSession.repeatQuestionsSinceCheckpoint || false;
    
    // Initialize checkpoints based on behavior
    this.checkpoints = [];
    this.questionTimes = times || [];
    this.questions = questions || [];
    this.currentQuestionIndex = 0;
    this.completedQuestions = new Set(); // Track which questions have been answered correctly
    this.questionsToRepeat = []; // Track questions that need to be repeated after rewind
    
    if (this.checkpointBehavior === 'all') {
      // Use all question times as checkpoints
      this.checkpoints = times.map((time: any) => ({ time }));
    } else if (this.checkpointBehavior === 'some') {
      // Use question times where stim has checkpoint:true
      this.checkpoints = this.buildSelectiveCheckpoints(times, questions);
    } else if (this.checkpointBehavior === 'adaptive' && videoSession.checkpoints) {
      // Use adaptively generated checkpoints
      this.checkpoints = videoSession.checkpoints.slice();
    }
    
    // Always add time 0 as the first checkpoint (beginning of video)
    if (this.checkpoints.length > 0 && this.checkpoints[0].time !== 0) {
      this.checkpoints.unshift({ time: 0 });
    }
    
    const plyrConfig: any = {
      markers: { enabled: times.length > 0, points: points }
    };
    // If scrubbing is prevented, modify controls
    if (this.preventScrubbing) {
      // Disable seeking and keyboard controls
      plyrConfig.seekTime = 0;
      plyrConfig.keyboard = { focused: false, global: false };
    }
    this.player = new PlyrAny(playerElement, plyrConfig);
    this.times = times;
    this.questions = questions;
    this.lastVolume = this.player.volume;
    this.lastSpeed = this.player.speed;
    this.currentProgressTime = 0;
    this.startTime = Date.now();
    this.checkingPoint = false;
    this.isPlaying = false;
    this.hasSetSpeed = false;
    this.totalTime = 0;
    this.currentQuestionIndex = 0;
  }

  // Build checkpoints for selective behavior (checkpointBehavior: "some")
  buildSelectiveCheckpoints(times: any[], _questions: any) {
    const checkpoints: any[] = [];
    const videoSession = (Session.get('currentTdfUnit') as any).videosession;
    
    // New approach: Use checkpointQuestions array if available
    if (videoSession.checkpointQuestions && Array.isArray(videoSession.checkpointQuestions)) {
      videoSession.checkpointQuestions.forEach((questionIndex: any) => {
        // Convert 1-based question index to 0-based array index
        const arrayIndex = questionIndex - 1;
        if (arrayIndex >= 0 && arrayIndex < times.length) {
          checkpoints.push({ time: times[arrayIndex] });
        }
      });
    } else {
      const currentStimuliSet = Session.get('currentStimuliSet') || [];
      
      // Check each question time to see if corresponding stim has checkpoint:true
      times.forEach((time: any, index: any) => {
        if (index < currentStimuliSet.length) {
          const stim = currentStimuliSet[index];
          if (stim && stim.checkpoint === true) {
            checkpoints.push({ time });
          }
        }
      });
    }
    
    return checkpoints;
  }

  // Find the previous checkpoint before the current time
  findPreviousCheckpoint(currentTime: any) {
    if (this.checkpoints.length === 0) return null;
    const currentTimeFloor = Math.floor(currentTime)
    // Find the checkpoint that comes before the current time
    let previousCheckpoint = null;
    for (const checkpoint of this.checkpoints as any[]) {
      if (checkpoint.time < currentTimeFloor) {
        previousCheckpoint = checkpoint;
      } else {
        break; 
      }
    }
    
    return previousCheckpoint;
  }

  // Get the current question index based on time
  getCurrentQuestionIndex(currentTime: any) {
    for (let i = 0; i < this.questionTimes.length; i++) {
      if (Math.abs(this.questionTimes[i] - currentTime) < 5) { // 5 second tolerance
        return i;
      }
    }
    return -1; // Not at a question time
  }

  // Mark questions between checkpoint and current time for repetition
  markQuestionsForRepetition(checkpointTime: any, currentTime: any) {
    if (!this.repeatQuestionsSinceCheckpoint) return;
    
    // Find all questions between checkpoint time and current time
    const questionsToRepeat: any[] = [];
    for (let i = 0; i < this.questionTimes.length; i++) {
      const questionTime = this.questionTimes[i];
      if (questionTime >= checkpointTime && questionTime <= currentTime) {
        // Only add questions that haven't been completed correctly
        if (!this.completedQuestions.has(i)) {
          questionsToRepeat.push({
            index: i,
            time: questionTime,
            question: this.questions[i]
          });
        }
      }
    }
    
    this.questionsToRepeat = questionsToRepeat;
    
    
    // Optionally, schedule these questions to be repeated after the video segment
    if (questionsToRepeat.length > 0) {
      this.scheduleQuestionRepetition(questionsToRepeat);
    }
  }

  // Schedule repeated questions (this would integrate with the MoFaCTS question engine)
  scheduleQuestionRepetition(questionsToRepeat: any[]) {
    // This is a placeholder for integration with the MoFaCTS scheduling system
    // In practice, this would need to interact with the experiment engine
    
    
    // Store the questions to repeat in session for later processing
    Session.set('questionsToRepeat', questionsToRepeat);
    
    // Optionally, show a notification to the user
    this.showRepetitionNotification(questionsToRepeat.length);
  }

  // Show notification about question repetition
  showRepetitionNotification(_count: any) {
    
    // This could show a UI notification to inform the student
  }

  // Check if there are questions pending repetition
  hasPendingRepetitions() {
    return this.questionsToRepeat && this.questionsToRepeat.length > 0;
  }

  // Get the next question to repeat
  getNextRepetitionQuestion() {
    if (this.questionsToRepeat && this.questionsToRepeat.length > 0) {
      return this.questionsToRepeat.shift();
    }
    return null;
  }

  // Clear completed repetitions
  clearCompletedRepetition(questionIndex: any) {
    this.completedQuestions.add(questionIndex);
    
  }

  // Handle question response with enhanced checkpoint logic
  handleQuestionResponse(isCorrect: any) {
    const currentTime = this.player.currentTime;
    const currentQuestionIndex = this.getCurrentQuestionIndex(currentTime);
    
    if (isCorrect) {
      // Mark this question as completed correctly
      if (currentQuestionIndex !== -1) {
        this.completedQuestions.add(currentQuestionIndex);
      }
      return; // No rewind needed
    }

    if (!this.rewindOnIncorrect) {
      return; // Rewind is disabled
    }

    const previousCheckpoint = this.findPreviousCheckpoint(currentTime);
    
    if (previousCheckpoint) {
      // Add a small offset (0.1 seconds) to avoid repeating the checkpoint question itself
      const rewindTime = previousCheckpoint.time + 0.1;
      
      
      // If repeatQuestionsSinceCheckpoint is enabled, mark questions for repetition
      // Use the original checkpoint time for marking questions, but exclude the checkpoint question itself
      if (this.repeatQuestionsSinceCheckpoint) {
        this.markQuestionsForRepetition(rewindTime, currentTime);
      }
      
      this.player.currentTime = rewindTime;
    } else {
      
      
      // If repeatQuestionsSinceCheckpoint is enabled, mark all questions for repetition
      if (this.repeatQuestionsSinceCheckpoint) {
        this.markQuestionsForRepetition(0.1, currentTime); // Small offset from beginning too
      }
      
      this.player.currentTime = 0.1; // Small offset from beginning to avoid any question at time 0
    }
  } 
  
  rewindToPreviousCheckpoint() {
      if (!this.rewindOnIncorrect) return;
      
      if (this.currentCheckpointIndex > 0) {
        this.currentCheckpointIndex--;
      }
      
      const checkpointTime = this.checkpoints[this.currentCheckpointIndex]?.time ?? this.checkpoints[this.currentCheckpointIndex];
      // Add small offset to avoid repeating the checkpoint question
      const rewindTime = checkpointTime + 0.1;
      this.maxAllowedTime = rewindTime;
      
      // Temporarily allow seeking for rewind
      this.allowSeeking = true;
      this.player.currentTime = rewindTime;
      this.allowSeeking = false;
      
      // Reset question state for dynamic scheduling
      this.questioningComplete = false;
      for(let i = 0; i < this.times.length; i++){
        if(this.times[i] > rewindTime){
          this.nextTimeIndex = i;
          this.nextTime = this.times[i];
          break;
        }
      }
      
      
      this.logPlyrAction('rewind_to_checkpoint');
    }
    
    advanceToNextCheckpoint() {
      if (this.currentCheckpointIndex < this.checkpoints.length - 1) {
        this.currentCheckpointIndex++;
        this.maxAllowedTime = Math.max(this.maxAllowedTime, this.player.currentTime);
      }
      
      
      this.logPlyrAction('advance_checkpoint');
    }

    handleCorrectAnswer() {
      this.advanceToNextCheckpoint();
  }
  // Initialize video cards and set up event listeners
  // Returns a Promise that resolves when the player is ready and initialized
  initVideoCards() {
    return new Promise<void>((resolve, reject) => {
      this.player.on('ready', async (_event: any) => {
        try {
          const engine = getUnitEngine();
          this.times.sort((a, b) => a - b);
          if(this.nextTimeIndex < this.times.length){
            this.nextTime = this.times[this.nextTimeIndex];
            let nextQuestion = this.questions[this.nextTimeIndex];
            let indices = {stimIndex: 0, clusterIndex: nextQuestion}
            await engine.selectNextCard(indices, ExperimentStateStore.get());
            await newQuestionHandler();
          }

          //if this is not the furthest unit the student has reached, display the continue button
          if(Session.get('currentUnitNumber') < ((ExperimentStateStore.get() as any)?.lastUnitStarted ?? 0)){
            $("#continueBar").removeAttr('hidden');
            $('#continueButton').prop('disabled', false);
          }

          this.player.on('timeupdate', () => this.timeUpdate());

          this.player.on('pause', () => this.logPlyrAction('pause'));

          this.player.on('play', () => this.logPlyrAction('play'));

          this.player.on('volumechange', () => this.logPlyrAction('volumechange'));

          this.player.on('ratechange', () => this.logPlyrAction('ratechange'));

          this.player.on('ended', () => this.endPlayback());

          waitForElm("[id*='plyr-seek']").then((elm: any) => {
            if (this.preventScrubbing) {
              elm.style.setProperty("pointer-events", "none")
            } else {
              elm.addEventListener("mouseup", stopSeeking)
              elm.addEventListener("mousedown", startSeeking)
            }
          });

          this.playVideo();

          // Resolve the promise now that initialization is complete
          resolve();
        } catch (error) {
          clientConsole(1, '[Plyr] Error initializing video cards:', error);
          reject(error);
        }
      });
    });
  }

  async setNextTime(time: any, index: any){
    const engine = getUnitEngine();
    this.nextTime = time;
    this.nextTimeIndex = index;
    const nextQuestion = this.questions[index];
    Session.set('engineIndices', {stimIndex: 0, clusterIndex: nextQuestion});
    await engine.selectNextCard(Session.get('engineIndices'), ExperimentStateStore.get());
    await newQuestionHandler();
  }

  timeUpdate(){
    let currentTime = this.player.currentTime;
    
    // Prevent scrubbing ahead if enabled
    if (this.preventScrubbing && currentTime > this.maxAllowedTime + 1) {
      this.player.currentTime = this.maxAllowedTime;
      return;
    }
    
    // Update max allowed time as video progresses naturally
    if (!this.preventScrubbing || currentTime <= this.maxAllowedTime + 1) {
      this.maxAllowedTime = Math.max(this.maxAllowedTime, currentTime);
    }

    // If no times are set or nextTimeIndex is -1, set nextTime to end of video
    if(this.times.length == 0 || this.nextTimeIndex == -1) {
      this.nextTime = this.player.duration;
      this.questioningComplete = true;
    } else {
      this.nextTime = this.times[this.nextTimeIndex];
    }
    //get the difference between the current time and the next time

    const timeDiff = this.nextTime - this.player.currentTime;
    //if this.times[this.nextTimeIndex] is undefined, we set it to the end of the video
    if(this.nextTime == undefined){
      this.questioningComplete = true;
      this.times.push(this.player.duration);
      this.nextTime = this.player.duration;
    }
    //get the difference between the next time and the previous time
    const lastTime = this.nextTimeIndex == 0 ? 0: this.times[this.lastTimeIndex];
    const totalTimeDiff =  this.nextTime - lastTime;
    //get the percentage of the progress bar that should be filled
    const percentage = (timeDiff / totalTimeDiff) * 100;
    //add class
    $('#progressbar').addClass('progress-bar');
    //set the width of the progress bar
    if(this.times.length != 0 || (UiSettingsStore.get() as any).displayReviewTimeoutAsBarOrText == "bar" || (UiSettingsStore.get() as any).displayEndOfVideoCountdown){
      if(UiSettingsStore.get().displayReviewTimeoutAsBarOrText == "text" || UiSettingsStore.get().displayReviewTimeoutAsBarOrText == "both"){                
        (document.getElementById("CountdownTimerText") as any).innerHTML = 'Continuing in: ' + Math.floor(timeDiff) + ' seconds';
      } else {
        (document.getElementById("CountdownTimerText") as any).innerHTML = '';
      }
      if(UiSettingsStore.get().displayReviewTimeoutAsBarOrText == "bar" || UiSettingsStore.get().displayCardTimeoutAsBarOrText == "both"){
        //add the progress bar class
        $('#progressbar').addClass('progress-bar');
        (document.getElementById("progressbar") as any).style.width = percentage + "%";
      } else {
        //set width to 0% 
        (document.getElementById("progressbar") as any).style.width = 0 + "%";
        //remove progress bar class
        $('#progressbar').removeClass('progress-bar');
      }
   }
    if(timeDiff < 0 && !this.questioningComplete){
      this.showQuestion();
    }
  }

  endPlayback(){
    
    this.logPlyrAction('end');
    Session.set('engineIndices', undefined);
    $("#continueBar").removeAttr('hidden');
    $('#continueButton').prop('disabled', false);
  }
  
  logPlyrAction(action: any){
    const trialStartTimestamp = Session.get('trialStartTimestamp');
    const sessionID = (new Date(trialStartTimestamp)).toUTCString().substr(0, 16) + ' ' + Session.get('currentTdfName');
  
    const curTdf = Session.get('currentTdfFile');
    const unitName = legacyTrim(curTdf.tdfs.tutor.unit[Session.get('currentUnitNumber')].unitname);
  
    const problemName = (ExperimentStateStore.get() as any)?.originalDisplay;
    const stepName = problemName;
  
    const currentTime = this.player.currentTime;
    const seekEnd = this.seekStart ? currentTime : null;
      
    const answerLogRecord = {
      'itemId': "N/A",
      'KCId': "N/A",
      'userId': Meteor.userId(),
      'TDFId': Session.get('currentTdfId'),
      'outcome': action,
      'probabilityEstimate': "N/A",
      'typeOfResponse': "N/A",
      'responseValue': "N/A",
      'displayedStimulus': Session.get('currentDisplay'),
      'sectionId': Session.get('curSectionId'),
      'teacherId': Session.get('curTeacher')?._id,
      'anonStudentId': MeteorAny.user()?.username,
      'sessionID': sessionID,
  
      'conditionNameA': 'tdf file',
      // Note: we use this to enrich the history record server side, change both places if at all
      'conditionTypeA': Session.get('currentTdfName'),
      'conditionNameB': 'xcondition',
      'conditionTypeB': Session.get('experimentXCond') || null,
      'conditionNameC': 'schedule condition',
      'conditionTypeC': "N/A",
      'conditionNameD': 'how answered',
      'conditionTypeD': legacyTrim(action),
      'conditionNameE': 'section',
      'conditionTypeE': MeteorAny.user()?.loginParams?.entryPoint &&
          MeteorAny.user()?.loginParams?.entryPoint !== 'direct' ? MeteorAny.user()?.loginParams?.entryPoint : null,
  
      'responseDuration': null,
  
      'levelUnit': Session.get('currentUnitNumber'),
      'levelUnitName': unitName,
      'levelUnitType': Session.get('unitType'),
      'problemName': problemName,
      'stepName': stepName, // this is no longer a valid field as we don't restore state one step at a time
      'time': trialStartTimestamp,
      'selection': '',
      'action': action,
      'input': legacyTrim(action),
      'studentResponseType': "N/A",
      'studentResponseSubtype': "N/A",
      'tutorResponseType': "N/A",
      'KCDefault': "N/A",
      'KCCategoryDefault': '',
      'KCCluster': "N/A",
      'KCCategoryCluster': '',
      'CFStartLatency': null,
      'CFEndLatency': null,
      'CFFeedbackLatency': null,
      'CFVideoTimeStamp': currentTime,
      'CFVideoSeekStart': this.seekStart,
      'CFVideoSeekEnd': seekEnd,
      'CFVideoCurrentSpeed': this.player.speed,
      'CFVideoCurrentVolume': this.player.volume,
      'CFVideoPreviousSpeed': this.lastSpeed,
      'CFVideoPreviousVolume': this.lastVolume,
      'CFVideoIsPlaying': this.player.playing,
      'feedbackText': $('#UserInteraction').text() || '',
      'feedbackType': 'N/A',
      'instructionQuestionResult': Session.get('instructionQuestionResult') || false,
      'entryPoint': MeteorAny.user()?.loginParams?.entryPoint
    };
    MeteorAny.callAsync('insertHistory', answerLogRecord);
  }

  async playVideo() {
    if(this.fullscreenUser){
      this.player.fullscreen.enter();
    }
    $("#videoUnitContainer").show();
    this.player.play();
    newQuestionHandler();
  }


  showQuestion(){
    this.fullscreenUser = this.player.fullscreen.active;
    this.player.pause();
    if(this.player.fullscreen.active) this.player.fullscreen.exit();
    Session.set('displayReady', true);

    
    this.lastTimeIndex = this.nextTimeIndex;
    if(this.nextTimeIndex < this.times.length){
      this.nextTimeIndex++;
      this.nextTime = this.times[this.nextTimeIndex];
      let nextQuestion = this.questions[this.nextTimeIndex];
      Session.set('engineIndices', {stimIndex: 0, clusterIndex: nextQuestion});
      $('#userAnswer, #multipleChoiceContainer button').prop('disabled', false);
    }
  }

  async playNextCard() {
    const engine = getUnitEngine();
    let curTdfUnit = Session.get('currentTdfUnit');
    let logic = '';
    if( curTdfUnit.videosession.adaptiveLogic && curTdfUnit.videosession.adaptiveLogic[this.lastlogicIndex])
      logic = curTdfUnit.videosession.adaptiveLogic[this.lastlogicIndex];
    this.lastlogicIndex++;
    if(engine.adaptiveQuestionLogic){
      if(logic != '' && logic != undefined){
           
        await engine.adaptiveQuestionLogic.evaluate(logic);
      }
      //add new question to current unit
      if(engine.adaptiveQuestionLogic.when == Session.get("currentUnitNumber")){
        this.addStimToSchedule(curTdfUnit);
      }
    }
    if(this.nextTimeIndex < this.questions.length){
      const nextQuestion = this.questions[this.nextTimeIndex];
      Session.set('engineIndices', {stimIndex: 0, clusterIndex: nextQuestion});
      await engine.selectNextCard(Session.get('engineIndices'), ExperimentStateStore.get());
      await newQuestionHandler();
    }
    waitForElmRemoved("[id*='displayContainer']").then(() => {
      this.playVideo()
    });
  }

  addStimToSchedule(curTdfUnit: any){
    const engine = getUnitEngine();
    let markers: any[] = [];
    const newschedule = engine.adaptiveQuestionLogic.schedule;
    this.questions = [];
    this.times = [];
    //assume time is correct and sort questions based on times
    newschedule.sort((a: any, b: any) => curTdfUnit.videosession.questiontimes[a.clusterIndex] - curTdfUnit.videosession.questiontimes[b.clusterIndex]);
  
    for (let i = 0; i < newschedule.length; i++){
      const question = newschedule[i].clusterIndex
      const time = curTdfUnit.videosession.questiontimes[question]
      if(time < 0)
        continue;
  
      this.times.push(time);
      this.questions.push(question);
      markers.push({time: Math.floor(time)});
    }

    //sort markers based on time
    markers.sort((a, b) => a.time - b.time);
    for(let i = 0; i < markers.length; i++){
      markers[i].label = 'Question ' + (i + 1);
    }
    //create markers for new markers
    this.addNewMarkers(markers);

    // Update max allowed time if we're not preventing scrubbing
    if (!this.preventScrubbing) {
      this.maxAllowedTime = Math.max(this.maxAllowedTime, this.player.currentTime);
    }
  
    //default nextTime to end of player
    this.nextTime = this.player.duration;
    //check if next time needs to be set to new question
    for (let i = 0; i < this.times.length; i++) {
      if(this.player.currentTime < this.times[i]){
        this.nextTimeIndex = i;
        this.nextTime = this.times[this.nextTimeIndex];
        const nextQuestion = this.questions[i];
        Session.set('engineIndices', {stimIndex: 0, clusterIndex: nextQuestion});
        Session.set('displayReady', true);
        break;
      }
    }
  }
  
  addNewMarkers(markers: any[]){
    //filter out all old questions
    let newMarkers = markers.filter((x: any) => !this.player.config.markers.points.some((y: any) => y.time == x.time))
  
    this.player.config.markers.points = markers

    //Updatge checkpoints when markers change
    if(this.checkpointBehavior === "question"){
      this.checkpoints = [{ time: 0 }, ...this.times.sort((a: any, b: any) => a - b).map((time: any) => ({ time }))];
    }
    for(let i = 0; i < newMarkers.length; i++){
      $(".plyr__progress").append(`<span class="plyr__progress__marker" style="left: ${newMarkers[i].time/this.player.duration*100}%;"></span>`)
    }
  }
}

async function stopSeeking(){
  if(playerController.loggingSeek) {
    const currentTime = playerController.player.currentTime;
    // Check if seeking is allowed
    if (playerController.preventScrubbing && currentTime > playerController.maxAllowedTime) {
      playerController.player.currentTime = playerController.maxAllowedTime;
      playerController.logPlyrAction('seek_blocked');
      playerController.loggingSeek = false;
      return;
    }

    const nextTime = playerController.nextTime;
    const prevTimeIndex = playerController.nextTimeIndex - 1;
    let prevTime = playerController.times[0];
    if(prevTimeIndex >= 0) prevTime = playerController.times[prevTimeIndex];

    
    playerController.logPlyrAction('seek');
    playerController.loggingSeek = false; 
    if(currentTime >= nextTime) {
      playerController.showQuestion();
    } else if(currentTime < prevTime){
      playerController.questioningComplete = false;
      let nextTimeIndex = getIndex(playerController.times, currentTime);
      await playerController.setNextTime(playerController.times[nextTimeIndex], nextTimeIndex);
    }
  }
}

function startSeeking(){
  if(playerController.loggingSeek) return;
  playerController.loggingSeek = true;
  playerController.seekStart = playerController.player.currentTime;
  
}

function getIndex(arr: any[], num: any) {
  return arr.concat(num).sort(function(a: any, b: any) {
    return a - b;
  }).indexOf(num);
}

export async function initializePlyr() {
  const engine = getUnitEngine();
  Session.set('trialStartTimestamp', Date.now());
  const currentVideoSession = Session.get('currentTdfUnit').videosession || {};
  let questions = Session.get('currentTdfUnit').videosession.questions;

  // Parse questions if it's a string (e.g., "8-13" or "0 1 2")
  // Adaptive mode converts this to an array, but regular mode doesn't
  if (typeof questions === 'string') {
    const questionIndices: any[] = [];
    const clusterList: any[] = [];
    extractDelimFields(questions, clusterList);
    for (let i = 0; i < clusterList.length; i++) {
      const nums = rangeVal(clusterList[i]);
      questionIndices.push(...nums);
    }
    questions = questionIndices;
  }

  let times: any[] = [];
  let schedule = engine.adaptiveQuestionLogic.schedule;
  const hasAdaptiveVideoLogic = !!(
    currentVideoSession.adaptiveLogic &&
    ((Array.isArray(currentVideoSession.adaptiveLogic) && currentVideoSession.adaptiveLogic.length > 0) ||
      (typeof currentVideoSession.adaptiveLogic === 'object' && Object.keys(currentVideoSession.adaptiveLogic).length > 0))
  );
  // For static video sessions, always rebuild schedule from current unit questions
  // to prevent stale schedule state from previous units/experiments.
  if (!hasAdaptiveVideoLogic && schedule.length > 0) {
    schedule = [];
    engine.adaptiveQuestionLogic.setSchedule(schedule);
  }
  if(schedule.length == 0){
    for (let i = 0; i < questions?.length; i++){
      schedule.push({clusterIndex: questions[i], stimIndex: 0});
      times.push(Session.get('currentTdfUnit').videosession.questiontimes[i]);
    }
    engine.adaptiveQuestionLogic.setSchedule(schedule);
  } else {
    const questiontimes = Session.get('currentTdfUnit').videosession.questiontimes || [];
    const scheduledQuestions: any[] = [];
    const scheduledTimes: any[] = [];
    for (let i = 0; i < schedule.length; i++) {
      const scheduledClusterIndex = schedule[i].clusterIndex;
      scheduledQuestions.push(scheduledClusterIndex);
      const timeByClusterIndex = questiontimes[scheduledClusterIndex];
      const fallbackTimeByOrder = questiontimes[i];
      scheduledTimes.push(
        Number.isFinite(timeByClusterIndex) ? timeByClusterIndex : fallbackTimeByOrder
      );
    }
    questions = scheduledQuestions;
    times = scheduledTimes;
  }
  // Keep question/time pairing stable even if author-provided questiontimes are unsorted
  const pairedQuestionsAndTimes: any[] = [];
  for (let i = 0; i < questions?.length; i++) {
    pairedQuestionsAndTimes.push({
      question: questions[i],
      time: times[i],
    });
  }
  pairedQuestionsAndTimes.sort((a: any, b: any) => a.time - b.time);
  questions = pairedQuestionsAndTimes.map((entry) => entry.question);
  times = pairedQuestionsAndTimes.map((entry) => entry.time);
  const points: any[] = [];
  if(times){
    times.forEach((time: any) => {
      points.push({time: Math.floor(time), label: 'Question ' + (times.indexOf(time) + 1)});
    });
  }
  await waitForElm('#videoUnitPlayer');

  playerController = new PlayerController('#videoUnitPlayer', times, questions, points);

  //set the source of the video to the new video
  let source = Session.get('currentTdfUnit').videosession.videosource;

  // Handle YouTube vs HTML5 video sources differently
  if(source.includes('youtu')){
    // Extract video ID from YouTube URL
    if(source.includes('youtu.be')){
      source = source.split('youtu.be/')[1];
    } else {
      source = source.split('v=')[1];
      source = source.split('&')[0];
    }
    playerController.player.source = {
      type: 'video',
      sources: [
        {
          src: 'https://www.youtube.com/watch?v=' + source,
          provider: 'youtube',
        },
      ],
    };
  } else {
    // HTML5 video
    playerController.player.source = {
      type: 'video',
      sources: [
        {
          src: source,
          type: 'video/mp4',
        },
      ],
    };
  }

  // Wait for player to be ready and initialized before returning
  await playerController.initVideoCards();
}

export async function destroyPlyr() {
  if (playerController && playerController.player) {
    playerController.player.destroy();
  }
  playerController = null;
}

function waitForElm(selector: any) {
  return new Promise<any>((resolve) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver((_mutations) => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    // If you get "parameter 1 is not of type 'Node'" error, see https://stackoverflow.com/a/77855838/492336
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

function waitForElmRemoved(selector: any) {
  return new Promise<void>((resolve) => {
    if (!document.querySelector(selector)) {
      return resolve(undefined);
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        observer.disconnect();
        resolve(undefined);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}






