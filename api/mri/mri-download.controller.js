'user strict'
var crypto = require('crypto');
var url = require('url');
var fs = require('fs');
var request = require('request');
var atlasMakerServer = require('../../js/atlasMakerServer');
//expressValidator = require('express-validator')

var validator = function(req, res, next) {
	req.checkQuery('url', 'please enter a valid URL')
	.isURL();
	
	// req.checkQuery('var', 'please enter one of the variables that are indicated')
	// .optional()
	// .matches("localpath|filename|source|url|dim|pixdim");						//todo: decent regexp
	var errors = req.validationErrors();
	console.log(errors);
	if (errors) {
		res.send(errors).status(403).end();
	} else {
		return next();
	}
}

/* Download MRI file
---------------------*/
function downloadMRI(myurl,req,res,callback) {
	console.log("downloadMRI");
	var hash = crypto.createHash('md5').update(myurl).digest('hex');
	var filename = url.parse(myurl).pathname.split("/").pop();
	var dest= req.dirname + "/public/data/"+hash+"/"+filename;
	console.log("   source:",myurl);
	console.log("     hash:",hash);
	console.log(" filename:",filename);
	console.log("     dest:",dest);
	
console.log(process.cwd());

	if (!fs.existsSync(req.dirname + "/public/data/"+hash)) {
		fs.mkdirSync(req.dirname + "/public/data/"+hash,0777);
	}

	var file = fs.createWriteStream(dest,{mode:0777});


	request({uri:myurl})
	.pipe(fs.createWriteStream(dest))
	.on('close', function() {
		atlasMakerServer.getBrainAtPath(req.dirname + "/public/data/"+hash+"/"+filename,function(mri) {
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
			//req.db.get('mri').insert(json);
			callback(json);
		});
	})
	.on('error',function(err){
		console.error("ERROR in downloadMRI",err);
		callback();
	});
}

var download = function(req, res) {
	var login=	(req.isAuthenticated())?
				("<a href='/user/"+req.user.username+"'>"+req.user.username+"</a> (<a href='/logout'>Log Out</a>)")
				:("<a href='/auth/github'>Log in with GitHub</a>");
	var myurl = req.query.url;
	var hash = crypto.createHash('md5').update(myurl).digest('hex');
	console.log("yoyo what's up")	
	req.db.get('mri').find({url:"/data/"+hash+"/"}, {fields:{_id:0},sort:{$natural:-1},limit:1})
	.then(function(json) {
		console.log(json);
		json=json[0];
		if(json) {
			res.render('mri', {
				title: json.name||'Untitled MRI',
				params: JSON.stringify(req.query),
				mriInfo: JSON.stringify(json),
				login: login
			});
		} else {
			(function(my,rq,rs) {
				downloadMRI(my,rq,rs,function(obj) {
					console.log(obj);
					req.db.get('mri').insert(obj);
					rs.render('mri', {
						title: obj.name||'Untitled MRI',
						params: JSON.stringify(rq.query),
						mriInfo: JSON.stringify(obj),
						login: login
					});
				});
			})(myurl,req,res);
		}
	}, function(err) {
		console.error(err);
	});
}

var api_download = function(req, res) {
	var myurl=req.query.url;
	var hash = crypto.createHash('md5').update(myurl).digest('hex');
	// shell equivalent: req.db.mri.find({source:"http://braincatalogue.org/data/Pineal/P001/t1wreq.db.nii.gz"}).limit(1).sort({$natural:-1})
	
	req.db.get('mri').find({url:"/data/"+hash+"/",backup:{$exists:false}}, "-_id", {sort:{$natural:-1},limit:1})
	.then(function(json) {
		json=json[0];
		if(json) {
			if(req.query.var) {
				var i,arr=req.query.var.split("/");
				for(i in arr)
					json=json[arr[i]];
			}
			res.json(json);
		} else {
			if(req.query.var) {
				res.json({});
			} else {
				(function(my,rq,rs) {
					downloadMRI(my,rq,rs,function(obj) {
						rq.db.get('mri').insert(obj);
						rs.json(obj);
					});
				})(myurl,req,res);
			}
		}
	}, function(err) {
		console.error(err);
	});
}

var mriController = function(){
	this.validator = validator;
	this.api_download = api_download;
	this.download = download;
}

module.exports = new mriController();

