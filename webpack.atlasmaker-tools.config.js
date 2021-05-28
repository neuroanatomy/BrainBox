const fs = require('fs');
const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
var glob = require("glob");

// list tools with user interface
const uilist = glob.sync("./view/atlasmaker/src/tools/*/index.js");
const uientries = {};
for(const item of uilist) {
  const arr = item.split('/');
  const key = arr[arr.length-2]; // module name is directory's name
  uientries[key] = item;
}

// list tools without user interface
const cmdlist = glob.sync("./view/atlasmaker/src/tools/*.js");
const cmdentries = {};
for(const item of cmdlist) {
  const arr = item.split('/');
  const key = arr[arr.length-1].split(".").slice(0, -1)
    .join("."); // module name is script's name
  cmdentries[key] = item;
}

// write
const dir = path.resolve(__dirname, 'view/atlasmaker/dist/atlasmaker-tools/');
if(!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}
fs.writeFileSync(
  path.resolve(__dirname, 'view/atlasmaker/dist/atlasmaker-tools/tools.json'),
  JSON.stringify([
    ...Object.keys(uientries).map((name) => ({name, type: "ui"})),
    ...Object.keys(cmdentries).map((name) => ({name, type: "cmd"}))
  ])
);

// combine both lists
const entries = {};
Object.keys(uientries).forEach((k) => { entries[k] = uientries[k]; });
Object.keys(cmdentries).forEach((k) => { entries[k] = cmdentries[k]; });
console.log("entries:", entries);

module.exports = {
  mode: 'production',
  entry: entries,
  devtool: 'eval-source-map',
  plugins: [new CleanWebpackPlugin(['dist'])],
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'view/atlasmaker/dist/atlasmaker-tools')
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
        use: ['html-loader']
      }
    ]
  }
};
