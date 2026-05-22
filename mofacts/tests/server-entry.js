import '../server/main.ts';

const serverTests = import.meta.webpackContext('../server', {
  recursive: true,
  regExp: /\.(?:test|spec)s?\.[jt]s$/,
  mode: 'eager',
});

const commonTests = import.meta.webpackContext('../common', {
  recursive: true,
  regExp: /\.(?:test|spec)s?\.[jt]s$/,
  mode: 'eager',
});

const topLevelTests = import.meta.webpackContext('.', {
  recursive: false,
  regExp: /\.(?:test|spec)s?\.js$/,
  mode: 'eager',
});

serverTests.keys().forEach(serverTests);
commonTests.keys().forEach(commonTests);
topLevelTests.keys().forEach(topLevelTests);
