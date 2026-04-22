const path = require('path');

module.exports = {
  mode: 'production',
  target: 'web',
  entry: path.resolve(__dirname, 'entry.js'),
  output: {
    path: path.resolve(__dirname, '../../tmp/ts-loader-repro-dist'),
    filename: 'bundle.js',
    clean: true,
  },
  resolve: {
    extensions: ['.js', '.ts'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'builtin:swc-loader',
            options: {
              jsc: {
                parser: {
                  syntax: 'typescript',
                },
                target: 'es2022',
              },
            },
          },
        ],
      },
    ],
  },
};
