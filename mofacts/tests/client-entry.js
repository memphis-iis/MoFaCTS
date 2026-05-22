import '../client/index.ts';

const clientTests = import.meta.webpackContext('../client', {
  recursive: true,
  regExp: /\.(?:test|spec)s?\.[jt]s$/,
  mode: 'eager',
});

clientTests.keys().forEach(clientTests);
