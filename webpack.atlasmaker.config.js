/* eslint-disable prefer-exponentiation-operator */
const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
// const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: {
    atlasmaker: './view/atlasmaker/src/atlasmaker.js'
  },
  devtool: 'eval-source-map',
  plugins: [new CleanWebpackPlugin(['dist'])],
  output: {
    filename: 'atlasmaker.js',
    library: 'AtlasMakerWidget',
    libraryExport: 'AtlasMakerWidget',
    path: path.resolve(__dirname, 'view/atlasmaker/dist')
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          'style-loader',
          { loader: 'css-loader', options: { esModule: false } }
        ]
      },
      {
        test: /\.(png|jpg|gif)$/,
        use: ['file-loader']
      },
      {
        test: /\.svg$/,
        use: ['url-loader']
      },
      {
        test: /\.(html)$/,
        use: ['html-loader']
      }
    ]
  }
};
