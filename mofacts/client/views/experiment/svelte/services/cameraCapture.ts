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
    deviceId?: string,
  ): Promise<{ deviceId: string | undefined; cameraIds: string[]; mirrored: boolean }> {
    stop();
    const token = generation;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires HTTPS or localhost and a supported browser.');
    }
    const acquired = await navigator.mediaDevices.getUserMedia({
      audio: false,
      // Initial access permits a normal desktop webcam. Switching selects an
      // enumerated device, not a facing direction that webcams may not report.
      video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
        width: { ideal: 960 }, height: { ideal: 720 } },
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
      // Permission must be granted before the browser exposes camera identities.
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (token !== generation) throw new DOMException('Camera start was cancelled', 'AbortError');
      const track = acquired.getVideoTracks()[0];
      if (!track) throw new Error('The camera returned no video track.');
      const settings = track.getSettings();
      return {
        deviceId: settings.deviceId,
        cameraIds: devices.filter(device => device.kind === 'videoinput' && device.deviceId).map(device => device.deviceId),
        mirrored: settings.facingMode !== 'environment',
      };
    } catch (error) {
      if (token === generation) stop();
      throw error;
    }
  }

  return { start, stop };
}
