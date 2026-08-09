export const DEFAULT_NORMAL_LOGIN_DESTINATION = '/home' as const;
export const LEARNING_ANALYTICS_DESTINATION = '/learning-analytics' as const;

export type NormalLoginReturnDestination = typeof LEARNING_ANALYTICS_DESTINATION;
export type NormalLoginDestination =
  | typeof DEFAULT_NORMAL_LOGIN_DESTINATION
  | NormalLoginReturnDestination;

export function resolveNormalLoginDestination(returnTo: unknown): NormalLoginDestination {
  return returnTo === LEARNING_ANALYTICS_DESTINATION
    ? LEARNING_ANALYTICS_DESTINATION
    : DEFAULT_NORMAL_LOGIN_DESTINATION;
}
