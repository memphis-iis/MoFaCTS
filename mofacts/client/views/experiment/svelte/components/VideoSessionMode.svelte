<script>
  /**
   * VideoSessionMode Component
   * Video session wrapper with TrialContent overlaid (position: absolute)
   * Supports question checkpoints at specific timestamps
   */
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { Meteor } from 'meteor/meteor';
  import { Session } from 'meteor/session';
  import { ExperimentStateStore } from '../../../../lib/state/experimentStateStore';
  import { clientConsole } from '../../../../lib/userSessionHelpers';
  import { legacyTrim } from '../../../../../common/underscoreCompat';
  import { parseYouTubeVideoUrl } from '../../../../lib/youtubeUrl';

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

  /** @type {boolean} Whether the parent state machine can accept a checkpoint now */
  export let canAcceptCheckpoint = false;

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
  let maxAllowedTime = 0;
  let allowSeeking = false;
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

  function destroyPlayer() {
    if (player && typeof player.destroy === 'function') {
      player.destroy();
    }
    player = null;
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

    const Plyr = typeof window !== 'undefined' ? window.Plyr : null;

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
      controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'],
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

    // Event listeners
    player.on('play', () => {
      const activeCheckpointIndex = Math.max(0, nextCheckpointIndex - 1);
      const activeCheckpointTime = Number(questionTimes?.[activeCheckpointIndex]);
      const isAtTriggeredCheckpointTime = Number.isFinite(activeCheckpointTime) &&
        player.currentTime >= activeCheckpointTime - 0.5;

      if (atCheckpoint && !machineResumeInProgress && isAtTriggeredCheckpointTime) {
        clientConsole(1, '[VideoSessionMode] Blocking manual playback while checkpoint question is active', {
          currentTime: player.currentTime,
          nextCheckpointIndex,
          activeCheckpointTime,
        });
        player.pause();
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
    });

    player.on('pause', () => {
      isPlaying = false;
      logVideoAction('pause');
      dispatch('pause', { time: player.currentTime });
    });

    player.on('timeupdate', handleTimeUpdate);

    player.on('loadedmetadata', () => {
      duration = player.duration;
      dispatch('loadedmetadata', { duration: player.duration });
    });

    player.on('ready', () => {
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
        maxAllowedTime = normalizedResumeTime;
        setCurrentTime(normalizedResumeTime);
        appliedResumeAnchorKey = resumeAnchorKey;
      }
      if (preventScrubbing) {
        disableSeekUi();
      }
      dispatch('ready', { duration: player.duration });
    });

    player.on('ended', () => {
      logVideoAction('end');
      dispatch('ended');
    });

    player.on('seeking', () => {
      markSeekStart();
      clampSeekIfNeeded();
      dispatch('seeking', { time: player.currentTime });
    });

    player.on('seeked', () => {
      clampSeekIfNeeded();
      logSeekAction();
      dispatch('seeked', { time: player.currentTime });
    });

    player.on('volumechange', () => {
      logVideoAction('volumechange');
    });

    player.on('ratechange', () => {
      logVideoAction('ratechange');
    });

    player.on('error', (error) => {
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
    // Use tick() to ensure DOM is fully rendered before first init
    tick().then(() => initializePlayer());
  });

  onDestroy(() => {
    mounted = false;
    destroyPlayer();
  });

  $: if (mounted && videoElement && videoUrl) {
    // Wait for DOM to update (e.g., {#if isYouTube} block) before initializing Plyr
    tick().then(() => initializePlayer());
  }

  /**
   * Handle timeupdate - check for question checkpoints
   */
  function handleTimeUpdate() {
    if (!player) return;

    currentTime = player.currentTime;
    const playerDuration = Number(player.duration);
    if (!Number.isFinite(playerDuration) || playerDuration <= 0) {
      // Metadata is not ready yet (common during initial player bootstrapping).
      return;
    }
    if (clampSeekIfNeeded()) return;

    if (!preventScrubbing || currentTime <= maxAllowedTime + 1) {
      maxAllowedTime = Math.max(maxAllowedTime, currentTime);
    }

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

        // Pause video
        player.pause();

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
  export function play() {
    if (!player) return undefined;
    const playPromise = player.play();
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
    if (player) player.pause();
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
      const playPromise = player.play();
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
      const playPromise = player.play();
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
    const playPromise = player.play();
    if (playPromise?.catch) {
      playPromise.catch((error) => {
        clientConsole(1, '[VideoSessionMode] Autoplay failed:', error?.message || error);
      });
    }
  }

  function setCurrentTime(time) {
    if (!player || !Number.isFinite(time)) return;
    allowSeeking = true;
    player.currentTime = time;
    allowSeeking = false;
  }

  function clampSeekIfNeeded() {
    if (!player || !preventScrubbing || allowSeeking) return false;
    const current = player.currentTime;
    if (current > maxAllowedTime + 1) {
      clientConsole(2, '[VideoSessionMode] Blocking seek beyond maxAllowedTime', current, maxAllowedTime);
      logVideoAction('seek_blocked');
      setCurrentTime(maxAllowedTime);
      return true;
    }
    return false;
  }

  function markSeekStart() {
    if (!player || allowSeeking || loggingSeek) return;
    loggingSeek = true;
    seekStart = player.currentTime;
  }

  function logSeekAction() {
    if (!player || allowSeeking || !loggingSeek) return;
    logVideoAction('seek');
    loggingSeek = false;
  }

  function logVideoAction(action) {
    if (!player) return;
    const trialStartTimestamp = Session.get('trialStartTimestamp') || Date.now();
    const actionTimestamp = Date.now();
    const sessionID = `${new Date(trialStartTimestamp).toUTCString().substr(0, 16)} ${Session.get('currentTdfName')}`;
    const curTdf = Session.get('currentTdfFile');
    const unitName = legacyTrim(curTdf?.tdfs?.tutor?.unit?.[Session.get('currentUnitNumber')]?.unitname || '');
    const problemName = ExperimentStateStore.get()?.originalDisplay || '';
    const currentTimeStamp = player.currentTime;
    const seekEnd = seekStart ? currentTimeStamp : null;

    const answerLogRecord = {
      itemId: 'N/A',
      KCId: 'N/A',
      userId: Meteor.userId(),
      TDFId: Session.get('currentTdfId'),
      outcome: '',
      probabilityEstimate: 'N/A',
      typeOfResponse: 'N/A',
      responseValue: 'N/A',
      displayedStimulus: Session.get('currentDisplay'),
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
      levelUnit: Session.get('currentUnitNumber'),
      levelUnitName: unitName,
      levelUnitType: Session.get('unitType'),
      problemName,
      stepName: problemName,
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
      instructionQuestionResult: Session.get('instructionQuestionResult') || false,
      entryPoint: Meteor.user()?.loginParams?.entryPoint,
      eventType: '',
    };

    lastVolume = player.volume;
    lastSpeed = player.speed;
    seekStart = player.currentTime;

    Meteor.callAsync('insertHistory', answerLogRecord).catch((error) => {
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
    background-color: var(--text-color);
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
    background-color: var(--video-overlay-surface-color);
    border-radius: var(--border-radius-lg);
    box-shadow: var(--surface-shadow);
    padding: 1rem;
    z-index: 100;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--transition-smooth) ease;
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
      padding: 0.75rem;
    }
  }

  /* Import Plyr CSS (will be loaded separately) */
  :global(.plyr) {
    width: 100%;
    height: 100%;
  }

  :global(.plyr__video-wrapper) {
    background: var(--text-color);
  }
</style>

