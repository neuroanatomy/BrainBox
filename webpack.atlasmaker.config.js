const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const WebpackShellPlugin = require('webpack-shell-plugin');

module.exports = {
    entry: {
        atlasmaker: './view/atlasMaker/src/atlasmaker.js'
    },
    devtool: 'eval-source-map',
    plugins: [
        new CleanWebpackPlugin(['dist']),
        new HtmlWebpackPlugin({
            title: 'Output Management'
        }),
        new WebpackShellPlugin({
            onBuildStart:['echo "Webpack Start"'],
            onBuildEnd:[
                'echo "Webpack End"',
                'cp view/atlasMaker/dist/atlasMaker.js public/lib/atlasMaker.js'
            ]
        })
    ],
    output: {
        filename: 'atlasmaker.js',
        library: 'AtlasMakerWidget',
        libraryExport: 'AtlasMakerWidget',
        path: path.resolve(__dirname, 'view/atlasMaker/dist')
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader'
                ]
            },
            {
                test: /\.(png|svg|jpg|gif)$/,
                use: [
                    'file-loader'
                ]
            }
        ]
    }
};
