var async = require("async");
var dateFormat = require('dateformat');

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
                    name: "Untitled",
                    shortname: "untitled",
                    url: "/",
                    brainboxURL: "/project/",
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


var projectController = function(){
	this.validator = validator;
	this.api_project = api_project;
	this.project = project;
	this.settings = settings;
	this.newProject = newProject;
}

module.exports = new projectController();