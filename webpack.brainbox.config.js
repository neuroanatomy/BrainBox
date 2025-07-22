const path = require('path');

module.exports = {
  entry: {
    brainbox: './view/brainbox/src/brainbox.js'
  },
  devtool: 'eval-source-map',
  output: {
    filename: 'brainbox.js',
    library: 'BrainBox',
    libraryExport: 'BrainBox',
    path: path.resolve(__dirname, 'view/brainbox/dist'),
    clean: false // do not clean as same output dir is used by webpack.pages.config.js
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { esModule: false } }
        ]
      }
    ]
  }
};
