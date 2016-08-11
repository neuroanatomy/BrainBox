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
var dateFormat = require('dateformat');
var mustacheExpress = require('mustache-express');
var crypto = require('crypto');
var async = require("async");

var mongo = require('mongodb');
var monk = require('monk');
var db = monk('localhost:27017/brainbox');
var fs = require('fs');
var expressValidator = require('express-validator');

var atlasMakerServer = require('./js/atlasMakerServer.js');

// init web server
//var routes = require('./routes/index');
// var users = require('./routes/users');

var app = express();
app.engine('mustache', mustacheExpress());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'mustache');
app.use(favicon(__dirname + '/public/favicon.png'));
app.set('trust proxy', 'loopback');
app.use(logger(':remote-addr :method :url :status :response-time ms - :res[content-length]'));//app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(expressValidator());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(function(req, res, next){
	req.dirname = __dirname;
	req.db = db;
	next();
})

//app.use('/', routes);
// app.use('/users', users);

//{-----passport
var session = require('express-session');
var passport = require('passport');
var GithubStrategy = require('passport-github').Strategy;
passport.use(new GithubStrategy(
	JSON.parse(fs.readFileSync(__dirname+"/github-keys.json")),
	function(accessToken,refreshToken,profile,done){return done(null, profile);}
));
app.use(session({
	secret: "a mi no me gusta la sémola",
	resave:false,
	saveUninitialized:false
}));
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
		.then(function(json) {Ò
			if(!json) {
				// insert new user
				json={
					name: req.user.displayName,
					nickname: req.user.username,
					url:req.user._json.blog,
					brainboxURL:"/user/"+req.user.username,
					avatarURL:req.user._json.avatar_url,
					joined: (new Date()).toJSON()
				}
				db.get('user').insert(json);
			}
		});
		res.redirect('/');
	});
//-----}



app.use('/mri', require('./controller/mri/'));

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

// app.get('/mri', function(req, res) {

// });
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
			console.log(arr);
			mri=arr;
			return db.get('mri').find({"mri.atlas":{$elemMatch:{owner:username}},backup:{$exists:false}});
		})
		.then(function(arr) {
			console.log(arr);
			atlas=arr;
			return db.get('project').find({owner:username,backup:{$exists:false}});
		})
		.then(function(arr) {
			projects=arr;
			console.log(arr);
			var context={
				title: req.params.id,
				userInfo: JSON.stringify(json),
				login: login,
				atlasFiles:[]
			}
			context.MRIFiles=mri.map(function(o){return {
				url:o.source,
				name:o.name,
				included:dateFormat(o.included,"d mmm yyyy, HH:MM"),
				volDimensions:o.dim.join(" x ")
			}});
			atlas.map(function(o){
				console.log("this is fucked up");
				var i,arr=[];
				for(i in o.mri.atlas) context.atlasFiles.push({
					url:o.source,
					parentName:o.name,
					name:o.mri.atlas[i].name,
					project:o.mri.atlas[i].project,
					projectURL:'/project/braincatalogue',
					modified:dateFormat(o.mri.atlas[i].modified,"d mmm yyyy, HH:MM")
				});
			});
			context.projects=projects.map(function(o){return {
				project:o.name,
				projectURL:o.brainboxURL,
				numFiles:o.files.length,
				numCollaborators:o.collaborators.length,
				owner:o.owner,
				modified:dateFormat(o.modified,"d mmm yyyy, HH:MM")
			}});
			
			context.username=json.name;
			context.nickname=json.nickname;
			context.joined=dateFormat(json.joined, "dddd d mmm yyyy, HH:MM");
			context.numMRI=context.MRIFiles.length;
			context.numAtlas=context.atlasFiles.length;
			context.numProjects=context.projects.length;
			context.avatar=json.avatarURL;
			
			res.render('user',context).end();;
		});
	});
});
app.get('/project/:id', function(req, res) {
	var login=	(req.isAuthenticated())?
				("<a href='/user/"+req.user.username+"'>"+req.user.username+"</a> (<a href='/logout'>Log Out</a>)")
				:("<a href='/auth/github'>Log in with GitHub</a>");
	db.get('project').findOne({shortname:req.params.id},"-_id")
	.then(function(json) {
		console.log(json);
		async.each(
			json.files,
			function(item,cb) {
				db.get('mri').find({source:item,backup:{$exists:0}},{name:1,_id:0})
				.then(function(obj) {
					if(obj[0]) {
						json.files[json.files.indexOf(item)]={
							source: item,
							name: obj[0].name
						}
					} else {
						json.files[json.files.indexOf(item)]={
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

app.get('/api/getLabelsets', function(req, res) {
	var i,arr=fs.readdirSync(__dirname+"/public/labels/"),info=[];
	for(i in arr) {
		var json=JSON.parse(fs.readFileSync(__dirname+"/public/labels/"+arr[i]));
		info.push({
			name:json.name,
			source:"/labels/"+arr[i]
		});
	}
	res.send(info);
});
app.post('/api/log', function(req, res) {
	var json=req.body;
	db.get('log').insert({
		key: json.key,
		value: json.value,
		username: json.username,
		date: (new Date()).toJSON(),
		ip: req.headers['x-forwarded-for'] || 
			req.connection.remoteAddress || 
			req.socket.remoteAddress ||
			req.connection.socket.remoteAddress
	});
	res.send();
});


// init web socket server
atlasMakerServer.initSocketConnection();
atlasMakerServer.dataDirectory = __dirname + "/public";

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


/* Download MRI file
---------------------*/
function downloadMRI(myurl,req,res,callback) {
	console.log("downloadMRI");
	var hash = crypto.createHash('md5').update(myurl).digest('hex');
	var filename = url.parse(myurl).pathname.split("/").pop();
	var dest="../../public/data/"+hash+"/"+filename;
	console.log("   source:",myurl);
	console.log("     hash:",hash);
	console.log(" filename:",filename);
	console.log("     dest:",dest);
	
	if (!fs.existsSync("../../public/data/"+hash)) {
		fs.mkdirSync("../../public/data/"+hash,0777);
	}

	var file = fs.createWriteStream(dest,{mode:0777});

	request({uri:myurl})
	.pipe(fs.createWriteStream(dest))
	.on('close', function() {
		getBrainAtPath("/data/"+hash+"/"+filename,function(mri) {
			// create json file for new dataset
			var ip = req.headers['x-forwarded-for'] || 
					 req.connection.remoteAddress || 
					 req.socket.remoteAddress ||
					 req.connection.socket.remoteAddress;
			var username=(req.isAuthenticated())?req.user.username:ip
			var json = {
				localpath: dest,
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
						labels: '/labels/foreground.json'
					}]
				}
			};
			db.get('mri').insert(json);
			callback(json);
		});
	})
	.on('error',function(err){
		console.error("ERROR in downloadMRI",err);
		callback();
	});
}



module.exports = app;
