var fs = require('fs');
const path = require('path');
const monk = require('monk');
const db = monk('localhost:27017/brainbox');
const rimraf = require("rimraf");
const {PNG} = require('pngjs');
var jpeg = require('jpeg-js');
const pixelmatch = require('pixelmatch');
const { exec } = require("child_process");
// const { constants } = require('buffer');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const serverURL = "http://127.0.0.1:3001";
const localBertURL = serverURL + "/test_data/bert_brain.nii.gz";
const cheetahURL = "https://zenodo.org/record/44846/files/MRI.nii.gz?download=1";
const testToken = "qwertyuiopasdfghjklzxcvbnm";
const testTokenDuration = 2 * (1000 * 3600); // 2h
const noTimeout = 0; // disable timeout
const longTimeout = 20 * 1000; // 20 sec
const mediumTimeout = 10 * 1000; // 10 sec
const shortTimeout = 6 * 1000; // 6 sec

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
        name: "Any User"
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

const privateProjectTest = {
  name: "Private Test Project",
  shortname: "privatetestproject",
  url: "https://testproject.org",
  brainboxURL: "/project/privatetestproject",
  created: (new Date()).toJSON(),
  owner: "foo",
  collaborators: {
    list: [
      {
        userID: "anyone",
        access: {
          collaborators: "none",
          annotations: "none",
          files: "none"
        },
        username: "anyone",
        name: "Any User"
      }
    ]
  },
  files: {
    list: []
  },
  annotations: {
    list: [
      {
        type: "volume",
        name: "Annotation name",
        values: null
      }
    ]
  },
  description: "A private test project used for checking the authorization process.",
  modified: (new Date()).toJSON(),
  modifiedBy: "foo"
};


const currentDirectory = function () {
  console.log("Current directory:", __dirname);
  exec('ls -l', (error, stdout) => {
    console.log(stdout);
  });
};

const queryUser = function (nickname) {
  return db.get('user').findOne({nickname});
};

const insertUser = function (user) {
  return db.get('user').insert(user);
};

const removeUser = function (nickname) {
  return db.get('user').remove({nickname});
};

const insertProject = function (project) {
  return db.get('project').insert(project);
};

const removeProject = function (shortname) {
  return db.get('project').remove({shortname});
};

const insertTestTokenForUser =async function (nickname) {
  const now = new Date();
  const obj = {
    token: testToken + nickname,
    now,
    expiryDate: new Date(now.getTime() + testTokenDuration),
    username: nickname
  };
  const res = await db.get("log").insert(obj);

  return res;
};

const removeTestTokenForUser =async function (nickname) {
  await db.get("log").remove({token: testToken + nickname});
};

const delay=async function (delayTimeout) {
  await new Promise((resolve) => {
    setTimeout(resolve, delayTimeout);
  });
};

const removeMRI=async function ({dirPath, srcURL}) {
  rimraf.sync(dirPath, {}, (err) => console.log(new Error(err)));
  const res = await db.get('mri').remove({source: srcURL});

  return res;
};

const compareImages = async function (pathImg1, pathImg2) {
  const data1 = await fs.promises.readFile(pathImg1);
  const data2 = await fs.promises.readFile(pathImg2);
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
};

// eslint-disable-next-line max-statements
const waitUntilHTMLRendered=async function (page, timeout = 30000) {
  const checkDurationMsecs = 1000;
  const maxChecks = timeout / checkDurationMsecs;
  let lastHTMLSize = 0;
  let checkCounts = 1;
  let countStableSizeIterations = 0;
  const minStableSizeIterations = 3;

  while(checkCounts++ <= maxChecks) {
    // eslint-disable-next-line no-await-in-loop
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
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(checkDurationMsecs);
  }
};

const comparePageScreenshots=async function (testPage, url, filename) {
  const newPath = './test/screenshots/' + filename;
  const refPath = './test/data/reference-screenshots/' + filename;
  await testPage.goto(url, {waitUntil: 'networkidle2', timeout: 90000});
  await waitUntilHTMLRendered(testPage);
  fs.promises.mkdir(path.dirname(newPath), { recursive: true });
  await testPage.screenshot({path:'./test/screenshots/' + filename});
  const pixdiff = await compareImages(newPath, refPath);

  return pixdiff;
};

const parseCookies = (str) => str
  .split(';')
  .map((v) => v.split('='))
  .reduce((acc, v) => {
    if (typeof v[0] === 'undefined' || typeof v[1] === 'undefined') {
      return acc;
    }
    acc.push({
      name: decodeURIComponent(v[0].trim()),
      value: decodeURIComponent(v[1].trim()),
      url: serverURL
    });

    return acc;
  }, []);

const testingCredentials = {
  username: "testing-user",
  password: "baz"
};

const createProjectWithPermission = function(name, accessProp) {
  const access = Object.assign({}, {
    collaborators: "view",
    annotations: "none",
    files: "none"
  }, accessProp);

  const project = {
    name: name,
    shortname: name,
    url: "https://testproject.org",
    brainboxURL: "/project/" + name,
    created: (new Date()).toJSON(),
    owner: "foo",
    collaborators: { list: [
      {
        userID: "anyone",
        access: {
          collaborators: "none",
          annotations: "none",
          files: "view"
        },
        username: "anyone",
        name: "Any User"
      },
      {
        userID: "bar",
        access: {
          collaborators: "view",
          annotations: "view",
          files: "view"
        },
        username: "foo",
        name: "Foo"
      }
    ] },
    files: {
      list: [{source: "https://zenodo.org/record/44855/files/MRI-n4.nii.gz", name: "MRI-n4.nii.gz"}]
    },
    annotations: {
      list: [{"type":"volume", "name":"Test", "values":"axolotl_labels.json", "display":"true"}]
    }
  };

  project.collaborators.list.push({
    access,
    userID: testingCredentials.username,
    username: testingCredentials.username,
    name: testingCredentials.username
  });

  return project;
};


module.exports = {
  serverURL,
  cheetahURL,
  localBertURL,
  userFoo,
  userBar,
  userFooB,
  userBarB,
  projectTest,
  privateProjectTest,
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
  shortTimeout,
  parseCookies,
  testingCredentials,
  createProjectWithPermission
};


