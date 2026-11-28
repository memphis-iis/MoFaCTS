// The native worker runs the same framework and package versions as this
// application's .meteor/versions. Source verification checks these pins.
export const FRAMEWORK_AUTH_PACKAGE_PINS = Object.freeze({
  'accounts-base': '3.4.1',
  'accounts-password': '3.3.3',
  'accounts-oauth': '1.4.8',
  'accounts-google': '1.4.2',
  'google-oauth': '1.5.1',
  'mofacts:accounts-microsoft': '3.0.0',
  'mofacts:microsoft-oauth': '3.0.0',
  oauth: '3.0.5',
} as const);
