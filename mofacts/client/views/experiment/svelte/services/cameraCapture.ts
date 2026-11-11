import { startCameraTracking, type CameraTrackingLease } from './cameraTrackingSession';

// Capture owns the preview and stream; its consumer owns inference and UI.
export function createCameraCapture(onRevoked: () => void = () => {}) {
  let lease: CameraTrackingLease<{ deviceId: string | undefined; cameraIds: string[]; mirrored: boolean }> | null = null;

  function stop(): void { const previous = lease; lease = null; previous?.stop(); }

  async function start(
    target: HTMLVideoElement,
    onEnded: () => void,
    deviceId?: string,
  ): Promise<{ deviceId: string | undefined; cameraIds: string[]; mirrored: boolean }> {
    stop();
    let stream: MediaStream | null = null;
    let attached = false;
    let notified = false;
    const request = startCameraTracking('pose', reason => {
      stream?.getTracks().forEach(track => track.stop());
      stream = null;
      if (attached) { target.pause(); target.srcObject = null; attached = false; }
      if (!notified && reason !== 'failed' && lease === request) { notified = true; onRevoked(); }
    }, async isCurrent => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires HTTPS or localhost and a supported browser.');
      }
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
          width: { ideal: 960 }, height: { ideal: 720 } },
      });
      stream = acquired;
      if (!isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
      acquired.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (isCurrent()) { stop(); onEnded(); }
      }, { once: true }));
      target.srcObject = acquired;
      attached = true;
      await target.play();
      if (!isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
      const track = acquired.getVideoTracks()[0];
      if (!track) throw new Error('The camera returned no video track.');
      const settings = track.getSettings();
      return {
        deviceId: settings.deviceId,
        cameraIds: devices.filter(device => device.kind === 'videoinput' && device.deviceId).map(device => device.deviceId),
        mirrored: settings.facingMode !== 'environment',
      };
    });
    lease = request;
    return request.ready;
  }

  return { start, stop };
}
