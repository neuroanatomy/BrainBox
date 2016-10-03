"use strict";

var crypto = require('crypto');
var url = require('url');
var fs = require('fs');
var request = require('request');
var atlasMakerServer = require('../../js/atlasMakerServer');
//expressValidator = require('express-validator')

var validator = function (req, res, next) {
    console.log("post query, ", req.body);
    req.checkQuery('url', 'please enter a valid URL')
        .isURL();

    // req.checkQuery('var', 'please enter one of the variables that are indicated')
    // .optional()
    // .matches("localpath|filename|source|url|dim|pixdim");    // todo: decent regexp
    var errors = req.validationErrors();
    console.log(errors);
    if (errors) {
        res.send(errors).status(403).end();
    } else {
        return next();
    }
};

var validator_post = function (req, res, next) {
    req.checkBody('url', 'please enter a valid URL')
        .isURL();

    // req.checkQuery('var', 'please enter one of the variables that are indicated')
    // .optional()
    // .matches("localpath|filename|source|url|dim|pixdim");    // todo: decent regexp
    var errors = req.validationErrors();
    console.log(errors);
    if (errors) {
        res.send(errors).status(403).end();
    } else {
        return next();
    }
};

/* Download MRI file
---------------------*/
function downloadMRI(myurl, req, res, callback) {
    console.log("downloadMRI");
    var hash = crypto.createHash('md5').update(myurl).digest('hex'),
        filename = url.parse(myurl).pathname.split("/").pop(),
        dest = req.dirname + "/public/data/" + hash + "/" + filename;
    console.log("   source:", myurl);
    console.log("     hash:", hash);
    console.log(" filename:", filename);
    console.log("     dest:", dest);

    console.log(process.cwd());

    if (!fs.existsSync(req.dirname + "/public/data/" + hash)) {
        fs.mkdirSync(req.dirname + "/public/data/" + hash, '0777');
    }

    request({uri: myurl, followAllRedirects: true})
        .pipe(fs.createWriteStream(dest))
        .on('close', function request_fromDownloadMRI() {
            // NOTE: getBrainAtPath has to be called with a client-side path like "/data/[md5hash/..."
            atlasMakerServer.getBrainAtPath("/data/" + hash  + "/" + filename)
                .then(function getBrainAtPath_fromDownloadMRI(mri) {
                    // create json file for new dataset
                    var ip = req.headers['x-forwarded-for'] ||
                             req.connection.remoteAddress ||
                             req.socket.remoteAddress ||
                             req.connection.socket.remoteAddress,
                        username = (req.isAuthenticated()) ? req.user.username : ip,
                        json = {
                            filename: filename,
                            success: true,
                            source: myurl,
                            url: "/data/" + hash + "/",
                            included: (new Date()).toJSON(),
                            dim: mri.dim,
                            pixdim: mri.pixdim,
                            voxel2world: mri.v2w,
                            worldOrigin: mri.wori,
                            owner: username,
                            mri: {
                                brain: filename,
                                atlas: [{
                                    owner: username,
                                    created: (new Date()).toJSON(),
                                    modified: (new Date()).toJSON(),
                                    access: 'Read/Write',
                                    type: 'volume',
                                    filename: 'Atlas.nii.gz',
                                    labels: '/labels/foreground.json'
                                }]
                            }
                        };
                    callback(json);
                })
                .catch(function(err) {
                    console.log("ERROR Cannot get brain at path /data/" + hash  + "/" + filename + ": ", err);
                    callback();
                });
                    
        })
        .on('error', function (err) {
            console.error("ERROR in downloadMRI", err);
            callback();
        });
}

var mri = function (req, res) {
    var login = (req.isAuthenticated()) ?
                ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
                : ("<a href='/auth/github'>Log in with GitHub</a>");
    var myurl = req.query.url,
        hash = crypto.createHash('md5').update(myurl).digest('hex');
    req.db.get('mri').find({url: "/data/" + hash + "/"}, {fields: {_id: 0}, sort: {$natural: -1}, limit: 1})
        .then(function (json) {
            console.log(json);
            json = json[0];
            if (json) {
                res.render('mri', {
                    title: json.name || 'Untitled MRI',
                    params: JSON.stringify(req.query),
                    mriInfo: JSON.stringify(json),
                    login: login
                });
            } else {
                (function (my, rq, rs) {
                    downloadMRI(my, rq, rs, function (obj) {
                        if(obj) {
                            req.db.get('mri').insert(obj);
                            rs.render('mri', {
                                title: obj.name || 'Untitled MRI',
                                params: JSON.stringify(rq.query),
                                mriInfo: JSON.stringify(obj),
                                login: login
                            });
                        } else {
                            console.log("ERROR: Cannot read file");
                            rs.render('mri', {
                                title: 'ERROR: Unreadable file',
                                params: JSON.stringify(rq.query),
                                mriInfo: JSON.stringify({}),
                                login: login
                            });
                            
                        }
                    });
                }(myurl, req, res));
            }
        }, function (err) {
            console.error(err);
        });
};

var api_mri_post = function (req, res) {
    console.log("post query, ", req.params);

    var myurl = req.body.url,
        hash = crypto.createHash('md5').update(myurl).digest('hex');
    // shell equivalent: req.db.mri.find({source:"http://braincatalogue.org/data/Pineal/P001/t1wreq.db.nii.gz"}).limit(1).sort({$natural:-1})

    req.db.get('mri').find({url: "/data/" + hash + "/", backup: {$exists: false}}, "-_id", {sort: {$natural: -1}, limit: 1})
        .then(function (json) {
            json = json[0];
            if (json) {
                if (req.body.var) {
                    var i, arr = req.body.var.split("/");
                    for (i in arr) {
                        json = json[arr[i]];
                    }
                }
                res.json(json);
            } else {
                if (req.body.var) {
                    res.json({});
                } else {
                    downloadMRI(myurl, req, res, function (obj) {
                        if(obj) {
                            req.db.get('mri').insert(obj);
                            res.json(obj);
                        } else {
                            console.log("ERROR: Cannot read file");
                            res.json({});
                        }
                    });
                }
            }
        }, function (err) {
            console.error(err);
        });
};

var api_mri_get = function (req, res) {
    var myurl = req.query.url,
    hash = crypto.createHash('md5').update(myurl).digest('hex');
    // shell equivalent: req.db.mri.find({source:"http://braincatalogue.org/data/Pineal/P001/t1wreq.db.nii.gz"}).limit(1).sort({$natural:-1})

    req.db.get('mri').find({url: "/data/" + hash + "/", backup: {$exists: false}}, "-_id", {sort: {$natural: -1}, limit: 1})
        .then(function (json) {
            res.status(200);
            res.json(json);
        })
        .catch(function(err) {
            res.status(500);
            res.json(err);
        });
};

var mriController = function () {
    this.validator = validator;
    this.validator_post = validator_post;
    this.api_mri_get = api_mri_get;
    this.api_mri_post = api_mri_post;
    this.mri = mri;
};

module.exports = new mriController();

