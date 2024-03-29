/* eslint-disable prefer-exponentiation-operator */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
// const WebpackShellPlugin = require('webpack-shell-plugin');

module.exports = (env, argv) => ({
  entry: {
    'ask-for-login-page': './view/brainbox/src/pages/ask-for-login-page.js',
    'index-page': './view/brainbox/src/pages/index-page.js',
    'mri-page': './view/brainbox/src/pages/mri-page.js',
    'project-page': './view/brainbox/src/pages/project-page.js',
    'project-new-page': './view/brainbox/src/pages/project-new-page.js',
    'project-settings-page':
      './view/brainbox/src/pages/project-settings-page.js',
    'user-page': './view/brainbox/src/pages/user-page.js'
  },
  devtool: 'eval-source-map',
  plugins: [
    new CleanWebpackPlugin(['dist']),
    new HtmlWebpackPlugin({
      title: 'Output Management'
    })
  ],
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'view/brainbox/dist')
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
        test: /\.(png|svg|jpg|gif)$/,
        use: ['file-loader']
      }
    ]
  },
  resolve: {
    symlinks: false,
    alias: {
      // for now using the browser build to parse existing inlined components
      vue: path.resolve(
        `./node_modules/vue/dist/vue.esm-browser${argv.mode === 'production' ? '.prod' : ''
        }`
      )
    }
  }
});
