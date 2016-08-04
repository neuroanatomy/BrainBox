/*
	Atlas Maker Server
	Roberto Toro, 25 July 2014
	
	Launch using > node atlasMakerServer.js
*/

var	debug=1;

var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var mustacheExpress = require('mustache-express');
var crypto = require('crypto');

var http = require('http'),
	server = http.createServer(),
	url = require('url'),
	WebSocketServer = require('ws').Server,
	websocket,
	port = 8080;
var os=require("os");
var fs=require("fs");
var zlib=require("zlib");
var fileType=require("file-type");
var request=require('request');
var jpeg=require('jpeg-js'); // jpeg-js library: https://github.com/eugeneware/jpeg-js
var keypress = require('keypress');

var mongo = require('mongodb');
var monk = require('monk');
var db = monk('localhost:27017/brainbox');

var db_url=fs.readFileSync(__dirname+"/public/js/db_url.txt","utf8");
var	Atlases=[];
var Brains=[];
var	Users=[];
var	usrsckts=[];
var	uidcounter=1;
var niiTag=bufferTag("nii",8);
var mghTag=bufferTag("mgh",8);
var jpgTag=bufferTag("jpg",8);
var enterCommands=0;
var UndoStack=[];

console.log("atlasMakerServer.js");
console.log(new Date());
setInterval(function(){console.log(new Date())},60*60*1000); // time mark every 60 minutes
console.log("free memory",os.freemem());

// init web server
var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();
app.engine('mustache', mustacheExpress());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'mustache');
app.use(favicon(__dirname + '/public/favicon.png'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

/*
app.use('/', routes);
app.use('/users', users);
*/

//{-----passport
var session = require('express-session');
var passport = require('passport');
var GithubStrategy = require('passport-github').Strategy;
passport.use(new GithubStrategy(
	JSON.parse(fs.readFileSync(__dirname+"/github-keys.json")),
	function(accessToken,refreshToken,profile,done){return done(null, profile);}
));
app.use(session({secret: "a mi no me gusta la sémola"}));
app.use(passport.initialize());
app.use(passport.session());
// add custom serialization/deserialization here (get user from mongo?) null is for errors
passport.serializeUser(function(user, done) {done(null, user);});
passport.deserializeUser(function(user, done) {done(null, user);});
// Simple authentication middleware. Add to routes that need to be protected.
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {return next();}
  else res.redirect('/');
}
app.get('/secure-route-example',ensureAuthenticated,function(req, res){res.send("access granted");});
app.get('/logout', function(req, res){
	console.log('logging out');
	req.logout();
	res.redirect('/');
});
app.get('/loggedIn', function(req, res){
	if (req.isAuthenticated())
		res.send({loggedIn:true,username:req.user.username});
	else
		res.send({loggedIn:false});
});
// start the GitHub Login process
app.get('/auth/github',passport.authenticate('github'));
app.get('/auth/github/callback',
	passport.authenticate('github',{failureRedirect:'/'}),
	function(req, res) {
		// successfully loged in. Check if user is new
		db.get('user').findOne({nickname:req.user.username},"-_id")
		.then(function(json) {
			if(!json) {
				// insert new user
				json={
					name: req.user.displayName,
					nickname: req.user.username,
					url:req.user._json.blog,
					brainboxURL:"http://brainbox.dev/user/"+req.user.username,
					avatarURL:req.user._json.avatar_url,
					joined: (new Date()).toJSON()
				}
				db.get('user').insert(json);
			}
		});
		res.redirect('/');
	});
//-----}

// GUI routes
app.get('/', function(req,res) { // /auth/github
	var login=	(req.isAuthenticated())?
				("<a href='/user/"+req.user.username+"'>"+req.user.username+"</a> (<a href='/logout'>Log Out</a>)")
				:("<a href='/auth/github'>Log in with GitHub</a>");
	res.render('index', {
		title: 'BrainBox',
		login: login
	});
});

app.get('/mri', function(req, res) {
	var login=	(req.isAuthenticated())?
				("<a href='/user/"+req.user.username+"'>"+req.user.username+"</a> (<a href='/logout'>Log Out</a>)")
				:("<a href='/auth/github'>Log in with GitHub</a>");
	var myurl = req.query.url;
	var hash = crypto.createHash('md5').update(myurl).digest('hex');
	
	console.log("i'll query the db");
	db.get('mri').find({url:"/data/"+hash+"/"}, {fields:{_id:0},sort:{$natural:-1},limit:1})
	.then(function(json) {
		json=json[0];
		console.log("query finished");
		if(json) {
			console.log("a known mri file:",json);
			res.render('mri', {
				title: json.name||'Untitled MRI',
				params: JSON.stringify(req.query),
				mriInfo: JSON.stringify(json),
				login: login
			});
		} else {
			console.log("an unknown mri file");

			console.log("check if its folder exists");
			if (!fs.existsSync(__dirname+"/public/data/"+hash)) {
				console.log("didn't exist: creating it");
				fs.mkdirSync(__dirname+"/public/data/"+hash,0777);
			}
			
			console.log("downloading the file");
			var myurl = req.query.url;
			var filename = url.parse(req.query.url).pathname.split("/").pop();
			var file = fs.createWriteStream(__dirname+"/public/data/"+hash+"/"+filename,{mode:0777});
			console.log(filename);
			var requ  = http.get(myurl, function(response) {
				response.pipe(file).on('close', function() {
					console.log("file completely downloaded");
					console.log("loading it");
					getBrainAtPath(__dirname+"/public/data/"+hash+"/"+filename,function(mri) {
						console.log("file loaded, get info");
						// create json file for new dataset
						var ip = req.headers['x-forwarded-for'] || 
								 req.connection.remoteAddress || 
								 req.socket.remoteAddress ||
								 req.connection.socket.remoteAddress;
						var username=(req.isAuthenticated())?req.user.username:ip
						var json = {
							localpath: __dirname+"/public/data/"+hash+"/"+filename,
							filename: filename,
							success: true,
							source: myurl,
							url: "/data/"+hash+"/",
							included: (new Date()).toJSON(),
							dim: mri.dim,
							pixdim: mri.pixdim,
							owner:username,
							mri: {
								brain: filename,
								atlas: [{
									owner:username,
									created: (new Date()).toJSON(),
									modified: (new Date()).toJSON(),
									access: 'Read/Write',
									type: 'volume',
									filename: 'Atlas.nii.gz',
									labels: 'http://brainbox.dev/labels/foreground.json'
								}]
							}
						};
						console.log("insert metadata in the database");
						db.get('mri').insert(json);
						res.render('mri', {
							title: json.name||'Untitled MRI',
							params: JSON.stringify(req.query),
							mriInfo: JSON.stringify(json),
							login: login
						});
					});
				});
			});			
		}
	}, function(err) {
		console.error(err);
	});
});
app.get('/user/:id', function(req, res) {
	var login=	(req.isAuthenticated())?
				("<a href='/user/"+req.user.username+"'>"+req.user.username+"</a> (<a href='/logout'>Log Out</a>)")
				:("<a href='/auth/github'>Log in with GitHub</a>");
	var username=req.params.id;
	db.get('user').findOne({nickname:username},"-_id")
	.then(function(json) {
		// gather user information on mri, atlas and projects
		var mri,atlas,projects;
		db.get('mri').find({owner:username,backup:{$exists:false}})
		.then(function(arr) {
			mri=arr;
			return db.get('mri').find({"mri.atlas":{$elemMatch:{owner:username}},backup:{$exists:false}});
		})
		.then(function(arr) {
			atlas=arr;
			return db.get('project').find({owner:username,backup:{$exists:false}});
		})
		.then(function(arr) {
			projects=arr;
			
			var context={
				title: req.params.id,
				userInfo: JSON.stringify(json),
				login: login,
				atlasFiles:[]
			}
			context.MRIFiles=mri.map(function(o){return {
				url:o.source,
				name:o.name,
				volDimensions:o.dim.join(" x ")
			}});
			atlas.map(function(o){
				var i,arr=[];
				for(i in o.mri.atlas) context.atlasFiles.push({
					url:o.source,
					parentName:o.name,
					name:o.mri.atlas[i].name,
					project:o.mri.atlas[i].project,
					projectURL:'http://brainbox.dev/project/braincatalogue',
					modified:o.mri.atlas[i].modified
				});
			});
			context.projects=projects.map(function(o){return {
				project:o.name,
				projectURL:o.brainboxURL,
				numFiles:o.files.length,
				numCollaborators:o.collaborators.length,
				owner:o.owner,
				modified:o.modified
			}});
			context.username=json.name;
			context.nickname=json.nickname;
			context.joined=json.joined;
			context.numMRI=context.MRIFiles.length;
			context.numAtlas=context.atlasFiles.length;
			context.numProjects=context.projects.length;
			context.avatar="<img src='"+json.avatarURL+"'/>";
			res.render('user',context);
		});
	});
});
app.get('/project/:id', function(req, res) {
	var login=	(req.isAuthenticated())?
				("<a href='/user/"+req.user.username+"'>"+req.user.username+"</a> (<a href='/logout'>Log Out</a>)")
				:("<a href='/auth/github'>Log in with GitHub</a>");
	db.get('project').findOne({shortname:req.params.id},"-_id")
	.then(function(json) {
		res.render('project', {
			title: json.name,
			projectInfo: JSON.stringify(json),
			projectName: json.name,
			login: login
		});
	});
});

// API routes
app.get('/api/user/:name', function(req, res) {
	db.get('user').findOne({nickname:req.params.name,backup:{$exists:false}},"-_id")
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
	});
});
app.get('/api/project/:name', function(req, res) {
	db.get('project').findOne({shortname:req.params.name,backup:{$exists:false}},"-_id")
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
});
app.get('/api/mri', function(req, res) {
	var myurl=req.query.url;
	var hash = crypto.createHash('md5').update(myurl).digest('hex');
	// shell equivalent: db.mri.find({source:"http://braincatalogue.org/data/Pineal/P001/t1wdb.nii.gz"}).limit(1).sort({$natural:-1})
	
	db.get('mri').find({url:"/data/"+hash+"/",backup:{$exists:false}}, "-_id", {sort:{$natural:-1},limit:1})
	.then(function(json) {
		json=json[0];
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
	}, function(err) {
		console.error(err);
	});
});
app.get('/api/getLabelsets', function(req, res) {
	var i,arr=fs.readdirSync(__dirname+"/public/labels/"),info=[];
	for(i in arr) {
		var json=JSON.parse(fs.readFileSync(__dirname+"/public/labels/"+arr[i]));
		info.push({
			name:json.name,
			source:"http://brainbox.dev/labels/"+arr[i]
		});
	}
	res.send(info);
});
app.post('/api/log', function(req, res) {
	var json=req.body;
	json.ip=req.headers['x-forwarded-for'] || 
			req.connection.remoteAddress || 
			req.socket.remoteAddress ||
			req.connection.socket.remoteAddress;
	json.date=(new Date()).toJSON();
	db.get('log').insert(json);
	res.send();
});

