import { Tracker } from 'meteor/tracker';
import {
  CLIENT_VERBOSITY_SETTING,
  type LoggingVerbosityLevel,
  parseLoggingVerbosityLevel,
} from '../../common/loggingSettings';

// Default to silent until the admin-controlled setting is loaded.
let verbosityLevel: LoggingVerbosityLevel = CLIENT_VERBOSITY_SETTING.defaultValue;

declare const Meteor: any;
declare const DynamicSettings: any;

declare global {
  interface Window {
    clientConsole: (...args: unknown[]) => void;
  }
}

export function loadClientSettings(): () => void {
  const handle = Meteor.subscribe('clientRuntimeSettings');
  const computation = Tracker.autorun(function () {
    if (handle.ready()) {
      const setting = DynamicSettings.findOne({ _id: CLIENT_VERBOSITY_SETTING.id });
      verbosityLevel = setting
        ? parseLoggingVerbosityLevel(setting.value)
        : CLIENT_VERBOSITY_SETTING.defaultValue;
    }
  });
  return () => {
    computation.stop();
    handle.stop();
    verbosityLevel = CLIENT_VERBOSITY_SETTING.defaultValue;
  };
}

export function clientConsole(...args: unknown[]): void {
  const firstArg = args.shift();
  const logVerbosityLevel = typeof firstArg === 'number' ? firstArg : 0;
  if (verbosityLevel === 0) return;
  if (logVerbosityLevel > verbosityLevel) return;
  const disp: unknown[] = [new Date().toString()];
  for (let i = 0; i < args.length; ++i) {
    disp.push(args[i]);
  }

  // This is the single browser console sink behind the admin-controlled gate.
  console.log(...disp);
}

if (typeof window !== 'undefined') {
  window.clientConsole = clientConsole;
}
