/* eslint-disable prefer-exponentiation-operator */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-sync */
"use strict";

/*
    Atlas Maker Server
    Roberto Toro, 25 July 2014
*/
const nwl = require('neuroweblab');
const fs = require('fs');
const express = require('express');
var compression = require('compression');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const tracer = require('tracer').console({format: '[{{file}}:{{line}}]  {{message}}'});
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mustacheExpress = require('mustache-express');
const Config = JSON.parse(fs.readFileSync('./cfg.json'));

let MONGO_DB;
const DOCKER_DB = process.env.DB_PORT;
const DOCKER_DEVELOP = process.env.DEVELOP;

if (DOCKER_DB) {
  MONGO_DB = DOCKER_DB.replace('tcp', 'mongodb') + '/brainbox';
} else {
  MONGO_DB = 'localhost:27017/brainbox'; //process.env.MONGODB;
}

/** @todo Handle the case when MongoDB is not installed */
// var db = monk(MONGO_DB);
var expressValidator = require('express-validator');

/* jslint nomen: true */
const dirname = __dirname; // Local directory
/* jslint nomen: false */

if (DOCKER_DEVELOP === '1') {
  // eslint-disable-next-line global-require
  const livereload = require('livereload');
  // Create a livereload server
  const hotServer = livereload.createServer({
    // Reload on changes to these file extensions.
    exts: ['json', 'mustache'],
    // Print debug info
    debug: true
  });

  // Specify the folder to watch for file-changes.
  hotServer.watch(__dirname);
  tracer.log(`Watching: ${__dirname}`);
}

const app = express();

/*
Use the NeuroWebLab (NWL) module for authentication.
NWL will also create the DB. In the future, a series
of functions common to BrainBox and MicroDraw will be
moved to NWL.
*/
nwl.init({
  app,
  MONGO_DB,
  dirname,
  usernameField: "nickname",
  usersCollection: "user",
  projectsCollection: "project"
});
const db = app.db.mongoDB();

//========================================================================================
// Allow CORS
//========================================================================================
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

//========================================================================================
// Enable compression
//========================================================================================
app.use(compression());

app.engine('mustache', mustacheExpress());
app.set('views', path.join(dirname, 'templates'));
app.set('view engine', 'mustache');
app.use(favicon(dirname + '/public/favicon.png'));
app.set('trust proxy', 'loopback');
if (app.get('env') === 'development') {
  app.use(logger(':remote-addr :method :url :status :response-time ms - :res[content-length]'));//app.use(logger('dev'));
}
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(expressValidator());
app.use(cookieParser());
app.use(express.static(path.join(dirname, 'public')));

if (DOCKER_DEVELOP === '1') {
  // eslint-disable-next-line global-require
  app.use(require('connect-livereload')());
}

//========================================================================================
// App-wide variables
//========================================================================================
app.use((req, res, next) => {
  req.dirname = dirname;
  req.db = db;
  req.tokenDuration = 24 * (1000 * 3600); // token duration in milliseconds

  next();
});

//========================================================================================
// Configure server and web socket
//========================================================================================
const https = require('https');
const http = require('http');

http.createServer(app).listen(3001, () => { console.log("Listening http on port 3001"); });
const atlasmakerServer = require('./controller/atlasmakerServer/atlasmakerServer.js');
atlasmakerServer.dataDirectory = dirname + '/public';

if (Config.secure) {
  const options = {
    key: fs.readFileSync(Config.ssl_key),
    cert: fs.readFileSync(Config.ssl_cert)
  };
  if(Config.ssl_chain) {
    options.ca = fs.readFileSync(Config.ssl_chain);
  }
  atlasmakerServer.server = https.createServer(options, app);
} else {
  atlasmakerServer.server = http.createServer(app);
}

atlasmakerServer.server.listen(8080, () => {
  if (Config.secure) {
    console.log('Listening wss on port 8080');
  } else {
    console.log('Listening ws on port 8080');
  }
  atlasmakerServer.initSocketConnection();
});

//========================================================================================
// Token authentication
//========================================================================================
global.tokenAuthentication = function (req, res, next) {
  tracer.log('>> Check token');
  let token;
  if(typeof req.params.token !== "undefined") {
    token = req.params.token;
  } else if(typeof req.query.token !== "undefined") {
    token = req.query.token;
  } else if(typeof req.body.token !== "undefined") {
    token = req.body.token;
  }

  if (typeof token === "undefined") {
    tracer.log('>> No token');

    return next();
  }
  console.log('>> Token prrovided. Checking if good');


  req.db.get('log').findOne({token})
    .then( (obj) => {
      if (obj) {
        // Check token expiry date
        const now = new Date();
        if (now.getTime() - obj.expiryDate.getTime() < 0) {
          tracer.log('>> Authenticated by token');
          req.isTokenAuthenticated = true;
          req.tokenUsername = obj.username;
        } else {
          tracer.log('>> Token expired');
          req.isTokenAuthenticated = false;
          req.tokenUsername = obj.username;
        }
      }
      next();
    })
    .catch( (err) => {
      tracer.log('ERROR:', err);
      next();
    });
};