// init web socket server
initSocketConnection();
server.on('request', app);
server.listen(port, function () { console.log('Listening on ' + server.address().port,server.address()) });

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers
// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}
// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;


function displayAtlases() {
	console.log("\n"+Atlases.filter(function(o){return o!=undefined}).length+" Atlases:");
	for(var i in Atlases) {
		var sum=numberOfUsersConnectedToAtlas(Atlases[i].dirname,Atlases[i].name);
		console.log("Atlases["+i+"] path:"+Atlases[i].dirname+Atlases[i].name+", "+sum+" users connected");
	}
	for(var i in Atlases) {
		console.log(Atlases[i]);
	}
}
function displayBrains() {
	console.log("\n"+Brains.length+" Brains:");
	for(var i=0;i<Brains.length;i++) {
		var sum=numberOfUsersConnectedToMRI(Brains[i].path);
		console.log("Brains["+i+"].path="+Brains[i].path+", "+sum+" users connected");
	}
	for(var i=0;i<Brains.length;i++) {
		console.log(Brains[i]);
	}
}
function displayUsers() {
	console.log("\n"+usrsckts.filter(function(o){return o!=undefined}).length+" usrsckts:");
	for(var i in usrsckts) {
		console.log("usrsckts["+i+"].uid=",usrsckts[i].uid);
		console.log("Users["+usrsckts[i].uid+"]:");
		console.log(Users[usrsckts[i].uid]);
	}
}
keypress(process.stdin);
process.stdin.on('keypress', function (ch, key) {
	if(key) {
		if(key.name=='c' && key.ctrl) {
			console.log("Exit.");
			process.exit();
		}
		if(key.name=='escape') {
			enterCommands=!enterCommands;
			console.log("enterCommands: "+enterCommands);
		}
		if(enterCommands==0) {
			if(key.name=='return')
				console.log();
			else
				process.stdout.write(key.sequence);
		} else {
			switch (key.name) {
				case 'a':
					displayAtlases();
					break;
				case 'b':
					displayBrains();
					break;
				case 'u':
					displayUsers();
					break;
			}
		}
	}
});
process.stdin.setRawMode(true);
process.stdin.resume();

function bufferTag(str,sz) {
	var buf=new Buffer(sz).fill(32);
	buf.write(str);
	return buf;
}

