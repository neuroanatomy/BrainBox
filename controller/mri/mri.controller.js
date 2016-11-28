"use strict";

var crypto = require('crypto');
var url = require('url');
var fs = require('fs');
var request = require('request');
var atlasMakerServer = require('../../js/atlasMakerServer');
var checkAccess = require('../../js/checkAccess.js');
var dataSlices = require("../../js/dataSlices.js");

var downloadQueue = [];

//expressValidator = require('express-validator')

var validator = function (req, res, next) {
    console.log("Query validator");
    console.log("body:",req.body);
    console.log("query:",req.query);

    if(!req.query.url) {
        return next();
    } else {
        req.checkQuery('url', 'please enter a valid URL')
            .isURL();

        // req.checkQuery('var', 'please enter one of the variables that are indicated')
        // .optional()
        // .matches("localpath|filename|source|url|dim|pixdim");    // todo: decent regexp
        var errors = req.validationErrors();
        console.log("errors:",errors);
        if (errors) {
            res.send(errors).status(403).end();
        } else {
            return next();
        }
    }
};

var validator_post = function (req, res, next) {
    req.checkBody('url', 'please enter a valid URL')
        .isURL();

    // req.checkQuery('var', 'please enter one of the variables that are indicated')
    // .optional()
    // .matches("localpath|filename|source|url|dim|pixdim");    // todo: decent regexp
    var errors = req.validationErrors();
    console.log("errors:",errors);
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
    var newFilename, newDest, len, cur = 0;

    request({uri: myurl, followAllRedirects: true})
    .on('error', function (err) {
        console.log("ERROR in downloadMRI", err);
        callback({error:err});
    })
    .on('response', function(res) {
        var href = res.request.uri.href;
        newFilename = href.split("/").pop();
        console.log("filename:",newFilename);
        var arr = dest.split("/");
        arr.pop();
        arr.push(newFilename);
        newDest = arr.join("/");
        console.log("new dest:",newDest);
        len = parseInt(res.headers['content-length'], 10);
        console.log("file length:",len);
    })
    .on('data', function(chunk) {    
//      body += chunk;
        cur += chunk.length;
        //console.log("downloaded:",cur,"/",len);
//      obj.innerHTML = "Downloading " + (100.0 * cur / len).toFixed(2) + "% " + (cur / 1048576).toFixed(2) + " mb\r" + ".<br/> Total size: " + total.toFixed(2) + " mb";
    })
    .pipe(fs.createWriteStream(dest))
    .on('close', function request_fromDownloadMRI(res) {
        console.log("new:",newFilename, newDest);
        
        fs.renameSync(dest, newDest);
        filename=newFilename;
        dest=newDest;
        
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
                        created: (new Date()).toJSON(),
                        modified: (new Date()).toJSON(),
                        access: 'edit',
                        type: 'volume',
                        name: 'Default',
                        filename: 'Atlas.nii.gz',
                        labels: 'foreground.json'
                    }]
                }
            };
            callback(json);
        })
        .catch(function(err) {
            console.log("ERROR Cannot get brain at path /data/" + hash  + "/" + filename + ": ", err);
            callback({error:"Can't get brain"});
        });
    });
}
var mri = function (req, res) {
    var login = (req.isAuthenticated()) ?
                ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
                : ("<a href='/auth/github'>Log in with GitHub</a>");
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";
    
    // store return path in case of login
    req.session.returnTo = req.originalUrl;
    
    var myurl = req.query.url;
    var hash = crypto.createHash('md5').update(myurl).digest('hex');
    console.log("Receive GET, query:",myurl,hash);

    req.db.get('mri').findOne({source: myurl, backup:{$exists:0}}, {_id: 0})
    .then(function (json) {
        if(!json) {
            var obj = {
                source: myurl
            };

            res.render('mri', {
                title: obj.name || 'BrainBox',
                params: JSON.stringify(req.query),
                mriInfo: JSON.stringify(obj),
                login: login
            });
        } else {
            // if the json object exists, and has annotations, configure the access to them
            if(!json.mri.atlas)
                json.mri.atlas = [];
            var i, j, k, ii, prj = new Set(), arr = [];
            // check access to volume annotations
            for(i=0;i<json.mri.atlas.length;i++) {
                if(json.mri.atlas[i].project) {
                    prj.add(json.mri.atlas[i].project);
                }
            }
            // check access to text annotations
            for(i in json.mri.annotations) {
                prj.add(i);
            }
            arr = [...prj].map(function(o){return req.db.get('project').findOne({
                shortname:o,
                backup: {$exists: 0}
            })});
            Promise.all([...arr]).then(function(projects) {
                checkAccess.filterAnnotationsByProjects(json.mri,projects,loggedUser);

                // set access to text annotations
                for(i in json.mri.annotations) {
                    for(j=0;j<projects.length;j++) {
                        if(projects[j] && projects[j].shortname == i) {
                            var access = checkAccess.toAnnotationByProject(projects[j],loggedUser);
                            var level = checkAccess.accessStringToLevel(access);
                            if(level > 0) {
                                for(k in json.mri.annotations[i]) {
                                    json.mri.annotations[i][k].access = access;
                                }
                            } else {
                                delete json.mri.annotations[i];
                            }
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
        console.log("err 241:",err);
    });
}

var api_mri_post = function (req, res) {
    console.log("Received POST, params:", req.params);

    var myurl = req.body.url;
    var hash = crypto.createHash('md5').update(myurl).digest('hex');

    req.db.get('mri').findOne({source:myurl, backup: {$exists: 0}}, {_id: 0})
        .then(function (json) {
            // determine whether we need to download the data from the source
            var doDownload = false;
            
            // if client is not requesting a specific MRI variable
            if (!req.body.var) {
                // if the json object is empty, download
                if(!json) {
                    console.log("No DB entry for MRI: download");
                    doDownload = true;
                } else {
                    // if the json object exists, but there's no file, download
                    var filename = url.parse(myurl).pathname.split("/").pop();
                    var path = req.dirname + "/public/data/" + hash + "/" + filename;
                    if(fs.existsSync(path) == false) {
                        console.log("No MRI file in server: download");
                        doDownload = true;
                    } else
                    // if the json object exists, there's a file, but no .dim object, download
                    if(!json.dim) {
                        console.log("No dim[] field in DB entry: download");
                        doDownload = true;
                    }
                }
            }

            if(doDownload === true ) {
                if(downloadQueue[myurl]) {
                    if(downloadQueue[myurl].success==true) {
                        var info = JSON.parse(JSON.stringify(downloadQueue[myurl]));
                        delete downloadQueue[myurl];
                        res.json(info);
                    } else {
                        res.json(downloadQueue[myurl]);
                    }
                        
                } else {
                    console.log("Start download:");
                    downloadQueue[myurl] = {success:"downloading"};
                    downloadMRI(myurl, req, res, function (obj) {                        
                        if(obj.error == undefined) {
                            console.log("Download succeeded");
                            req.db.get('mri').insert(obj);
                            obj.success = true;
                            downloadQueue[myurl]=obj;
                        } else {
                            console.log("Download failed:", obj);
                            downloadQueue[myurl]={success:"error"};
                        }
                    });
                    
                    res.json(downloadQueue[myurl]);
                }
            } else {
                // return a specific variable, or the complete json object
                console.log("Send the data to the client. End of transaction.");
                if (req.body.var) {
                    var i, arr = req.body.var.split("/");
                    for (i in arr) {
                        json = json[arr[i]];
                    }
                }
                res.json(json);            
            }
        }, function (err) {
            console.log("ERROR:",err);
            res.json({success:false});
        });
};
var api_mri_get = function (req, res) {
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";
    var myurl = req.query.url;

    // if query does not contain a specific mri, send paginated list of mris
    if(!myurl) {
        if(req.query.page === undefined) {
            res.send({error:"Specify the 'page' parameter"});
            return;
        }
        
        // display access-filtered list of mris
        var page = Math.max(0,parseInt(req.query.page));
        var nItemsPerPage = 20;
        
        dataSlices.getFilesSlice(req,page*nItemsPerPage,nItemsPerPage)
        .then(function (values) {
            res.json(values);
        });
        
        return;
    }

    req.db.get('mri').findOne({source: myurl, backup:{$exists:0}}, {_id: 0})
    .then(function (json) {
        if(!json) {
            res.status(404).json({});
        } else {
            // if the json object exists, and has annotations, configure the access to them
            console.log("check access rights");
            if(!json.mri.atlas)
                json.mri.atlas = [];
            var i, j, k, ii, prj = new Set(), arr = [];
            // check access to volume annotations
            for(i=0;i<json.mri.atlas.length;i++) {
                if(json.mri.atlas[i].project) {
                    console.log("mri is in project",json.mri.atlas[i].project);
                    prj.add(json.mri.atlas[i].project);
                }
            }
            // check access to text annotations
            for(i in json.mri.annotations) {
                console.log("text annotation is in project",i);
                prj.add(i);
            }
            arr = [...prj].map(function(o){return req.db.get('project').findOne({
                        shortname:o,
                        backup: {$exists: 0}
                    })});

            Promise.all([...arr]).then(function(projects) {
                console.log("projects",projects);
                // set access to volume annotations
                for(i=json.mri.atlas.length-1;i>=0;i--) {
                    for(j=0;j<projects.length;j++) {
                        if(projects[j] && projects[j].shortname == json.mri.atlas[i].project) {
                            var access = checkAccess.toAnnotationByProject(projects[j],loggedUser);
                            var level = checkAccess.accessStringToLevel(access);
                            console.log("loggedUser,access,level:",loggedUser,access,level);
                            // check for 'view' access (level > 0)
                            if(level == 0) {
                                json.mri.atlas.splice(i,1);
                            }
                            break;
                        }
                    }
                }
                // set access to text annotations
                for(i in json.mri.annotations) {
                    for(j=0;j<projects.length;j++) {
                        if(projects[j] && projects[j].shortname == i) {
                            var access = checkAccess.toAnnotationByProject(projects[j],loggedUser);
                            var level = checkAccess.accessStringToLevel(access);
                            console.log("loggedUser,access,level:",loggedUser, access, level);
                            if(level == 0) {
                                delete json.mri.annotations[i];
                            }
                        }
                    }
                }

                // send data
                res.json(json);
            }).catch(function(err) {
                console.log("ERROR Cannot get db information:",err);
            });
        }
    }, function (err) {
        console.log("err:",err);
    });
}

var reset = function reset(req, res) {
    var myurl = req.query.url;
    
    console.log("body:",req.body);
    console.log("query:",req.query);
    console.log("params:",req.params);
    console.log(myurl,req.query.url);
    
    var hash = crypto.createHash('md5').update(myurl).digest('hex'),
        filename = url.parse(myurl).pathname.split("/").pop();
    
    atlasMakerServer.getBrainAtPath("/data/" + hash  + "/" + filename)
    .then(function getBrainAtPath_fromReset(mri) {
        req.db.get('mri').update({source:myurl,backup:{$exists:0}},{$set:{
            dim: mri.dim,
            pixdim: mri.pixdim,
            voxel2world: mri.v2w,
            worldOrigin: mri.wori
        }})
        .then(function () {
            res.send({
                dim: mri.dim,
                pixdim: mri.pixdim,
                voxel2world: mri.v2w,
                worldOrigin: mri.wori
            });
        });
    });
};

var mriController = function () {
    this.validator = validator;
    this.validator_post = validator_post;
    this.api_mri_get = api_mri_get;
    this.api_mri_post = api_mri_post;
    this.mri = mri;
    this.reset = reset;
};

module.exports = new mriController();

