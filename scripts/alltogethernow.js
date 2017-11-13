const fs = require('fs');
const targetDir = process.argv[2] + '/';
const dest = process.argv[3];

let obj = {};

/* 1. Bundle all html */
const htmlDir = targetDir + 'html/';
if(fs.existsSync(htmlDir)) {
    console.log("> Adding html");
    obj.html = {};
    const files = fs.readdirSync(htmlDir);
    let i, ext;
    for(i = 0; i < files.length; i++) {
        ext = files[i].split('.').pop();
        name = files[i].replace(/\.[^\.]*/, '');
        if( ext !== 'html' ) {
            continue;
        }
        let html = fs.readFileSync(htmlDir + files[i]).toString();
        obj.html[name] = html;
        console.log(" File '" + files[i] + "' added");
    }
}

/* 2. Bundle all css */
const cssDir = targetDir + 'css/';
if(fs.existsSync(cssDir)) {
    console.log("> Adding css");
    obj.css = {};
    const files = fs.readdirSync(cssDir);
    let i, ext;
    for(i = 0; i < files.length; i++) {
        ext = files[i].split('.').pop();
        name = files[i].replace(/\.[^\.]*/, '');
        if( ext !== 'css' ) {
            continue;
        }
        let css = fs.readFileSync(cssDir + files[i]).toString();
        obj.css[name] = css;
        console.log(" File '" + files[i] + "' added");
    }
}

/* 3. Bundle all svg */
const svgDir = targetDir + 'svg/';
if(fs.existsSync(svgDir)) {
    console.log("> Adding svg");
    obj.svg = {};
    const files = fs.readdirSync(svgDir);
    let i, ext;
    for(i = 0; i < files.length; i++) {
        ext = files[i].split('.').pop();
        name = files[i].replace(/\.[^\.]*/, '');
        if( ext !== 'svg' ) {
            continue;
        }
        let svg = fs.readFileSync(svgDir + files[i]).toString();
        obj.svg[name] = svg;
        console.log(" File '" + files[i] + "' added");
    }
}

const destExt = dest.split('.').pop();
const destName = dest.replace(/\.[^\.]*/, '');
if(destExt === 'json') {
    fs.writeFileSync(dest, JSON.stringify(obj, null, 2));
} else if(destExt === 'js') {
    fs.writeFileSync(dest, 'var ' + destName + ' = ');
    fs.appendFileSync(dest, JSON.stringify(obj, null, 2));
    fs.appendFileSync(dest, ';\n');
} else {
    console.error("ERROR: Output can only be .json or .js");
}

console.log("Done");