//========================================================================================
// Web socket
//========================================================================================
function getUserId(socket) {
	for(var i in usrsckts) {
		if(socket==usrsckts[i].socket)
			return usrsckts[i].uid;
	}
	return -1;
}
function removeUser(socket) {
	for(var i in usrsckts) {
		if(socket==usrsckts[i].socket) {
			delete usrsckts[i];
			break;
		}
	}
}
function numberOfUsersConnectedToMRI(path) {
	var sum=0;

	if(path==undefined)
		return sum;
		
	for(var i in Users) {
		if(Users[i]==undefined) {
			console.log("ERROR: When counting the number of users connected to MRI, user uid "+i+" was not defined");
			continue;
		}
		if(Users[i].dirname==undefined) {
			console.log("ERROR: A user uid "+i+" dirname is unknown");
			continue;
		}
		if(Users[i].mri==undefined) {
			console.log("ERROR: A user uid "+i+" MRI is unknown");
			continue;
		}
		if(Users[i].dirname+Users[i].mri==path)
			sum++;
	}
	/* sum--; */
	return sum;
}
function unloadMRI(path) {
	if(debug)
		console.log(new Date(), "[unload MRI]",path);
		
	for(var i in Brains) {
		if(Brains[i].path==path) {
			Brains.splice(i,1);
			console.log("free memory",os.freemem());
			break;
		}
	}
}

function numberOfUsersConnectedToAtlas(dirname,atlasFilename) {
	var sum=0;

	if(dirname==undefined || atlasFilename==undefined)
		return sum;
		
	for(i in Users) {
		if(Users[i]==undefined) {
			console.log("ERROR: When counting the number of users connected to the atlas, user uid "+i+" was not defined");
			continue;
		}
		if(Users[i].dirname==undefined) {
			console.log("ERROR: A user uid "+i+" dirname is unknown");
			continue;
		}
		if(Users[i].atlasFilename==undefined) {
			console.log("ERROR: A user uid "+i+" atlasFilename is unknown");
			continue;
		}
		if(Users[i].dirname==dirname && Users[i].atlasFilename==atlasFilename)
			sum++;
	}
	return sum;
}
function unloadAtlas(dirname,atlasFilename) {
	if(debug)
		console.log(new Date(), "[unload atlas]",dirname,atlasFilename);
		
	var i;
	for(i in Atlases) {
		if(Atlases[i].dirname==dirname && Atlases[i].name==atlasFilename) {
			saveNifti(Atlases[i]);
			clearInterval(Atlases[i].timer);
			delete Atlases[i];
			console.log("free memory",os.freemem());
			break;
		}
	}
}
function initSocketConnection() {
	// WS connection
	var host = "ws://localhost:8080";
	
	if(debug) console.log(new Date(),"[initSocketConnection] host:",host);
	
	try {
		websocket = new WebSocketServer({ server: server });
		// websocket = new WebSocketServer({port:8080});
		websocket.on("connection",function(s) {
			console.log("[connection open]");
			console.log("remote_address",s.upgradeReq.connection.remoteAddress);
			var	usr={"uid":"u"+uidcounter++,"socket":s};
			usrsckts.push(usr);
			console.log("User id "+usr.uid+" connected, total: "+usrsckts.filter(function(o){return o!=undefined}).length+" users");
			
			// send data from previous users
			sendPreviousUserDataMessage(usr.uid);
			
			s.on('message',function(msg) {
				if(debug>=2) console.log("[connection: message]",msg);
				
				var uid=getUserId(this);
				var data={};
				
				if(msg instanceof Buffer) { // Handle binary data: a user uploaded an atlas file
					data.data=msg;
					data.type="atlas";
				} else
					data=JSON.parse(msg);
				data.uid=uid;
				
				// integrate paint messages
				switch(data.type) {
					case "intro":
						receiveUserDataMessage(data,this);
						break;
					case "paint":
						receivePaintMessage(data);
						break;
					case "requestSlice":
						receiveRequestSliceMessage(data,this);
						break;
					case "saveMetadata":
						receiveSaveMetadataMessage(data,this);
						break;
					case "atlas":
						receiveAtlasFromUserMessage(data,this);
						break;
					case "echo":
						console.log("ECHO: '"+data.msg+"' from user "+data.username);
						break;
				}

				// broadcast
				var n=0;
				for(var i in websocket.clients) {
					// i-th user
					var uid=getUserId(websocket.clients[i]);
					
					// do not auto-broadcast
					if(data.uid==uid) {
						if(debug>1) console.log("no broadcast to self");
						continue;
					}
					
					// do not broadcast to unknown users
					if( Users[data.uid]==undefined || Users[uid]==undefined) {
						if(debug) console.log("User "+data.uid+": "+(Users[data.uid]==undefined)?"undefined":"defined");
						if(debug) console.log("User "+uid+": "+(Users[uid]==undefined)?"undefined":"defined");
						continue;
					}
					
					if( Users[uid].iAtlas!=Users[data.uid].iAtlas && data.type!="chat" && data.type!="intro" ) {
						if(debug) console.log("no broadcast to user "+Users[uid].username+" [uid: "+uid+"] of atlas "+Users[uid].specimenName+"/"+Users[uid].atlasFilename);
						continue;
					}
					
					if(data.type=="atlas") {
						sendAtlasToUser(data.data,websocket.clients[i],false);
					} 
					else {
						websocket.clients[i].send(JSON.stringify(data));
					}
					n++;
				}
				if(debug>=2) console.log("broadcasted to",n,"users");
			});
			
			s.on('close',function(msg) {
				console.log(new Date(),"[connection: close]");
				console.log("usrsckts length",usrsckts.filter(function(o){return o!=undefined}).length);
				for(var i in usrsckts)
					if(usrsckts[i].socket==s)
						console.log("user",usrsckts[i].uid,"is closing connection");
				var uid=getUserId(this);
				console.log("User ID "+uid+" is disconnecting");
				if(Users[uid]==undefined) {
					console.log("<BUG ALERT> User ID "+uid+" is undefined.");
					console.log("Users:",Users);
					console.log("usrsckts:",usrsckts);
					console.log("</BUG ALERT>");
				} else if(Users[uid].dirname) {
					console.log("User was connected to MRI "+ Users[uid].dirname+Users[uid].mri);
					console.log("User was connected to atlas "+ Users[uid].dirname+Users[uid].atlasFilename);
				} else {
					console.log("WARNING: dirname was not defined");
				}
				
				// count how many users remain connected to the MRI after user leaves
				sum=numberOfUsersConnectedToMRI(Users[uid].dirname+Users[uid].mri);
				sum-=1; // subtract current user
				if(sum) {
					console.log("There remain "+sum+" users connected to that MRI");
				} else {
					console.log("No user connected to MRI "
								+ Users[uid].dirname
								+ Users[uid].mri+": unloading it");
					unloadMRI(Users[uid].dirname+Users[uid].mri);
				}

				// count how many users remain connected to the atlas after user leaves
				sum=numberOfUsersConnectedToAtlas(Users[uid].dirname,Users[uid].atlasFilename);
				sum-=1; // subtract current user
				if(sum) {
					console.log("There remain "+sum+" users connected to that atlas");
				} else {
					console.log("No user connected to atlas "
								+ Users[uid].dirname
								+ Users[uid].atlasFilename+": unloading it");
					unloadAtlas(Users[uid].dirname,Users[uid].atlasFilename);
				}
				
				// remove the user from the list
				delete Users[uid];
				removeUser(this);
				
				// send user disconnect message to remaining users
				sendDisconnectMessage(uid);
				
				// display the total number of connected users
				var	nusers=0;
				for(var i in Users) nusers++;
				if(debug) console.log("user",uid,"closed connection");
				if(debug) console.log(nusers+" connected");
			});
		});
	} catch (ex) {
		console.log(new Date(),"ERROR: Unable to create a server",ex);
	}
}
function receivePaintMessage(data) {
	if(debug>=2) console.log("[receivePaintMessage]");

	var	msg=data.data;
	var uid=data.uid;	// user id
	var	user=Users[uid];			// user data
	var c=msg.c;				// command
	var x=msg.x;		// x coordinate
	var y=msg.y;		// y coordinate
	var undoLayer=getCurrentUndoLayer(user);	// current undoLayer for user
	
	// console.log("PaintMessage u",user,"user",user);
	paintxy(uid,c,x,y,user,undoLayer);
}
function receiveRequestSliceMessage(data,user_socket) {
	if(debug>=2) console.log("[receiveRequestSliceMessage]");

	var uid=data.uid;		// user id
	var	user=Users[uid];	// user data
	var brainPath=user.dirname+user.mri;
	var view=user.view;		// user view
	var slice=parseInt(user.slice);	// user slice
	
	var brain=getBrainAtPath(__dirname+"/public"+brainPath,function(data){
		sendSliceToUser(data,view,slice,user_socket);
	});

	if(brain) {
		sendSliceToUser(brain,view,slice,user_socket);
	}
}
function receiveSaveMetadataMessage(data,user_socket) {
	if(debug>=1) console.log("[receiveSaveMetadataMessage]");

	var uid=data.uid;		// user id
	console.log("received save metadata message from user uid:",uid);
	var json=data.metadata;
	console.log("the metadata was json:",json);
	json.modified=(new Date()).toJSON();
	console.log("the modification date was:",json.modified);
	json.modifiedBy=Users[uid].username||"unknown";
	console.log("and the user that modified it:",json.modifiedBy);
	console.log("going to insert this json object in the db");
	// mark previous one as backup
	db.get('mri').update({url:json.url,backup:{$exists:false}},{$set:{backup:true}},{multi:true});
	// insert new one
	db.get('mri').insert(json);
}
function receiveAtlasFromUserMessage(data,user_socket) {
	if(debug>=1) console.log("[receiveAtlasFromUserMessage]");
	zlib.inflate(data.data,function(err,atlasData){
		// Save current atlas
		var uid=data.uid;		// user id
		var iAtlas=Users[uid].iAtlas;
		var atlas=Atlases[iAtlas];
		saveNifti(atlas);

		// Replace current atlas with new atlas
		atlas.data=atlasData;
	});
}
function getBrainAtPath(brainPath,callback) {
	if(debug) console.log("[getBrainAtPath]");
	var i;
	for(i=0;i<Brains.length;i++) {
		if(Brains[i].path==brainPath) {
			if(debug)
				console.log("brain already loaded");
			return Brains[i].data;
		}
	}
	if(debug) {
		console.log("loading brain at",brainPath);
	}	
	loadBrainCompressed(brainPath,function(data) {
		var brain={path:brainPath,data:data};
		Brains.push(brain);
		callback(data); // callback: sendSliceToUser
	});
		
	return null;
}
function unloadUnusedBrains() {
	var i;
	for(i=0;i<Brains.length;i++) {
		var sum=numberOfUsersConnectedToMRI(Brains[i].path);

		if(sum==0) {
			console.log("No user connected to MRI "+Brains[i].path+": unloading it");
			unloadMRI(Brains[i].path);
		}
	}
}
function unloadUnusedAtlases() {
	var i;
	for(i in Atlases) {
		var sum=numberOfUsersConnectedToAtlas(Atlases[i].dirname,Atlases[i].name);
		if(sum==0) {
			console.log("No user connected to Atlas "+Atlases[i].dirname+Atlases[i].name+": unloading it");
			unloadAtlas(Atlases[i].dirname,Atlases[i].name);
		}
	}
}
function sendSliceToUser(brain,view,slice,user_socket) {
	if(debug>1) console.log("[sendSliceToUser]");
	
	try {
		var jpegImageData=drawSlice(brain,view,slice);
		var length=jpegImageData.data.length+jpgTag.length;
		var bin=Buffer.concat([jpegImageData.data,jpgTag],length);
		user_socket.send(bin, {binary: true,mask:false});
	} catch(e) {
		console.log(new Date(),"ERROR: Cannot send slice to user");
	}
}

