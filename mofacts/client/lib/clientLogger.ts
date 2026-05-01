import { Tracker } from 'meteor/tracker';

// Default to silent until the admin-controlled setting is loaded.
let verbosityLevel = 0;

declare const Meteor: any;
declare const DynamicSettings: any;

declare global {
  interface Window {
    clientConsole: (...args: unknown[]) => void;
  }
}

export function loadClientSettings() {
  const handle = Meteor.subscribe('clientRuntimeSettings');
  Tracker.autorun(function () {
    if (handle.ready()) {
      const setting = DynamicSettings.findOne({ key: 'clientVerbosityLevel' });
      if (setting) {
        verbosityLevel = setting.value;
      }
    }
  });
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

window.clientConsole = clientConsole;
