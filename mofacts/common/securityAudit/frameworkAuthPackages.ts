// The native worker runs the same framework and package versions as this
// application's .meteor/versions. Source verification checks these pins.
export const FRAMEWORK_AUTH_PACKAGE_PINS = Object.freeze({
  'accounts-base': '3.3.1',
  'accounts-password': '3.3.1_1',
  'accounts-oauth': '1.4.7',
  'accounts-google': '1.4.1',
  'google-oauth': '1.5.0',
  'mofacts:accounts-microsoft': '3.0.0',
  'mofacts:microsoft-oauth': '3.0.0',
  oauth: '3.0.4_1',
} as const);