function receiveUserDataMessage(data,user_socket) {
	if(debug>1) console.log("[receiveUserDataMessage]");
	

	var uid=data.uid;
	var user=data.user;
	var	i,atlasLoadedFlag,firstConnectionFlag,switchingAtlasFlag;
	
	firstConnectionFlag=(Users[uid]==undefined);
	
	user.uid=uid;

	if(data.description=="sendAtlas") {
		// 1. Check if the atlas the user is requesting has not been loaded
		atlasLoadedFlag=false;
		
		// check whether user is switching atlas.
		switchingAtlasFlag=false;
		if(Users[uid]) {
			if((Users[uid].atlasFilename!=user.atlasFilename)||(Users[uid].dirname!=user.dirname)) {
				switchingAtlasFlag=true;
			}
		}
		
		for(i in Atlases)
			if(Atlases[i].dirname==user.dirname && Atlases[i].name==user.atlasFilename) {
				atlasLoadedFlag=true;
				break;
			}
		user.iAtlas=atlasLoadedFlag?i:Atlases.length;	// value i if it was found, or last available if it wasn't
	
		// 2. Send the atlas to the user (load it if required)
		if(atlasLoadedFlag) {
			if(firstConnectionFlag || switchingAtlasFlag) {
				// send the new user our data
				sendAtlasToUser(Atlases[i].data,user_socket,true);
			}
		} else {
			// The atlas requested has not been loaded before:
			// Load the atlas s/he's requesting
			addAtlas(user,function(atlas){sendAtlasToUser(atlas,user_socket,true)});
		}
	}
	
	// 3. Update user data
	// If the user didn't have a name (wasn't logged in), but now has one,
	// display the name in the log
	if(user.hasOwnProperty('username')) {
		if(Users[uid]==undefined)
			console.log("No User yet for id "+uid);
		else
		if(!Users[uid].hasOwnProperty('username')) {
			console.log("User "+user.username+", id "+uid+" logged in");
		}
	}
	if(Users[uid]==null) Users[uid]={};
	for(var prop in user) Users[uid][prop]=user[prop];

	// 4. Update number of users connected to atlas
	if(firstConnectionFlag) {
		var sum=0;
		for(i in Users)
			if(Users[i].dirname==user.dirname && Users[i].atlasFilename==user.atlasFilename)
				sum++;
		console.log(sum+" user"+((sum==1)?" is":"s are")+" connected to the atlas "+user.dirname+user.atlasFilename);
	}	

	// 5. Unload unused data (the check is only done if new data has been added)
	if(data.description=="sendAtlas") {
		unloadUnusedBrains();
		unloadUnusedAtlases();
	}
}

