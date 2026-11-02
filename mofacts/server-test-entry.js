import './server/main.ts';
import { Mocha, mochaInstance } from 'meteor/meteortesting:mocha-core';
import { EVIDENCE_MARKER, createMeteorTestLoader } from './tests/meteorEvidenceReporter.mjs';

const loadTests = createMeteorTestLoader(Mocha, mochaInstance, 'server', report =>
  new Promise((resolve, reject) => process.stdout.write(`${EVIDENCE_MARKER}${JSON.stringify(report)}\n`,
    error => error ? reject(error) : resolve())), process.env.SERVER_TEST_REPORTER || process.env.MOCHA_REPORTER);

const serverTests = import.meta.webpackContext('./server', {
  recursive: true,
  regExp: /\.(?:test|spec)s?\.[jt]s$/,
  mode: 'eager',
});

const commonTests = import.meta.webpackContext('./common', {
  recursive: true,
  regExp: /\.(?:test|spec)s?\.[jt]s$/,
  mode: 'eager',
});

const standaloneTests = import.meta.webpackContext('./tests', {
  recursive: false,
  regExp: /\.(?:test|spec)s?\.[jt]s$/,
  mode: 'eager',
});

loadTests('server', serverTests);
loadTests('common', commonTests);
loadTests('tests', standaloneTests);