//========================================================================================
// Admin route
//========================================================================================
app.use('/admin', require('./controller/admin/'));

//========================================================================================
// GUI routes
//========================================================================================
app.get('/', (req, res) => {
  const login = (req.isAuthenticated()) ?
    ('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)') :
    ('<a href=\'/auth/github\'>Log in with GitHub</a>');

  // store return path in case of login
  req.session.returnTo = req.originalUrl;

  res.render('index', {
    title: 'BrainBox',
    login: login
  });
});

app.use('/mri', require('./controller/mri/'));
app.use('/project', require('./controller/project/'));
app.use('/user', require('./controller/user/'));

//========================================================================================
// API routes
//========================================================================================
app.get('/api/getLabelsets', (req, res) => {
  const arr = fs.readdirSync(dirname + '/public/labels/');
  const info = [];
  for (const label of arr) {
    var json = JSON.parse(fs.readFileSync(dirname + "/public/labels/" + label));
    info.push({
      name: json.name,
      source: label
    });
  }
  res.send(info);
});

app.get('/api/userNameQuery', (req, res) => {
  const {query} = req;
  db.get('user')
    .find(
      { $or: [
        {nickname: {$regex:query.q}},
        {name: {$regex:query.q}}
      ]},
      { fields: ['name', 'nickname'], limit: 10 }
    )
    .then((list) => {
      res.send(list);
    })
    .catch(tracer.log);
});

app.get('/api/getAtlasBackups', (req, res) => {
  const { source, atlasProject, atlasName } = req.query;

  if(typeof source === "undefined"
        || typeof atlasProject === "undefined"
        || atlasName === "undefined") {
    res.status(400);
    res.render('error', {
      message: "Missing source, atlasProject or atlasName"
    });

    return;
  }

  // get the mri object to which this atlas belongs
  db.get('mri').findOne({
    source: source,
    "mri.atlas": {$elemMatch:{name: atlasName, project: atlasProject}},
    backup: {$exists: 0}
  }, {url: 1, "mri.atlas.$": 1})
    .then( (obj) => {
      // get all filenames that have ever been associated with this atlas
      let {url: dataDir} = obj;
      [,, dataDir] = dataDir.split("/");
      db.get('mri').aggregate([
        { $match:{ source: source, "mri.atlas":{$elemMatch: {project: atlasProject, name: atlasName}}}},
        { $unwind: "$mri.atlas" },
        { $match: { "mri.atlas.project":atlasProject, "mri.atlas.name": atlasName}},
        { $group: {_id:{filename: "$mri.atlas.filename"}}},
        { $project: {_id:0, filename:"$_id.filename"}}
      ])
        .then( (obj2) => {
          // get all backups for those files...
          let i;
          const promiseArray = [];
          // ...from backup logs
          for(i=0; i<obj2.length; i++) {
            promiseArray.push(
              db.get('log').aggregate([
                { $match: {key:"saveAtlasBackup", "value.atlasDirectory": dataDir, "value.atlasFilename": obj2[i].filename}},
                { $project: {_id:0, filename:"$value.atlasFilename", timestamp:"$value.timestamp"}}
              ])
            );
          }
          Promise.all(promiseArray)
            .then((values) => {
              let result = [].concat(...values);
              result = result.concat(obj2);
              res.send(result);
            })
            .catch( (err) => {
              res.status(500);
              res.render('error', {
                message: "Can't query backup file logs",
                error: err
              });
            });
        })
        .catch( (err) => {
          res.status(500);
          res.render('error', {
            message: "Can't query backup files",
            error: err
          });
        });
    })
    .catch( (err) => {
      res.status(400);
      res.render('error', {
        message: "Can't find atlas",
        error: err
      });
    });
});

app.post('/api/log', (req, res) => {
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  const json = req.body;
  let obj;

  switch (json.key) {
  case 'annotationLength':
    obj = {
      key: "annotationLength",
      username: loggedUser,
      "value.source": json.value.source,
      "value.atlas": json.value.atlas
    };
    req.db.get('log').findOne(obj)
      .then( (result) => {
        let length = 0;
        if (result) {
          length = parseFloat(result.value.length);
        }
        var sum = parseFloat(json.value.length) + length;
        req.db.get('log').update(obj, {$set:{
          "value.length":sum,
          date: (new Date()).toJSON()
        }}, {upsert: true});
        res.send({length: sum});
      })
      .catch( (err) => {
        tracer.log('ERROR', err);
        res.send({error: JSON.stringify(err)});
      });
    break;
  default:
    req.db.get('log').insert({
      key: json.key,
      value: json.value,
      username: loggedUser,
      date: (new Date()).toJSON(),
      ip: req.headers['x-forwarded-for'] ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    req.connection.socket.remoteAddress
    });
    res.send();
  }

  req.db.get('mri').update({
    source: json.value.source,
    "mri.atlas":{$elemMatch:{filename:json.value.atlas}}
  }, {
    $set: {
      "mri.atlas.$.modified": (new Date()).toJSON(),
      "mri.atlas.$.modifiedBy": loggedUser
    }
  });
});

//========================================================================================
// Error handlers
//========================================================================================
// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}
// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

module.exports = app;
