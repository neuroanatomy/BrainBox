const path = require('path');

const { VueLoaderPlugin } = require('vue-loader');

module.exports = {
  entry: {
    'ask-for-login-page': './view/brainbox/src/pages/ask-for-login-page.js',
    'index-page': './view/brainbox/src/pages/index-page.js',
    'mri-page': './view/brainbox/src/pages/mri-page.js',
    'project-page': './view/brainbox/src/pages/project-page.js',
    'embed-page': './view/brainbox/src/pages/embed-page.js',
    'project-new-page': './view/brainbox/src/pages/project-new-page.js',
    'project-settings-page':
      './view/brainbox/src/pages/project-settings-page.js',
    'user-page': './view/brainbox/src/pages/user-page.js'
  },
  devtool: 'eval-source-map',
  plugins: [new VueLoaderPlugin()],
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'view/brainbox/dist'),
    clean: false // do not clean as same output dir is used by webpack.brainbox.config.js
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { esModule: false, url: false } }
        ]
      },
      {
        test: /\.svg$/,
        type: 'asset/inline'
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader'
      }
    ]
  }
};
