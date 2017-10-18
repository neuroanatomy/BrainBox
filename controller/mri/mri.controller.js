'use strict';

const crypto = require('crypto');
const url = require('url');
const fs = require('fs');
const request = require('request');
const path = require('path');
const atlasMakerServer = require('../../js/atlasMakerServer');
const checkAccess = require('../../js/checkAccess.js');
const dataSlices = require('../../js/dataSlices.js');

const downloadQueue = [];

// ExpressValidator = require('express-validator')

const validator = function (req, res, next) {
    console.log('Query validator');
    console.log('body:', req.body);
    console.log('query:', req.query);

    if (!req.query.url) {
        return next();
    }
    req.checkQuery('url', 'please enter a valid URL')
            .isURL();

        // Req.checkQuery('var', 'please enter one of the variables that are indicated')
        // .optional()
        // .matches("localpath|filename|source|url|dim|pixdim");    // todo: decent regexp
    const errors = req.validationErrors();
    console.log('errors:', errors);
    if (errors) {
        res.send(errors).status(403).end();
    } else {
        return next();
    }
};

const validator_post = function (req, res, next) {
    req.checkBody('url', 'please enter a valid URL')
        .isURL();

    // Req.checkQuery('var', 'please enter one of the variables that are indicated')
    // .optional()
    // .matches("localpath|filename|source|url|dim|pixdim");    // todo: decent regexp
    const errors = req.validationErrors();
    console.log('errors:', errors);
    if (errors) {
        res.send(errors).status(403).end();
    } else {
        return next();
    }
};

/* Download MRI file
--------------------- */
/**
 * @todo Change this function callback into a promise
 */
