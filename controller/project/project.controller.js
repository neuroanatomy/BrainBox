var async = require("async");
var url = require('url');
var crypto = require('crypto');
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
        var allowed="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890.,_- ".split("");
        
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
            }
        }
        console.log("> files ok");

        // description
        if (object.description && !validatorNPM.isWhitelisted(object.description, allowed)) {
            reject({success:false,error:"Invalid project description"});
            return;
            // delete object.description;
        }
        console.log("> description ok");

        // name
        if (object.name && !validatorNPM.isWhitelisted(object.name, allowed)) {
            reject({success:false,error:"Invalid name"});
            return;
            //delete object.name;
        }
        console.log("> name ok");

        // check that owner and shortname are present
        if (!object.owner || !object.shortname) {
            reject({success:false,error:"Invalid owner or project shortname, not present"});
            return;
        }
        console.log("> owner and project shortname present")
        
        // check that shortname is alphanumeric
        if(!validatorNPM.isAlphanumeric(object.owner) || !validatorNPM.isAlphanumeric(object.shortname)) {
            reject({success:false,error:"Invalid owner or project shortname, not alphanumeric"});
            return;
        }
        console.log("> owner and project shortname present")

        // convenience array for collaborator checks
        arr=object.collaborators.list;

        // check that the 'anyone' user is present
        flag=false;
        for(i=0;i<arr.length;i++) {
            if(arr[i].userID === 'anyone') {
                flag = true;
                break;
            }
        }
        if(flag === false) {
            reject({success:false,error:"User 'anynone' is not present"});
            return;
        }
        
        // check that collaborator's access values are valid
        flag=true;
        for(i=0;i<arr.length;i++) {
            if (validatorNPM.matches(arr[i].access.collaborators, "none|view|edit|add|remove") === false ) {
                // console.log("collaborators",arr[i]);
                flag = false;
                break;
            }
            if (validatorNPM.matches(arr[i].access.annotations, "none|view|edit|add|remove") === false ) {
                // console.log("annotations",arr[i]);
                flag = false;
                break;
            }
            if (validatorNPM.matches(arr[i].access.files, "none|view|edit|add|remove") === false ) {
                // console.log("files",arr[i]);
                flag = false;
                break;
            }
        }
        if(flag === false) {
            reject({success:false,error:"Access values are invalid"});
            return;
        }
        console.log("> Access values ok");
        
        // check that the list of annotations contains at least 1 volume-type entry
        flag = false;
        for(i=0;i<object.annotations.list.length;i++) {
            if(object.annotations.list[i].type == "volume") {
                flag = true;
                break;
            }
        }
        if(flag == false) {
            reject({success:false,error:"Annotations must contain at least 1 volume-type entry"});
            return;
        }
                
        
        // 2. Asynchronous checks
        //-----------------------
        
        /**
         * @todo Replace the .find calls by .findOne. The check if(val[i].length === 0)
         *       should change to if(val[i])
         */
        arr=[];
        arr.push(req.db.get('user').find({nickname:object.owner}));
        for(i in object.collaborators.list) {
            arr.push(req.db.get('user').find({nickname:object.collaborators.list[i].userID}));
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
            // console.log({success:true,message:"All checks ok. Project object looks valid"});
            resolve(object);
        });
    });

    return pr;
}

/**
 * @func getFilesSlice
 * @desc Get a slice of the mri files in a project
 * @param {String} projectShortname Shortname of the project containing the files
 * @param {integer} start Start index of the file slice
 * @param {integer} length Number of files to include in the slice
 */