/*
 send new user information to old users,
 and old users information to new user.
*/
function sendPreviousUserDataMessage(new_uid) {
	if(debug) console.log("[sendPreviousUserDataMessage]");
	
	var new_user=Users[new_uid];
	var msg,found=false;
	try {
		var i,n=0;
		for(i in websocket.clients) {
			var uid=getUserId(websocket.clients[i]);
			if(new_uid==uid) {
				new_socket=websocket.clients[i];
				found=true;
				break;
			}
		}
		if(debug) console.log("[sendPreviousUserDataMessage] check if socket already exists:",found);
		
		if(found) {
			for(i in websocket.clients) {
				if(websocket.clients[i]==new_socket)
					continue;
				var uid=getUserId(websocket.clients[i]);
				var msg=JSON.stringify({type:"intro",user:Users[uid],uid:uid,description:"old user intro to new user"});
				new_socket.send(msg);
				n++;
			}
			if(debug) console.log("send user data from "+n+" users");
		} else {
			console.log("ERROR: new user socket not found");
		}
		
	} catch (ex) {
		console.log("ERROR: Unable to sendPreviousUserDataMessage",ex);
	}
}
function sendAtlasToUser(atlasdata,user_socket,flagCompress) {
	if(debug>=1) console.log("[sendAtlasToUser]");
	
	if(flagCompress) {
		zlib.gzip(atlasdata,function(err,atlasdatagz) {
			try {
				user_socket.send(Buffer.concat([atlasdatagz,niiTag]), {binary: true, mask: false});
			} catch(e) {
				console.log(new Date(),"ERROR: Cannot send atlas data to user");
			}
		});
	} else {
		try {
			user_socket.send(Buffer.concat([atlasdata,niiTag]), {binary: true, mask: false});
		} catch(e) {
			console.log(new Date(),"ERROR: Cannot send atlas data to user");
		}
	}
}
function broadcastPaintVolumeMessage(msg,user) {
	if(debug) console.log("> broadcastPaintVolumeMessage()");
	
	try {
		var n=0,i,msg=JSON.stringify({"type":"paintvol","data":msg});
		for(i in websocket.clients) {
			var uid=getUserId(websocket.clients[i]);
			if( Users[uid]!=undefined &&
				Users[uid].iAtlas!=user.iAtlas )
				continue;
			websocket.clients[i].send(msg);
			n++;
		}
		if(debug) console.log("paintVolume message broadcasted to "+n+" users");
		
	} catch (ex) {
		console.log("ERROR: Unable to broadcastPaintVolumeMessage",ex);
	}
}
function sendDisconnectMessage(uid) {
	if(debug) console.log("> sendDisconnectMessage()");
	
	try {
		var n=0,i,msg=JSON.stringify({type:"disconnect",uid:uid});
		for(i in websocket.clients) {
			websocket.clients[i].send(msg);
			n++;
		}
		if(debug) console.log("user disconnect message sent to "+n+" users");
		
	} catch (ex) {
		console.log("ERROR: Unable to sendDisconnectMessage",ex);
	}
}

