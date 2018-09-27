const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const WebpackShellPlugin = require('webpack-shell-plugin');

module.exports = {
    entry: {
        brainbox: './view/brainbox/src/index.js',
        "index-page": './view/brainbox/src/pages/index-page.js',
        "mri-page": './view/brainbox/src/pages/mri-page.js',
        "project-page": './view/brainbox/src/pages/project-page.js',
        "project-new-page": './view/brainbox/src/pages/project-new-page.js',
        "project-settings-page": './view/brainbox/src/pages/project-settings-page.js'
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
                'cp view/brainbox/dist/index-page.js public/js/index-page.js',
                'cp view/brainbox/dist/mri-page.js public/js/mri-page.js',
                'cp view/brainbox/dist/project-page.js public/js/project-page.js',
                'cp view/brainbox/dist/project-new-page.js public/js/project-new-page.js',
                'cp view/brainbox/dist/project-settings-page.js public/js/project-settings-page.js'
            ]
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
