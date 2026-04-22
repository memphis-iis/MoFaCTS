import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { defineConfig } = require("@meteorjs/rspack");
const sveltePreprocess = require("svelte-preprocess");
const svelteLoaderPath = require.resolve("./scripts/loaders/svelte-loader-wrapper.cjs");

export default defineConfig((Meteor) => {
  return {
    // Split node_modules into a separate "vendor" chunk for parallel loading
    // and better browser caching (vendor chunk changes less often than app code).
    // Client-only — server must emit a single bundle file.
    ...(Meteor.isClient && Meteor.splitVendorChunk()),
    ...(Meteor.isClient && {
      optimization: {
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Heavy libraries get their own chunks for independent caching
            xstate: {
              test: /[\\/]node_modules[\\/]xstate[\\/]/,
              name: 'vendor-xstate',
              chunks: 'all',
              priority: 20,
            },
            svelte: {
              test: /[\\/]node_modules[\\/]svelte[\\/]/,
              name: 'vendor-svelte',
              chunks: 'all',
              priority: 20,
            },
            sqljs: {
              test: /[\\/]node_modules[\\/]sql\.js[\\/]/,
              name: 'vendor-sqljs',
              chunks: 'all',
              priority: 20,
            },
            jszip: {
              test: /[\\/]node_modules[\\/]jszip[\\/]/,
              name: 'vendor-jszip',
              chunks: 'all',
              priority: 20,
            },
            marked: {
              test: /[\\/]node_modules[\\/]marked[\\/]/,
              name: 'vendor-marked',
              chunks: 'all',
              priority: 20,
            },
          },
        },
      },
    }),
    performance: Meteor.isClient
      ? {
          // Client bundles are downloaded by browsers — keep strict defaults
          hints: Meteor.isProduction ? 'warning' : false,
          // rspack defaults: 244 KiB per asset, 244 KiB entrypoint
        }
      : {
          // Server bundle is a single Node.js file read from local disk,
          // never downloaded by browsers. Meteor requires it as one file —
          // it cannot be split. Use a realistic limit so we still notice
          // if something truly unusual gets pulled in (e.g. 10+ MiB).
          hints: Meteor.isProduction ? 'warning' : false,
          maxAssetSize: 5 * 1024 * 1024,       // 5 MiB per asset
          maxEntrypointSize: 10 * 1024 * 1024,  // 10 MiB entrypoint
        },
    node: {
      __dirname: false,
    },
    resolve: {
      extensions: [".mjs", ".ts", ".js", ".svelte", ".json"],
      mainFields: ["svelte", "browser", "module", "main"],
      conditionNames: ["svelte", "..."],
      byDependency: {
        esm: {
          conditionNames: ["svelte", "..."],
        },
      },
      // sql.js has a Node.js code path that require('fs') and require('path').
      // These don't exist in the browser — stub them out as empty modules.
      fallback: {
        path: false,
        fs: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: "builtin:swc-loader",
              options: {
                jsc: {
                  parser: {
                    syntax: "typescript",
                  },
                  target: "es2022",
                },
              },
            },
          ],
        },
        ...(Meteor.isClient
          ? [
              {
                test: /\.svelte$/,
                use: [
                  {
                    loader: svelteLoaderPath,
                    options: {
                      compilerOptions: { dev: !Meteor.isProduction },
                      emitCss: Meteor.isProduction,
                      hotReload: !Meteor.isProduction,
                      preprocess: sveltePreprocess({
                        sourceMap: !Meteor.isProduction,
                        postcss: true,
                      }),
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
  };
});
