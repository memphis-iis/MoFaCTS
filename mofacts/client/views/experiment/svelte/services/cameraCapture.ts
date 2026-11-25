import { startCameraTracking, type CameraTrackingLease } from './cameraTrackingSession';

// resizeMode is standardized but absent from the pinned TypeScript DOM types.
type NativeCameraConstraints = MediaTrackConstraints & { resizeMode: ConstrainDOMString };

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
      const video: NativeCameraConstraints = {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
        resizeMode: { exact: 'none' },
      };
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      stream = acquired;
      if (!isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
      acquired.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (isCurrent()) { stop(); onEnded(); }
      }, { once: true }));
      const track = acquired.getVideoTracks()[0];
      if (!track) throw new Error('The camera returned no video track.');
      // Prefer the device's largest native mode, without imposing a 4:3 crop.
      // Width/height are preferences because their capability maxima need not
      // describe one supported mode. Never allow browser crop-and-scale.
      const capabilities = track.getCapabilities();
      const nativeMode: NativeCameraConstraints = {
        resizeMode: { exact: 'none' },
        ...(capabilities.width?.max ? { width: { ideal: capabilities.width.max } } : {}),
        ...(capabilities.height?.max ? { height: { ideal: capabilities.height.max } } : {}),
      };
      await track.applyConstraints(nativeMode);
      if (!isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
      target.srcObject = acquired;
      attached = true;
      await target.play();
      if (!isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!isCurrent()) throw new DOMException('Camera start was cancelled', 'AbortError');
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
