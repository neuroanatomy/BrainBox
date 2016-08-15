"use strict";


//expressValidator = require('express-validator')

var validator = function (req, res, next) {
    //CHECK URL
    req.checkBody('url', 'please enter a valid URL')
        .isURL();

    var errors = req.validationErrors();
    console.log(errors);
    if (errors) {
        return res.send(errors).status(403).end();
    } else {
        return next();
    }
};

var other_validations = function(req, res, next) {
    //CHECK USER AUTHENTICITY
    if (!req.isAuthenticated()){
        return res.json({error:"Require Authentification"}).status(403).end();
    }
    //LOOK FOR THE MRI IN THE DATABASE
    req.db.get('mri').find({source:req.body.url})
    .then(function(json){
        if (json && req.files) {
            req.mri = json;

            console.log(req.files);
            console.log(json);
            next();
        }
        else {return res.send(errors).status(403).end();}
    })
}

var upload = function(req, res) {
    console.log("everything is in order")
    console.log(req.user.username);
    console.log(req.mri);
    console.log(req.files);
    console.log(req.body.url);

    //do the "getBrainAtPath thingy"
    //check for the validity with the niftii thingy

    //create the atlas object

    //update the database

    //return the full mri object ???
    res.json({hello:"world"}).status(200).end();
}

var uploadController = function () {
    this.validator = validator;
    this.other_validations = other_validations;
    this.upload = upload;
};

module.exports = new uploadController();

