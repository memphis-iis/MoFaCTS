// Test-entry-only code: no application method, route, or production import.
export const EVIDENCE_MARKER = 'MOFACTS_METEOR_EVIDENCE_V1 ';
export const EVIDENCE_REPORTER = 'mofacts-evidence';

export function createMeteorTestLoader(Mocha, instance, side, emit, selectedReporter) {
  // Interactive tests keep the driver's ordinary reporter and focus/run policy.
  if (selectedReporter !== EVIDENCE_REPORTER) {
    return (_root, context) => context.keys().forEach(context);
  }
  const modules = [];
  let loading = 0;
  let loadFailed = false;
  instance.forbidOnly();
  if (instance.options.dryRun || instance.options.delay) {
    throw new Error('Evidence requires an actual, undelayed Meteor test run');
  }

  class EvidenceReporter extends Mocha.reporters.Spec {
    constructor(runner, options) {
      super(runner, options);
      const registered = [];
      runner.suite.eachTest(test => registered.push(test));
      const outcomes = new Map();
      let invalid = false;
      let hookFailures = 0;
      const record = (test, outcome) => {
        if (test.type !== 'test') { hookFailures++; return; }
        // Mocha retries clone Test objects. Retain the original registration ID.
        while (test.retriedTest?.()) test = test.retriedTest();
        if (!registered.includes(test) || outcomes.has(test)) invalid = true;
        outcomes.set(test, outcome);
      };
      runner.on('pass', test => record(test, 'passed'));
      runner.on('pending', test => record(test, 'pending'));
      runner.on('fail', test => record(test, 'failed'));
      this.done = (failures, done) => {
        (async () => {
          if (invalid || loadFailed || loading || registered.length === 0
            || outcomes.size !== registered.length || runner.total !== registered.length) {
            throw new Error('Incomplete Meteor test evidence');
          }
          const occurrences = new Map();
          const tests = await Promise.all(registered.map(async test => {
            const title = JSON.stringify(test.titlePath());
            const occurrence = occurrences.get(title) || 0;
            occurrences.set(title, occurrence + 1);
            const bytes = new TextEncoder().encode(JSON.stringify([side, title, occurrence]));
            const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
            const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
            return { id, outcome: outcomes.get(test) };
          }));
          const report = { schema: 'MeteorEnvironmentEvidenceV1', side,
            modules: [...modules].sort(), tests, hookFailures };
          await emit(report);
          done(failures);
        })().catch(() => {
          // Never include assertion messages, titles, fixture data or stacks in evidence.
          console.error('Unable to complete bounded Meteor test evidence');
          done(Math.max(failures, 1));
        });
      };
    }
  }
  Mocha.reporters[EVIDENCE_REPORTER] = EvidenceReporter;
  return (root, context) => {
    for (const key of context.keys()) {
      modules.push(`${root}/${key.replace(/^\.\//, '')}`);
      loading++;
      try {
        Promise.resolve(context(key)).then(() => { loading--; }, () => { loading--; loadFailed = true; });
      } catch (error) {
        loading--;
        loadFailed = true;
        throw error;
      }
    }
  };
}
