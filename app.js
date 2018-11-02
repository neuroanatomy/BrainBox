"use strict";

/*
    Atlas Maker Server
    Roberto Toro, 25 July 2014
    
    Launch using > node atlasMakerServer.js
*/

const debug = 1;

const fs = require('fs');
const express = require('express');
const path = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan');
const tracer = require('tracer').console({format: '[{{file}}:{{line}}]  {{message}}'});
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mustacheExpress = require('mustache-express');
const crypto = require('crypto');
const request = require('request');
const url = require('url');
const async = require('async');
const mongo = require('mongodb');
const monk = require('monk');

let MONGO_DB;
const DOCKER_DB = process.env.DB_PORT;
const DOCKER_DEVELOP = process.env.DEVELOP;

if (DOCKER_DB) {
    MONGO_DB = DOCKER_DB.replace('tcp', 'mongodb') + '/brainbox';
} else {
  MONGO_DB = 'localhost:27017/brainbox'; //process.env.MONGODB;
}

var db = monk(MONGO_DB);
var expressValidator = require('express-validator');

/* jslint nomen: true */
const dirname = __dirname; // Local directory
/* jslint nomen: false */

if (DOCKER_DEVELOP === '1') {
    const livereload = require('livereload');
    // Create a livereload server
    const hotServer = livereload.createServer({
      // Reload on changes to these file extensions.
      exts: [ 'json', 'mustache' ],
      // Print debug info
      debug: true
    });

    // Specify the folder to watch for file-changes.
    hotServer.watch(__dirname);
    tracer.log('Watching: ' + __dirname);
}

const app = express();

// allow CORS
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.engine('mustache', mustacheExpress());
app.set('views', path.join(dirname, 'templates'));
app.set('view engine', 'mustache');
app.use(favicon(dirname + '/public/favicon.png'));
app.set('trust proxy', 'loopback');
app.use(logger(':remote-addr :method :url :status :response-time ms - :res[content-length]'));//app.use(logger('dev'));
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(expressValidator());
app.use(cookieParser());
app.use(express.static(path.join(dirname, 'public')));

if (DOCKER_DEVELOP === '1') {
    app.use(require('connect-livereload')());
}

// { App-wide variables
app.use((req, res, next) => {
    req.dirname = dirname;
    req.db = db;
    req.tokenDuration = 24 * (1000 * 3600); // token duration in milliseconds

    next();
});
// }

// { Init web socket server
const atlasMakerServer = require('./controller/atlasMakerServer/atlasMakerServer.js');
atlasMakerServer.initSocketConnection();
atlasMakerServer.dataDirectory = dirname + '/public';
// }

// { Check that the 'anyone' user exists. Insert it otherwise
db.get('user').findOne({nickname: 'anyone'})
    .then( (obj) => {
        if (!obj) {
            const anyone = {
                name: 'Any BrainBox User',
                nickname: 'anyone',
                brainboxURL: '/user/anyone',
                joined: (new Date()).toJSON()
            };
            tracer.log('WARNING: \'anyone\' user absent: inserting it');
            db.get('user').insert(anyone);
        } else {
            tracer.log('\'anyone\' user correctly configured.');
        }
    });
// }

// { Passport: OAuth2 authentication
const session = require('express-session');
const passport = require('passport');
const GithubStrategy = require('passport-github').Strategy;

passport.use(new GithubStrategy(
    JSON.parse(fs.readFileSync(dirname + "/github-keys.json")),
    function (accessToken, refreshToken, profile, done) {return done(null, profile); }
));
app.use(session({
    secret: "a mi no me gusta la sémola",
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
// add custom serialization/deserialization here (get user from mongo?) null is for errors
passport.serializeUser((user, done) => {
    done(null, user);
});
passport.deserializeUser((user, done) => {
    done(null, user);
});
// simple authentication middleware. Add to routes that need to be protected.
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/');
}
app.get('/secure-route-example', ensureAuthenticated, function (req, res) {res.send("access granted"); });
app.get('/logout', function (req, res) {
    req.logout();
    res.redirect(req.session.returnTo || '/');
    delete req.session.returnTo;
});
app.get('/loggedIn', function (req, res) {
    if (req.isAuthenticated()) {
        res.send({loggedIn: true, username: req.user.username});
    } else {
        res.send({loggedIn: false});
    }
});
// start the GitHub Login process
app.get('/auth/github', passport.authenticate('github'));
app.get('/auth/github/callback',
    passport.authenticate('github', {failureRedirect: '/'}),
    (req, res) => {
        // Successfully loged in. Check if user is new
        db.get('user').findOne({nickname: req.user.username}, '-_id')
            .then( (json) => {
                if (!json) {
                    // insert new user
                    json = {
                        name: req.user.displayName,
                        nickname: req.user.username,
                        url: req.user._json.blog,
                        brainboxURL: "/user/" + req.user.username,
                        avatarURL: req.user._json.avatar_url,
                        joined: (new Date()).toJSON()
                    };
                    db.get('user').insert(json);
                } else {
                    tracer.log('Update user data from GitHub');
                    db.get('user').update({nickname: req.user.username}, {$set: {
                        name: req.user.displayName,
                        url: req.user._json.blog,
                        avatarURL: req.user._json.avatar_url
                    }});
                }
            });
            res.redirect(req.session.returnTo || '/');
            delete req.session.returnTo;
    });
// }

// { Token authentication
global.tokenAuthentication = function (req, res, next) {
    tracer.log('>> Check token');
    let token;
    if (req.params.token)
        token = req.params.token;
    if(req.query.token)
        token = req.query.token;

    if (!token) {
        tracer.log('>> No token');
        next();

        return;
    }
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
// }

// { GUI routes
app.get('/', (req, res) => { // /auth/github
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
// }

// { API routes
app.get('/api/getLabelsets', (req, res) => {
    let i;
    const arr = fs.readdirSync(dirname + '/public/labels/');
    const info = [];
    for (i in arr) {
        var json = JSON.parse(fs.readFileSync(dirname + "/public/labels/" + arr[i]));
        info.push({
            name: json.name,
            source: arr[i]
        });
    }
    res.send(info);
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
        dataDir = dataDir.split("/")[2];
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
                let result = [].concat.apply([], values);
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
                req.db.get('log').update(obj,{$set:{
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
// }

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers
// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}
// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;