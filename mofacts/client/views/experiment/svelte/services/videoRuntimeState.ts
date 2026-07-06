import { ReactiveDict } from 'meteor/reactive-dict';

const videoRuntimeState = new ReactiveDict('videoRuntimeState');

const VideoRuntimeKeys = Object.freeze({
  VIDEO_SOURCE: 'videoSource',
});

export function setVideoSource(value: unknown): void {
  videoRuntimeState.set(VideoRuntimeKeys.VIDEO_SOURCE, value as never);
}

export function getVideoSource(): unknown {
  return videoRuntimeState.get(VideoRuntimeKeys.VIDEO_SOURCE);
}

export function resetVideoRuntimeState(): void {
  setVideoSource(undefined);
}

resetVideoRuntimeState();
