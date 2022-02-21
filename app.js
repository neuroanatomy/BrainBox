'use strict';

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
const https = require('https');
const http = require('http');

global.authTokenMiddleware = nwl.authTokenMiddleware;

const AtlasmakerServer = require('./controller/atlasmakerServer/atlasmakerServer');
const routes = require('./controller/routes/routes');

let MONGO_DB;
const DOCKER_DB = process.env.DB_PORT;
const DOCKER_DEVELOP = process.env.DEVELOP;

if (DOCKER_DB) {
  MONGO_DB = DOCKER_DB.replace('tcp://', '') + '/brainbox';
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

// eslint-disable-next-line max-statements
const start = async function () {
  const app = express();

  app.use(bodyParser.json({limit: '50mb'}));
  app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

  /*
  Use the NeuroWebLab (NWL) module for authentication.
  NWL will also create the DB. In the future, a series
  of functions common to BrainBox and MicroDraw will be
  moved to NWL.
  */
  await nwl.init({
    app,
    MONGO_DB,
    dirname,
    usernameField: 'nickname',
    usersCollection: 'user',
    projectsCollection: 'project',
    annotationsCollection: 'mri'
  });
  const db = app.db.mongoDB();

  //========================================================================================
  // Allow CORS
  //========================================================================================
  app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
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

  const server = http.createServer(app).listen(3001, () => { console.log('Listening http on port 3001'); });
  const atlasmakerServer = new AtlasmakerServer(db);
  atlasmakerServer.dataDirectory = dirname + '/public';

  if (Config.secure) {
    const options = {
      key: await fs.read(Config.ssl_key),
      cert: await fs.read(Config.ssl_cert)
    };
    if(Config.ssl_chain) {
      options.ca = await fs.read(Config.ssl_chain);
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
  // Setup routes
  //========================================================================================
  routes(app);

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

  return { app, server, atlasmakerServer };
};

module.exports = {start};
