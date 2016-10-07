var async = require("async");
var dateFormat = require('dateformat');
var validatorNPM = require('validator');
var async = require('async');

const createDOMPurify = require('dompurify');
const jsdom = require('jsdom');
const window = jsdom.jsdom('', {
  features: {
    FetchExternalResources: false, // disables resource loading over HTTP / filesystem
    ProcessExternalResources: false // do not execute JS within script blocks
  }
}).defaultView;
const DOMPurify = createDOMPurify(window);

var validator = function(req, res, next) {

	req.checkParams('projectName', 'incorrect project name').isAlphanumeric();
	// req.checkQuery('url', 'please enter a valid URL')
	// .isURL();
	
	// req.checkQuery('var', 'please enter one of the variables that are indicated')
	// .optional()
	// .matches("localpath|filename|source|url|dim|pixdim");						//todo: decent regexp
	var errors = req.validationErrors();
	if (errors) {
		res.send(errors).status(403).end();
	} else {
		return next();
	}
}

var isProjectObject = function(object)
{
    var goodOwner = false;
    var goodCollaborators = false;

    var ret = new Promise(function(resolve, reject){

        //object.brainboxURL
        if (object.brainboxURL && !validatorNPM.isURL(object.brainboxURL)) {
                delete object.brainboxURL;
        }

        //object.files
        if (object.files)
        {
            for (k in object.files)
            {
                if (!validatorNPM.isURL(object.files[k].source)
                    || !validatorNPM.isAlphanumeric(object.files[k].name))
                {
                    delete object.files[k];
                }
            }
        }

        //object.description
        if (object.description && !validatorNPM.isAlphanumeric(object.description))
        {
            delete object.description;
        }

        //object.name
        if (object.name && !validatorNPM.isAlphanumeric(object.name)) {
            delete object.name;
        }

        //object.collaborators
        //TODO check if the "anyone" collaborator is here
        async.filter(object.collaborators, function(itm, callback){
            if (!validatorNPM.matches(itm.collaboratorsAccess, "none|view|edit|add|remove")
                || !validatorNPM.matches(itm.annotationsAccess, "none|view|edit|add|remove")
                || !validatorNPM.matches(itm.filesAccess, "none|view|edit|add|remove"))
                callback("access does not match", false);
            else
                req.db.get('user').findOne({nickname:itm.nickname})
                .then(function(user){
                    if (!user)
                        callback("unknown user", false);
                    else
                        callback(null, true);
                });
        }, function(err, itm){
            if (!err)
            {
                object.collaborators = itm;
                goodCollaborators = true;
                if (goodOwner)
                    resolve(object);
            }
        });

        //object.owner * and object.shortname *
        if (!object.owner
            || !object.shortname
            || !validatorNPM.isAlphanumeric(object.shortname))
        {
            console.log("required fields are not here");
            reject(403, "required fields are not here");
        }
        else
        {
            req.db.get('user').find({"nickname":owner})
            .then(function(own){
                if (!own){reject(403, "unknown owner")}
                else {goodOwner = true;
                    if (goodCollaborators)
                        resolve(object);
                }
            });
        }
    });

    return ret
    // TODO object.annotations ??
}

var project = function(req, res) {
	var login=	(req.isAuthenticated())?
				("<a href='/user/"+req.user.username+"'>"+req.user.username+"</a> (<a href='/logout'>Log Out</a>)")
				:("<a href='/auth/github'>Log in with GitHub</a>");
	req.db.get('project').findOne({shortname:req.params.projectName},"-_id")
	.then(function(json) {
		if (json) {
			async.each(
				json.files.list,
				function(item,cb) {
					req.db.get('mri').find({source:item,backup:{$exists:0}},{name:1,_id:0})
					.then(function(obj) {
						if(obj[0]) {
                            /*
                                json.files.list[json.files.list.indexOf(item)]={
                                    source: item,
                                    name: obj[0].name
                                }
                            */
							json.files.list[json.files.list.indexOf(item)]=obj[0];
						} else {
							json.files.list[json.files.list.indexOf(item)]={
								source: item,
								name: ""
							}
						}
						cb();
					});
				},
				function() {
					res.render('project', {
						title: json.name,
						projectInfo: JSON.stringify(json),
						projectName: json.name,
						login: login
					});
				}
			);
		} else {
 			res.status(404).send("Project Not Found");
		}
	});
}