//========================================================================================
// Load & Save
//========================================================================================
function addAtlas(user,callback) {
	if(debug) console.log("[add atlas]");

	var atlas={
		name:user.atlasFilename,
		specimen:user.specimenName,
		dirname:user.dirname,
		dim:user.dim
	};

	console.log("User requests atlas "+atlas.name+" from "+atlas.dirname);
	
	loadAtlasNifti(atlas,user.username,callback);

	Atlases.push(atlas);
	user.iAtlas=Atlases.indexOf(atlas);

	atlas.timer=setInterval(function(){saveNifti(atlas)},60*60*1000); // 60 minutes
}
function loadNifti(nii) {
	if(debug>=1) console.log("[loadNifti]");

	var	vox_offset=352;
	var	sizeof_hdr=nii.readUInt32LE(0);
	var	dimensions=nii.readUInt16LE(40);
	
	var mri={};
	mri.hdr=nii.slice(0,vox_offset);
	mri.dim=[];
	mri.dim[0]=nii.readUInt16LE(42);
	mri.dim[1]=nii.readUInt16LE(44);
	mri.dim[2]=nii.readUInt16LE(46);
	mri.datatype=nii.readUInt16LE(70);
	mri.pixdim=[];
	mri.pixdim[0]=nii.readFloatLE(80);
	mri.pixdim[1]=nii.readFloatLE(84);
	mri.pixdim[2]=nii.readFloatLE(88);
	vox_offset=nii.readFloatLE(108);	
	
	switch(mri.datatype) {
		case 2: // UCHAR
			mri.data=nii.slice(vox_offset);
			break;
		case 4: // SHORT
			var tmp=nii.slice(vox_offset);
			mri.data=new Int16Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
				mri.data[j]=tmp.readInt16LE(j*2);
			break;
		case 8: // INT
			var tmp=nii.slice(vox_offset);
			mri.data=new Uint32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
				mri.data[j]=tmp.readUInt32LE(j*4);
			break;
		case 16: // FLOAT
			var tmp=nii.slice(vox_offset);
			mri.data=new Float32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
				mri.data[j]=tmp.readFloatLE(j*4);
			break;
		default:
			console.log("ERROR: Unknown dataType: "+mri.datatype);
	}
	
	return mri;
}
function loadAtlasNifti(atlas,username,callback)
{
	if(debug>=1) console.log("[loadAtlasNifti]");
		
	// Load nifty label
	
	var path=__dirname+"/public"+atlas.dirname+atlas.name;
	var datatype=2;
	var	vox_offset=352;
	
	if(!fs.existsSync(path)) {
		console.log("Atlas "+path+" does not exists. Create a new one");
/*
To create this buffer, I used an hex editor to dump the 1st 352 bytes of a
nii file, and converted them to decimal using:
gawk 'BEGIN{s="5C 01 ...";split(s,a," ");for(i=1;i<=352;i++)printf"%s,",strtonum("0x"a[i])}'
*/
		atlas.hdr=new Buffer([
			92,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,230,0,
			44,1,14,1,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,8,0,0,0,0,0,128,191,195,245,168,
			62,195,245,168,62,195,245,168,62,0,0,0,0,0,0,128,63,0,0,128,63,0,0,128,63,0,0,176,67,0,0,0,
			0,0,0,0,0,0,0,0,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
			// AtlasMaker, braincatalogue.org
			65,116,108,97,115,77,97,107,101,114,44,32,98,114,97,105,110,99,97,116,97,108,111,103,117,101,46,111,114,103,
			0,0,0,0,0,0,0,0,0,0,0,
			0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
			0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,128,0,0,128,63,0,0,0,0,144,194,93,66,164,112,
			125,194,195,245,40,194,195,245,168,190,0,0,0,128,0,0,0,0,144,194,93,66,0,0,0,128,195,245,168,
			62,0,0,0,128,164,112,125,194,0,0,0,0,0,0,0,0,195,245,168,62,195,245,40,194,0,0,0,0,0,0,0,0,0,
			0,0,0,0,0,0,0,110,43,49,0,0,0,0,0]);
		try {
			atlas.hdr.writeUInt16LE(datatype,72,2);		// datatype 2: unsigned char (8 bits/voxel)
			atlas.hdr.writeUInt16LE(atlas.dim[0],42,2);
			atlas.hdr.writeUInt16LE(atlas.dim[1],44,2);
			atlas.hdr.writeUInt16LE(atlas.dim[2],46,2);
			atlas.data=new Buffer(atlas.dim[0]*atlas.dim[1]*atlas.dim[2]);

			var i;
			for(i=0;i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2];i++)
				atlas.data[i]=0;
			atlas.sum=0;

			console.log(new Date());
			console.log("atlas size",atlas.data.length);
			console.log("atlas dim",atlas.dim);
			console.log("atlas datatype",datatype);
			console.log("atlas vox_offset",vox_offset);
			console.log("free memory",os.freemem());
			callback(atlas.data);
		
			// log atlas creation
			var key="createAtlas";
			var value=JSON.stringify({specimen:atlas.specimen,atlas:atlas.name});
			logToDatabase(key,value,username);
		} catch(e) {
			console.log(new Date(),"ERROR: Cannot create new empty atlas");
		}
	} else {
		console.log("Atlas found. Loading it");
		var niigz;
		try {
			niigz=fs.readFileSync(path);
			zlib.gunzip(niigz,function(err,nii) {
				var mri=loadNifti(nii);
				
				atlas.hdr=mri.hdr;
				atlas.dim=mri.dim;
				atlas.datatype=mri.datatype;
				atlas.pixdim=mri.pixdim;
				atlas.data=mri.data;
				
				var i,sum=0;
				for(i=0;i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2];i++)
					sum+=atlas.data[i];
				atlas.sum=sum;

				console.log(new Date());
				console.log("atlas size",atlas.data.length);
				console.log("atlas dim",atlas.dim);
				console.log("atlas datatype",atlas.datatype);
				console.log("free memory",os.freemem());
				callback(atlas.data);
			});
		} catch(e) {
			console.log(new Date(),"ERROR: Cannot read atlas data");
		}
	}
}
function saveNifti(atlas)
{
	if(debug>=1) console.log("[saveNifti]");

	if(atlas && atlas.dim ) {
		if(atlas.data==undefined) {
			console.log("ERROR: [saveNifti] atlas is still in Atlas array, but it has not data");
			return;
		}
		
		var i,sum=0;
		for(i=0;i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2];i++)
			sum+=atlas.data[i];
		if(sum==atlas.sum) {
			console.log("Atlas",atlas.specimen,atlas.name,
						"no change, no save, freemem",os.freemem());
			return;
		}
		atlas.sum=sum;

		var	voxel_offset=352;
		var	nii=new Buffer(atlas.dim[0]*atlas.dim[1]*atlas.dim[2]+voxel_offset);
		console.log("Atlas",atlas.dirname,atlas.name,
					"data length",atlas.data.length+voxel_offset,
					"buff length",nii.length);
		atlas.hdr.copy(nii);
		atlas.data.copy(nii,voxel_offset);
		zlib.gzip(nii,function(err,niigz) {
			var	ms=+new Date;
			var path1=__dirname+"/public"+atlas.dirname+atlas.name;
			var	path2=__dirname+"/public"+atlas.dirname+ms+"_"+atlas.name;
			fs.rename(path1,path2,function(){
				fs.writeFile(path1,niigz);
			});
		});
	}
}
//==========
// Database
//==========
function logToDatabase(key,value,username)
{
	if(debug>=1) console.log("[logToDatabase]");
	
	if(!username)
		username="Undefined";
	request.post({
  		url:db_url,
		form:{
			action:"add_log",
			userName:username,
			key:key,
			value:value
		}
	}, function (error, response, body) {console.log(body)});
}

//========================================================================================
// Undo
//========================================================================================

/* TODO
 UndoStacks should be stored separately for each user, in that way
 when a user leaves, its undo stack is disposed. With the current
 implementation, we'll be storing undo stacks for long gone users...
*/

