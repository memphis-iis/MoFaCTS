<script>
  /**
   * VideoSessionMode Component
   * Video session wrapper with FlashcardController overlaid (position: absolute)
   * Supports question checkpoints at specific timestamps
   */
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { Meteor } from 'meteor/meteor';
  import { Session } from 'meteor/session';
  import Plyr from 'plyr';
  import { clientConsole } from '../../../../lib/userSessionHelpers';
  import { legacyTrim } from '../../../../../common/underscoreCompat';
  import { parseYouTubeVideoUrl } from '../../../../lib/youtubeUrl';
  import { insertCompressedHistory } from '../../../../lib/historyWire';
  import { ensureStylesheet } from '../../../../lib/cssAssetLoader';
  import { createVideoParticipantControls } from '../services/videoParticipantControls';
  import { buildVideoHistoryIdentity } from '../services/videoHistoryIdentity';

  const dispatch = createEventDispatcher();

  /** @type {string} Video URL */
  export let videoUrl = '';

  /** @type {boolean} Whether video is playing */
  export let isPlaying = false;

  /** @type {number} Current video time in seconds */
  export let currentTime = 0;

  /** @type {number} Video duration in seconds */
  export let duration = 0;

  /** @type {boolean} Whether to show overlay content */
  export let showOverlay = false;

  /** @type {boolean} Whether the overlay surface should be mounted */
  export let overlayMounted = false;

  /** @type {boolean} Whether the overlay surface should be visible */
  export let overlayVisible = false;

  /** @type {number[]} Timestamps (in seconds) when questions should appear */
  export let questionTimes = [];

  /** @type {number[]} Cluster indices for each question timestamp */
  export let questionIndices = [];

  /** @type {number|null} Resume start time in seconds */
  export let resumeStartTime = null;

  /** @type {number|null} Resume checkpoint index to replay/continue from */
  export let resumeCheckpointIndex = null;

  /** @type {boolean} Whether to prevent seeking beyond the current checkpoint */
  export let preventScrubbing = false;
  export let preventPause = false;
  export let preventRewind = false;

  /** @type {boolean} Whether the parent state machine can accept a checkpoint now */
  export let canAcceptCheckpoint = false;

  /** @type {boolean} Whether startup is blocked by an instruction overlay */
  export let startBlocked = false;

  /** @type {string} Diagnostic snapshot of the parent gate state */
  export let checkpointGateState = '';

  let videoElement;
  let player;
  let containerElement;
  let mounted = false;
  let initializedVideoUrl = '';

  // Checkpoint tracking state
  let nextCheckpointIndex = 0;
  let atCheckpoint = false;
  let wasFullscreen = false;
  let participantControls;
  let youtubePositionObserver = null;
  let loggingSeek = false;
  let seekStart;
  let lastVolume;
  let lastSpeed;
  let isYouTube;
  let youtubeInfo = null;
  let youtubeId = '';
  let appliedResumeAnchorKey = '';
  let lastRejectedCheckpointKey = '';
  let machineResumeInProgress = false;

  // Check if URL is YouTube
  $: youtubeInfo = parseYouTubeVideoUrl(videoUrl);
  $: isYouTube = youtubeInfo !== null;
  $: youtubeId = youtubeInfo?.id || '';
  $: resolvedOverlayMounted = overlayMounted || showOverlay;
  $: resolvedOverlayVisible = overlayVisible || showOverlay;
  $: if (canAcceptCheckpoint) {
    lastRejectedCheckpointKey = '';
  }
  $: if (player && startBlocked) {
    player.muted = true;
    participantControls?.pauseSystem();
  }
  $: if (player) {
    startBlocked;
    atCheckpoint;
    updateParticipantPlayControls();
  }

  function destroyPlayer() {
    if (youtubePositionObserver !== null) clearInterval(youtubePositionObserver);
    youtubePositionObserver = null;
    participantControls?.dispose();
    if (player && typeof player.destroy === 'function') {
      player.destroy();
    }
    player = null;
    participantControls = null;
    initializedVideoUrl = '';
    nextCheckpointIndex = 0;
    atCheckpoint = false;
    wasFullscreen = false;
    loggingSeek = false;
    appliedResumeAnchorKey = '';
    lastRejectedCheckpointKey = '';
    machineResumeInProgress = false;
  }

  function initializePlayer() {
    const normalizedVideoUrl = String(videoUrl || '').trim();
    if (!mounted || !videoElement || !normalizedVideoUrl) {
      return;
    }

    // Guard: ensure the DOM element matches the current video mode.
    // Svelte reactive statements fire before the {#if} block updates the DOM,
    // so videoElement may still be a <video> when isYouTube just became true.
    const expectedTag = isYouTube ? 'DIV' : 'VIDEO';
    if (videoElement.tagName !== expectedTag) {
      return;
    }

    if (!Plyr) {
      clientConsole(1, '[VideoSessionMode] Plyr not loaded');
      return;
    }

    if (isYouTube && !youtubeId) {
      const message = '[VideoSessionMode] Invalid YouTube URL - missing video ID';
      clientConsole(1, message, buildVideoDiagnostic(normalizedVideoUrl, null));
      return;
    }

    if (player && initializedVideoUrl === normalizedVideoUrl) {
      return;
    }

    destroyPlayer();

    // Build Plyr configuration
    const plyrConfig = {
      controls: preventPause
        ? ['play-large', 'progress', 'current-time', 'mute', 'volume', 'fullscreen']
        : ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
      clickToPlay: !preventPause,
      autopause: false,
      hideControls: false,
    };

    // Add markers for question timestamps if available
    if (questionTimes && questionTimes.length > 0) {
      plyrConfig.markers = {
        enabled: true,
        points: questionTimes.map((time, index) => ({
          time: time,
          label: `Question ${index + 1}`,
        })),
      };
    }

    // Disable seeking if scrubbing is prevented
    if (preventScrubbing) {
      plyrConfig.seekTime = 0;
      plyrConfig.keyboard = { focused: false, global: false };
    }

    if (isYouTube) {
      // YouTube video - use Plyr's YouTube provider
      // Note: videoElement will be replaced with YouTube embed
      clientConsole(1, '[VideoSessionMode] Initializing YouTube player', buildVideoDiagnostic(normalizedVideoUrl, null));
      player = new Plyr(videoElement, {
        ...plyrConfig,
        youtube: {
          noCookie: true,
          rel: 0,
          iv_load_policy: 3,
        },
      });
    } else if (videoElement && videoUrl) {
      // HTML5 video
      clientConsole(2, '[VideoSessionMode] Initializing HTML5 player:', normalizedVideoUrl);
      player = new Plyr(videoElement, plyrConfig);
    }

    if (!player) {
      clientConsole(1, '[VideoSessionMode] Failed to create player', { videoUrl: normalizedVideoUrl, isYouTube, hasVideoElement: !!videoElement });
      return;
    }

    initializedVideoUrl = normalizedVideoUrl;
    const controlledPlayer = player;
    participantControls = createVideoParticipantControls({
      getPlayer: () => controlledPlayer,
      getPolicy: () => ({ preventPause, preventRewind, preventScrubbing }),
      isPlayBlocked: () => startBlocked || (atCheckpoint && !machineResumeInProgress),
      onSeekBlocked: () => logVideoAction('seek_blocked'),
      onPlayRejected: (error) => {
        clientConsole(1, '[VideoSessionMode] Restricted playback resume failed:', error?.message || error);
        updateParticipantPlayControls();
      },
    });

    if (!isYouTube) {
      const inferredType = inferVideoMimeType(normalizedVideoUrl) || 'video/mp4';
      player.source = {
        type: 'video',
        sources: [
          {
            src: normalizedVideoUrl,
            type: inferredType,
          },
        ],
      };
      clientConsole(2, '[VideoSessionMode] HTML5 source configured', {
        src: normalizedVideoUrl,
        type: inferredType,
      });
    }

    // Ignore late provider events from a player destroyed during a unit change.
    const onPlayer = (event, listener) => controlledPlayer.on(event, (...args) => {
      if (player === controlledPlayer) listener(...args);
    });

    // Event listeners
    onPlayer('play', () => {
      if (!participantControls.handlePlay()) {
        updateParticipantPlayControls();
        return;
      }
      isPlaying = true;
      if (atCheckpoint) {
        clientConsole(2, '[VideoSessionMode] Clearing checkpoint latch on playback resume', {
          currentTime: player.currentTime,
          nextCheckpointIndex,
        });
        atCheckpoint = false;
      }
      logVideoAction('play');
      dispatch('play', { time: player.currentTime });
      updateParticipantPlayControls();
    });

    onPlayer('pause', () => {
      isPlaying = false;
      logVideoAction('pause');
      dispatch('pause', { time: player.currentTime });
      participantControls.handlePause();
      updateParticipantPlayControls();
    });

    onPlayer('timeupdate', () => handleTimeUpdate());

    onPlayer('loadedmetadata', () => {
      duration = player.duration;
      dispatch('loadedmetadata', { duration: player.duration });
    });

    onPlayer('ready', () => {
      clientConsole(1, '[VideoSessionMode] Player ready', {
        mode: isYouTube ? 'youtube' : 'html5',
        src: initializedVideoUrl || normalizedVideoUrl,
        ...(isYouTube ? buildVideoDiagnostic(normalizedVideoUrl, getRenderedYouTubeIframeSrc()) : {}),
      });
      lastVolume = player.volume;
      lastSpeed = player.speed;
      const normalizedResumeTime = Number(resumeStartTime);
      const normalizedResumeIndex = Number(resumeCheckpointIndex);
      const resumeAnchorKey = `${normalizedResumeTime}|${normalizedResumeIndex}`;
      if (
        resumeAnchorKey !== appliedResumeAnchorKey &&
        Number.isFinite(normalizedResumeTime) &&
        normalizedResumeTime >= 0 &&
        Number.isFinite(normalizedResumeIndex) &&
        normalizedResumeIndex >= 0
      ) {
        nextCheckpointIndex = Math.floor(normalizedResumeIndex);
        setCurrentTime(normalizedResumeTime);
        appliedResumeAnchorKey = resumeAnchorKey;
      }
      if (preventScrubbing) {
        disableSeekUi();
      }
      if (startBlocked) participantControls.pauseSystem();
      updateParticipantPlayControls();
      if (isYouTube && youtubePositionObserver === null) {
        // YouTube's API can move while paused without emitting seeked/timeupdate.
        // Observe its reported position explicitly, including authorized seeks.
        youtubePositionObserver = setInterval(() => {
          if (player === controlledPlayer && (controlledPlayer.seeking || participantControls.hasPendingSeek())) {
            handleTimeUpdate('provider-observation');
          }
        }, 100);
      }
      dispatch('ready', { duration: player.duration });
    });

    onPlayer('ended', () => {
      participantControls.handleEnded();
      logVideoAction('end');
      // A final checkpoint still owns its question/review even when the provider
      // reports ended before its final timeupdate.
      handleTimeUpdate();
      if (!atCheckpoint) dispatch('ended');
    });

    onPlayer('seeking', () => {
      markSeekStart();
      participantControls.checkPosition('seeking');
      dispatch('seeking', { time: player.currentTime });
    });

    onPlayer('seeked', () => {
      const systemSeek = participantControls.hasPendingSeek();
      participantControls.checkPosition('seeked');
      if (!systemSeek) logSeekAction();
      else loggingSeek = false;
      dispatch('seeked', { time: player.currentTime });
    });

    onPlayer('volumechange', () => {
      logVideoAction('volumechange');
    });

    onPlayer('ratechange', () => {
      logVideoAction('ratechange');
    });

    onPlayer('error', (error) => {
      const mediaErrorCode = videoElement?.error?.code ?? null;
      clientConsole(1, '[VideoSessionMode] Player error event', {
        error: error?.message || error || null,
        src: initializedVideoUrl || normalizedVideoUrl,
        mediaErrorCode,
        ...(isYouTube ? buildVideoDiagnostic(normalizedVideoUrl, getRenderedYouTubeIframeSrc()) : {}),
      });
    });

    if (videoElement) {
      videoElement.addEventListener('error', () => {
        const mediaErrorCode = videoElement?.error?.code ?? null;
        clientConsole(1, '[VideoSessionMode] HTML5 video element error', {
          src: initializedVideoUrl || normalizedVideoUrl,
          mediaErrorCode,
        });
      });
    }
  }

  onMount(() => {
    mounted = true;
    ensureStylesheet('/vendor/plyr/3.8.4/plyr.css');
    containerElement.addEventListener('keydown', preventPauseShortcut, true);
    // Use tick() to ensure DOM is fully rendered before first init
    tick().then(() => initializePlayer());
  });

  onDestroy(() => {
    mounted = false;
    containerElement?.removeEventListener('keydown', preventPauseShortcut, true);
    destroyPlayer();
  });

  $: if (mounted && videoElement && videoUrl) {
    // Wait for DOM to update (e.g., {#if isYouTube} block) before initializing Plyr
    tick().then(() => initializePlayer());
  }

  /**
   * Handle timeupdate - check for question checkpoints
   */
  function handleTimeUpdate(positionEvent = 'timeupdate') {
    if (!player) return;

    currentTime = player.currentTime;
    const playerDuration = Number(player.duration);
    if (!Number.isFinite(playerDuration) || playerDuration <= 0) {
      // Metadata is not ready yet (common during initial player bootstrapping).
      return;
    }
    if (participantControls.checkPosition(positionEvent)) return;

    // Check if we've reached the next checkpoint
    if (questionTimes && questionTimes.length > 0 && nextCheckpointIndex < questionTimes.length && !atCheckpoint) {
      const nextTime = Number(questionTimes[nextCheckpointIndex]);
      if (!Number.isFinite(nextTime)) {
        const message = '[VideoSessionMode] Invalid checkpoint time';
        clientConsole(1, message, questionTimes, nextCheckpointIndex);
        throw new Error(message);
      }

      // Check if we've reached or passed the checkpoint time
      if (currentTime >= nextTime) {
        const questionIndex = questionIndices[nextCheckpointIndex];
        if (!Number.isFinite(questionIndex)) {
          const message = '[VideoSessionMode] Missing question index for checkpoint';
          clientConsole(1, message, questionIndices, nextCheckpointIndex);
          throw new Error(message);
        }

        if (!canAcceptCheckpoint) {
          const rejectionKey = `${nextCheckpointIndex}|${nextTime}|${questionIndex}|${checkpointGateState}`;
          if (rejectionKey !== lastRejectedCheckpointKey) {
            clientConsole(1, '[VideoSessionMode] Checkpoint detected while parent cannot accept it', {
              checkpointIndex: nextCheckpointIndex,
              checkpointTime: nextTime,
              questionIndex,
              currentTime,
              checkpointGateState,
            });
            dispatch('checkpointrejected', {
              index: nextCheckpointIndex,
              time: nextTime,
              questionIndex,
              checkpointGateState,
            });
            lastRejectedCheckpointKey = rejectionKey;
          }
          return;
        }

        clientConsole(
          2,
          `[VideoSessionMode] Reached checkpoint ${nextCheckpointIndex} at ${nextTime}s (current: ${currentTime}s)`
        );

        // Mark that we're at a checkpoint (prevents re-triggering)
        atCheckpoint = true;

        // This is a system pause, never a participant pause.
        participantControls.pauseSystem();

        // Exit fullscreen if active (so user can see the question)
        if (player.fullscreen && player.fullscreen.active) {
          wasFullscreen = true;
          player.fullscreen.exit();
        }

        // Dispatch checkpoint event with question details
        dispatch('checkpoint', {
          index: nextCheckpointIndex,
          time: nextTime,
          questionIndex,
        });

        nextCheckpointIndex++;
      }
    }

    dispatch('timeupdate', { time: player.currentTime });
  }

  // Expose player control methods
  export async function play() {
    // Instruction Continue clears the parent gate in this same event turn.
    await tick();
    if (!player) return undefined;
    player.muted = false;
    const playPromise = participantControls.playSystem();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        if (error?.name === 'AbortError') {
          clientConsole(2, '[VideoSessionMode] Play interrupted (user must click play):', error?.message);
        } else {
          clientConsole(1, '[VideoSessionMode] Play failed:', error?.message || error);
        }
      });
    }
    return playPromise;
  }

  export function pause() {
    participantControls?.pauseSystem();
    updateParticipantPlayControls();
  }

  export function seek(time) {
    setCurrentTime(time);
  }

  export function rewind(seconds = 5) {
    if (!player) return;
    const nextTime = Math.max(0, player.currentTime - seconds);
    setCurrentTime(nextTime);
  }

  /**
   * Rewind to a specific time (used for incorrect answer handling)
   */
  export function rewindTo(time) {
    const beforeTime = player ? player.currentTime : 'no player';
    setCurrentTime(time);
    const afterTime = player ? player.currentTime : 'no player';
    clientConsole(2, '[VIDEO-REWIND-DEBUG] VideoSessionMode.rewindTo:', { requestedTime: time, beforeTime, afterTime });
  }

  /**
   * Resume playback after answering a question
   * Call this after the user submits an answer
   */
  export function resumeAfterQuestion() {
    if (player) {
      clientConsole(2, '[VIDEO-REWIND-DEBUG] resumeAfterQuestion:', {
        currentTime: player.currentTime,
        nextCheckpointIndex,
        nextCheckpointTime: questionTimes?.[nextCheckpointIndex],
        atCheckpoint,
      });
      atCheckpoint = false;

      const duration = Number(player.duration);
      if (Number.isFinite(duration) && duration > 0 && player.currentTime >= duration) {
        handleTimeUpdate();
        if (!atCheckpoint) {
          participantControls.handleEnded();
          dispatch('ended');
        }
        return;
      }

      clientConsole(
        2,
        `[VideoSessionMode] Resuming after question, next checkpoint index: ${nextCheckpointIndex}`
      );

      // Resume fullscreen if it was active before
      if (wasFullscreen && player.fullscreen) {
        player.fullscreen.enter();
        wasFullscreen = false;
      }

      // Resume playback
      machineResumeInProgress = true;
      const playPromise = participantControls.playSystem();
      if (playPromise?.catch) {
        playPromise
          .catch((error) => {
            clientConsole(1, '[VideoSessionMode] Resume playback failed:', error?.message || error);
          })
          .finally(() => {
            machineResumeInProgress = false;
          });
      } else {
        machineResumeInProgress = false;
      }
    }
  }

  export function recoverRejectedCheckpoint() {
    atCheckpoint = false;
    if (player && player.paused) {
      const playPromise = participantControls.playSystem();
      if (playPromise?.catch) {
        playPromise.catch((error) => {
          clientConsole(1, '[VideoSessionMode] Failed to recover rejected checkpoint:', error?.message || error);
        });
      }
    }
  }

  /**
   * Reset checkpoint tracking (for rewinding to repeat questions)
   */
  export function resetCheckpointTo(index) {
    const prevIndex = nextCheckpointIndex;
    nextCheckpointIndex = index;
    atCheckpoint = false;
    clientConsole(2, '[VIDEO-REWIND-DEBUG] VideoSessionMode.resetCheckpointTo:', { prevIndex, newIndex: index, atCheckpoint: false });
    clientConsole(2, `[VideoSessionMode] Reset checkpoint to index: ${index}`);
  }

  export function logAction(action) {
    logVideoAction(action);
  }

  export function getPlayer() {
    return player;
  }

  export function getCurrentTime() {
    return player ? player.currentTime : 0;
  }

  export function getCurrentCheckpointIndex() {
    return nextCheckpointIndex;
  }

  export function isAtCheckpoint() {
    return atCheckpoint;
  }

  function attemptAutoplay() {
    if (!player) return;
    const playPromise = participantControls.playSystem();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        clientConsole(1, '[VideoSessionMode] Autoplay failed:', error?.message || error);
      });
    }
  }

  function setCurrentTime(time) {
    participantControls?.seekSystem(time);
  }

  function updateParticipantPlayControls() {
    if (!player || !containerElement || !participantControls) return;
    const blocked = !participantControls.canParticipantPlay();
    containerElement.querySelectorAll('[data-plyr="play"]').forEach(button => {
      button.disabled = blocked;
      button.hidden = blocked || (preventPause && !player.paused);
    });
    if (isYouTube && (preventPause || preventRewind || preventScrubbing)) {
      // Keep interaction on the accessible Plyr controls; provider overlays must
      // not expose a second set of pause/seek controls inside the cross-origin iframe.
      containerElement.querySelectorAll('iframe').forEach(frame => {
        frame.inert = true;
        frame.tabIndex = -1;
        frame.style.pointerEvents = 'none';
      });
    }
  }

  function preventPauseShortcut(event) {
    if (!preventPause || !player || ![' ', 'k', 'K'].includes(event.key)) return;
    const target = event.target;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    // Space on another control (volume/fullscreen) keeps its normal semantics.
    if (event.key === ' ' && target?.closest?.('button:not([data-plyr="play"]), [role="button"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (player.paused && participantControls?.canParticipantPlay()) {
      void participantControls.playSystem().catch(error => {
        clientConsole(1, '[VideoSessionMode] Keyboard play failed:', error?.message || error);
      });
    }
  }

  function markSeekStart() {
    if (!player || participantControls?.hasPendingSeek() || loggingSeek) return;
    loggingSeek = true;
    seekStart = participantControls.getAcceptedTime();
  }

  function logSeekAction() {
    if (!player || participantControls?.hasPendingSeek() || !loggingSeek) return;
    logVideoAction('seek');
    loggingSeek = false;
  }

  function logVideoAction(action) {
    if (!player) return;
    const trialStartTimestamp = Session.get('trialStartTimestamp') || Date.now();
    const actionTimestamp = Date.now();
    const sessionID = `${new Date(trialStartTimestamp).toUTCString().substr(0, 16)} ${Session.get('currentTdfName')}`;
    const curTdf = Session.get('currentTdfFile');
    const unitNumber = Session.get('currentUnitNumber');
    let videoIdentity;
    try {
      videoIdentity = buildVideoHistoryIdentity({
        videoUrl,
        unitNumber,
        unit: curTdf?.tdfs?.tutor?.unit?.[unitNumber],
      });
    } catch (error) {
      clientConsole(1, '[VideoSessionMode] Error writing video history:', error?.message || error);
      return;
    }
    const currentTimeStamp = player.currentTime;
    const seekEnd = Number.isFinite(seekStart) ? currentTimeStamp : null;

    const answerLogRecord = {
      itemId: 'N/A',
      KCId: 'N/A',
      userId: Meteor.userId(),
      TDFId: Session.get('currentTdfId'),
      outcome: '',
      probabilityEstimate: 'N/A',
      typeOfResponse: 'N/A',
      responseValue: 'N/A',
      ...videoIdentity,
      sectionId: Session.get('curSectionId'),
      teacherId: Session.get('curTeacher')?._id,
      anonStudentId: Meteor.user()?.username,
      sessionID,
      conditionNameA: 'tdf file',
      conditionTypeA: Session.get('currentTdfName'),
      conditionNameB: 'xcondition',
      conditionTypeB: Session.get('experimentXCond') || null,
      conditionNameC: 'schedule condition',
      conditionTypeC: 'N/A',
      conditionNameD: 'how answered',
      conditionTypeD: legacyTrim(action),
      conditionNameE: 'section',
      conditionTypeE: Meteor.user()?.loginParams?.entryPoint &&
        Meteor.user()?.loginParams?.entryPoint !== 'direct'
        ? Meteor.user()?.loginParams?.entryPoint
        : null,
      responseDuration: null,
      time: actionTimestamp,
      problemStartTime: trialStartTimestamp,
      selection: 'video',
      action,
      input: legacyTrim(action),
      studentResponseType: 'N/A',
      studentResponseSubtype: 'N/A',
      tutorResponseType: 'N/A',
      KCDefault: 'N/A',
      KCCategoryDefault: '',
      KCCluster: 'N/A',
      KCCategoryCluster: '',
      CFStartLatency: null,
      CFEndLatency: null,
      CFFeedbackLatency: null,
      CFVideoTimeStamp: currentTimeStamp,
      CFVideoSeekStart: seekStart,
      CFVideoSeekEnd: seekEnd,
      CFVideoCurrentSpeed: player.speed,
      CFVideoCurrentVolume: player.volume,
      CFVideoPreviousSpeed: lastSpeed,
      CFVideoPreviousVolume: lastVolume,
      CFVideoIsPlaying: player.playing,
      feedbackText: document.getElementById('UserInteraction')?.textContent || '',
      feedbackType: '',
      entryPoint: Meteor.user()?.loginParams?.entryPoint,
      eventType: 'video',
    };

    lastVolume = player.volume;
    lastSpeed = player.speed;
    seekStart = player.currentTime;

    insertCompressedHistory(answerLogRecord).catch((error) => {
      clientConsole(1, '[VideoSessionMode] Error writing video history:', error?.message || error);
    });
  }

  function disableSeekUi() {
    if (!containerElement) return;
    const seekInput = containerElement.querySelector('[data-plyr="seek"]');
    const progressBar = containerElement.querySelector('.plyr__progress');
    if (seekInput) seekInput.style.pointerEvents = 'none';
    if (progressBar) progressBar.style.pointerEvents = 'none';
  }

  function getRenderedYouTubeIframeSrc() {
    return containerElement?.querySelector('iframe[src*="youtube"]')?.getAttribute('src') || null;
  }

  function getReferrerPolicyValue() {
    const metaPolicy = document.querySelector('meta[name="referrer"]')?.getAttribute('content');
    return metaPolicy || 'strict-origin-when-cross-origin';
  }

  function getBrowserFamily() {
    const userAgentData = navigator.userAgentData;
    if (userAgentData?.brands?.length) {
      return userAgentData.brands.map((brand) => `${brand.brand}/${brand.version}`).join(', ');
    }
    const userAgent = navigator.userAgent || '';
    if (userAgent.includes('Edg/')) return 'Edge';
    if (userAgent.includes('Chrome/')) return 'Chrome';
    if (userAgent.includes('Firefox/')) return 'Firefox';
    if (userAgent.includes('Safari/')) return 'Safari';
    return 'Unknown';
  }

  function buildVideoDiagnostic(rawUrl, iframeSrc) {
    return {
      loginMode: Session.get('loginMode') || null,
      isExperiment: Session.get('loginMode') === 'experiment',
      routePath: window.location?.pathname || '',
      videoId: youtubeInfo?.id || null,
      sourceHost: youtubeInfo?.sourceHost || null,
      watchUrl: youtubeInfo?.watchUrl || null,
      embedHost: 'youtube-nocookie.com',
      iframeSrc,
      originalUrlHost: (() => {
        try {
          return new URL(rawUrl).hostname;
        } catch (_error) {
          return null;
        }
      })(),
      documentReferrerPresent: Boolean(document.referrer),
      referrerPolicy: getReferrerPolicyValue(),
      browserFamily: getBrowserFamily(),
      standaloneDisplayMode: Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches),
      touchCapable: navigator.maxTouchPoints > 0,
      thirdPartyCookieProbeAvailable: typeof document.hasStorageAccess === 'function',
    };
  }

  function inferVideoMimeType(url) {
    const withoutQuery = String(url || '').split('?')[0]?.split('#')[0] || '';
    const ext = withoutQuery.split('.').pop()?.toLowerCase() || '';
    const mimeByExt = {
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      webm: 'video/webm',
      ogv: 'video/ogg',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      m3u8: 'application/x-mpegURL',
    };
    return mimeByExt[ext] || '';
  }
