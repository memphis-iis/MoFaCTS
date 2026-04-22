<script>
  /**
   * SRStatus Component
   * Speech recognition status indicator (Ready/Active)
   */

  /** @type {'idle' | 'ready' | 'active' | 'recording' | 'processing' | 'error'} */
  export let status = 'idle';

  /** @type {number} Current attempt number */
  export let attempt = 0;

  /** @type {number} Maximum attempts */
  export let maxAttempts = 3;

  /** @type {string} Error message (if status is error) */
  export let errorMessage = '';

  /** @type {string} Last transcript */
  export let transcript = '';

  $: isRecording = status === 'ready' || status === 'active' || status === 'recording';
  $: isProcessing = status === 'processing';
  $: statusMessage = getStatusMessage(status);
  $: attemptMessage = attempt > 0 && maxAttempts > 0 ? `Attempt ${attempt} of ${maxAttempts}` : '';
  $: transcriptMessage = transcript ? `Last transcript: ${transcript}` : '';
  $: statusAriaLabel = [statusMessage, attemptMessage, transcriptMessage].filter(Boolean).join('. ');

  function getStatusMessage(currentStatus) {
    switch (currentStatus) {
      case 'idle':
        return '';
      case 'ready':
      case 'active':
      case 'recording':
        return 'Say skip or answer';
      case 'processing':
        return 'Please wait...';
      case 'error':
        return errorMessage || 'Speech recognition error';
      default:
        return '';
    }
  }
</script>

{#if status !== 'idle'}
  <div
    class="sr-status"
    class:recording={isRecording}
    class:processing={isProcessing}
    class:error={status === 'error'}
    aria-label={statusAriaLabel}
  >
    <div class="status-indicator">
      <div class="mic-icon" aria-hidden="true"></div>
    </div>

    <div class="status-message">
      <div class="status-text">{statusMessage}</div>
    </div>
  </div>
{/if}

<style>
  .sr-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
  }

  .status-indicator {
    display: none;
  }

  .status-message {
    text-align: center;
  }

  .status-text {
    font-size: var(--card-font-size, inherit);
    color: var(--text-color);
  }

  .sr-status.recording .status-text {
    color: var(--success-color, #00cc00);
  }

  .sr-status.processing .status-text {
    color: var(--alert-color, #ff0000);
  }

  .sr-status.error .status-text {
    color: var(--alert-color, #ff0000);
  }
</style>
