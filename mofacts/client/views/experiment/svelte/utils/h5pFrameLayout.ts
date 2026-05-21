import type { H5PFitResult } from './h5pFitPolicy';

export const H5P_BOOTSTRAP_FRAME_WIDTH = 640;
export const H5P_MIN_FRAME_HEIGHT = 120;

export interface H5PFrameLayoutInput {
  isSelfHosted: boolean;
  stageWidth: number;
  stageHeight: number;
  preferredHeight: number;
  fitResult: H5PFitResult | null;
  naturalWidth: number | null;
  naturalHeight: number | null;
  measurementWidth: number | null;
  measuring: boolean;
}

export interface H5PFrameLayout {
  visibleNaturalWidth: number;
  visibleNaturalHeight: number;
  measurementFrameWidth: number;
  measurementFrameHeight: number;
  displaySurfaceHeight: number;
  displayFrameHeight: number;
  frameScale: number;
  stageStyle: string;
  visualStyle: string;
  surfaceStyle: string;
  frameStyle: string;
}

function positivePixel(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}

function fitScale(frameWidth: number, frameHeight: number, stageWidth: number, stageHeight: number): number {
  if (stageWidth <= 0 || stageHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) {
    return 1;
  }
  return Math.min(1, stageWidth / frameWidth, stageHeight / frameHeight);
}

export function buildH5PFrameLayout(input: H5PFrameLayoutInput): H5PFrameLayout {
  const bootstrapFrameWidth = positivePixel(input.stageWidth, H5P_BOOTSTRAP_FRAME_WIDTH);
  const bootstrapFrameHeight = Math.max(
    H5P_MIN_FRAME_HEIGHT,
    input.isSelfHosted && input.stageHeight > 0
      ? Math.floor(input.stageHeight)
      : Math.floor(Math.min(input.stageHeight || input.preferredHeight, input.preferredHeight))
  );

  const visibleNaturalWidth = positivePixel(
    input.fitResult?.naturalWidth ?? input.naturalWidth ?? input.measurementWidth,
    bootstrapFrameWidth
  );
  const visibleNaturalHeight = Math.max(
    H5P_MIN_FRAME_HEIGHT,
    positivePixel(input.fitResult?.naturalHeight ?? input.naturalHeight, bootstrapFrameHeight)
  );
  const measurementFrameWidth = positivePixel(input.measurementWidth, visibleNaturalWidth);
  const measurementFrameHeight = Math.max(
    H5P_MIN_FRAME_HEIGHT,
    positivePixel(input.naturalHeight ?? input.fitResult?.naturalHeight, bootstrapFrameHeight)
  );
  const hasSelectedFit = Boolean(input.fitResult);
  const isProvisional = input.measuring && !hasSelectedFit;
  const provisionalFrameWidth = positivePixel(input.stageWidth, bootstrapFrameWidth);
  const displaySurfaceHeight = isProvisional
    ? bootstrapFrameHeight
    : (input.isSelfHosted
      ? Math.max(visibleNaturalHeight, positivePixel(input.stageHeight, visibleNaturalHeight))
      : visibleNaturalHeight);
  const displayFrameWidth = isProvisional
    ? provisionalFrameWidth
    : visibleNaturalWidth;
  const displayFrameHeight = displaySurfaceHeight;
  const frameScale = input.fitResult && input.fitResult.scale > 0
    ? input.fitResult.scale
    : fitScale(displayFrameWidth, displayFrameHeight, input.stageWidth, input.stageHeight);
  const frameVisualWidth = Math.max(1, Math.floor(displayFrameWidth * frameScale));
  const frameVisualHeight = Math.max(1, Math.floor(displaySurfaceHeight * frameScale));

  return {
    visibleNaturalWidth,
    visibleNaturalHeight,
    measurementFrameWidth,
    measurementFrameHeight,
    displaySurfaceHeight,
    displayFrameHeight,
    frameScale,
    stageStyle: 'width:100%;height:100%;',
    visualStyle: `width:${frameVisualWidth}px;height:${frameVisualHeight}px;`,
    surfaceStyle: `width:${displayFrameWidth}px;height:${displaySurfaceHeight}px;transform:scale(${frameScale});`,
    frameStyle: `width:${displayFrameWidth}px;height:${displayFrameHeight}px;`,
  };
}
