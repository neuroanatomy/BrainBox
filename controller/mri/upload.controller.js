"use strict";

var atlasMakerServer = require('../../js/atlasMakerServer');
//expressValidator = require('express-validator')

var tokenDuration = 24 * (1000 * 3600); // in milliseconds

var validator = function (req, res, next) {
    //CHECK URL
    req.checkBody('url', 'please enter a valid URL')
        .isURL();

    /*
        Check for all these required fields:
        url: url
        atlas: a file
        atlasName: Alphanumeric string
        atlasProject: Alphanumeric string
        atlasLabelSet: One of the labels available inside the /public/labels/ directory
    */
    
    var errors = req.validationErrors();
    console.log(errors);
    if (errors) {
        return res.send(errors).status(403).end();
    } else {
        return next();
    }
};

var other_validations = function(req, res, next) {
    // CHECK USER AUTHENTICITY
    var token = req.body.token;
    req.db.get("log").findOne({"token":token})
        .then(function (obj) {
            if(obj) {
                // Check token expiry date
                var now = new Date();
                if(obj.expiryDate.getTime()-now.getTime() < tokenDuration) {
                    //Check that MRI exists in the database
                    // (for each mri, there may be many backup versions, we don't want those)
                    req.db.get('mri').find({source:req.body.url, backup: {$exists: false}})
                    .then(function (json) {
                        if (json && req.files) {
                            req.atlasUpload = {
                                mri: json,
                                username: obj.username
                            };
                            next();
                        }
                        else {return res.send(errors).status(403).end();}
                    })
                } else {
                    return res.send("ERROR: Token expired").status(403).end();
                }
            } else {
                return res.send("ERROR: Cannot find token").status(403).end();
            }                
        })
        .catch(function (err) {
            console.log("ERROR:",err);
            res.send().status(403).end();
        });
}

var upload = function(req, res) {
    var username = req.atlasUpload.username;
    var url = req.body.url;
    var mri = req.atlasUpload.mri;
    var atlasName = req.body.atlasName;
    var atlasProject = req.body.atlasProject;
    var atlasLabelSet = req.body.atlasLabelSet;
    var files = req.files;

    console.log("Everything is in order");
    console.log("username:",username);
    console.log("url:", url);
    console.log("mri:", mri);
    console.log("atlasName:", atlasName);
    console.log("atlasProject:", atlasProject);
    console.log("atlasLabelSet:", atlasLabelSet);
    console.log("files:", files);

    // Check that there is not an atlas with this atlasName and atlasProject
    // ==> something like this should be empty: db.get("mri").find({"mri.atlas.$.name":atlasName, "mri.atlas.$.project":atlasProject})
    
    // Check that the dimensions of the nifti atlas are the same as its parent mri
    var atlas = {};
    atlasMakerServer.readAtlasNifti(files[0].path, atlas);
    console.log(atlas);

    //create the atlas object
    var date = new Date();
    var atlasMetadata = {
        name: atlasName,
        project: atlasProject,
        access: "Read/Write", 
        created: date.toJSON(), 
        modified: date.toJSON(), 
        filename: Math.random().toString(36).slice(2)+".nii.gz",	// automatically generated filename
        originalname: files[0].originalname,
        labels: atlasLabelSet,
        owner: username,
        type: "volume"
    };

    /*
    //update the database

    //return the full mri object ???

    */
    res.json({hello:"world"}).status(200).end();
}

var token = function token(req, res) {
    if (req.isAuthenticated()) {
        var obj = {},
            a = Math.random().toString(36).slice(2),
            b = Math.random().toString(36).slice(2),
            token, now, expiryDate;
        // token duration is set to 1 h in milliseconds
        // generate a random token
        obj.token = a + b;
        // expiration date: now plus tokenDuration milliseconds
        now = new Date();
        obj.expiryDate = new Date(now.getTime() + tokenDuration);
        // record the username
        obj.username = req.user.username;
        // store it in the database for the user
        req.db.get("log").insert(obj);
        
        /*
            // schedule its removal or log them forever?
            setTimer(function () {
                req.db.get("log").remove(obj);
            }, tokenDuration);
        */
        
        res.json(obj);
    } else {
        res.redirect('/');
    }
}

var uploadController = function () {
    this.validator = validator;
    this.other_validations = other_validations;
    this.upload = upload;
    this.token = token;
};

module.exports = new uploadController();

