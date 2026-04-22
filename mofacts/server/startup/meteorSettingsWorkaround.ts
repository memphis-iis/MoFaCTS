import { Meteor } from 'meteor/meteor';

const fs = require('fs');

type Logger = (...args: any[]) => void;

export function applyMeteorSettingsWorkaround({ serverConsole }: { serverConsole: Logger }) {
  const settingsWorkaround = process.env.METEOR_SETTINGS_WORKAROUND;
  if (!settingsWorkaround) {
    return;
  }

  const trimmedSettingsWorkaround = settingsWorkaround.trim();
  if (!trimmedSettingsWorkaround) {
    throw new Error('METEOR_SETTINGS_WORKAROUND is set but empty');
  }

  if (trimmedSettingsWorkaround.startsWith('{') || trimmedSettingsWorkaround.startsWith('[')) {
    throw new Error('METEOR_SETTINGS_WORKAROUND must point to a settings file path, not inline JSON');
  }

  if (!fs.existsSync(trimmedSettingsWorkaround)) {
    throw new Error(`METEOR_SETTINGS_WORKAROUND points to a missing file: ${trimmedSettingsWorkaround}`);
  }

  serverConsole('loading settings from ' + trimmedSettingsWorkaround);
  Meteor.settings = JSON.parse(fs.readFileSync(trimmedSettingsWorkaround, 'utf8'));
}
