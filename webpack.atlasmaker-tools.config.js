const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
var glob = require("glob");

const list = glob.sync("./view/atlasMaker/src/tools/*/index.js");
const entries = {};
for(const item of list) {
    const arr = item.split('/');
    const key = arr[arr.length-2]; // module name is directory's name
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
        path: path.resolve(__dirname, 'view/atlasMaker/dist/atlasMaker-tools')
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