function downloadMRI(myurl, req, res, callback) {
    console.log('downloadMRI');
    const hash = crypto.createHash('md5').update(myurl).digest('hex');

    req.db.get('mri').findOne({source: myurl, backup: {$exists: 0}})
    .then(mridb => {
        console.log('mridb:', mridb);
        let filename;
        if (!mridb || !mridb.filename) {
            filename = url.parse(myurl).pathname.split('/').pop();
        } else {
            filename = mridb.filename;
        }
        let dest = req.dirname + '/public/data/' + hash + '/' + filename;
        console.log('   source:', myurl);
        console.log('     hash:', hash);
        console.log(' filename:', filename);
        console.log('     dest:', dest);

        if (!fs.existsSync(req.dirname + '/public/data/' + hash)) {
            fs.mkdirSync(req.dirname + '/public/data/' + hash, '0777');
        }
        let newFilename, newDest, len,
            cur = 0;

        request({uri: myurl, followAllRedirects: true})
        .on('error', err => {
            console.log('ERROR in downloadMRI', err);
            callback({error: err});
        })
        .on('response', res => {
            const href = res.request.uri.href;
            const contentDisp = res.headers['content-disposition'];
            if (contentDisp && /^attachment/.test(contentDisp)) {
                newFilename = contentDisp.split('filename=')[1].split(';')[0].replace(/"/g, '');
            } else {
                newFilename = path.basename(url.parse(href).path);
            }
            console.log('filename:', newFilename);
            const arr = dest.split('/');
            arr.pop();
            arr.push(newFilename);
            newDest = arr.join('/');
            console.log('new dest:', newDest);
            len = parseInt(res.headers['content-length'], 10);
            console.log('file length:', len);
        })
        .on('data', chunk => {
    //      Body += chunk;
            cur += chunk.length;
            console.log('downloaded:', cur, '/', len, newFilename);
            downloadQueue[myurl].cur = cur;
            downloadQueue[myurl].len = len;
    //      Obj.innerHTML = "Downloading " + (100.0 * cur / len).toFixed(2) + "% " + (cur / 1048576).toFixed(2) + " mb\r" + ".<br/> Total size: " + total.toFixed(2) + " mb";
        })
        .pipe(fs.createWriteStream(dest))
        .on('close', res => {
            console.log('new:', newFilename, newDest);

            fs.renameSync(dest, newDest);
            filename = newFilename;
            dest = newDest;

            // NOTE: getBrainAtPath has to be called with a client-side path like "/data/[md5hash]/..."
            atlasMakerServer.getBrainAtPath('/data/' + hash + '/' + filename)
            .then(mri => {
                // Create json file for new dataset
                const ip = req.headers['x-forwarded-for'] ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    req.connection.socket.remoteAddress;
                const username = (req.isAuthenticated()) ? req.user.username : ip;
                const json = {
                    filename,
                    success: true,
                    source: myurl,
                    url: '/data/' + hash + '/',
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
            .catch(err => {
                console.log('ERROR Cannot get brain at path /data/' + hash + '/' + filename + ': ', err);
                callback({error: 'Can\'t get brain'});
            });
        });
    });
}
const mri = function (req, res) {
    const login = (req.isAuthenticated()) ?
                ('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)') :
                ('<a href=\'/auth/github\'>Log in with GitHub</a>');
    const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';

    // Store return path in case of login
    req.session.returnTo = req.originalUrl;

    const myurl = req.query.url;
    const hash = crypto.createHash('md5').update(myurl).digest('hex');
    console.log('Receive GET, query:', myurl, hash);

    req.db.get('mri').findOne({source: myurl, backup: {$exists: 0}}, {_id: 0})
    .then(json => {
        if (!json) {
            const obj = {
                source: myurl
            };

            res.render('mri', {
                title: obj.name || 'BrainBox',
                params: JSON.stringify(req.query),
                mriInfo: JSON.stringify(obj),
                login
            });
        } else {
            // If the json object exists, and has annotations, configure the access to them
            if (!json.mri.atlas) {
                json.mri.atlas = [];
            }
            let i, j, k, ii,
                prj = new Set(),
                arr = [];
            // Check access to volume annotations
            for (i = 0; i < json.mri.atlas.length; i++) {
                if (json.mri.atlas[i].project) {
                    prj.add(json.mri.atlas[i].project);
                }
            }
            // Check access to text annotations
            for (i in json.mri.annotations) {
                prj.add(i);
            }
            arr = [...prj].map(o => {
                return req.db.get('project').findOne({
                    shortname: o,
                    backup: {$exists: 0}
                });
            });
            Promise.all([...arr]).then(projects => {
                checkAccess.filterAnnotationsByProjects(json.mri, projects, loggedUser);

                // Set access to text annotations
                for (i in json.mri.annotations) {
                    for (j = 0; j < projects.length; j++) {
                        if (projects[j] && projects[j].shortname == i) {
                            const access = checkAccess.toAnnotationByProject(projects[j], loggedUser);
                            const level = checkAccess.accessStringToLevel(access);
                            if (level > 0) {
                                for (k in json.mri.annotations[i]) {
                                    json.mri.annotations[i][k].access = access;
                                }
                            } else {
                                delete json.mri.annotations[i];
                            }
                        }
                    }
                }

                // Send data
                res.render('mri', {
                    title: json.name || 'BrainBox',
                    params: JSON.stringify(req.query),
                    mriInfo: JSON.stringify(json),
                    login
                });
            }).catch(err => {
                console.log('ERROR Cannot get db information:', err);
            });
        }
    }, err => {
        console.log('err 241:', err);
    });
};

const api_mri_post = function (req, res) {
    const myurl = req.body.url;
    const hash = crypto.createHash('md5').update(myurl).digest('hex');
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    req.db.get('mri').findOne({source: myurl, backup: {$exists: 0}}, {_id: 0})
        .then(json => {
            // Determine whether we need to download the data from the source
            let doDownload = false;

            // If client is not requesting a specific MRI variable
            if (!req.body.var) {
                // If the json object is empty, download
                if (!json) {
                    console.log('No DB entry for MRI: download');
                    doDownload = true;
                } else {
                    // If the json object exists, but there's no file, download
                    const filename = json.filename || url.parse(myurl).pathname.split('/').pop();
                    const path = req.dirname + '/public/data/' + hash + '/' + filename;
                    if (fs.existsSync(path) == false) {
                        console.log('No MRI file in server: download');
                        doDownload = true;
                    } else
                    // If the json object exists, there's a file, but no .dim object, download
                    if (!json.dim) {
                        // If(debug>1) console.log("No dim[] field in DB entry: download");
                        doDownload = true;
                    }
                }
            }

            if (doDownload === true) {
                if (downloadQueue[myurl]) {
                    if (downloadQueue[myurl].success == true) {
                        const info = JSON.parse(JSON.stringify(downloadQueue[myurl]));
                        delete downloadQueue[myurl];
                        res.json(info);
                    } else {
                        console.log('>>', downloadQueue[myurl], myurl);
                        res.json(downloadQueue[myurl]);
                    }
                } else {
                    console.log('Start download:');
                    downloadQueue[myurl] = {success: 'downloading', cur: 0, len: 1};
                    downloadMRI(myurl, req, res, obj => {
                        if (obj.error == undefined) {
                            console.log('Download succeeded');
                            req.db.get('mri').insert(obj);
                            obj.success = true;
                            downloadQueue[myurl] = obj;
                        } else {
                            console.log('Download failed:', obj);
                            downloadQueue[myurl] = {success: 'error'};
                        }
                    });

                    res.json(downloadQueue[myurl]);
                }
            } else {
                // Return a specific variable, or the complete json object
                console.log('Send the data to the client. End of transaction.');
                if (req.body.var) {
                    let i,
                        arr = req.body.var.split('/');
                    for (i in arr) {
                        json = json[arr[i]];
                    }
                }
                res.json(json);
            }
        }, err => {
            console.log('ERROR:', err);
            res.json({success: false});
        });
};

/*

Token=054x9gjgfdukozkv25cfgh9f6rzpuc9h1fbwb2o83vondpwrk9

*/

const api_mri_get = function (req, res) {
    const myurl = req.query.url;
    let loggedUser = 'anonymous';
    if (req.isAuthenticated()) {
        loggedUser = req.user.username;
    } else
    if (req.isTokenAuthenticated) {
        loggedUser = req.tokenUsername;
    }

    // If query does not contain a specific mri, send paginated list of mris
    if (!myurl) {
        if (req.query.page === undefined) {
            res.send({error: 'Specify the \'page\' parameter'});
            return;
        }

        // Display access-filtered list of mris
        const page = Math.max(0, parseInt(req.query.page));
        const nItemsPerPage = 20;

        dataSlices.getFilesSlice(req, page * nItemsPerPage, nItemsPerPage)
        .then(values => {
            res.json(values);
        });

        return;
    }

    req.db.get('mri').findOne({source: myurl, backup: {$exists: 0}}, {_id: 0})
    .then(json => {
        if (!json) {
            res.status(404).json({});
        } else {
            // If the json object exists, and has annotations, configure the access to them
            console.log('check access rights');
            if (!json.mri.atlas) {
                json.mri.atlas = [];
            }
            let i, j, k, ii,
                prj = new Set(),
                arr = [];
            // Check access to volume annotations
            for (i = 0; i < json.mri.atlas.length; i++) {
                if (json.mri.atlas[i].project) {
                    console.log('mri is in project', json.mri.atlas[i].project);
                    prj.add(json.mri.atlas[i].project);
                }
            }
            // Check access to text annotations
            for (i in json.mri.annotations) {
                console.log('text annotation is in project', i);
                prj.add(i);
            }
            arr = [...prj].map(o => {
                return req.db.get('project').findOne({
                    shortname: o,
                    backup: {$exists: 0}
                });
            });

            Promise.all([...arr]).then(projects => {
                console.log('projects', projects);
                // Set access to volume annotations
                for (i = json.mri.atlas.length - 1; i >= 0; i--) {
                    for (j = 0; j < projects.length; j++) {
                        if (projects[j] && projects[j].shortname == json.mri.atlas[i].project) {
                            var access = checkAccess.toAnnotationByProject(projects[j], loggedUser);
                            var level = checkAccess.accessStringToLevel(access);
                            console.log('loggedUser,access,level:', loggedUser, access, level);
                            // Check for 'view' access (level > 0)
                            if (level == 0) {
                                json.mri.atlas.splice(i, 1);
                            }
                            break;
                        }
                    }
                }
                // Set access to text annotations
                for (i in json.mri.annotations) {
                    for (j = 0; j < projects.length; j++) {
                        if (projects[j] && projects[j].shortname == i) {
                            var access = checkAccess.toAnnotationByProject(projects[j], loggedUser);
                            var level = checkAccess.accessStringToLevel(access);
                            console.log('loggedUser,access,level:', loggedUser, access, level);
                            if (level == 0) {
                                delete json.mri.annotations[i];
                            }
                        }
                    }
                }

                // Send data
                res.json(json);
            }).catch(err => {
                console.log('ERROR Cannot get db information:', err);
            });
        }
    }, err => {
        console.log('err:', err);
    });
};

const reset = function reset(req, res) {
    const myurl = req.query.url;
    const hash = crypto.createHash('md5').update(myurl).digest('hex');

    req.db.get('mri').findOne({source: myurl, backup: {$exists: 0}})
    .then(mridb => {
        const filename = mridb.filename;
        atlasMakerServer.getBrainAtPath('/data/' + hash + '/' + filename)
        .then(mri => {
            req.db.get('mri').update({source: myurl, backup: {$exists: 0}}, {$set: {
                dim: mri.dim,
                pixdim: mri.pixdim,
                voxel2world: mri.v2w,
                worldOrigin: mri.wori
            }})
            .then(() => {
                res.send({
                    dim: mri.dim,
                    pixdim: mri.pixdim,
                    voxel2world: mri.v2w,
                    worldOrigin: mri.wori
                });
            })
            .catch(err => {
                console.log('ERROR:', err);
                res.send(err).status(403).end();
            });
        })
        .catch(err => {
            console.log('ERROR:', err);
            res.send(err).status(403).end();
        });
    })
    .catch(err => {
        console.log('ERROR:', err);
        res.send(err).status(403).end();
    });
};

const mriController = function () {
    this.validator = validator;
    this.validator_post = validator_post;
    this.api_mri_get = api_mri_get;
    this.api_mri_post = api_mri_post;
    this.mri = mri;
    this.reset = reset;
};

module.exports = new mriController();

