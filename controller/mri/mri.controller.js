"use strict";

var crypto = require('crypto');
var url = require('url');
var fs = require('fs');
var request = require('request');
var atlasMakerServer = require('../../js/atlasMakerServer');
var checkAccess = require('../../js/checkAccess.js');

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
/**
 * @todo Change this function callback into a promise
 */
function downloadMRI(myurl, req, res, callback) {
    console.log("downloadMRI");
    var hash = crypto.createHash('md5').update(myurl).digest('hex'),
        filename = url.parse(myurl).pathname.split("/").pop(),
        dest = req.dirname + "/public/data/" + hash + "/" + filename;
    console.log("   source:", myurl);
    console.log("     hash:", hash);
    console.log(" filename:", filename);
    console.log("     dest:", dest);

    if (!fs.existsSync(req.dirname + "/public/data/" + hash)) {
        fs.mkdirSync(req.dirname + "/public/data/" + hash, '0777');
    }

    request({uri: myurl, followAllRedirects: true})
        .pipe(fs.createWriteStream(dest))
        .on('close', function request_fromDownloadMRI() {
            // NOTE: getBrainAtPath has to be called with a client-side path like "/data/[md5hash]/..."
            atlasMakerServer.getBrainAtPath("/data/" + hash  + "/" + filename)
                .then(function getBrainAtPath_fromDownloadMRI(mri) {
                    // create json file for new dataset
                    var ip = req.headers['x-forwarded-for'] ||
                        req.connection.remoteAddress ||
                        req.socket.remoteAddress ||
                        req.connection.socket.remoteAddress;
                    var username = (req.isAuthenticated()) ? req.user.username : ip;
                    var json = {
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
                                labels: 'foreground.json'
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
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";
    var myurl = req.query.url;
    var hash = crypto.createHash('md5').update(myurl).digest('hex');
    
    // store return path in case of login
    req.session.returnTo = req.originalUrl;
    
    console.log("query",myurl,hash);

    req.db.get('mri').findOne({url: "/data/" + hash + "/", backup:{$exists:0}}, {fields: {_id: 0}, sort: {$natural: -1}, limit: 1})
        .then(function (json) {
            
            // determine whether we need to download the data from the source
            var doDownload = false;
            
            if(!json) {
                // if the json object is empty, download
                doDownload = true;
            } else {
                // if the json object exists, but there's no file, download
                var filename = url.parse(myurl).pathname.split("/").pop();
                var path = req.dirname + "/public/data/" + hash + "/" + filename;
                if(fs.existsSync(path) == false) {
                    console.log("no mri file in server: download");
                    doDownload = true;
                } else
                // if the json object exists, there's a file, but no .dim object, download
                if(!json.dim) {
                    console.log("no dim in db entry: download");
                    doDownload = true;
                }
            }
            
            if(doDownload === true ) {
                // download MRI first, send data next
                (function (my, rq, rs) {
                    downloadMRI(my, rq, rs, function (obj) {
                        if(obj) {
                            req.db.get('mri').insert(obj);
                            rs.render('mri', {
                                title: obj.name || 'BrainBox',
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
            } else {
                // if the json object exists, and has annotations, configure the access to them
                console.log("check access rights");
                if(!json.mri.atlas)
                    json.mri.atlas = [];
                var i, j, k, ii, arr = [];
                for(i=0;i<json.mri.atlas.length;i++) {
                    if(json.mri.atlas[i].project) {
                        console.log("mri is in project",json.mri.atlas[i].project);
                        arr.push(req.db.get('project').findOne({
                            shortname:json.mri.atlas[i].project,
                            backup: {$exists: 0}
                        }));
                    }
                }
                Promise.all(arr).then(function(projects) {
                    console.log("projects",projects);
                    for(i=0;i<json.mri.atlas.length;i++) {
                        for(j=0;j<projects.length;j++) {
                            if(projects[j] && projects[j].shortname == json.mri.atlas[i].project) {
                                json.mri.atlas[i].access = checkAccess.toAnnotationByProject(json.mri.atlas[i],projects[j],loggedUser);
                                break;
                            }
                        }
                    }

                    // send data
                    res.render('mri', {
                        title: json.name || 'BrainBox',
                        params: JSON.stringify(req.query),
                        mriInfo: JSON.stringify(json),
                        login: login
                    });
                }).catch(function(err) {
                    console.log("ERROR Cannot get db information:",err);
                });
            }
        }, function (err) {
            console.error(err);
        });
};

var api_mri_post = function (req, res) {
    console.log("post query, ", req.params);

    var myurl = req.body.url;
    var hash = crypto.createHash('md5').update(myurl).digest('hex');

    req.db.get('mri').findOne({source:myurl, backup: {$exists: false}}, "-_id", {sort: {$natural: -1}, limit: 1})
        .then(function (json) {
        
            // determine whether we need to download the data from the source
            var doDownload = false;
            
            // if client is not requesting a specific MRI variable
            if (!req.body.var) {
                // if the json object is empty, download
                if(!json) {
                    console.log("no db entry for mri: download");
                    doDownload = true;
                } else {
                    // if the json object exists, but there's no file, download
                    var filename = url.parse(myurl).pathname.split("/").pop();
                    var path = req.dirname + "/public/data/" + hash + "/" + filename;
                    if(fs.existsSync(path) == false) {
                        console.log("no mri file in server: download");
                        doDownload = true;
                    } else
                    // if the json object exists, there's a file, but no .dim object, download
                    if(!json.dim) {
                        console.log("no dim in db entry: download");
                        doDownload = true;
                    }
                }
            }

            if(doDownload === true ) {
                downloadMRI(myurl, req, res, function (obj) {
                    if(obj) {
                        req.db.get('mri').insert(obj);
                        res.json(obj);
                    } else {
                        console.log("ERROR: Cannot read file");
                        res.json({});
                    }
                });
            } else {
                // return a specific variable, or the complete json object
                if (req.body.var) {
                    var i, arr = req.body.var.split("/");
                    for (i in arr) {
                        json = json[arr[i]];
                    }
                }
                res.json(json);            
            }
        }, function (err) {
            console.error(err);
        });
};

var api_mri_get = function (req, res) {
    var myurl = req.query.url,
    hash = crypto.createHash('md5').update(myurl).digest('hex');
    // shell equivalent: req.db.mri.find({source:"http://braincatalogue.org/data/Pineal/P001/t1wreq.db.nii.gz"}).limit(1).sort({$natural:-1})

    req.db.get('mri').findOne({url: "/data/" + hash + "/", backup: {$exists: false}}, "-_id", {sort: {$natural: -1}, limit: 1})
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

