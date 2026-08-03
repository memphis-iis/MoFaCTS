const CLIENT_LIBRARY_NAME = '__mofactsRspackClient';

function rspackClientOutputContract(Meteor) {
  const requiresInjectedBrowserBundle = Boolean(
    Meteor?.isClient && (Meteor?.isTest || Meteor?.isProduction),
  );

  if (!requiresInjectedBrowserBundle) {
    return {};
  }

  return {
    // Changing the library target also changes Rspack's implicit externals
    // type. Keep Meteor package imports on the CommonJS loader that the
    // injected browser runtime provides instead of looking for nonexistent
    // window["meteor/..."] globals.
    externalsType: 'commonjs2',
    output: {
      library: CLIENT_LIBRARY_NAME,
      libraryTarget: 'window',
    },
  };
}

module.exports = {
  CLIENT_LIBRARY_NAME,
  rspackClientOutputContract,
};
