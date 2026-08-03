// Decides what each generated `-meteor.js` / `-entry.js` file imports.
// Dependency-free so the build plugin and TinyTest can both use it.
import { FILE_ROLE } from './constants';

function capitalizeFirstLetter(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function getImportContent(config, side, role) {
  if (!config?.entryFile && !config?.isTest) {
    return '';
  }

  if (role === FILE_ROLE.entry) {
    if (config?.isTest) {
      return `${
        config?.isTestFullApp && config?.mainEntryFile
          ? `/* Link to 🔌 Meteor ${capitalizeFirstLetter(
              side
            )} Main Entry (--full-app mode) */
import '../../${config.mainEntryFile}';`
          : ""
      }
${
  config?.entryFile
    ? `
/* Link to 🔌 Meteor ${capitalizeFirstLetter(side)} Test Entry */
import '../../${config.entryFile}';`
    : ""
}`;
    }

    if (config?.entryFile) {
      return `/* Link to 🔌 Meteor ${capitalizeFirstLetter(side)} Entry */
import '../../${config?.entryFile}';`;
    }
  }

  if (config?.outputFile &&
    (role === FILE_ROLE.build || config?.isProduction ||
      (role === FILE_ROLE.run &&
        (config?.isServer || config?.isTest || config?.isNative)))
  ) {
    // Client bundle is served + injected, not imported (#14561). Native is the
    // exception: no Meteor web server to serve it from.
    if (config?.isClient && !config?.isNative) {
      return `/* ⚡ Rspack ${capitalizeFirstLetter(side)} App served as a static resource and injected as a <script> (not imported), see #14561 */`;
    }
    return `/* Link to ⚡ Rspack ${capitalizeFirstLetter(side)} App */
import './${config?.outputFile || ''}';`;
  }

  if (role === FILE_ROLE.run && config?.isServer && !config?.isTest) {
    return '/* No link to ☄️ Meteor Server App as served by HMR server */';
  }

  if (role === FILE_ROLE.run && config?.isClient && !config?.isTest) {
    return '/* No link to ⚡ Rspack Client App as served by HMR server */';
  }

  if (role === FILE_ROLE.output && config?.isClient && !config?.isTest) {
    return '/* No code generated as served by HMR server */';
  }

  if (role === FILE_ROLE.output && (config?.isServer || config?.isTest)) {
    return '/* Code generated */';
  }

  if (role === FILE_ROLE.entry && config?.isTest) {
    return '/* Tests automatically imported */';
  }

  return '';
}
