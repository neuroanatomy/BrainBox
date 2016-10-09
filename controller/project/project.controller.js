var async = require("async");
var dateFormat = require('dateformat');
var validatorNPM = require('validator');
var async = require('async');
var checkAccess = require("../../js/checkAccess.js");

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
	// .matches("localpath|filename|source|url|dim|pixdim"); //todo: decent regexp
	var errors = req.validationErrors();
	if (errors) {
		res.send(errors).status(403).end();
	} else {
		return next();
	}
}

/**
 * @func isProjectObject
 * @param {Object} req Express req object
 * @param {Object} res Express res object
 * @param {Object} object Project definition object
 * @todo object.annotations??
 */
var isProjectObject = function(req,res,object) {
    var goodOwner = false;
    var goodCollaborators = false;

    var pr = new Promise(function(resolve, reject) {
        var i, k, flag, arr;
        var allowed="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890_- ".split("");
        
        // 1. Synchronous checks
        //----------------------
        
        // files
        if (object.files) {
            for (k in object.files.list) {
                if (!validatorNPM.isURL(object.files.list[k].source)) {
                    reject({success:false,error:"Invalid file URL"});
                    return;
                }
                if(!validatorNPM.isWhitelisted(object.files.list[k].name, allowed)) {
                    reject({success:false,error:"Invalid file name"});
                    return;
                }
                
                /**
                 * @todo This is a momentary fix: list object contains only source (URL). It should also record the name change in the mri db
                 */
                 object.files.list[k]=object.files.list[k].source;
            }
        }
        console.log("files ok");

        // description
        if (object.description && !validatorNPM.isWhitelisted(object.description, allowed)) {
            reject({success:false,error:"Invalid project description"});
            return;
            // delete object.description;
        }
        console.log("description ok");

        // name
        if (object.name && !validatorNPM.isWhitelisted(object.name, allowed)) {
            reject({success:false,error:"Invalid name"});
            return;
            //delete object.name;
        }
        console.log("name ok");

        // check that owner and shortname are present
        if (!object.owner || !object.shortname) {
            reject({success:false,error:"Invalid owner or project shortname, not present"});
            return;
        }
        console.log("owner and project shortname present")
        
        // check that shortname is alphanumeric
        if(!validatorNPM.isAlphanumeric(object.owner) || !validatorNPM.isAlphanumeric(object.shortname)) {
            reject({success:false,error:"Invalid owner or project shortname, not alphanumeric"});
            return;
        }
        console.log("owner and project shortname present")

        // check that access values are valid
        flag=true; // validation ok
        //arr=object.collaborators.access.whitelist;
        arr=object.collaborators.list;
        for(i=0;i<arr.length;i++) {
            if (validatorNPM.matches(arr[i].access.collaborators, "none|view|edit|add|remove") === false ) {
                console.log("collaborators",arr[i]);
                flag = false;
                break;
            }
        }
        //arr=object.annotations.access.whitelist;
        for(i=0;i<arr.length;i++) {
            if (validatorNPM.matches(arr[i].access.annotations, "none|view|edit|add|remove") === false ) {
                console.log("annotations",arr[i]);
                flag = false;
                break;
            }
        }
        //arr=object.files.access.whitelist;
        for(i=0;i<arr.length;i++) {
            if (validatorNPM.matches(arr[i].access.files, "none|view|edit|add|remove") === false ) {
                console.log("files",arr[i]);
                flag = false;
                break;
            }
        }
        if(flag === false) {
            reject({success:false,error:"Access values are invalid"});
            return;
        }
        console.log("Access values ok");
                
        
        // 2. Asynchronous checks
        //-----------------------
        
        arr=[];
        arr.push(req.db.get('user').find({nickname:object.owner}));
        for(i in object.collaborators.list) {
            arr.push(req.db.get('user').find({nickname:object.collaborators.list[i].username}));
        }
        Promise.all(arr).then(function(val) {
            var i, notFound=false;
            for(i=0;i<val.length;i++) {
                if(val[i].length === 0) {
                    notFound=true;
                    break;
                }
            }
            if(notFound === true) {
                reject({success:false,error:"Users are invalid, one or more do not exist"});
                return;
            }
            
            // All checks are successful, resolve the promisse
            console.log({success:true,message:"All checks ok. Project object looks valid"});
            resolve(object);
        });
    });

    return pr;
}

