const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
// const WebpackShellPlugin = require('webpack-shell-plugin');

module.exports = {
    mode: 'development',
    entry: {
        brainbox: './view/brainbox/src/brainbox.js'
    },
    devtool: 'eval-source-map',
    plugins: [
        new CleanWebpackPlugin(['dist']),
        new HtmlWebpackPlugin({
            title: 'Output Management'
        })
    ],
    output: {
        filename: 'brainbox.js',
        library: 'BrainBox',
        libraryExport: 'BrainBox',
        path: path.resolve(__dirname, 'view/brainbox/dist')
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
            }
        ]
    }
};
