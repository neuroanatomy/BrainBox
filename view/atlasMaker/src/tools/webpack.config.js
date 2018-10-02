const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
var glob = require("glob");

const list = glob.sync("./*/index.js");
const entries = {};
for(const item of list) {
    const key = item.split('/')[1];
    entries[key] = item;
};
console.log(entries);

module.exports = {
    mode: 'development',
    entry: entries,
    devtool: 'eval-source-map',
    plugins: [
        new CleanWebpackPlugin(['dist']),
    ],
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, './dist')
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
                test: /\.(png|jpg|gif)$/,
                use: [
                    'file-loader'
                ]
            },
            {
                test: /\.(svg)$/,
                use: {
                    loader: 'url-loader',
                    options: {
                        noquotes: true
                    }
                }
            },
            {
                test: /\.(html)$/,
                use: [
                    'html-loader'
                ]
            }
        ]
    }
};