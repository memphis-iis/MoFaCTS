export type H5PFitPhase = 'question' | 'feedback';

export type H5PFitMode =
  | 'native'
  | 'width-adjusted'
  | 'scaled'
  | 'focus';

export interface H5PMeasuredCandidate {
  measurementWidth: number;
  naturalWidth?: number;
  naturalHeight: number;
}

export interface H5PFitInput {
  phase: H5PFitPhase;
  availableWidth: number;
  availableHeight: number;
  reservedControlHeight: number;
  scaleFloor: number;
  focusAvailable: boolean;
  candidates: H5PMeasuredCandidate[];
}

export interface H5PFitResult {
  phase: H5PFitPhase;
  mode: H5PFitMode;
  measurementWidth: number;
  naturalWidth: number;
  naturalHeight: number;
  availableWidth: number;
  availableHeight: number;
  visualWidth: number;
  visualHeight: number;
  scale: number;
  reservedControlHeight: number;
  reason: string;
}

interface NormalizedCandidate {
  measurementWidth: number;
  naturalWidth: number;
  naturalHeight: number;
}

const MIN_CANDIDATE_WIDTH = 320;
const LOCAL_BREAKPOINT_OFFSETS = [1, 2, 4, 8, 16];

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function roundPositivePixel(value: number): number | null {
  if (!isPositiveFinite(value)) {
    return null;
  }
  return Math.max(1, Math.round(value));
}

function normalizeCandidate(candidate: H5PMeasuredCandidate): NormalizedCandidate | null {
  const measurementWidth = roundPositivePixel(candidate.measurementWidth);
  const naturalHeight = roundPositivePixel(candidate.naturalHeight);
  const naturalWidth = roundPositivePixel(candidate.naturalWidth ?? candidate.measurementWidth);
  if (measurementWidth === null || naturalHeight === null || naturalWidth === null) {
    return null;
  }
  return {
    measurementWidth,
    naturalWidth,
    naturalHeight,
  };
}

function buildResult(
  input: H5PFitInput,
  mode: H5PFitMode,
  candidate: NormalizedCandidate,
  scale: number,
  reason: string
): H5PFitResult {
  return {
    phase: input.phase,
    mode,
    measurementWidth: candidate.measurementWidth,
    naturalWidth: candidate.naturalWidth,
    naturalHeight: candidate.naturalHeight,
    availableWidth: input.availableWidth,
    availableHeight: input.availableHeight,
    visualWidth: Math.max(1, Math.floor(candidate.naturalWidth * scale)),
    visualHeight: Math.max(1, Math.floor(candidate.naturalHeight * scale)),
    scale,
    reservedControlHeight: input.reservedControlHeight,
    reason,
  };
}

function fitsWithoutScale(candidate: NormalizedCandidate, availableWidth: number, availableHeight: number): boolean {
  return candidate.naturalWidth <= availableWidth && candidate.naturalHeight <= availableHeight;
}

function requiredScale(candidate: NormalizedCandidate, availableWidth: number, availableHeight: number): number {
  return Math.min(
    1,
    availableWidth / candidate.naturalWidth,
    availableHeight / candidate.naturalHeight
  );
}

export function buildH5PCandidateWidths(availableWidth: number): number[] {
  const roundedAvailableWidth = roundPositivePixel(availableWidth);
  if (roundedAvailableWidth === null) {
    return [];
  }

  const widths = [
    roundedAvailableWidth,
    ...LOCAL_BREAKPOINT_OFFSETS.map((offset) => roundedAvailableWidth - offset),
    roundedAvailableWidth * 0.95,
    roundedAvailableWidth * 0.9,
    roundedAvailableWidth * 0.85,
    roundedAvailableWidth * 0.8,
  ]
    .map((width) => Math.round(width))
    .filter((width) => roundedAvailableWidth < MIN_CANDIDATE_WIDTH || width >= MIN_CANDIDATE_WIDTH);

  return Array.from(new Set(widths));
}

export function getH5PScaleFloor(availableWidth: number, focusMode = false): number {
  if (focusMode) {
    return 0.8;
  }
  if (availableWidth < 640) {
    return 0.95;
  }
  if (availableWidth < 1024) {
    return 0.9;
  }
  return 0.85;
}

export function chooseH5PFit(input: H5PFitInput): H5PFitResult {
  if (!isPositiveFinite(input.availableWidth) || !isPositiveFinite(input.availableHeight)) {
    throw new Error('H5P fit requires a positive available stage size.');
  }

  const candidates = input.candidates
    .map(normalizeCandidate)
    .filter((candidate): candidate is NormalizedCandidate => Boolean(candidate));

  if (candidates.length === 0) {
    throw new Error('H5P fit requires at least one valid measured candidate.');
  }

  const preferred = candidates[0];
  if (preferred && fitsWithoutScale(preferred, input.availableWidth, input.availableHeight)) {
    return buildResult(input, 'native', preferred, 1, 'preferred-candidate-fits');
  }

  const widthAdjusted = candidates.slice(1)
    .find((candidate) => fitsWithoutScale(candidate, input.availableWidth, input.availableHeight));

  if (widthAdjusted) {
    return buildResult(input, 'width-adjusted', widthAdjusted, 1, 'alternate-width-fits');
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      scale: requiredScale(candidate, input.availableWidth, input.availableHeight),
    }))
    .sort((left, right) => right.scale - left.scale);

  const best = ranked[0];
  if (!best) {
    throw new Error('H5P fit could not rank measured candidates.');
  }

  if (best.scale >= input.scaleFloor) {
    return buildResult(input, 'scaled', best.candidate, best.scale, 'scaled-within-floor');
  }

  if (input.focusAvailable) {
    return buildResult(input, 'focus', best.candidate, best.scale, 'requires-focus-mode');
  }

  return buildResult(input, 'scaled', best.candidate, best.scale, 'scaled-below-preferred-floor');
}
