/* eslint-disable no-await-in-loop */
var fs = require('fs');
const path = require('path');
const monk = require('monk');
const db = monk('localhost:27017/brainbox');
const rimraf = require("rimraf");
const {PNG} = require('pngjs');
var jpeg = require('jpeg-js');
const pixelmatch = require('pixelmatch');
const { exec } = require("child_process");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const serverURL = "http://127.0.0.1:3001";
const localBertURL = serverURL + "/test_data/bert_brain.nii.gz";
const cheetahURL = "https://zenodo.org/record/44846/files/MRI.nii.gz?download=1";
const testToken = "qwertyuiopasdfghjklzxcvbnm";
const testTokenDuration = 2 * (1000 * 3600); // 2h
const noTimeout = 0; // disable timeout
const longTimeout = 10 * 1000; // 10 sec
const mediumTimeout = 5 * 1000; // 5 sec
const shortTimeout = 3 * 1000; // 3 sec

const userFoo = {
  name: "Founibald Barr",
  nickname: "foo",
  url: "https://foo.bar",
  brainboxURL: "/user/foo",
  avatarURL: serverURL + "/test_data/foo.png",
  joined: (new Date()).toJSON()
};
const userBar = {
  name: "Barton Fouquet",
  nickname: "bar",
  url: "https://bar.foo",
  brainboxURL: "/user/foo",
  avatarURL: serverURL + "/test_data/bar.png",
  joined: (new Date()).toJSON()
};
const userFooB = {
  name: "Founibald Barr",
  username: "foo",
  url: "https://foo.bar",
  brainboxURL: "/user/foo",
  avatarURL: serverURL + "/test_data/foo.png",
  joined: (new Date()).toJSON()
};
const userBarB = {
  name: "Barton Fouquet",
  username: "bar",
  url: "https://bar.foo",
  brainboxURL: "/user/foo",
  avatarURL: serverURL + "/test_data/bar.png",
  joined: (new Date()).toJSON()
};
const projectTest = {
  name: "Test Project",
  shortname: "testproject",
  url: "https://testproject.org",
  brainboxURL: "/project/testproject",
  created: (new Date()).toJSON(),
  owner: "foo",
  collaborators: {
    list: [
      {
        userID: "anyone",
        access: {
          collaborators: "view",
          annotations: "edit",
          files: "view"
        },
        username: "anyone",
        name: "Any BrainBox User"
      }
    ]
  },
  files: {
    list: [
      serverURL + "/test_data/bert_brain.nii.gz",
      "https://zenodo.org/record/44855/files/MRI-n4.nii.gz",
      "http://files.figshare.com/2284784/MRI_n4.nii.gz",
      "https://dl.dropbox.com/s/cny5b3so267bv94/p32-f18-uchar.nii.gz",
      "https://s3.amazonaws.com/fcp-indi/data/Projects/ABIDE_Initiative/Outputs/freesurfer/5.1/Caltech_0051456/mri/T1.mgz"
    ]
  },
  annotations: {
    list: [
      {
        type: "volume",
        values: "cerebellum.json",
        display: "true",
        name: "Cerebrum"
      }
    ]
  },
  description: "A test project used for checking that rendering is behaving as expected.",
  modified: (new Date()).toJSON(),
  modifiedBy: "foo"
};

function currentDirectory() {
  console.log("Current directory:", __dirname);
  exec('ls -l', (error, stdout) => {
    console.log(stdout);
  });
}

function queryUser(nickname) {
  return db.get('user').findOne({nickname});
}

function insertUser(user) {
  return db.get('user').insert(user);
}

function removeUser(nickname) {
  return db.get('user').remove({nickname});
}

function insertProject(project) {
  return db.get('project').insert(project);
}

function removeProject(shortname) {
  return db.get('project').remove({shortname});
}
async function insertTestTokenForUser(nickname) {
  const now = new Date();
  const obj = {
    token: testToken + nickname,
    now,
    expiryDate: new Date(now.getTime() + testTokenDuration),
    username: nickname
  };
  const res = await db.get("log").insert(obj);

  return res;
}

async function removeTestTokenForUser(nickname) {
  await db.get("log").remove({token: testToken + nickname});
}

async function delay(delayTimeout) {
  await new Promise((resolve) => {
    setTimeout(resolve, delayTimeout);
  });
}

async function removeMRI({dirPath, srcURL}) {
  rimraf.sync(dirPath, {}, (err) => console.log(new Error(err)));
  const res = await db.get('mri').remove({source: srcURL});

  return res;
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

async function waitUntilHTMLRendered(page, timeout = 30000) {
  const checkDurationMsecs = 1000;
  const maxChecks = timeout / checkDurationMsecs;
  let lastHTMLSize = 0;
  let checkCounts = 1;
  let countStableSizeIterations = 0;
  const minStableSizeIterations = 3;

  while(checkCounts++ <= maxChecks) {
    const html = await page.content();
    const currentHTMLSize = html.length;

    // const bodyHTMLSize = await page.evaluate(() => document.body.innerHTML.length);

    // console.log('last: ', lastHTMLSize, ' <> curr: ', currentHTMLSize, " body html size: ", bodyHTMLSize);

    if(lastHTMLSize !== 0 && currentHTMLSize === lastHTMLSize) {
      countStableSizeIterations++;
    } else {
      countStableSizeIterations = 0; //reset the counter
    }

    if(countStableSizeIterations >= minStableSizeIterations) {
      // console.log("Page rendered fully..");
      break;
    }
    lastHTMLSize = currentHTMLSize;
    await page.waitForTimeout(checkDurationMsecs);
  }
}

async function comparePageScreenshots(testPage, url, filename) {
  const newPath = './test/screenshots/' + filename;
  const refPath = './test/data/reference-screenshots/' + filename;
  await testPage.goto(url, {waitUntil: 'networkidle2', timeout: 90000});
  await waitUntilHTMLRendered(testPage);
  fs.mkdirSync(path.dirname(newPath), { recursive: true });
  await testPage.screenshot({path:'./test/screenshots/' + filename});
  const pixdiff = compareImages(newPath, refPath);

  return pixdiff;
}

module.exports = {
  serverURL,
  cheetahURL,
  localBertURL,
  userFoo,
  userBar,
  userFooB,
  userBarB,
  projectTest,
  testToken,
  removeMRI,
  currentDirectory,
  insertTestTokenForUser,
  removeTestTokenForUser,
  queryUser,
  insertUser,
  removeUser,
  insertProject,
  removeProject,
  delay,
  compareImages,
  comparePageScreenshots,
  waitUntilHTMLRendered,
  noTimeout,
  longTimeout,
  mediumTimeout,
  shortTimeout
};


