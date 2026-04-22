type ErrorLike = {
  message?: string;
  stack?: string;
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const typed = error as ErrorLike;
    if (typeof typed.message === 'string') {
      return typed.message;
    }
  }

  return typeof error === 'string' ? error : String(error);
}

export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }

  if (typeof error === 'object' && error !== null && 'stack' in error) {
    const typed = error as ErrorLike;
    if (typeof typed.stack === 'string') {
      return typed.stack;
    }
  }

  return undefined;
}
