import './server/main.ts';

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

serverTests.keys().forEach(serverTests);
commonTests.keys().forEach(commonTests);
standaloneTests.keys().forEach(standaloneTests);
