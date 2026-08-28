type AuthenticatedChromeSuppressionInput = {
  explicitlySuppressed: boolean;
  loginMode: unknown;
  userCreatedBy: unknown;
};

export function shouldSuppressAuthenticatedChrome(
  input: AuthenticatedChromeSuppressionInput,
): boolean {
  const isPublicDemo = input.userCreatedBy === 'publicDemo';
  if (isPublicDemo) {
    return false;
  }
  return input.explicitlySuppressed || input.loginMode === 'experiment';
}