/**
 * @function project
 * @desc Render the project page GUI
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
var project = function(req, res) {
	var login=	(req.isAuthenticated())?
				("<a href='/user/"+req.user.username+"'>"+req.user.username+"</a> (<a href='/logout'>Log Out</a>)")
				:("<a href='/auth/github'>Log in with GitHub</a>");
	req.db.get('project').findOne({shortname:req.params.projectName,backup:{$exists:0}},"-_id")
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

/**
 * @function api_project
 * @desc Writes json data for a project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @result A json object with project data
 */
var api_project = function(req, res) {
	req.db.get('project').findOne({shortname:req.params.projectName,backup:{$exists:0}},"-_id")
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

/**
 * @function settings
 * @desc Render the settings page GUI
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
var settings = function(req, res) {
    var login = (req.isAuthenticated()) ?
                ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
                : ("<a href='/auth/github'>Log in with GitHub</a>");
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";

	req.db.get('project').findOne({shortname:req.params.projectName,backup:{$exists:0}},"-_id")
	.then(function(json) {
		if(json) {
            // check that the logged user has access to view this project
            if(checkAccess.toProject(json, loggedUser, "view") === false) {
                res.status(401).send("Authorization required");
                return;
            }
		} else {
		    json = {
                name: "",
                shortname: req.params.projectName,
                url: "",
                brainboxURL: "/project/"+req.params.projectName,
                created: (new Date()).toJSON(),
                owner: loggedUser,
                collaborators: {
                    /*
                    access: {
                        owner: loggedUser,
                        public: "edit",
                        whitelist: []
                    },
                    */
                    list: [
                        {
                            userID: 'anyone',
                            access: {
                                collaborators: 'view',
                                annotations: 'edit',
                                files: 'view'
                            }
                        }
                    ]
                },
                files: {
                    /*
                    access: {
                        owner: loggedUser,
                        public: "edit",
                        whitelist: []
                    },
                    */
                    list: []
                },
                annotations: {
                    /*
                    access: {
                        owner: loggedUser,
                        public: "edit",
                        whitelist: []
                    },
                    */
                    list: []
                }
            };
        }

        // find source URL and name for each of the files in the project
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
                // find username and name for each of the collaborators in the project
                async.each(
                    json.collaborators.list.map(function(o){return o.userID}), // convert array of objects into array of userIDs
                    function(item,cb) {
                        console.log("item",item);
                        req.db.get('user').find({nickname:item,backup:{$exists:0}},{name:1,_id:0})
                        .then(function(obj) {
                            console.log("user",obj);
                            var i, found = false;
                            for(i=0;i<json.collaborators.list.length;i++) {
                                if(json.collaborators.list[i].userID === item) {
                                    found = true;
                                    break;
                                }
                            }
                            if(obj[0]) {    // name found
                                json.collaborators.list[i].username=item;
                                json.collaborators.list[i].name=obj[0].name;
                            } else {    // name not found: set to empty
                                json.collaborators.list[i].username=item;
                                json.collaborators.list[i].name="";
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

/**
 * @function newProject
 * @desc Render the page with the GUI for entering a new project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
var newProject = function(req, res) {
    var login = (req.isAuthenticated()) ?
                ("<a href='/user/" + req.user.username + "'>" + req.user.username + "</a> (<a href='/logout'>Log Out</a>)")
                : ("<a href='/auth/github'>Log in with GitHub</a>");
    var loggedUser = req.isAuthenticated()?req.user.username:"anonymous";

    if(loggedUser === "anonymous" ) {
        var context = {
            title: "BrainBox: New Project",
            functionality: "create a new project",
            login: login
        };
        res.render('askForLogin',context);
    } else {
        var context = {
            title: "BrainBox: New Project",
            login: login
        };
        res.render('projectNew',context);
    }
};

/**
 * @function post_project
 * @desc Receives data for creating a new project or updating the settings of an existing one
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
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
    console.log("object: ",JSON.stringify(obj));
    //TODO Data validation obj

    isProjectObject(req,res,obj)
    .then(function(obj) {
        console.log("obj",obj);
        req.db.get('project').find({shortname:obj.shortname, backup:{$exists:false}})
            .then(function (result) {
                console.log("result",result);
                if(result.length) {
                    // project exists, save update
                    console.log("updating...");
                    req.db.get('project').update({shortname:obj.shortname},{$set:{backup:true}},{multi:true})
                        .then(function () {
                            req.db.get('project').insert(obj);
                            res.json({success:true,message:"Project settings updated"});
                        });
                } else {
                    // new project, insert
                    console.log("inserting...");
                    req.db.get('project').insert(obj);
                    res.json({success:true,message:"New project inserted"});
                }
            });
    })
    .catch(function(error) {
        console.log(error);
        res.status(300);
        res.json({"error":error});
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