function pushUndoLayer(user) {
	if(debug) console.log("[pushUndoLayer] for user "+user.username+" "+user.specimenName+" "+user.atlasFilename);
		
	var undoLayer={"user":user,"actions":[]};
	UndoStack.push(undoLayer);

	if(debug) console.log("Number of layers: "+UndoStack.length);
	
	return undoLayer;
}
function getCurrentUndoLayer(user) {
	if(debug>=2) console.log("[getCurrentUndoLayer]");
		
	var i,undoLayer,found=false;
	
	for(i=UndoStack.length-1;i>=0;i--) {
		undoLayer=UndoStack[i];
		if(undoLayer==undefined)
			break;
		if( undoLayer.user.username==user.username &&
			undoLayer.user.atlasFilename==user.atlasFilename &&
			undoLayer.user.specimenName==user.specimenName) {
			found=true;
			break;
		}
	}
	if(!found) {
		// There was no undoLayer for this user. This may be the
		// first user's action. Create an appropriate undoLayer for it.
		console.log("No previous undo layer for "+user.username+", "+user.atlasFilename+", "+user.specimenName+": Create and push one");
		undoLayer=pushUndoLayer(user);
	}	
	return undoLayer;
}
function undo(user) {
	if(debug) console.log("[undo]");
		
	var undoLayer;
	var	i,action,found=false;
	
	// find latest undo layer for user
	for(i=UndoStack.length-1;i>=0;i--) {
		undoLayer=UndoStack[i];
		if(undoLayer==undefined)
			break;
		if( undoLayer.user.username==user.username &&
			undoLayer.user.atlasFilename==user.atlasFilename &&
			undoLayer.user.specimenName==user.specimenName &&
			undoLayer.actions.length>0) {
			found=true;
			UndoStack.splice(i,1); // remove layer from UndoStack
			if(debug) console.log("found undo layer for "+user.username+", "+user.specimenName+", "+user.atlasFilename+", with "+undoLayer.actions.length+" actions");
			break;
		}
	}
	if(!found) {
		// There was no undoLayer for this user.
		if(debug) console.log("No undo layers for user "+user.username+" in "+user.specimenName+", "+user.atlasFilename);
		return;
	}
	
	// undo latest actions
	/*
		undoLayer.actions is a sparse array, with many undefined values.
		Here I take each of the values in actions, and add them to arr.
		Each element of arr is an array of 2 elements, index and value.
	*/
	var arr=[];
	var msg;
	var	vol=Atlases[user.iAtlas].data;
	var val;

	for(j in undoLayer.actions) {
		var i=parseInt(j);
		val=undoLayer.actions[i];
		arr.push([i,val]);

	    // The actual undo having place:
	    vol[i]=val;
	    
	    if(debug>=3) console.log("undo:",i%user.dim[0],parseInt(i/user.dim[0])%user.dim[1],parseInt(i/user.dim[0]/user.dim[1])%user.dim[2]);
	}
	msg={"data":arr};
	broadcastPaintVolumeMessage(msg,user);

	if(debug) console.log(UndoStack.length+" undo layers remaining (all users)");	
}
//========================================================================================
// Painting
//========================================================================================
function paintxy(u,c,x,y,user,undoLayer)
/*
	From 'user' we know slice, atlas, vol, view, dim.
	[issue: undoLayer also has a user field. Maybe only undoLayer should be kept?]
*/
{
	if(Atlases[user.iAtlas].data==undefined) {
		console.log(new Date(),"ERROR: No atlas to draw into");
		return;
	}
	
	var coord={"x":x,"y":y,"z":user.slice};
		
	switch(c) {
		case 'me':
		case 'mf':
			if(user.x0<0) {
				user.x0=coord.x;
				user.y0=coord.y;
			}
			break;
		case 'le': // Line, erasing
			line(coord.x,coord.y,0,user,undoLayer);
			user.x0=coord.x;
			user.y0=coord.y;
			break;
		case 'lf': // Line, painting
			line(coord.x,coord.y,user.penValue,user,undoLayer);
			user.x0=coord.x;
			user.y0=coord.y;
			break;
		case 'f': // Fill, painting
			fill(coord.x,coord.y,coord.z,user.penValue,user,undoLayer);
			break;
		case 'e': // Fill, erasing
			fill(coord.x,coord.y,coord.z,0,user,undoLayer);
			break;
		case 'mu': // Mouse up (touch ended)
			pushUndoLayer(user);
			break;
		case 'u':
			undo(user);
			break;
	}
}
function paintVoxel(mx,my,mz,user,vol,val,undoLayer) {
	var	myView=user.view;
	var	dim=Atlases[user.iAtlas].dim;
	var	x,y,z;
	var	i=-1;
	switch(myView) {
		case 'sag':	x=mz; y=mx; z=my;break; // sagital
		case 'cor':	x=mx; y=mz; z=my;break; // coronal
		case 'axi':	x=mx; y=my; z=mz;break; // axial
	}	
	if(z>=0&&z<dim[2]&&y>=0&&y<dim[1]&&x>=0&&x<dim[0])
		i=z*dim[1]*dim[0]+y*dim[0]+x;
	
	if(vol[i]!=val) {
		undoLayer.actions[i]=vol[i];
		vol[i]=val;
	}
}
function sliceXYZ2index(mx,my,mz,user)
{
	var	myView=user.view;
	var	dim=Atlases[user.iAtlas].dim;
	var	x,y,z;
	var	i=-1;
	switch(myView) {
		case 'sag':	x=mz; y=mx; z=my;break; // sagital
		case 'cor':	x=mx; y=mz; z=my;break; // coronal
		case 'axi':	x=mx; y=my; z=mz;break; // axial
	}	
	if(z>=0&&z<dim[2]&&y>=0&&y<dim[1]&&x>=0&&x<dim[0])
		i=z*dim[1]*dim[0]+y*dim[0]+x;
	return i;
}
function line(x,y,val,user,undoLayer)
{
	// Bresenham's line algorithm adapted from
	// http://stackoverflow.com/questions/4672279/bresenham-algorithm-in-javascript

	var	vol=Atlases[user.iAtlas].data;
	var	dim=Atlases[user.iAtlas].dim;
	var	x1=user.x0;
	var y1=user.y0;
	var	z=user.slice;
	var x2=x;
	var y2=y;
	var	i;
	
	if(Math.pow(x1-x2,2)+Math.pow(y1-y2,2)>10*10)
		console.log("WARNING: long line from",x1,y1,"to",x2,y2,user);

    // Define differences and error check
    var dx = Math.abs(x2 - x1);
    var dy = Math.abs(y2 - y1);
    var sx = (x1 < x2) ? 1 : -1;
    var sy = (y1 < y2) ? 1 : -1;
    var err = dx - dy;

	for(j=0;j<user.penSize;j++)
	for(k=0;k<user.penSize;k++)
	    paintVoxel(x1+j,y1+k,z,user,vol,val,undoLayer);
    
	while (!((x1 == x2) && (y1 == y2))) {
		var e2 = err << 1;
		if (e2 > -dy) {
			err -= dy;
			x1 += sx;
		}
		if (e2 < dx) {
			err += dx;
			y1 += sy;
		}
		for(j=0;j<user.penSize;j++)
		for(k=0;k<user.penSize;k++)
			paintVoxel(x1+j,y1+k,z,user,vol,val,undoLayer);
	}
}
function fill(x,y,z,val,user,undoLayer)
{
	var view=user.view;
	var	vol=Atlases[user.iAtlas].data;
	var dim=Atlases[user.iAtlas].dim;
	var	Q=[],n;
	var	i;
	var bval=vol[sliceXYZ2index(x,y,z,user)]; // background-value: value of the voxel where the click occurred

	if(bval==val)	// nothing to do
		return;
	
	Q.push({"x":x,"y":y});
	while(Q.length>0) {
		n=Q.pop();
		x=n.x;
		y=n.y;
		if(vol[sliceXYZ2index(x,y,z,user)]==bval) {
			paintVoxel(x,y,z,user,vol,val,undoLayer);
			
			i=sliceXYZ2index(x-1,y,z,user);
			if(i>=0 && vol[i]==bval)
				Q.push({"x":x-1,"y":y});
			
			i=sliceXYZ2index(x+1,y,z,user);
			if(i>=0 && vol[i]==bval)
				Q.push({"x":x+1,"y":y});
			
			i=sliceXYZ2index(x,y-1,z,user);
			if(i>=0 && vol[i]==bval)
				Q.push({"x":x,"y":y-1});
			
			i=sliceXYZ2index(x,y+1,z,user);
			if(i>=0 && vol[i]==bval)
				Q.push({"x":x,"y":y+1});
		}
	}
}
/*
	Serve brain slices
*/
function loadBrainNifti(nii,callback) {

	brain=loadNifti(nii);
		
	console.log(new Date());
	console.log("brain size",brain.data.length);
	console.log("brain dim",brain.dim);
	console.log("brain datatype",brain.datatype);
	console.log("free memory",os.freemem());
	
	var i,sum=0,min,max;
	min=brain.data[0];
	max=min;
	for(i=0;i<brain.dim[0]*brain.dim[1]*brain.dim[2];i++) {
		sum+=brain.data[i];
		
		if(brain.data[i]<min) min=brain.data[i];
		if(brain.data[i]>max) max=brain.data[i];
	}
	brain.sum=sum;
	brain.min=min;
	brain.max=max;

	console.log("nii file loaded, sum:",sum);
	console.log("min:",min,"max:",max);
	callback(brain);
}
function loadBrainMGZ(data,callback) {
	var hdr_sz=284;
	var brain={};
	var datatype;
	
	brain.dim=[];
	brain.dim[0]=data.readInt32BE(4);
	brain.dim[1]=data.readInt32BE(8);
	brain.dim[2]=data.readInt32BE(12);
	datatype=data.readInt32BE(20);
	brain.pixdim=[];
	brain.pixdim[0]=data.readFloatBE(30);
	brain.pixdim[1]=data.readFloatBE(34);
	brain.pixdim[2]=data.readFloatBE(38);
	
	switch(datatype) {
		case 0: // MGHUCHAR
			brain.data=data.slice(hdr_sz);
			break;
		case 1: // MGHINT
			var tmp=data.slice(hdr_sz);
			brain.data=new Uint32Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(j=0;j<brain.dim[0]*brain.dim[1]*brain.dim[2];j++)
				brain.data[j]=tmp.readUInt32BE(j*4);
			break;
		case 3: // MGHFLOAT
			var tmp=data.slice(hdr_sz);
			brain.data=new Float32Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(j=0;j<brain.dim[0]*brain.dim[1]*brain.dim[2];j++)
				brain.data[j]=tmp.readFloatBE(j*4);
			break;
		case 4: // MGHSHORT
			var tmp=data.slice(hdr_sz);
			brain.data=new Int16Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(j=0;j<brain.dim[0]*brain.dim[1]*brain.dim[2];j++)
				brain.data[j]=tmp.readInt16BE(j*2);
			break;
		default:
			console.log("ERROR: Unknown dataType: "+datatype);
	}
		
	console.log(new Date());
	console.log("brain size",brain.data.length);
	console.log("brain dim",brain.dim);
	console.log("brain datatype",datatype);
	console.log("free memory",os.freemem());
	
	var i,sum=0,min,max;
	min=brain.data[0];
	max=min;
	for(i=0;i<brain.dim[0]*brain.dim[1]*brain.dim[2];i++) {
		sum+=brain.data[i];
		
		if(brain.data[i]<min) min=brain.data[i];
		if(brain.data[i]>max) max=brain.data[i];
	}
	brain.sum=sum;
	brain.min=min;
	brain.max=max;

	console.log("mgh file loaded, sum:",sum);
	console.log("min:",min,"max:",max);
	callback(brain);
}
function loadBrainCompressed(path,callback) {
	if(debug)
		console.log("[loadBrainCompressed]",path);
	if(!fs.existsSync(path)) {
		console.log("ERROR: File does not exist:",path);
		return;
	} else {
		var datagz;
		try {
			datagz=fs.readFileSync(path);
			var ft=fileType(datagz);
			console.log("fileType",ft);
			var ext=path.split('.').pop();
			console.log("extension",ext);
			
			switch(ft.ext) {
				case 'gz': {
					switch(ext) {
						case 'gz':
							zlib.gunzip(datagz,function(err,nii){if(err) console.log("ERROR:",err);loadBrainNifti(nii,callback)});
							break;
						case 'mgz':
							zlib.gunzip(datagz,function(err,nii){if(err) console.log("ERROR:",err);loadBrainMGZ(nii,callback)});
							break;
					}
					break;
				}
				case 'zip':
					zlib.inflate(datagz,function(err,nii){if(err) console.log("ERROR:",err);loadBrainNifti(nii,callback)});
					break;
			}
		} catch(e) {
			console.log(new Date(),"ERROR: Cannot read brain data");
		}
	}
	return null;
}

