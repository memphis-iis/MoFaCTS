<script>
  import { createEventDispatcher, flushSync, onDestroy, tick } from 'svelte';
  import {
    clampH5PPreferredHeight,
    H5P_DEFAULT_PREFERRED_HEIGHT,
    isSelfHostedH5PConfig,
    validateH5PDisplayConfig,
  } from '../../../../../common/lib/h5pDisplay';
  import { clientConsole } from '../../../../lib/clientLogger';
  import {
    buildH5PCandidateWidths,
    chooseH5PFit,
    getH5PScaleFloor,
  } from '../utils/h5pFitPolicy';
  import { buildH5PFrameLayout } from '../utils/h5pFrameLayout';
  import { parseH5PFrameMessage } from '../utils/h5pFrameMessages';
  import { waitForBrowserPaint } from '../utils/paintTiming';
  import H5PFrameView from './H5PFrameView.svelte';

  const dispatch = createEventDispatcher();
  const FIT_VERTICAL_SAFETY_PX = 8;
  const MEASUREMENT_TIMEOUT_MS = 1500;
  const CANDIDATE_MEASUREMENT_TIMEOUT_MS = 750;
  const FEEDBACK_RESIZE_SETTLE_MS = 120;
  const FEEDBACK_RESIZE_MAX_SETTLE_MS = 360;

  export let config = null;

  let pendingResult = null;
  let resultLifecycle = 'idle';
  let frameElement;
  let viewportElement;
  let continueBarElement;
  let viewportResizeObserver;
  let observedViewportElement;
  let resizeFrameId = 0;
  let measurementTimeoutId = 0;
  let feedbackSettleTimeoutId = 0;
  let feedbackMaxSettleTimeoutId = 0;
  let currentConfigSignature = '';

  let fitPhase = 'question';
  let fitEpoch = 0;
  let stageWidth = 0;
  let stageHeight = 0;
  let naturalWidth = null;
  let naturalHeight = null;
  let measurementWidth = null;
  let candidateWidths = [];
  let measuredCandidates = [];
  let activeCandidateIndex = 0;
  let fitResult = null;
  let resizeMessageCount = 0;
  let fitAttemptCount = 0;
  let measurementRequestId = 0;
  let activeMeasurementRequestId = null;
  let measuring = false;
  let h5pRuntimeReady = false;
  let transitionReady = false;
  let timedOut = false;
  let lastFitLogSignature = '';
  let loggedMeasurementRequestForEpoch = false;

  $: baseUrl = typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/`
    : 'https://mofacts.local/';
  $: validation = validateH5PDisplayConfig(config, baseUrl);
  $: embedUrl = validation.valid
    ? (isSelfHostedH5PConfig(config)
      ? `/h5p-content/${encodeURIComponent(String(config?.contentId || ''))}/play`
      : String(config?.embedUrl || '').trim())
    : '';
  $: configSignature = validation.valid
    ? [
      String(config?.sourceType || ''),
      String(config?.contentId || ''),
      String(config?.packageAssetId || ''),
      String(config?.library || ''),
      embedUrl,
      String(config?.preferredHeight ?? ''),
    ].join('|')
    : '';
  $: isSelfHosted = isSelfHostedH5PConfig(config);
  $: preferredHeight = clampH5PPreferredHeight(config?.preferredHeight ?? H5P_DEFAULT_PREFERRED_HEIGHT);
  $: reservedControlHeight = isSelfHosted && continueBarElement ? continueBarElement.offsetHeight : 0;
  $: frameLayout = buildH5PFrameLayout({
    isSelfHosted,
    stageWidth,
    stageHeight,
    preferredHeight,
    fitResult,
    naturalWidth,
    naturalHeight,
    measurementWidth,
    measuring,
  });
  $: frameVisible = Boolean(h5pRuntimeReady && fitResult);
  $: continueReady = Boolean(pendingResult && resultLifecycle === 'available' && !measuring && fitResult);

  $: if (configSignature !== currentConfigSignature) {
    currentConfigSignature = configSignature;
    resetH5PState('config');
  }

  $: syncViewportResizeObserver();

  function clearMeasurementTimeout() {
    if (measurementTimeoutId) {
      clearTimeout(measurementTimeoutId);
      measurementTimeoutId = 0;
    }
  }

  function clearFeedbackSettleTimers() {
    if (feedbackSettleTimeoutId) {
      clearTimeout(feedbackSettleTimeoutId);
      feedbackSettleTimeoutId = 0;
    }
    if (feedbackMaxSettleTimeoutId) {
      clearTimeout(feedbackMaxSettleTimeoutId);
      feedbackMaxSettleTimeoutId = 0;
    }
  }

  function finalizeSettledFeedbackResize(source) {
    clearFeedbackSettleTimers();
    completeCurrentCandidate(source);
  }

  function resetH5PState(reason) {
    pendingResult = null;
    resultLifecycle = 'idle';
    fitPhase = 'question';
    fitEpoch += 1;
    naturalWidth = null;
    naturalHeight = null;
    measurementWidth = null;
    candidateWidths = [];
    measuredCandidates = [];
    activeCandidateIndex = 0;
    fitResult = null;
    resizeMessageCount = 0;
    fitAttemptCount = 0;
    activeMeasurementRequestId = null;
    measuring = false;
    h5pRuntimeReady = false;
    transitionReady = false;
    timedOut = false;
    lastFitLogSignature = '';
    loggedMeasurementRequestForEpoch = false;
    clearMeasurementTimeout();
    clearFeedbackSettleTimers();
    void requestMeasurementAfterPaint(reason);
  }

  function prepareNextH5PItemLayout(reason) {
    fitPhase = 'question';
    fitEpoch += 1;
    naturalWidth = null;
    naturalHeight = null;
    measurementWidth = availableMeasurementWidth();
    candidateWidths = measurementWidth > 0 ? [measurementWidth] : [];
    measuredCandidates = [];
    activeCandidateIndex = 0;
    fitResult = null;
    resizeMessageCount = 0;
    fitAttemptCount = 0;
    activeMeasurementRequestId = null;
    measuring = measurementWidth > 0;
    h5pRuntimeReady = false;
    transitionReady = false;
    timedOut = false;
    lastFitLogSignature = '';
    loggedMeasurementRequestForEpoch = false;
    clearMeasurementTimeout();
    clearFeedbackSettleTimers();
    void requestMeasurementAfterPaint(reason);
  }

  function availableMeasurementWidth() {
    return Math.floor(viewportElement?.clientWidth || stageWidth || 0);
  }

  function beginCandidateMeasurements(availableWidth, allowAlternateWidths) {
    const widths = allowAlternateWidths && !isSelfHosted
      ? buildH5PCandidateWidths(availableWidth)
      : [availableWidth];
    candidateWidths = widths.length > 0 ? widths : [availableWidth];
    measuredCandidates = [];
    activeCandidateIndex = 0;
    measurementWidth = candidateWidths[0] ?? availableWidth;
  }

  function startFitEpoch(phase, reason, preservePresentedFit = true) {
    const firstMeasurementWidth = availableMeasurementWidth();
    if (firstMeasurementWidth <= 0) {
      clientConsole(1, '[H5PFrame][Fit] cannot start epoch without a measured stage width', {
        phase,
        reason,
        contentId: config?.contentId,
      });
      return;
    }
    fitPhase = phase;
    fitEpoch += 1;
    naturalWidth = null;
    naturalHeight = null;
    if (!preservePresentedFit) {
      fitResult = null;
    }
    beginCandidateMeasurements(firstMeasurementWidth, true);
    activeMeasurementRequestId = null;
    measuring = true;
    timedOut = false;
    loggedMeasurementRequestForEpoch = false;
    clearMeasurementTimeout();
    clearFeedbackSettleTimers();
    scheduleMeasurementTimeout(fitEpoch, phase);
    void requestMeasurementAfterPaint(reason);
  }

  function scheduleMeasurementTimeout(epoch, phase) {
    clearMeasurementTimeout();
    measurementTimeoutId = setTimeout(() => {
      if (epoch !== fitEpoch || !measuring) {
        return;
      }
      timedOut = true;
      if (naturalHeight !== null && naturalWidth !== null) {
        logMeasurementIssue('timeout-after-partial-resize-sequence', {
          phase,
          epoch,
          naturalWidth,
          naturalHeight,
        });
        completeCurrentCandidate('timeout');
        return;
      }
      logMeasurementIssue('timeout-without-natural-size', {
        phase,
        epoch,
        contentId: config?.contentId,
      });
      measuring = false;
      activeMeasurementRequestId = null;
      measurementWidth = null;
      clearMeasurementTimeout();
    }, measuredCandidates.length > 0 ? CANDIDATE_MEASUREMENT_TIMEOUT_MS : MEASUREMENT_TIMEOUT_MS);
  }

  function logMeasurementIssue(reason, details = {}) {
    clientConsole(1, '[H5PFrame][Fit] measurement invariant', {
      reason,
      contentId: config?.contentId,
      phase: fitPhase,
      epoch: fitEpoch,
      stageWidth,
      stageHeight,
      candidateWidths,
      measuredCandidates,
      details,
    });
  }

  async function requestMeasurementAfterPaint(reason) {
    const epoch = fitEpoch;
    await tick();
    await waitForBrowserPaint();
    if (epoch !== fitEpoch) {
      return;
    }
    updateStageSize(`${reason}:paint`);
    if (epoch !== fitEpoch) {
      return;
    }
    if (activeMeasurementRequestId !== null) {
      return;
    }
    if (measurementWidth === null) {
      const nextMeasurementWidth = availableMeasurementWidth();
      if (nextMeasurementWidth <= 0) {
        logMeasurementIssue('measurement-request-without-width', { reason });
        measuring = false;
        activeMeasurementRequestId = null;
        return;
      }
      beginCandidateMeasurements(nextMeasurementWidth, true);
      measuring = true;
      await tick();
      await waitForBrowserPaint();
      if (epoch !== fitEpoch) {
        return;
      }
    }
    requestH5PMeasurement(reason);
  }

  function requestH5PMeasurement(reason) {
    if (!frameElement?.contentWindow) {
      return;
    }
    if (activeMeasurementRequestId !== null) {
      return;
    }
    if (measurementWidth === null) {
      logMeasurementIssue('measurement-request-without-width', { reason });
      measuring = false;
      activeMeasurementRequestId = null;
      return;
    }
    measurementRequestId += 1;
    activeMeasurementRequestId = measurementRequestId;
    measuring = true;
    scheduleMeasurementTimeout(fitEpoch, fitPhase);
    logMeasurementRequest(reason, activeMeasurementRequestId);
    frameElement.getBoundingClientRect();
    postH5PAction('resize', {
      requestId: activeMeasurementRequestId,
      measurementWidth,
      phase: fitPhase,
      epoch: fitEpoch,
    });
  }

  function scheduleStageSizeUpdate(reason) {
    if (resizeFrameId) {
      cancelAnimationFrame(resizeFrameId);
    }
    resizeFrameId = requestAnimationFrame(() => {
      resizeFrameId = 0;
      updateStageSize(reason);
    });
  }

  function syncViewportResizeObserver() {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    if (!viewportElement) {
      return;
    }

    if (viewportResizeObserver && observedViewportElement !== viewportElement) {
      viewportResizeObserver.disconnect();
      viewportResizeObserver = undefined;
      observedViewportElement = undefined;
    }

    if (!viewportResizeObserver) {
      viewportResizeObserver = new ResizeObserver(() => {
        scheduleStageSizeUpdate('resize-observer');
      });
      viewportResizeObserver.observe(viewportElement);
      observedViewportElement = viewportElement;
      void requestMeasurementAfterPaint('viewport-observer');
    }
  }

  function logMeasurementRequest(reason, requestId) {
    if (loggedMeasurementRequestForEpoch) {
      return;
    }

    loggedMeasurementRequestForEpoch = true;
    clientConsole(2, '[H5PFrame][Fit] request-measurement', {
      reason,
      requestId,
      phase: fitPhase,
      epoch: fitEpoch,
      stageWidth,
      stageHeight,
      measurementWidth,
      activeCandidateIndex,
      candidateWidths,
      contentId: config?.contentId,
    });
  }

  function updateStageSize(reason) {
    if (!viewportElement) {
      return;
    }
    const nextWidth = Math.floor(viewportElement.clientWidth || 0);
    const nextHeight = Math.floor(viewportElement.clientHeight || 0);
    if (nextWidth <= 0 || nextHeight <= 0) {
      return;
    }

    const widthChanged = Math.abs(nextWidth - stageWidth) > 1;
    const heightChanged = Math.abs(nextHeight - stageHeight) > 1;
    stageWidth = nextWidth;
    stageHeight = nextHeight;

    if (widthChanged || heightChanged) {
      startFitEpoch(fitPhase, reason);
    }
  }

  function postH5PAction(action, data = {}) {
    if (!frameElement?.contentWindow) {
      return;
    }
    frameElement.contentWindow.postMessage({
      ...data,
      action,
      context: 'h5p',
    }, '*');
  }

  function upsertMeasuredCandidate(candidate) {
    const existingIndex = measuredCandidates
      .findIndex((entry) => entry.measurementWidth === candidate.measurementWidth);
    if (existingIndex >= 0) {
      measuredCandidates = [
        ...measuredCandidates.slice(0, existingIndex),
        candidate,
        ...measuredCandidates.slice(existingIndex + 1),
      ];
      return;
    }
    measuredCandidates = [...measuredCandidates, candidate];
  }

  function chooseFitFromMeasurements() {
    const scaleFloor = getH5PScaleFloor(stageWidth, false);
    const availableHeight = Math.max(1, stageHeight - FIT_VERTICAL_SAFETY_PX);
    return chooseH5PFit({
      phase: fitPhase,
      availableWidth: stageWidth,
      availableHeight,
      reservedControlHeight,
      scaleFloor,
      focusAvailable: false,
      candidates: measuredCandidates,
    });
  }

  function completeFit(nextFit, source) {
    if (!nextFit || !(nextFit.scale > 0)) {
      logMeasurementIssue('invalid-fit-result', { source, fit: nextFit });
      measuring = false;
      activeMeasurementRequestId = null;
      return;
    }
    const wasVisible = frameVisible;
    fitResult = nextFit;
    measuring = false;
    activeMeasurementRequestId = null;
    measurementWidth = null;
    naturalWidth = nextFit.naturalWidth;
    naturalHeight = nextFit.naturalHeight;
    clearMeasurementTimeout();
    fitAttemptCount += 1;

    const signature = [
      nextFit.phase,
      nextFit.mode,
      nextFit.naturalWidth,
      nextFit.naturalHeight,
      nextFit.availableWidth,
      nextFit.availableHeight,
      nextFit.scale.toFixed(3),
    ].join(':');

    if (signature !== lastFitLogSignature) {
      lastFitLogSignature = signature;
      clientConsole(2, '[H5PFrame][Fit] applied', {
        source,
        epoch: fitEpoch,
        contentId: config?.contentId,
        candidateWidths,
        measuredCandidates,
        resizeMessageCount,
        fitAttemptCount,
        timedOut,
        fit: nextFit,
      });
    }

    if (h5pRuntimeReady && !wasVisible && !transitionReady) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (h5pRuntimeReady && fitResult) {
            transitionReady = true;
          }
        });
      });
    } else if (h5pRuntimeReady && wasVisible) {
      transitionReady = true;
    }
  }

  function measureNextCandidate(source) {
    const nextIndex = activeCandidateIndex + 1;
    const nextWidth = candidateWidths[nextIndex];
    if (!nextWidth) {
      completeCurrentCandidate(source);
      return;
    }

    activeMeasurementRequestId = null;
    activeCandidateIndex = nextIndex;
    measurementWidth = nextWidth;
    naturalWidth = null;
    naturalHeight = null;
    measuring = true;
    loggedMeasurementRequestForEpoch = false;
    clearMeasurementTimeout();
    clearFeedbackSettleTimers();
    void requestMeasurementAfterPaint(`${source}:candidate-${nextIndex}`);
  }

  function completeCurrentCandidate(source) {
    if (!measuring || measuredCandidates.length === 0) {
      return;
    }

    let nextFit;
    try {
      nextFit = chooseFitFromMeasurements();
    } catch (error) {
      logMeasurementIssue('fit-policy-error', {
        source,
        message: error instanceof Error ? error.message : String(error),
      });
      measuring = false;
      activeMeasurementRequestId = null;
      return;
    }

    const hasMoreCandidates = activeCandidateIndex + 1 < candidateWidths.length;
    const canStop =
      nextFit.mode === 'native' ||
      nextFit.mode === 'width-adjusted' ||
      !hasMoreCandidates;

    if (!canStop) {
      measureNextCandidate(source);
      return;
    }

    completeFit(nextFit, source);
  }

  function recordNaturalSize(data, source, finalize = false) {
    const responseRequestId = Number(data.requestId);
    if (!measuring || responseRequestId !== activeMeasurementRequestId) {
      return;
    }

    const scrollHeight = Number(data.scrollHeight);
    if (!Number.isFinite(scrollHeight) || scrollHeight <= 0) {
      return;
    }

    const measuredWidth = Math.round(
      measurementWidth || Number(data.measurementWidth) || Number(data.clientWidth) || 0
    );
    if (measuredWidth <= 0) {
      logMeasurementIssue('resize-message-without-measurement-width', { source, data });
      return;
    }

    resizeMessageCount += 1;
    naturalWidth = measuredWidth;
    naturalHeight = scrollHeight;
    upsertMeasuredCandidate({
      measurementWidth: measuredWidth,
      naturalWidth: measuredWidth,
      naturalHeight: scrollHeight,
    });

    if (finalize) {
      if (fitPhase === 'feedback' && source === 'resize') {
        if (feedbackSettleTimeoutId) {
          clearTimeout(feedbackSettleTimeoutId);
        }
        feedbackSettleTimeoutId = setTimeout(() => {
          finalizeSettledFeedbackResize('resize-settled');
        }, FEEDBACK_RESIZE_SETTLE_MS);
        if (!feedbackMaxSettleTimeoutId) {
          feedbackMaxSettleTimeoutId = setTimeout(() => {
            finalizeSettledFeedbackResize('resize-max-settled');
          }, FEEDBACK_RESIZE_MAX_SETTLE_MS);
        }
      } else {
        completeCurrentCandidate(source);
      }
    }
  }

  function handleH5PResizerMessage(data) {
    if (!frameElement) {
      return;
    }
    if (isSelfHosted && data.contentId !== config?.contentId) {
      return;
    }

    if (data.action === 'hello') {
      void requestMeasurementAfterPaint('hello');
      return;
    }

    if (data.action === 'contentChanged') {
      startFitEpoch(fitPhase, 'content-changed');
      return;
    }

    if (data.action === 'prepareResize') {
      recordNaturalSize(data, 'prepareResize');
      postH5PAction('resizePrepared', {
        requestId: activeMeasurementRequestId,
        measurementWidth,
        phase: fitPhase,
        epoch: fitEpoch,
      });
      return;
    }

    if (data.action === 'resize') {
      recordNaturalSize(data, 'resize', true);
    }
  }

  function handleMessage(event) {
    if (typeof window !== 'undefined' && event.origin !== window.location.origin) {
      return;
    }

    const message = parseH5PFrameMessage(event.data, config?.contentId);
    if (!message) {
      return;
    }

    if (message.kind === 'resizer') {
      handleH5PResizerMessage(message.data);
    } else if (message.kind === 'result') {
      if (resultLifecycle === 'continued') {
        return;
      }
      pendingResult = message.result;
      resultLifecycle = 'available';
      startFitEpoch('feedback', 'h5p-result');
    } else if (message.kind === 'loaded') {
      const wasVisible = frameVisible;
      h5pRuntimeReady = true;
      dispatch('loaded', message.data);
      startFitEpoch(fitPhase, 'h5p-loaded', wasVisible);
    } else if (message.kind === 'failed') {
      clientConsole(1, '[H5PFrame] H5P runtime reported a failure', message.data);
      dispatch('failed', message.data);
    } else if (message.kind === 'xapi') {
      dispatch('h5pxapi', message.data);
    }
  }

  function handleWindowResize() {
    scheduleStageSizeUpdate('window-resize');
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('message', handleMessage);
    window.addEventListener('resize', handleWindowResize);
  }

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('resize', handleWindowResize);
    }
    if (viewportResizeObserver) {
      viewportResizeObserver.disconnect();
      viewportResizeObserver = undefined;
    }
    if (resizeFrameId) {
      cancelAnimationFrame(resizeFrameId);
      resizeFrameId = 0;
    }
    clearMeasurementTimeout();
    clearFeedbackSettleTimers();
  });

  function handleLoad() {
    postH5PAction('ready');
    void requestMeasurementAfterPaint('iframe-load');
    dispatch('loaded', { sourceType: config?.sourceType, embedUrl });
  }

  function handleError() {
    clientConsole(1, '[H5PFrame] H5P iframe failed to load', {
      embedUrl,
    });
    dispatch('failed', { embedUrl });
  }

  async function handleContinue() {
    if (!continueReady) {
      return;
    }
    const result = pendingResult;
    pendingResult = null;
    resultLifecycle = 'continued';
    flushSync(() => {
      prepareNextH5PItemLayout('continue');
    });
    dispatch('h5presult', result);
  }

</script>

<H5PFrameView
  bind:frameElement
  bind:viewportElement
  bind:continueBarElement
  {validation}
  {embedUrl}
  {isSelfHosted}
  {continueReady}
  manualContinueVisible={Boolean(pendingResult)}
  {measuring}
  {frameVisible}
  {transitionReady}
  stageStyle={frameLayout.stageStyle}
  visualStyle={frameLayout.visualStyle}
  surfaceStyle={frameLayout.surfaceStyle}
  frameStyle={frameLayout.frameStyle}
  on:load={handleLoad}
  on:error={handleError}
  on:continue={handleContinue}
/>
