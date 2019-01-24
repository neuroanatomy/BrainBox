const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
// const HtmlWebpackPlugin = require('html-webpack-plugin');
// const WebpackShellPlugin = require('webpack-shell-plugin');

module.exports = {
    mode: 'development',
    entry: {
        atlasmaker: './view/atlasMaker/src/atlasmaker.js'
    },
    devtool: 'eval-source-map',
    plugins: [new CleanWebpackPlugin(['dist'])],
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
                use: ['file-loader']
            },
            {
                test: /\.(html)$/,
                use: ['html-loader']
            }
        ]
    }
};