var api_project = function(req, res) {
	req.db.get('project').findOne({shortname:req.params.projectName,backup:{$exists:false}},"-_id")
	.then(function(json) {
		if(json) {
			if(req.query.var) {
				var i,arr=req.query.var.split("/");
				for(i in arr)
					json=json[arr[i]];
			}
			res.send(json);
		} else {
			res.send();
		}
	})
};

var settings = function(req, res) {
    var login = (req.isAuthenticated()) ?
                ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
                : ("<a href='/auth/github'>Log in with GitHub</a>");
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";

	req.db.get('project').findOne({shortname:req.params.projectName},"-_id")
	.then(function(json) {
		if(!json) {
		    json = {
                    name: "",
                    shortname: req.params.projectName,
                    url: "",
                    brainboxURL: "/project/"+req.params.projectName,
                    created: (new Date()).toJSON(),
                    owner: loggedUser,
                    collaborators: {
                        access: {
                            owner: loggedUser,
                            public: "edit",
                            whitelist: []
                        },
                        list: []
                    },
                    files: {
                        access: {
                            owner: loggedUser,
                            public: "edit",
                            whitelist: []
                        },
                        list: []
                    },
                    annotations: {
                        access: {
                            owner: loggedUser,
                            public: "edit",
                            whitelist: []
                        },
                        list: []
                    }
                };
        }

        async.each(
            json.files.list,
            function(item,cb) {
                req.db.get('mri').find({source:item,backup:{$exists:0}},{name:1,_id:0})
                .then(function(obj) {
                    if(obj[0]) {
                        json.files.list[json.files.list.indexOf(item)]={
                            source: item,
                            name: obj[0].name
                        }
                    } else {
                        json.files.list[json.files.list.indexOf(item)]={
                            source: item,
                            name: ""
                        }
                    }
                    cb();
                });
            },
            /**
             * @todo replace the nested async calls
             */
            function() {
                async.each(
                    json.collaborators.list,
                    function(item,cb) {
                        console.log("item",item);
                        req.db.get('user').find({nickname:item,backup:{$exists:0}},{name:1,_id:0})
                        .then(function(obj) {
                            console.log("user",obj);
                            if(obj[0]) {
                                json.collaborators.list[json.collaborators.list.indexOf(item)]={
                                    username: item,
                                    name: obj[0].name
                                }
                            } else {
                                json.files.list[json.files.list.indexOf(item)]={
                                    username: item,
                                    name: ""
                                }
                            }
                            cb();
                        });
                    },
                    function() {
                        var context = {
                            projectShortname: json.shortname,
                            owner: json.owner,
                            projectInfo: JSON.stringify(json),
                            login: login
                        };
                        res.render('projectSettings',context);
                    }
                );
            }
	    );
	});
};
var newProject = function(req, res) {
    var login = (req.isAuthenticated()) ?
                ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
                : ("<a href='/auth/github'>Log in with GitHub</a>");
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";

    var context = {
        title: "BrainBox: New Project",
        login: login
    };
    res.render('projectNew',context);
};


var post_project = function(req, res) {
    if (!req.isAuthenticated())
    {
        console.log("not Authenticated");
        res.status(403);
        res.json({})
    }

    console.log(req.params);
    console.log(req.body);
    var obj = JSON.parse(DOMPurify.sanitize(req.body.data));
    console.log("object: ",obj);
    //TODO Data validation obj

    isProjectObject(obj)
    .catch(function(error){
        console.log(error);
        res.status(300);
        res.json({"error":error});
    })
    .then(function(){
        //check if it already exists
        //then insert or update in the database
        req.db.get('project').findOne({"sortname":obj.shortname}).then(function(result){
        //check if the user has the rights to modify the project
        if (result)
            req.db.get('project').update({"sortname":obj.shortname}, obj).then(function(shit, othershit){
                console.log(shit);
                console.log(othershit);

                res.status(200);
                res.json({updated:true});
            });
        else
            req.db.get('project').insert(obj).then(function(shit, othershit){
                console.log(shit);
                console.log(othershit);

                res.status(200);
                res.json({inserted:true});
            });
        });
    });
}


var projectController = function(){
	this.validator = validator;
	this.api_project = api_project;
	this.project = project;
	this.settings = settings;
	this.newProject = newProject;
    this.post_project = post_project;
}

module.exports = new projectController();