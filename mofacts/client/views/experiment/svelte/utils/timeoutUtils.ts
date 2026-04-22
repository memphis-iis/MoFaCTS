import { DEFAULT_TIMINGS } from '../machine/constants';

type TimeoutContext = {
  deliveryParams?: Record<string, unknown>;
  testType?: string;
  isCorrect?: boolean;
};

function parseTimeoutMs(value: unknown, options: { allowZero?: boolean } = {}): number | null {
  const { allowZero = false } = options;
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed > 0) return parsed;
  if (allowZero && parsed === 0) return 0;
  return null;
}

export function getMainTimeoutMs(context: TimeoutContext): number {
  const delivery = context.deliveryParams || {};
  if (context.testType === 's') {
    const studyMs = parseTimeoutMs((delivery as Record<string, unknown>).purestudy);
    if (studyMs !== null) return studyMs;
  }

  const drillMs = parseTimeoutMs((delivery as Record<string, unknown>).drill);
  if (drillMs !== null) return drillMs;

  return DEFAULT_TIMINGS.MAIN_TIMEOUT;
}

export function getFeedbackTimeoutMs(context: TimeoutContext): number {
  const delivery = context.deliveryParams || {};

  

  if (context.testType === 's') {
    const studyMs = parseTimeoutMs((delivery as Record<string, unknown>).purestudy, { allowZero: true });
    if (studyMs !== null) return studyMs;
  }

  if (context.testType === 't' || context.testType === 'i') {
    return 1;
  }

  const correctMs = parseTimeoutMs((delivery as Record<string, unknown>).correctprompt, { allowZero: true });
  const incorrectMs = parseTimeoutMs((delivery as Record<string, unknown>).reviewstudy, { allowZero: true });
  
  
  
  if (context.isCorrect && correctMs !== null) {
    
    return correctMs;
  }
  if (!context.isCorrect && incorrectMs !== null) {
    
    return incorrectMs;
  }

  
  return DEFAULT_TIMINGS.FEEDBACK_TIMEOUT;
}


