type ProcessEvent = 'uncaughtException' | 'unhandledRejection';

type ProcessLike = {
  on(event: ProcessEvent, handler: (...args: unknown[]) => void): unknown;
  off?(event: ProcessEvent, handler: (...args: unknown[]) => void): unknown;
  removeListener?(event: ProcessEvent, handler: (...args: unknown[]) => void): unknown;
};

type MongoDriverErrorLike = {
  address?: unknown;
  cause?: unknown;
  errorLabelSet?: unknown;
  message?: unknown;
  name?: unknown;
};

export type MongoDriverUnhandledPolicyLogger = (
  level: number,
  message: string,
  details?: Record<string, unknown>,
) => void;

export function hasMongoErrorLabel(error: MongoDriverErrorLike, label: string): boolean {
  const labels = error.errorLabelSet;
  if (labels instanceof Set) {
    return labels.has(label);
  }
  if (Array.isArray(labels)) {
    return labels.includes(label);
  }
  return false;
}

function asErrorLike(value: unknown): MongoDriverErrorLike {
  return value && typeof value === 'object'
    ? value as MongoDriverErrorLike
    : {};
}

export function isMongoPoolMonitorInterruption(value: unknown): boolean {
  const error = asErrorLike(value);
  const message = String(error.message || '');

  if (error.name === 'MongoPoolClearedError') {
    return message.includes('Connection pool for ') &&
      message.includes('was cleared because another operation failed with') &&
      message.includes('connection <monitor>') &&
      message.includes('timed out');
  }

  if (error.name === 'PoolClearedOnNetworkError') {
    if (!message.includes('interrupted due to server monitor timeout')) {
      return false;
    }

    const cause = asErrorLike(error.cause);
    return cause.name === 'MongoNetworkTimeoutError' ||
      hasMongoErrorLabel(cause, 'ResetPool') ||
      hasMongoErrorLabel(cause, 'InterruptInUseConnections');
  }

  return false;
}

export function summarizeMongoPoolInterruption(value: unknown): Record<string, unknown> {
  const error = asErrorLike(value);
  const cause = asErrorLike(error.cause);
  return {
    name: error.name || null,
    message: error.message || null,
    address: error.address || null,
    causeName: cause.name || null,
    causeMessage: cause.message || null,
  };
}

export function installMongoDriverUnhandledPolicy({
  logger,
  onFatal,
  processLike = process,
}: {
  logger: MongoDriverUnhandledPolicyLogger;
  onFatal?: (reason: unknown) => void;
  processLike?: ProcessLike;
}): () => void {
  const fatal = onFatal || ((reason: unknown) => {
    const message = reason instanceof Error
      ? reason.stack || reason.message
      : String(reason);
    console.error(message);
    process.exit(1);
  });

  function handleRecoverable(reason: unknown, source: string): boolean {
    if (!isMongoPoolMonitorInterruption(reason)) {
      return false;
    }
    logger(1, '[MongoDB] Recovered from background pool monitor interruption', {
      source,
      ...summarizeMongoPoolInterruption(reason),
    });
    return true;
  }

  function handleUnhandledRejection(reason: unknown): void {
    if (handleRecoverable(reason, 'unhandledRejection')) {
      return;
    }
    fatal(reason);
  }

  function handleUncaughtException(error: unknown, origin: unknown): void {
    if (handleRecoverable(error, `uncaughtException:${String(origin || 'unknown')}`)) {
      return;
    }
    fatal(error);
  }

  processLike.on('unhandledRejection', handleUnhandledRejection);
  processLike.on('uncaughtException', handleUncaughtException);

  return () => {
    if (typeof processLike.off === 'function') {
      processLike.off('unhandledRejection', handleUnhandledRejection);
      processLike.off('uncaughtException', handleUncaughtException);
      return;
    }
    processLike.removeListener?.('unhandledRejection', handleUnhandledRejection);
    processLike.removeListener?.('uncaughtException', handleUncaughtException);
  };
}