function getFilesSlice(req, projShortname, start, length) {
    console.log(projShortname,start,length);
	return new Promise(function (resolve, reject) {
	    start = parseInt(start);
	    length = parseInt(length);
		console.log("inside the promise for project, start, length",projShortname, start, length);
		req.db.get('project').findOne({shortname:projShortname,backup:{$exists:0}},"-_id")
		.then(function(json) {
            console.log("got json");
			if (json) {
			    console.log("json is not empty");
				var list = json.files.list, newList = [], arr = [];
				var i;
				
				start = Math.min(start, list.length);
				length = Math.min(length, list.length-start);
				
				console.log("end:",start+length);
				for(i=start;i<start+length;i++) {
					var item = list[i];
					arr.push(req.db.get('mri').findOne({source:item,backup:{$exists:0}},{name:1,_id:0}));
				}
				console.log("an array of db requests will be processed, length:",arr.length);
				Promise.all(arr)
				.then(function(values) {
					var j;
					for(j=0;j<values.length;j++) {
						if(values[j]) {
							newList[j] = values[j];
						} else {
							newList[j] = {
								source: list[start+j],
								name: ""
							};
						}
						console.log(newList[j]);
					}
					resolve(newList);
				})
				.catch(function(err) {
				    console.log("ERROR:",err);
				    reject();
				});
			} else {
			    console.log("json is empty");
			}
		}).catch(function(err) {
		    console.log("ERROR:",err);
			reject();
		});
	});
				
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

    // store return path in case of login
    req.session.returnTo = req.originalUrl;
	
	req.db.get('project').findOne({shortname:req.params.projectName,backup:{$exists:0}},"-_id")
	.then(function(json) {
		if (json) {
            json.files.list = [];
            res.render('project', {
                title: json.name,
                projectInfo: JSON.stringify(json),
                projectName: json.name,
                login: login
            });
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
 * @function api_projectFiles
 * @desc Writes json data for a slice of project files
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 * @result A json object with project data
 */
/**
 * @todo Check access rights for this route
 */
var api_projectFiles = function(req, res) {

    var projShortname = req.params.projectName;
    var start = req.query.start;
    var length = req.query.length;
    
    console.log("projShortname:",projShortname, "start:",start, "length:",length);
    getFilesSlice(req,projShortname, start, length)
    .then(function(list) {
        res.send(list);    
    })
    .catch(function(err) {
        res.send();
    });
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

    // store return path in case of login
    req.session.returnTo = req.originalUrl;

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
                    list: []
                },
                annotations: {
                    list: []
                }
            };
        }

        // find source URL and name for each of the files in the project
        async.each(
            json.files.list,
            function(item,cb) {
                req.db.get('mri').findOne({source:item,backup:{$exists:0}},{name:1,_id:0})
                .then(function(obj) {
                    if(obj) {
                        json.files.list[json.files.list.indexOf(item)]={
                            source: item,
                            name: obj.name
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
                        // console.log("item",item);
                        req.db.get('user').findOne({nickname:item,backup:{$exists:0}},{name:1,_id:0})
                        .then(function(obj) {
                            // console.log("user",obj);
                            var i, found = false;
                            for(i=0;i<json.collaborators.list.length;i++) {
                                if(json.collaborators.list[i].userID === item) {
                                    found = true;
                                    break;
                                }
                            }
                            if(obj) {    // name found
                                json.collaborators.list[i].username=item;
                                json.collaborators.list[i].name=obj.name;
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

    // store return path in case of login
    req.session.returnTo = req.originalUrl;

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

function insertMRInames(req,res,list) {
    // insert MRI names, but only if they don't exist
    for(var i=0;i<list.length;i++) {
        var name=list[i].name;
        var source=list[i].source;
        var filename = url.parse(source).pathname.split("/").pop();
        
        // it there's no name, continue to the next mri
        if(!name)
            continue;
        
        // check if the mri entry already exists
        (function(na,so,fi) { // without a closure, only the last name in the list is used and repeated
            req.db.get('mri').findOne({source:so,backup:{$exists:0}})
            .then(function (mri) {
                var hash = crypto.createHash('md5').update(so).digest('hex');
                
                // if mri exists, and has no name, insert the name
                if(!mri) {
                    mri = {
                        filename: fi,
                        source: so,
                        url: "/data/" + hash + "/",
                        included: (new Date()).toJSON(),
                        owner: req.user.username,
                        mri: {
                            brain: fi,
                            atlas: [{
                                owner: req.user.username,
                                created: (new Date()).toJSON(),
                                modified: (new Date()).toJSON(),
                                type: 'volume',
                                filename: 'Atlas.nii.gz',
                                labels: 'foreground.json'
                            }]
                        }
                    };
                } else {
                    delete mri["_id"];
                }
                mri.modified=(new Date()).toJSON();
                mri.modifiedBy = req.user.username;
                
                /* Use this if you want imported names to overwrite existing ones */
                mri.name = na;
                
                /* Use this if you want imported names to be used only if no previous name exists */
                /*
                if(!mri.name) {
                    mri.name=na;
                }
                */
                
                // sanitise json
                mri=JSON.parse(DOMPurify.sanitize(JSON.stringify(mri))); // sanitize works on strings, not objects

                // update and insert
                req.db.get('mri').update({source:mri.source},{$set:{backup:true}},{multi:true})
                    .then(function () {
                        req.db.get('mri').insert(mri);
                    });
            });
        })(name,source,filename);
    }
}

/**
 * @function post_project
 * @desc Receives data for creating a new project or updating the settings of an existing one
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
var post_project = function(req, res) {
    if (!req.isAuthenticated())
    {
        console.log("ERROR not Authenticated");
        res.status(403);
        res.json({error:"error",message:"User not authenticated"});
        return;
    }

    var obj = JSON.parse(DOMPurify.sanitize(req.body.data));
    var k;

    /**
     * @todo Replace .find call by .findOne. if(result.length) should change
     *       to if(result)
     */

    isProjectObject(req,res,obj)
    .then(function(obj) {
        req.db.get('project').find({shortname:obj.shortname, backup:{$exists:false}})
            .then(function (result) {
                
                // update/insert project
                if(result.length) {
                    // project exists, save update
                    console.log("updating...");
                    req.db.get('project').update({shortname:obj.shortname},{$set:{backup:true}},{multi:true})
                        .then(function () {
                            obj.modified=(new Date()).toJSON();
                            obj.modifiedBy = req.user.username;
                            req.db.get('project').insert(obj);
                            
                            // insert MRI names if provided
                            console.log("insert mri names");
                            insertMRInames(req,res,obj.files.list);
                            
                            // reformat file list
                            console.log("reformat file list");
                            for(k=0;k<obj.files.list.length;k++)
                                obj.files.list[k]=obj.files.list[k].source;
                            
                            console.log("success: true");
                            res.json({success:true,message:"Project settings updated"});
                        });
                } else {
                    // new project, insert
                    console.log("inserting...");
                    req.db.get('project').insert(obj);

                    console.log("insert mri names");
                    insertMRInames(req,res,obj.files.list);

                    // reformat file list
                    console.log("reformat file list");
                    for(k=0;k<obj.files.list.length;k++)
                        obj.files.list[k]=obj.files.list[k].source;

                    console.log("success: true");
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
/**
 * @function delete_project
 * @desc Delete a project
 * @param {Object} req Req object from express
 * @param {Object} res Res object from express
 */
var delete_project = function(req, res) {
    var shortname;
    var loggedUser;
    
    if (!req.isAuthenticated()) {
        console.log("The user is not logged in");
        res.json({success:false,message:"User not authenticated"});
        return;
    }
    loggedUser = req.isAuthenticated()?req.user.username:"anonymous";

    shortname = req.params.projectName;
    req.db.get('project').findOne({shortname: shortname, backup: {$exists: 0}})
    .then(function(project) {
        if(project) {
            console.log(">> project does exist");
            if(checkAccess.toProject(project, loggedUser, "remove") == true ) {
                console.log(">> user does have remove rights");
                
                var query = {}, update = {};
                query["mri.annotations."+shortname] = {$exists:1};
                query["backup"] = {$exists:0};
                update["$unset"] = {};
                update["$unset"]["mri.annotations."+shortname] = "";
                
                Promise.all([
                    req.db.get('project').remove({_id:project._id, backup:{$exists:false}}),
                    req.db.get('mri').update(query, update, {multi: true}),
                    req.db.get('mri').update({"mri.atlas":{$elemMatch:{project:shortname}}}, {$pull:{"mri.atlas":{project:shortname}}}, {multi: true})
                ])
                .then(function () {
                    console.log(">> project and project-related annotations removed");
                    res.json({success:true, message:"Project deleted"});
                })
                .catch(function(err) {
                    console.log("ERROR: cannot remove project or project-related annotations");
                    res.json({success:false ,message:"Unable to delete. Try again later"});
                });
            } else {
                console.log("WARNING: user does not have remove rights");
                res.json({success:false,message:"The user is not allowed to delete this project"});
            }
        } else {
            console.log("WARNING: project does not exist");
            res.json({success:false,message:"Unable to delete. Project does not exist in the database"});
        }
            
    }).catch(function(err) {
        console.log("ERROR: unable to query the db");
        res.json({success:false,message:"Unable to delete. Try again later"});
    });
}


var projectController = function(){
	this.validator = validator;
	this.api_project = api_project;
	this.api_projectFiles = api_projectFiles;
	this.project = project;
	this.settings = settings;
	this.newProject = newProject;
    this.post_project = post_project;
    this.delete_project = delete_project;
}

module.exports = new projectController();