</script>

<div class="video-session-mode" bind:this={containerElement}>
  <div class="video-container">
    {#if isYouTube}
      <div
        class="plyr__video-embed"
        bind:this={videoElement}
        data-plyr-provider="youtube"
        data-plyr-embed-id={youtubeId}
      ></div>
    {:else}
      <video bind:this={videoElement} playsinline>
        <track kind="captions" />
      </video>
    {/if}
  </div>

  {#if resolvedOverlayMounted}
    <div class="overlay-content" class:overlay-content-visible={resolvedOverlayVisible}>
      <slot></slot>
    </div>
  {/if}
</div>

<style>
  .video-session-mode {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: var(--app-text-color);
  }

  .video-container {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .video-container :global(video) {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .overlay-content {
    position: absolute;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: 90%;
    background-color: var(--media-video-overlay-surface-color);
    border-radius: var(--app-border-radius-lg);
    box-shadow: var(--app-surface-shadow);
    padding: var(--app-space-3);
    z-index: 100;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--app-transition-smooth) ease;
  }

  .overlay-content.overlay-content-visible {
    opacity: 1;
    pointer-events: auto;
  }

  /* Mobile adjustments */
  @media (max-width: 768px) {
    .overlay-content {
      width: 95%;
      bottom: 60px;
      padding: calc(0.75rem * var(--app-density-scale));
    }
  }

  /* Import Plyr CSS (will be loaded separately) */
  :global(.plyr) {
    width: 100%;
    height: 100%;
  }

  :global(.plyr__video-wrapper) {
    background: var(--app-text-color);
  }
</style>
