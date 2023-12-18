const path = require('path');

const {ProvidePlugin} = require('webpack');

module.exports = {
  entry: {
    atlasmaker: './view/atlasmaker/src/atlasmaker.js'
  },
  devtool: 'eval-source-map',
  plugins: [
    // used by structjs
    new ProvidePlugin({
      Buffer: ['buffer', 'Buffer']
    })
  ],
  output: {
    filename: 'atlasmaker.js',
    library: 'AtlasMakerWidget',
    libraryExport: 'AtlasMakerWidget',
    path: path.resolve(__dirname, 'view/atlasmaker/dist'),
    clean: {
      keep: 'atlasmaker-tools/'
    }
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
        test: /\.svg$/,
        type: 'asset/inline'
      },
      {
        test: /\.(html)$/,
        loader: 'html-loader',

        options: {
          // do not resolve sources starting with /
          sources: {
            urlFilter: (_, value) => {
              if ((/^\//).test(value)) {
                return false;
              }

              return true;
            }
          }
        }
      }
    ]
  }
};
