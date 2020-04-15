var fs = require('fs');
const monk = require('monk');
const db = monk('localhost:27017/brainbox');
const rimraf = require("rimraf");
const {PNG} = require('pngjs');
var jpeg = require('jpeg-js');
const pixelmatch = require('pixelmatch');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const localBertURL = "https://127.0.0.1:3001/test_data/bert_brain.nii.gz";
const cheetahURL = "https://zenodo.org/record/44846/files/MRI.nii.gz?download=1";
const serverURL = "https://localhost:3001";
const testToken = "qwertyuiopasdfghjklzxcvbnm";
const testTokenDuration = 2 * (1000 * 3600); // 2h
const longTimeout = 30 * 1000; // 30 sec
const mediumTimeout = 10 * 1000; // 10 sec
const shortTimeout = 5 * 1000; // 5 sec

const userFoo = {
    name: "Founibald Barr",
    nickname: "foo",
    url: "https://foo.bar",
    brainboxURL: "/user/foo",
    avatarURL: "https://foo.bar/avatar.jpg",
    joined: (new Date()).toJSON()
};
const userBar = {
    name: "Barton Fouquet",
    nickname: "bar",
    url: "https://bar.foo",
    brainboxURL: "/user/foo",
    avatarURL: "https://bar.foo/avatar.jpg",
    joined: (new Date()).toJSON()
}
const userFooB = {
    name: "Founibald Barr",
    username: "foo",
    url: "https://foo.bar",
    brainboxURL: "/user/foo",
    avatarURL: "https://foo.bar/avatar.jpg",
    joined: (new Date()).toJSON()
};
const userBarB = {
    name: "Barton Fouquet",
    username: "bar",
    url: "https://bar.foo",
    brainboxURL: "/user/foo",
    avatarURL: "https://bar.foo/avatar.jpg",
    joined: (new Date()).toJSON()
}

async function currentDirectory() {
    console.log("Current directory:", __dirname);
    const { exec } = require("child_process");
    exec('ls -l', (error, stdout, std_err) => {
      console.log(stdout);
    });
}

async function queryUser(nickname) {
    return db.get('user').findOne({nickname});
}

async function insertUser(user) {
    return db.get('user').insert(user);
}

async function removeUser(nickname) {
    return db.get('user').remove({nickname});
}

async function insertTestTokenForUser(nickname) {
    const now = new Date();
    const obj = {
        token: testToken,
        now,
        expiryDate: new Date(now.getTime() + testTokenDuration),
        username: nickname
    };
    return db.get("log").insert(obj);
}

async function removeTestToken() {
    return db.get("log").remove({token: testToken});
}

function delay(delayTimeout) {
  return new Promise((resolve) => {
      setTimeout(resolve, delayTimeout);
  });
}

async function removeMRI({dirPath, srcURL}) {
  rimraf.sync(dirPath, {}, (err) => console.log);
  return await db.get('mri').remove({source: srcURL});
}

function compareImages(pathImg1, pathImg2) {
    const data1 = fs.readFileSync(pathImg1);
    const data2 = fs.readFileSync(pathImg2);
    let img1, img2;
    if(pathImg1.split(".").pop() === "png") {
        img1 = PNG.sync.read(data1);
    } else if(pathImg1.split(".").pop() === "jpg") {
        img1 = jpeg.decode(data1);
    }
    if(pathImg2.split(".").pop() === "png") {
        img2 = PNG.sync.read(data2);
    } else if(pathImg2.split(".").pop() === "jpg") {
        img2 = jpeg.decode(data2);
    }
    const pixdiff = pixelmatch(img1.data, img2.data, null, img1.width, img1.height);

    return pixdiff;
}

async function comparePageScreenshots(testPage, url, filename) {
    const pr = new Promise((resolve, reject) => {
        const newPath = './test/screenshots/' + filename;
        const refPath = './test/data/reference-screenshots/' + filename;
        // console.log("go to page:", url);
        testPage.goto(url, {waitUntil: 'domcontentloaded'});
        delay(5000)
        .then(() => { return testPage.screenshot({path:'./test/screenshots/' + filename})})
        .then(() => {
            const pixdiff = compareImages(newPath, refPath);
            // console.log("  pixdiff:", pixdiff);
            resolve(pixdiff);
        })
        .catch( (err) => {
            reject(err);
        });
    });

    return pr;
}

module.exports = {
    serverURL,
    cheetahURL,
    localBertURL,
    userFoo,
    userBar,
    userFooB,
    userBarB,
    testToken,
    removeMRI,
    currentDirectory,
    insertTestTokenForUser,
    removeTestToken,
    queryUser,
    insertUser,
    removeUser,
    delay,
    compareImages,
    comparePageScreenshots,
    longTimeout,
    mediumTimeout,
    shortTimeout
};