function drawSlice(brain,view,slice) {
	var x,y,i,j;
	var brain_W, brain_H;
	var ys,ya,yc;
	var val;
	
	switch(view) {
		case 'sag':	brain_W=brain.dim[1]; brain_H=brain.dim[2]; brain_D=brain.dim[0]; break; // sagital
		case 'cor':	brain_W=brain.dim[0]; brain_H=brain.dim[2]; brain_D=brain.dim[1]; break; // coronal
		case 'axi':	brain_W=brain.dim[0]; brain_H=brain.dim[1]; brain_D=brain.dim[2]; break; // axial
	}
	
	var frameData = new Buffer(brain_W * brain_H * 4);

	j=0;
	switch(view) {
		case 'sag':ys=slice; break;
		case 'cor':yc=slice; break;
		case 'axi':ya=slice; break;
	}

	for(y=0;y<brain_H;y++)
	for(x=0;x<brain_W;x++) {
		switch(view) {
			case 'sag':i= y*brain.dim[1]*brain.dim[0]+ x*brain.dim[0]+ys; break;
			case 'cor':i= y*brain.dim[1]*brain.dim[0]+yc*brain.dim[0]+x; break;
			case 'axi':i=ya*brain.dim[1]*brain.dim[0]+ y*brain.dim[0]+x; break;
		}
		val=255*(brain.data[i]-brain.min)/(brain.max-brain.min);
		frameData[4*j+0] = val; // red
		frameData[4*j+1] = val; // green
		frameData[4*j+2] = val; // blue
		frameData[4*j+3] = 0xFF; // alpha - ignored in JPEGs
		j++;
	}

	var rawImageData = {
	  data: frameData,
	  width: brain_W,
	  height: brain_H
	};
	return jpeg.encode(rawImageData,99);
}


/*
	atlas
		.name:		string
		.dirname:	string
		.hdr:		Analyze hdr
		.dim[3]:	3 uint16s
		.data:		Analyze img
		.sum:		value sum
	
	user
		.view:		string, either 'sag', 'axi' or 'cor'
		.tool:		string, either 'paint' or 'erase'
		.slice:		slice which the user is editing
		.penSize:	integer, for example, 5
		.penValue:	integer, value used to paint, for example, 1
		.doFill:	boolean, indicates whether 'paint' or 'erase' fill their target
		.mouseIsDown:	boolean, indicates whether the user's mouse button is down
		.x0:		previous x coordinate for painting, -1 if no previous
		.y0:		previous y coordinate for painting, -1 if no previous
		.mri:		normally, MRI-n4.nii.gz
		.dirname:	string, atlas file directory, for example, /data/Gorilla/
		.username:	string, for example, roberto
		.specimenName: string, for example, Crab-eating_macaque
		.atlasFilename:	string, atlas filename, for example, Cerebellum.nii.gz
		.iAtlas:	index of atlas in Atlases[]
		.dim:		array, size of the mri the user is editing, for example, [160,224,160]

	undoBuffer
		.type:	line, slice, volume
		.data:
*/
