// A camera stream belongs to one mounted consumer. No recording or persistence.
export function createCameraCapture() {
  let generation = 0;
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;

  function stop(): void {
    generation++;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    if (video) {
      video.pause();
      video.srcObject = null;
      video = null;
    }
  }

  async function start(
    target: HTMLVideoElement,
    onEnded: () => void,
    facingMode?: 'user' | 'environment',
  ): Promise<void> {
    stop();
    const token = generation;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires HTTPS or localhost and a supported browser.');
    }
    const acquired = await navigator.mediaDevices.getUserMedia({
      audio: false,
      // Initial webcam access prefers the front camera; an explicit switch must
      // obtain the requested direction or report failure, never silently ignore it.
      video: { facingMode: facingMode ? { exact: facingMode } : 'user', width: { ideal: 960 }, height: { ideal: 720 } },
    });
    if (token !== generation) {
      acquired.getTracks().forEach(track => track.stop());
      throw new DOMException('Camera start was cancelled', 'AbortError');
    }
    stream = acquired;
    video = target;
    acquired.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (token === generation) onEnded();
    }, { once: true }));
    target.srcObject = acquired;
    try {
      await target.play();
    } catch (error) {
      if (token === generation) stop();
      throw error;
    }
  }

  return { start, stop };
}
