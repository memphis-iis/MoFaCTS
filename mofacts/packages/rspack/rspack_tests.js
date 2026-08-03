import { getImportContent } from 'meteor/rspack';

// #14561: in test/build the generated client -meteor.js must serve + inject the
// bundle, not import it. The server bundle must keep being imported.

const IMPORT_RE = /import\s+['"]\.\/[^'"]*client-rspack\.js['"]/;
const SERVED_RE = /served as a static resource and injected as a <script>/;

const testClient = {
  isClient: true,
  isTest: true,
  entryFile: 'client/main.js',
  outputFile: 'client-rspack.js',
};
const buildClient = {
  isClient: true,
  isProduction: true,
  entryFile: 'client/main.js',
  outputFile: 'client-rspack.js',
};
const testServer = {
  isServer: true,
  isTest: true,
  entryFile: 'server/main.js',
  outputFile: 'server-rspack.js',
};
const buildServer = {
  isServer: true,
  isProduction: true,
  entryFile: 'server/main.js',
  outputFile: 'server-rspack.js',
};

Tinytest.add(
  'rspack - test client -meteor.js serves + injects the bundle instead of importing it',
  test => {
    const content = getImportContent(testClient, 'client', 'run');
    test.isFalse(
      IMPORT_RE.test(content),
      `expected no client-rspack.js import, got: ${content}`
    );
    test.isTrue(
      SERVED_RE.test(content),
      `expected serve + inject marker, got: ${content}`
    );
  }
);

Tinytest.add(
  'rspack - build client -meteor.js serves + injects the bundle instead of importing it',
  test => {
    const content = getImportContent(buildClient, 'client', 'build');
    test.isFalse(
      IMPORT_RE.test(content),
      `expected no client-rspack.js import, got: ${content}`
    );
    test.isTrue(
      SERVED_RE.test(content),
      `expected serve + inject marker, got: ${content}`
    );
  }
);

Tinytest.add(
  'rspack - client wiring is Blaze-independent (Blaze no longer short-circuits the import)',
  test => {
    // getImportContent no longer depends on project type, so Blaze gets the
    // same wiring as any other app (the short-circuit that dropped it is gone).
    const runContent = getImportContent(testClient, 'client', 'run');
    const buildContent = getImportContent(buildClient, 'client', 'build');
    test.isTrue(SERVED_RE.test(runContent));
    test.isTrue(SERVED_RE.test(buildContent));
    test.isFalse(IMPORT_RE.test(runContent));
    test.isFalse(IMPORT_RE.test(buildContent));
  }
);

Tinytest.add(
  'rspack - server -meteor.js still imports the server bundle in test and build',
  test => {
    const testContent = getImportContent(testServer, 'server', 'run');
    const buildContent = getImportContent(buildServer, 'server', 'build');
    test.isTrue(
      /import\s+['"]\.\/server-rspack\.js['"]/.test(testContent),
      `expected server bundle import in test, got: ${testContent}`
    );
    test.isTrue(
      /import\s+['"]\.\/server-rspack\.js['"]/.test(buildContent),
      `expected server bundle import in build, got: ${buildContent}`
    );
  }
);

Tinytest.add(
  'rspack - native client still imports the bundle (no Meteor server to serve from)',
  test => {
    const nativeClient = {
      isClient: true,
      isNative: true,
      isProduction: true,
      entryFile: 'client/main.js',
      outputFile: 'client-rspack.js',
    };
    const content = getImportContent(nativeClient, 'client', 'build');
    test.isTrue(
      IMPORT_RE.test(content),
      `expected native client to import the bundle, got: ${content}`
    );
  }
);
