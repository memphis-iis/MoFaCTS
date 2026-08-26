export const DEFAULT_NORMAL_LOGIN_DESTINATION = '/home' as const;
export const LEARNING_ANALYTICS_DESTINATION = '/learning-analytics' as const;

export type NormalLoginReturnDestination = string;
export type NormalLoginDestination = string;

const SAFE_EXACT_DESTINATIONS = new Set([
  '/home',
  '/learning-analytics',
  '/courses',
  '/profile',
  '/profileEdit',
  '/classSelection',
  '/help',
  '/content',
  '/contentUpload',
  '/contentCreate',
  '/aiContentCreate',
  '/adminControls',
  '/admin/tests',
  '/admin/backups',
  '/admin/security-audits',
  '/theme',
  '/terms-of-service',
]);

const SAFE_DYNAMIC_PATHS = [
  /^\/content\/[^/?#]+$/,
  /^\/contentEdit\/[^/?#]+$/,
  /^\/sparcEdit\/[^/?#]+$/,
  /^\/tdfEdit\/[^/?#]+$/,
  /^\/instructions\/[^/?#]+$/,
  /^\/classes\/[^/?#]+\/[^/?#]+$/,
];

export function resolveNormalLoginDestination(returnTo: unknown): NormalLoginDestination {
  if (typeof returnTo !== 'string' || !returnTo.startsWith('/') || returnTo.startsWith('//') || returnTo.includes('\\')) {
    return DEFAULT_NORMAL_LOGIN_DESTINATION;
  }
  let parsed: URL;
  try {
    parsed = new URL(returnTo, 'https://mofacts.invalid');
  } catch {
    return DEFAULT_NORMAL_LOGIN_DESTINATION;
  }
  if (parsed.origin !== 'https://mofacts.invalid' || parsed.username || parsed.password) {
    return DEFAULT_NORMAL_LOGIN_DESTINATION;
  }
  const path = parsed.pathname.replace(/\/$/, '') || '/';
  const safe = SAFE_EXACT_DESTINATIONS.has(path) || SAFE_DYNAMIC_PATHS.some((pattern) => pattern.test(path));
  return safe ? `${path}${parsed.search}` : DEFAULT_NORMAL_LOGIN_DESTINATION;
}
