import { normalizeH5PTrialResult } from '../../../../../common/lib/h5pTrialResult';
import type { H5PTrialResult } from '../../../../../common/types';

export type H5PFrameMessage =
  | { kind: 'resizer'; data: Record<string, unknown> }
  | { kind: 'result'; result: H5PTrialResult }
  | { kind: 'loaded'; data: Record<string, unknown> }
  | { kind: 'failed'; data: Record<string, unknown> }
  | { kind: 'xapi'; data: Record<string, unknown> };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseH5PFrameMessage(
  data: unknown,
  expectedContentId?: string
): H5PFrameMessage | null {
  if (!isPlainObject(data)) {
    return null;
  }

  if (data.context === 'h5p') {
    if (
      typeof data.contentId === 'string' &&
      expectedContentId &&
      data.contentId !== expectedContentId
    ) {
      return null;
    }
    return { kind: 'resizer', data };
  }

  if (data.type === 'mofacts:h5p-result') {
    return {
      kind: 'result',
      result: normalizeH5PTrialResult(data, expectedContentId),
    };
  }

  if (data.type === 'mofacts:h5p-loaded') {
    return { kind: 'loaded', data };
  }

  if (data.type === 'mofacts:h5p-failed') {
    return { kind: 'failed', data };
  }

  if (data.type === 'mofacts:h5p-xapi') {
    return { kind: 'xapi', data };
  }

  return null;
}
