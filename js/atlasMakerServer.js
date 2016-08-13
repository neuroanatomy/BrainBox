var request = require('request');
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
var jpeg=require('jpeg-js'); // jpeg-js library: https://github.com/eugeneware/jpeg-js
var keypress = require('keypress');
var dateFormat = require('dateformat');
var async = require("async");
var niijs = require('nifti-js');

var mongo = require('mongodb');
var monk = require('monk');
var db = monk('localhost:27017/brainbox');

var atlasMakerServer = function() {

var	debug=2;
this.dataDirectory = "";
var	Atlases=[];
this.Brains=[];
var	US=[];
var	uidcounter=1;
var enterCommands=0;
var UndoStack=[];

console.log("atlasMakerServer.js");
console.log(new Date());
setInterval(function(){console.log(new Date())},60*60*1000); // time mark every 60 minutes
console.log("free memory",os.freemem());

var bufferTag = function(str,sz) {
	var buf=new Buffer(sz).fill(32);
	buf.write(str);
	return buf;
}

var niiTag=bufferTag("nii",8);
var mghTag=bufferTag("mgh",8);
var jpgTag=bufferTag("jpg",8);

var displayAtlases = function() {
	console.log("\n"+Atlases.filter(function(o){return o!==undefined}).length+" Atlases:");
	for(var i in Atlases) {
		var sum=numberOfUsersConnectedToAtlas(Atlases[i].dirname,Atlases[i].name);
		console.log("Atlases["+i+"] path:"+Atlases[i].dirname+Atlases[i].name+", "+sum+" users connected");
	}
	for(var i in Atlases) {
		console.log(Atlases[i]);
	}
}
var displayBrains = function() {
	console.log("\n"+Brains.length+" Brains:");
	for(var i=0;i<Brains.length;i++) {
		var sum=numberOfUsersConnectedToMRI(Brains[i].path);
		console.log("Brains["+i+"].path="+Brains[i].path+", "+sum+" users connected");
	}
	for(var i=0;i<Brains.length;i++) {
		console.log("Brains["+i+"]");
		console.log("           path:",Brains[i].path);
		console.log("       data.dim:",Brains[i].data.dim);
		console.log("    data.pixdim:",Brains[i].data.pixdim);
		console.log("data.vox_offset:",Brains[i].data.vox_offset);
		console.log("       data.dir:",Brains[i].data.dir);
		console.log("       data.ori:",Brains[i].data.ori);
		console.log("       data.s2v:",Brains[i].data.s2v);
		console.log("       data.v2w:",Brains[i].data.v2w);
		console.log("      data.wori:",Brains[i].data.wori);
		console.log("  data.datatype:",Brains[i].data.datatype);
		console.log("       data.sum:",Brains[i].data.sum);
		console.log();
	}
}
var displayUsers = function() {
	console.log("\n"+US.filter(function(o){return o!==undefined}).length+" User Sockets:");
	for(var i in US) {
		console.log("US["+i+"].uid=",US[i].uid);
		console.log("US["+i+"]=",US[i].User);
	}
}
keypress(process.stdin);
process.stdin.on('keypress', function (ch, key) {
	if(key) {
		if(key.name==='c' && key.ctrl) {
			console.log("Exit.");
			process.exit();
		}
		if(key.name==='escape') {
			enterCommands=!enterCommands;
			console.log("enterCommands: "+enterCommands);
		}
		if(enterCommands===0) {
			if(key.name==='return')
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

//========================================================================================
// Web socket
//========================================================================================
var getUserFromSocket = function(socket) {
	for(var i in US) {
		if(socket===US[i].socket)
			return US[i];
	}
	return -1;
}
var getUserFromUserId = function(uid) {
	for(var i in US) {
		if(uid==US[i].uid)
			return US[i];
	}
	return null;
}
var getUserIdFromSocket = function(socket) {
	for(var i in US) {
		if(socket==US[i].socket)
			return US[i].uid;
	}
	return null;
}
var removeUser = function(socket) {
	for(var i in US) {
		if(socket===US[i].socket) {
			delete US[i];
			break;
		}
	}
}
var numberOfUsersConnectedToMRI = function(path) {
	var sum=0;

	if(path===undefined)
		return sum;
		
	for(var i in US) {
		if(US[i].User===undefined) {
			console.log("ERROR: When counting the number of users connected to MRI, user uid "+i+" was not defined");
			continue;
		}
		if(US[i].User.dirname===undefined) {
			console.log("ERROR: A user uid "+i+" dirname is unknown");
			continue;
		}
		if(US[i].User.mri===undefined) {
			console.log("ERROR: A user uid "+i+" MRI is unknown");
			continue;
		}
		if(US[i].User.dirname+US[i].User.mri===path)
			sum++;
	}
	/* sum--; */
	return sum;
}
var unloadMRI = function(path) {
	if(debug)
		console.log("[unload MRI]",path);
		
	for(var i in Brains) {
		if(Brains[i].path===path) {
			Brains.splice(i,1);
			console.log("free memory",os.freemem());
			break;
		}
	}
}

var numberOfUsersConnectedToAtlas = function(dirname,atlasFilename) {
	var sum=0;

	if(dirname===undefined || atlasFilename===undefined)
		return sum;
		
	for(i in US) {
		if(US[i].User===undefined) {
			console.log("ERROR: When counting the number of users connected to the atlas, user uid "+i+" was not defined");
			continue;
		}
		if(US[i].User.dirname===undefined) {
			console.log("ERROR: A user uid "+i+" dirname is unknown");
			continue;
		}
		if(US[i].User.atlasFilename===undefined) {
			console.log("ERROR: A user uid "+i+" atlasFilename is unknown");
			continue;
		}
		if(US[i].User.dirname===dirname && US[i].User.atlasFilename===atlasFilename)
			sum++;
	}
	return sum;
}
var unloadAtlas = function(dirname,atlasFilename) {
	if(debug)
		console.log("[unload atlas]",dirname,atlasFilename);

	for(var i in Atlases) {
		if(Atlases[i].dirname===dirname && Atlases[i].name===atlasFilename) {
			saveNifti(Atlases[i])
			.then(function() {
				console.log("Atlas saved. Unloading it");
				clearInterval(Atlases[i].timer);
				delete Atlases[i];
				console.log("free memory",os.freemem());
			});
			break;
		}
	}
}
var initSocketConnection = function() {
	// WS connection
	if(debug) console.log("[initSocketConnection]");
	
	try {
		websocket = new WebSocketServer({ server: server });
		
		websocket.on("connection",function(s) {
			console.log("[connection open]");
			console.log("remote_address",s.upgradeReq.connection.remoteAddress);
			var	newUS={"uid":"u"+uidcounter++,"socket":s};
			US.push(newUS);
			console.log("User id "+newUS.uid+" connected, total: "+US.filter(function(o){return o!=undefined}).length+" users");
			
			// send data from previous users
			sendPreviousUserDataMessage(newUS);
			
			s.on('message',function(msg) {
				if(debug>2) console.log("[connection: message]",msg);
				
				var sourceUS=getUserFromSocket(this);
				var data={};
				
				if(msg instanceof Buffer) { // Handle binary data: a user uploaded an atlas file
					data.data=msg;
					data.type="atlas";
				} else
					data=JSON.parse(msg);
				data.uid=sourceUS.uid;
				
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
					var targetUS=getUserFromSocket(websocket.clients[i]);
					
					// do not auto-broadcast
					if(sourceUS.uid===targetUS.uid) {
						if(debug>1) console.log("no broadcast to self");
						continue;
					}
					
					// do not broadcast to unknown users
					if( sourceUS.User===undefined || targetUS.User===undefined) {
						if(debug) console.log("User "+sourceUS.uid+": "+(sourceUS.User===undefined)?"undefined":"defined");
						if(debug) console.log("User "+targetUS.uid+": "+(targetUS.User===undefined)?"undefined":"defined");
						continue;
					}
					
					if( targetUS.User.iAtlas!==sourceUS.User.iAtlas && data.type!=="chat" && data.type!=="intro" ) {
						if(debug>1) console.log("no broadcast to user "+targetUS.User.username+" [uid: "+targetUS.uid+"] of atlas "+targetUS.User.specimenName+"/"+targetUS.User.atlasFilename);
						continue;
					}
					
					if(data.type==="atlas") {
						sendAtlasToUser(data.data,websocket.clients[i],false);
					} 
					else {
						websocket.clients[i].send(JSON.stringify(data));
					}
					n++;
				}
				if(debug>2) console.log("broadcasted to",n,"users");
			});
			
			s.on('close',function(msg) {
				console.log("[connection: close]");
				console.log("US length",US.filter(function(o){return o!=undefined}).length);
				for(var i in US)
					if(US[i].socket===s)
						console.log("user",US[i].uid,"is closing connection");
				var sourceUS=getUserFromSocket(this);
				console.log("User ID "+sourceUS.uid+" is disconnecting");
				if(sourceUS.User===undefined) {
					console.log("<BUG ALERT> User ID "+sourceUS.uid+" is undefined.");
					console.log("US:",US);
					console.log("</BUG ALERT>");
				} else if(sourceUS.User.dirname) {
					console.log("User was connected to MRI "+ sourceUS.User.dirname+sourceUS.User.mri);
					console.log("User was connected to atlas "+ sourceUS.User.dirname+sourceUS.User.atlasFilename);
				} else {
					console.log("WARNING: dirname was not defined");
				}
				
				// count how many users remain connected to the MRI after user leaves
				sum=numberOfUsersConnectedToMRI(sourceUS.User.dirname+sourceUS.User.mri);
				sum-=1; // subtract current user
				if(sum) {
					console.log("There remain "+sum+" users connected to that MRI");
				} else {
					console.log("No user connected to MRI "
								+ sourceUS.User.dirname
								+ sourceUS.User.mri+": unloading it");
					unloadMRI(sourceUS.User.dirname+sourceUS.User.mri);
				}

				// count how many users remain connected to the atlas after user leaves
				sum=numberOfUsersConnectedToAtlas(sourceUS.User.dirname,sourceUS.User.atlasFilename);
				sum-=1; // subtract current user
				if(sum) {
					console.log("There remain "+sum+" users connected to that atlas");
				} else {
					console.log("No user connected to atlas "
								+ sourceUS.User.dirname
								+ sourceUS.User.atlasFilename+": unloading it");
					unloadAtlas(sourceUS.User.dirname,sourceUS.User.atlasFilename);
				}
				
				// remove the user from the list
				removeUser(this);
				
				// send user disconnect message to remaining users
				sendDisconnectMessage(sourceUS.uid);
				
				// display the total number of connected users
				var	nusers=0;
				for(var i in US) nusers++;
				if(debug) console.log("user",sourceUS.uid,"closed connection");
				if(debug) console.log(nusers+" connected");
			});
		});
		server.listen(port, function () { console.log('Listening on ' + server.address().port,server.address()) });
	} catch (ex) {
		console.log("ERROR: Unable to create a server",ex);
	}
}
this.initSocketConnection = initSocketConnection;

var receivePaintMessage = function(data) {
	if(debug>=2) console.log("[receivePaintMessage]");

	var	msg=data.data;
	var	sourceUS=getUserFromUserId(data.uid);			// user data
	var c=msg.c;		// command
	var x=msg.x;		// x coordinate
	var y=msg.y;		// y coordinate
	var undoLayer=getCurrentUndoLayer(sourceUS.User);	// current undoLayer for user
	
	paintxy(sourceUS.uid,c,x,y,sourceUS.User,undoLayer);
}
var receiveRequestSliceMessage = function(data,user_socket) {
	if(debug>2) console.log("[receiveRequestSliceMessage]");

	// get slice information from message
	var view=data.view;		// user view
	var slice=parseInt(data.slice);	// user slice

	// get User object
	var sourceUS=getUserFromUserId(data.uid);

	// get brainPath from User object
	var brainPath=sourceUS.User.dirname+sourceUS.User.mri;
	
	// update User object
	sourceUS.User.view=view;
	sourceUS.User.slice=slice;
	
/*
	WARNING:
		And here you go... the client-side path expected by getBrainAtPath
		is changed by an absolute server-side path.
		This may break the scan for already loaded brains later on.
*/

/*
	var fullBrainPath = this.dataDirectory + brainPath;
	
	
	var brain=getBrainAtPath(fullBrainPath,function(data){
		sendSliceToUser(data,view,slice,user_socket);
	});
*/

	var brain=getBrainAtPath(brainPath,function(data){
		sendSliceToUser(data,view,slice,user_socket);
	});

	if(brain) {
		sendSliceToUser(brain,view,slice,user_socket);
	}
}
var receiveSaveMetadataMessage = function(data,user_socket) {
	if(debug>1) console.log("[receiveSaveMetadataMessage]");

	var sourceUS=getUserFromUserId(data.uid);
	var json=data.metadata;
	json.modified=(new Date()).toJSON();
	json.modifiedBy=sourceUS.User.username||"unknown";
	// mark previous one as backup
	db.get('mri').update({url:json.url,backup:{$exists:false}},{$set:{backup:true}},{multi:true});
	// insert new one
	db.get('mri').insert(json);
}
var receiveAtlasFromUserMessage = function(data,user_socket) {
	if(debug>1) console.log("[receiveAtlasFromUserMessage]");
	zlib.inflate(data.data,function(err,atlasData){
		// Save current atlas
		var sourceUS=getUserFromUserId(data.uid);
		var iAtlas=sourceUS.User.iAtlas;
		var atlas=Atlases[iAtlas];
		saveNifti(atlas)
		.then(function() {
			console.log("Replace current atlas with new atlas");
			atlas.data=atlasData;
		});
	});
}
var getBrainAtPath = function(brainPath,callback) {
	if(debug>1) console.log("[getBrainAtPath]");
	
	var i;
	for(i=0;i<Brains.length;i++) {
		if(Brains[i].path===brainPath) {
			if(debug>1) console.log("brain already loaded");
			return Brains[i].data;
		}
	}
	if(debug) {
		console.log("loading brain at",brainPath);
	}

	loadBrainCompressed(this.dataDirectory+brainPath,function(data) {
		var brain={path:brainPath,data:data};
		Brains.push(brain);
		callback(data); // callback: sendSliceToUser
	});
		
	return null;
}
this.getBrainAtPath = getBrainAtPath;

var unloadUnusedBrains = function() {
	var i;
	for(i=0;i<Brains.length;i++) {
		var sum=numberOfUsersConnectedToMRI(Brains[i].path);

		if(sum===0) {
			console.log("No user connected to MRI "+Brains[i].path+": unloading it");
			unloadMRI(Brains[i].path);
		}
	}
}
var unloadUnusedAtlases = function() {
	var i;
	for(i in Atlases) {
		var sum=numberOfUsersConnectedToAtlas(Atlases[i].dirname,Atlases[i].name);
		if(sum===0) {
			console.log("No user connected to Atlas "+Atlases[i].dirname+Atlases[i].name+": unloading it");
			unloadAtlas(Atlases[i].dirname,Atlases[i].name);
		}
	}
}
var sendSliceToUser = function(brain,view,slice,user_socket) {
	if(debug>1) console.log("[sendSliceToUser]");
	
	try {
		var jpegImageData=drawSlice(brain,view,slice);
		var length=jpegImageData.data.length+jpgTag.length;
		var bin=Buffer.concat([jpegImageData.data,jpgTag],length);
		user_socket.send(bin, {binary: true,mask:false});
	} catch(e) {
		console.log("ERROR: Cannot send slice to user");
	}
}

var receiveUserDataMessage = function(data,user_socket) {
	if(debug>1) console.log("[receiveUserDataMessage]");
	
	var sourceUS=getUserFromUserId(data.uid);
	var User=data.user;
	var	i,
		atlasLoadedFlag,
		firstConnectionFlag=false,
		switchingAtlasFlag=false;
	
	if(sourceUS.User===undefined) {
		firstConnectionFlag=true;
	} else if(sourceUS.User.isMRILoaded===false) {
		firstConnectionFlag=true;
	}
	
	User.uid=data.uid;

	if(data.description==="sendAtlas") {
		// 1. Check if the atlas the user is requesting has not been loaded
		atlasLoadedFlag=false;
		
		// check whether user is switching atlas.
		switchingAtlasFlag=false;
		if(sourceUS.User) {
			if((sourceUS.User.atlasFilename!==User.atlasFilename)||(sourceUS.User.dirname!==User.dirname)) {
				switchingAtlasFlag=true;
			}
		}
		
		for(i in Atlases) {
			if(Atlases[i].dirname===User.dirname && Atlases[i].name===User.atlasFilename) {
				atlasLoadedFlag=true;
				break;
			}
		}
		User.iAtlas=atlasLoadedFlag?parseInt(i):Atlases.length;	// value i if it was found, or last available if it wasn't
	
		// 2. Send the atlas to the user (load it if required)
		if(atlasLoadedFlag) {
			if(firstConnectionFlag || switchingAtlasFlag) {
				// send the new user our data
				sendAtlasToUser(Atlases[i].data,user_socket,true);
				sourceUS.User.isMRILoaded=true;
			}
		} else {
			// The atlas requested has not been loaded before:
			// Load the atlas s/he's requesting
			addAtlas(User,function(atlas){sendAtlasToUser(atlas,user_socket,true)});
			sourceUS.User.isMRILoaded=true;
		}
	}
	
	// 3. Update user data
	// If the user didn't have a name (wasn't logged in), but now has one,
	// display the name in the log
	if(User.hasOwnProperty('username')) {
		if(sourceUS.User===undefined) {
			console.log("No User yet for id "+data.uid);
		} else if(!sourceUS.User.hasOwnProperty('username')) {
			console.log("User "+User.username+", id "+data.uid+" logged in");
		}
	}

	if(sourceUS.hasOwnProperty('User')===false) {
		sourceUS.User={};
	}
	for(var prop in User) {
		sourceUS.User[prop]=User[prop];
	}

	// 4. Update number of users connected to atlas
	if(firstConnectionFlag) {
		var sumAtlas=0,
			sumMRI=0;
		for(i in US) {
			if(US[i].User.dirname===User.dirname && US[i].User.atlasFilename===User.atlasFilename) {
				sumAtlas++;
			}
			if(US[i].User.dirname===User.dirname && US[i].User.mri===User.mri) {
				sumMRI++;
			}
		}
		console.log(sumMRI+" user"+((sumMRI===1)?" is":"s are")+" requesting MRI "+User.dirname+User.mri);
		console.log(sumAtlas+" user"+((sumAtlas===1)?" is":"s are")+" requesting atlas "+User.dirname+User.atlasFilename);
	}	

	// 5. Unload unused data (the check is only done if new data has been added)
	if(data.description==="sendAtlas") {
		unloadUnusedBrains();
		unloadUnusedAtlases();
	}
}

/*
 send new user information to old users,
 and old users information to new user.
*/
var sendPreviousUserDataMessage = function(newUS) {
	if(debug) console.log("[sendPreviousUserDataMessage]");
	
	var i,n=0;
	for(i in US) {
		if(US[i].socket==newUS.socket)
			continue;
		var msg=JSON.stringify({type:"intro",user:US[i].User,uid:US[i].uid,description:"old user intro to new user"});
		newUS.socket.send(msg);
		n++;
	}
	if(debug) console.log("  send user data from "+n+" users");		
}
var sendAtlasToUser = function(atlasdata,user_socket,flagCompress) {
	if(debug>=1) console.log("[sendAtlasToUser]");
	
	if(flagCompress) {
		zlib.gzip(atlasdata,function(err,atlasdatagz) {
			try {
				user_socket.send(Buffer.concat([atlasdatagz,niiTag]), {binary: true, mask: false});
			} catch(e) {
				console.log("ERROR: Cannot send atlas data to user");
			}
		});
	} else {
		try {
			user_socket.send(Buffer.concat([atlasdata,niiTag]), {binary: true, mask: false});
		} catch(e) {
			console.log("ERROR: Cannot send atlas data to user");
		}
	}
}
var broadcastPaintVolumeMessage = function(msg,User) {
	if(debug) console.log("> broadcastPaintVolumeMessage()");
	
	try {
		var n=0,i,msg=JSON.stringify({"type":"paintvol","data":msg});
		for(i in US) {
			if( US[i].User!=undefined &&
				US[i].User.iAtlas!=User.iAtlas )
				continue;
			US[i].socket.send(msg);
			n++;
		}
		if(debug) console.log("paintVolume message broadcasted to "+n+" users");
		
	} catch (ex) {
		console.log("ERROR: Unable to broadcastPaintVolumeMessage",ex);
	}
}
var sendDisconnectMessage = function(uid) {
	if(debug) console.log("> sendDisconnectMessage()");
	
	try {
		var n=0,i,msg=JSON.stringify({type:"disconnect",uid:uid});
		for(i in US) {
			US[i].socket.send(msg);
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
var addAtlas = function(User,callback) {
	if(debug) console.log("[add atlas]");

	var atlas={
		name:User.atlasFilename,
		specimen:User.specimenName,
		dirname:User.dirname,
		dim:User.dim
	};

	console.log("User requests atlas "+atlas.name+" from "+atlas.dirname);
	
	loadAtlasNifti(atlas,User,function() {
		Atlases.push(atlas);
		User.iAtlas=Atlases.indexOf(atlas);

		atlas.timer=setInterval(function(){saveNifti(atlas)},60*60*1000); // 60 minutes
		
		callback();
	});

}
var loadNifti = function(nii) {
	if(debug>=1) console.log("[loadNifti]");
	
	var mri={};

	// standard nii header
	var niiHdr=niijs.parseNIfTIHeader(nii);
	var	sizeof_hdr=niiHdr.sizeof_hdr;
	mri.dim=niiHdr.dim.slice(1);
	mri.pixdim=niiHdr.pixdim.slice(1);
	mri.vox_offset=niiHdr.vox_offset;
	
	// nrrd-compatible header, computes space directions and space origin
	if(niiHdr.qform_code>0) {
		var nrrdHdr=niijs.parseHeader(nii);
		mri.dir=nrrdHdr.spaceDirections;
		mri.ori=nrrdHdr.spaceOrigin;
	} else {
		mri.dir=[[mri.pixdim[0],0,0],[0,mri.pixdim[1],0],[0,0,mri.pixdim[2]]];
		mri.ori=[0,0,0];
	}
	
	// compute the transformation from voxel space to screen space
	computeS2VTransformation(mri);
	
	// test if the transformation looks incorrect. Reset it if it does
	testS2VTransformation(mri);

	// manually parsed information
	mri.hdr=nii.slice(0,352);
	mri.datatype=nii.readUInt16LE(70);
	
	switch(mri.datatype) {
		case 2: // UCHAR
			mri.data=nii.slice(mri.vox_offset);
			break;
		case 4: // SHORT
			var tmp=nii.slice(mri.vox_offset);
			mri.data=new Int16Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
				mri.data[j]=tmp.readInt16LE(j*2);
			break;
		case 8: // INT
			var tmp=nii.slice(mri.vox_offset);
			mri.data=new Uint32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
				mri.data[j]=tmp.readUInt32LE(j*4);
			break;
		case 16: // FLOAT
			var tmp=nii.slice(mri.vox_offset);
			mri.data=new Float32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
				mri.data[j]=tmp.readFloatLE(j*4);
			break;
		default:
			console.log("ERROR: Unknown dataType: "+mri.datatype);
	}
	
	return mri;
}
var loadAtlasNifti = function(atlas,User,callback) {
	if(debug>=1) console.log("[loadAtlasNifti]");
		
	// Load nifty label
	
	var path=__dirname+"/public"+atlas.dirname+atlas.name;
	var datatype=2;
	var	vox_offset=352;
	
	if(!fs.existsSync(path)) {
		console.log("Atlas "+path+" does not exists. Create a new one");
		encodeAtlasNiftiHeader(User)
		.then(function(hdr) {
			atlas.hdr=hdr;
			atlas.data=new Buffer(atlas.dim[0]*atlas.dim[1]*atlas.dim[2]);
			for(var i=0;i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2];i++)
				atlas.data[i]=0;
			atlas.sum=0;

			console.log(new Date());
			console.log("      atlas size:",atlas.data.length);
			console.log("       atlas dim:",atlas.dim);
			console.log("  atlas datatype:",datatype);
			console.log("atlas vox_offset:",vox_offset);
			console.log("     free memory:",os.freemem());

			callback(atlas.data);
	
			// log atlas creation
			db.get('log').insert({
				key: "createAtlas",
				value: JSON.stringify({specimen:atlas.specimen,atlas:atlas.name}),
				username: User.username,
				date: (new Date()).toJSON()
			});
		});
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
				console.log("    atlas size:",atlas.data.length);
				console.log("     atlas dim:",atlas.dim);
				console.log("atlas datatype:",atlas.datatype);
				console.log("   free memory:",os.freemem());
				callback(atlas.data);
			});
		} catch(e) {
			console.log("ERROR: Cannot read atlas data");
		}
	}
}
var encodeAtlasNiftiHeader = function(User) {
	var encode=function encode(mri) {
		var hdr=new Buffer(mri.hdr);
		var datatype=2;
		var vox_offset=352;
		hdr.writeUInt16LE(datatype,70,2);	// set datatype to 2:unsigned char (8 bits/voxel)
		hdr.writeFloatLE(vox_offset,108,4);	// set voxel_offset to 352 (minimum size of a nii header)
		return hdr;
	}
	var pr = new Promise(function(resolve, reject) {
		var brain=getBrainAtPath(User.dirname+User.mri,function(mri) {
			resolve(encode(mri));
		});
		if(brain)
			resolve(encode(mri));
    });
    return pr;
}
var saveNifti = function(atlas) {
	if(debug>=1) console.log("[saveNifti]");

	if(atlas && atlas.dim ) {
		if(atlas.data==undefined) {
			displayAtlases();
			console.log("ERROR: [saveNifti] atlas in Atlas array has no data");
			console.log(atlas);
			return Promise.resolve();
		} else {
			var i,sum=0;
			for(i=0;i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2];i++)
				sum+=atlas.data[i];
			if(sum==atlas.sum) {
				console.log("Atlas",atlas.specimen,atlas.name,
							"no change, no save, freemem",os.freemem());
				return Promise.resolve();
			}
			atlas.sum=sum;

			var	voxel_offset=352;
			var	nii=new Buffer(atlas.dim[0]*atlas.dim[1]*atlas.dim[2]+voxel_offset);
			console.log("Atlas",atlas.dirname,atlas.name,
						"data length",atlas.data.length+voxel_offset,
						"buff length",nii.length);
			atlas.hdr.copy(nii);
			atlas.data.copy(nii,voxel_offset);
			
			var pr=new Promise(function(resolve, reject) {
				zlib.gzip(nii,function(err,niigz) {
					var	ms=+new Date;
					var path1=__dirname+"/public"+atlas.dirname+atlas.name;
					var	path2=__dirname+"/public"+atlas.dirname+ms+"_"+atlas.name;
					fs.rename(path1,path2,function(){
						fs.writeFileSync(path1,niigz);
						resolve();
					});
				});
			});
		}
	} else {
		return Promise.resolve();
	}


	return pr;
}

//========================================================================================
// Undo
//========================================================================================

/* TODO
 UndoStacks should be stored separately for each user, in that way
 when a user leaves, its undo stack is disposed. With the current
 implementation, we'll be storing undo stacks for long gone users...
*/

var pushUndoLayer = function(User) {
	if(debug) console.log("[pushUndoLayer] for user "+User.username+" "+User.specimenName+" "+User.atlasFilename);
		
	var undoLayer={User:User,actions:[]};
	UndoStack.push(undoLayer);

	if(debug) console.log("Number of layers: "+UndoStack.length);
	
	return undoLayer;
}
var getCurrentUndoLayer = function(User) {
	if(debug>=2) console.log("[getCurrentUndoLayer]");
		
	var i,undoLayer,found=false;
	
	for(i=UndoStack.length-1;i>=0;i--) {
		undoLayer=UndoStack[i];
		if(undoLayer===undefined)
			break;
		if( undoLayer.User.username===User.username &&
			undoLayer.User.atlasFilename===User.atlasFilename &&
			undoLayer.User.specimenName===User.specimenName) {
			found=true;
			break;
		}
	}
	if(!found) {
		// There was no undoLayer for this user. This may be the
		// first user's action. Create an appropriate undoLayer for it.
		console.log("No previous undo layer for "+User.username+", "+User.atlasFilename+", "+User.specimenName+": Create and push one");
		undoLayer=pushUndoLayer(User);
	}	
	return undoLayer;
}
var undo = function(User) {
	if(debug) console.log("[undo]");
		
	var undoLayer;
	var	i,action,found=false;
	
	// find latest undo layer for user
	for(i=UndoStack.length-1;i>=0;i--) {
		undoLayer=UndoStack[i];
		if(undoLayer===undefined)
			break;
		if( undoLayer.User.username===User.username &&
			undoLayer.User.atlasFilename===User.atlasFilename &&
			undoLayer.User.specimenName===User.specimenName &&
			undoLayer.actions.length>0) {
			found=true;
			UndoStack.splice(i,1); // remove layer from UndoStack
			if(debug) console.log("found undo layer for "+User.username+", "+User.specimenName+", "+User.atlasFilename+", with "+undoLayer.actions.length+" actions");
			break;
		}
	}
	if(!found) {
		// There was no undoLayer for this user.
		if(debug) console.log("No undo layers for user "+User.username+" in "+User.specimenName+", "+User.atlasFilename);
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
	var atlas=Atlases[User.iAtlas];
	var	vol=atlas.data;
	var val;

	for(var j in undoLayer.actions) {
		var i=parseInt(j);
		val=undoLayer.actions[i];
		arr.push([i,val]);

	    // The actual undo having place:
	    vol[i]=val;
	    
	    if(debug>=3) console.log("undo:",i%User.dim[0],parseInt(i/User.dim[0])%User.dim[1],parseInt(i/User.dim[0]/User.dim[1])%User.dim[2]);
	}
	msg={"data":arr};
	broadcastPaintVolumeMessage(msg,User);

	if(debug) console.log(UndoStack.length+" undo layers remaining (all users)");	
}

//========================================================================================
// Painting
//========================================================================================
var paintxy = function(u,c,x,y,User,undoLayer) {
/*
	From 'User' we know slice, atlas, vol, view, dim.
	[issue: undoLayer also has a User field. Maybe only undoLayer should be kept?]
*/
	var atlas=Atlases[User.iAtlas];
	if(atlas.data===undefined) {
		console.log("ERROR: No atlas to draw into");
		return;
	}
	
	var coord={"x":x,"y":y,"z":User.slice};
		
	switch(c) {
		case 'me':
		case 'mf':
			if(User.x0<0) {
				User.x0=coord.x;
				User.y0=coord.y;
			}
			break;
		case 'le': // Line, erasing
			line(coord.x,coord.y,0,User,undoLayer);
			User.x0=coord.x;
			User.y0=coord.y;
			break;
		case 'lf': // Line, painting
			line(coord.x,coord.y,User.penValue,User,undoLayer);
			User.x0=coord.x;
			User.y0=coord.y;
			break;
		case 'f': // Fill, painting
			fill(coord.x,coord.y,coord.z,User.penValue,User,undoLayer);
			break;
		case 'e': // Fill, erasing
			fill(coord.x,coord.y,coord.z,0,User,undoLayer);
			break;
		case 'mu': // Mouse up (touch ended)
			pushUndoLayer(User);
			break;
		case 'u':
			undo(User);
			break;
	}
}
var paintVoxel = function(mx,my,mz,User,vol,val,undoLayer) {
	var	view=User.view;
	var atlas=Atlases[User.iAtlas];
	var	x,y,z;
	var sdim=User.s2v.sdim;

	switch(view) {
		case 'sag':	x=mz; y=mx; z=sdim[2]-1-my;break; // sagital
		case 'cor':	x=mx; y=mz; z=sdim[2]-1-my;break; // coronal
		case 'axi':	x=mx; y=sdim[1]-1-my; z=mz;break; // axial
	}	

	var s,v;
	s=[x,y,z];
	i=S2I(s,User);
	if(vol[i]!=val) {
		undoLayer.actions[i]=vol[i];
		vol[i]=val;
	}
}
var sliceXYZ2index = function(mx,my,mz,User) {
	var	view=User.view;
	var atlas=Atlases[User.iAtlas];
	var	dim=atlas.dim;
	var	x,y,z;
	var	i=-1;
	var sdim=User.s2v.sdim;

	switch(view) {
		case 'sag':	x=mz; y=mx; z=sdim[2]-1-my;break; // sagital
		case 'cor':	x=mx; y=mz; z=sdim[2]-1-my;break; // coronal
		case 'axi':	x=mx; y=sdim[1]-1-my; z=mz;break; // axial
	}	
	var s;
	s=[x,y,z];
	i=S2I(s,User);
	
	return i;
}
var line = function(x,y,val,User,undoLayer) {
	// Bresenham's line algorithm adapted from
	// http://stackoverflow.com/questions/4672279/bresenham-algorithm-in-javascript

	var atlas=Atlases[User.iAtlas];
	var	vol=atlas.data;
	var	dim=atlas.dim;
	var	x1=User.x0; 	// screen coords
	var y1=User.y0; 	// screen coords
	var	z=User.slice;	// screen coords
	var x2=x;
	var y2=y;
	var	i;
	
	if(Math.pow(x1-x2,2)+Math.pow(y1-y2,2)>10*10)
		console.log("WARNING: long line from",x1,y1,"to",x2,y2,User);

    // Define differences and error check
    var dx = Math.abs(x2 - x1);
    var dy = Math.abs(y2 - y1);
    var sx = (x1 < x2) ? 1 : -1;
    var sy = (y1 < y2) ? 1 : -1;
    var err = dx - dy;

	for(j=0;j<User.penSize;j++)
	for(k=0;k<User.penSize;k++)
	    paintVoxel(x1+j,y1+k,z,User,vol,val,undoLayer);
    
	while (!((x1 === x2) && (y1 === y2))) {
		var e2 = err << 1;
		if (e2 > -dy) {
			err -= dy;
			x1 += sx;
		}
		if (e2 < dx) {
			err += dx;
			y1 += sy;
		}
		for(j=0;j<User.penSize;j++)
		for(k=0;k<User.penSize;k++)
			paintVoxel(x1+j,y1+k,z,User,vol,val,undoLayer);
	}
}
var fill = function(x,y,z,val,User,undoLayer) {
	var view=User.view;
	var	vol=Atlases[User.iAtlas].data;
	var dim=Atlases[User.iAtlas].dim;
	var	Q=[],n;
	var	i;
	var bval=vol[sliceXYZ2index(x,y,z,User)]; // background-value: value of the voxel where the click occurred

	if(bval===val)	// nothing to do
		return;
	
	Q.push({"x":x,"y":y});
	while(Q.length>0) {
		n=Q.pop();
		x=n.x;
		y=n.y;
		if(vol[sliceXYZ2index(x,y,z,User)]===bval) {
			paintVoxel(x,y,z,User,vol,val,undoLayer);
			
			i=sliceXYZ2index(x-1,y,z,User);
			if(i>=0 && vol[i]===bval)
				Q.push({"x":x-1,"y":y});
			
			i=sliceXYZ2index(x+1,y,z,User);
			if(i>=0 && vol[i]===bval)
				Q.push({"x":x+1,"y":y});
			
			i=sliceXYZ2index(x,y-1,z,User);
			if(i>=0 && vol[i]===bval)
				Q.push({"x":x,"y":y-1});
			
			i=sliceXYZ2index(x,y+1,z,User);
			if(i>=0 && vol[i]===bval)
				Q.push({"x":x,"y":y+1});
		}
	}
}
/*
	Serve brain slices
*/
var loadBrainNifti = function(nii,callback) {
	var brain=loadNifti(nii);
		
	console.log(new Date());
	console.log("    brain size:",brain.data.length);
	console.log("     brain dim:",brain.dim);
	console.log("brain datatype:",brain.datatype);
	console.log("   free memory:",os.freemem());
	
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
var loadBrainMGZ = function(data,callback) {
	var hdr_sz=284;
	var brain={};
	var datatype;
	var tmp,j;
	
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
			tmp=data.slice(hdr_sz);
			brain.data=new Uint32Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(j=0;j<brain.dim[0]*brain.dim[1]*brain.dim[2];j++)
				brain.data[j]=tmp.readUInt32BE(j*4);
			break;
		case 3: // MGHFLOAT
			tmp=data.slice(hdr_sz);
			brain.data=new Float32Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(j=0;j<brain.dim[0]*brain.dim[1]*brain.dim[2];j++)
				brain.data[j]=tmp.readFloatBE(j*4);
			break;
		case 4: // MGHSHORT
			tmp=data.slice(hdr_sz);
			brain.data=new Int16Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(j=0;j<brain.dim[0]*brain.dim[1]*brain.dim[2];j++)
				brain.data[j]=tmp.readInt16BE(j*2);
			break;
		default:
			console.log("ERROR: Unknown dataType: "+datatype);
	}
		
	console.log(new Date());
	console.log("    brain size:",brain.data.length);
	console.log("     brain dim:",brain.dim);
	console.log("brain datatype:",datatype);
	console.log("   free memory:",os.freemem());
	
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
var loadBrainCompressed = function(path,callback) {
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
			var ext=path.split('.').pop();
			
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
			console.log("ERROR: Cannot read brain data");
		}
	}
	return null;
}

var mulMatVec = function(m,v) {
	return [
		m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2],
		m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2],
		m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]
	];
}
var invMat = function(m) {
    var det;
    var w=[[],[],[]];

    det=m[0][1]*m[1][2]*m[2][0] + m[0][2]*m[1][0]*m[2][1] + m[0][0]*m[1][1]*m[2][2] - m[0][2]*m[1][1]*m[2][0] - m[0][0]*m[1][2]*m[2][1] - m[0][1]*m[1][0]*m[2][2];
    
    w[0][0]=(m[1][1]*m[2][2] - m[1][2]*m[2][1])/det;
    w[0][1]=(m[0][2]*m[2][1] - m[0][1]*m[2][2])/det;
    w[0][2]=(m[0][1]*m[1][2] - m[0][2]*m[1][1])/det;
    
    w[1][0]=(m[1][2]*m[2][0] - m[1][0]*m[2][2])/det;
    w[1][1]=(m[0][0]*m[2][2] - m[0][2]*m[2][0])/det;
    w[1][2]=(m[0][2]*m[1][0] - m[0][0]*m[1][2])/det;
    
    w[2][0]=(m[1][0]*m[2][1] - m[1][1]*m[2][0])/det;
    w[2][1]=(m[0][1]*m[2][0] - m[0][0]*m[2][1])/det;
    w[2][2]=(m[0][0]*m[1][1] - m[0][1]*m[1][0])/det;
    
    return w;
}
var subVecVec = function(a,b) {
	return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
}
var addVecVec = function(a,b) {
	return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
}
var computeS2VTransformation = function(mri) {
	/*
		The basic transformation is
		w = v2w * v + wori
		
		Where:
		w: world coordinates
		wori: origin of the world coordinates
		v: voxel coordinates
		v2w: rotation matrix from v to w
		
		In what follows:
		v refers to native voxel coordinates
		w refers to world coordinates
		s refers screen pixel coordinates
	*/ 
	var wori=mri.ori;
	// space directions are transposed!
	var v2w=[[],[],[]];
	for(j in mri.dir)
		for(i in mri.dir[j]) v2w[i][j]=mri.dir[j][i];	// transpose
	var wpixdim=subVecVec(mulMatVec(v2w,[1,1,1]),mulMatVec(v2w,[0,0,0]));
	// min and max world coordinates
	var wvmax=addVecVec(mulMatVec(v2w,mri.dim),wori);
	var wvmin=addVecVec(mulMatVec(v2w,[0,0,0]),wori);
	var wmin=[Math.min(wvmin[0],wvmax[0]),Math.min(wvmin[1],wvmax[1]),Math.min(wvmin[2],wvmax[2])];
	var wmax=[Math.max(wvmin[0],wvmax[0]),Math.max(wvmin[1],wvmax[1]),Math.max(wvmin[2],wvmax[2])];
	var w2s=[[1/Math.abs(wpixdim[0]),0,0],[0,1/Math.abs(wpixdim[1]),0],[0,0,1/Math.abs(wpixdim[2])]];

	// console.log(["v2w",v2w, "wori",wori, "wpixdim",wpixdim, "wvmax",wvmax, "wvmin",wvmin, "wmin",wmin, "wmax",wmax, "w2s",w2s]);

	mri.s2v = {
		sdim: [(wmax[0]-wmin[0])/Math.abs(wpixdim[0]),(wmax[1]-wmin[1])/Math.abs(wpixdim[1]),(wmax[2]-wmin[2])/Math.abs(wpixdim[2])],
		s2w: invMat(w2s),
		sori: [-wmin[0]/Math.abs(wpixdim[0]),-wmin[1]/Math.abs(wpixdim[1]),-wmin[2]/Math.abs(wpixdim[2])],
		w2v: invMat(v2w),
		wori: wori
	};
	mri.v2w=v2w;
	mri.wori=wori;
}
var testS2VTransformation = function(mri) {
	/*
		check the S2V transformation to see if it looks correct.
		If it does not, reset it
	*/
	var doReset=false;
	
	console.log("Transformation TEST:");

	if(debug) process.stdout.write("1. transformation volume: ");
	var vv=mri.dim[0]*mri.dim[1]*mri.dim[2];
	var vs=mri.s2v.sdim[0]*mri.s2v.sdim[1]*mri.s2v.sdim[2];
	var diff=(vs-vv)/vv;
	if(Math.abs(diff)>0.001) {
		doReset=true;
		if(debug) console.log("fail");
	} else {
		if(debug) console.log("ok");
	}
	
	if(debug) process.stdout.write("2. transformation origin: ");
	if(	mri.s2v.sori[0]<0||mri.s2v.sori[0]>mri.s2v.sdim[0] ||
		mri.s2v.sori[1]<0||mri.s2v.sori[1]>mri.s2v.sdim[1] ||
		mri.s2v.sori[2]<0||mri.s2v.sori[2]>mri.s2v.sdim[2]) {
		doReset=true;
		if(debug) console.log("fail");
	} else {
		if(debug) console.log("ok");
	}

	if(doReset) {
		console.log("FAIL: TRANSFORMATION WILL BE RESET");
		mri.dir=[[mri.pixdim[0],0,0],[0,-mri.pixdim[1],0],[0,0,-mri.pixdim[2]]];
		mri.ori=[0,mri.dim[1],mri.dim[2]];
		computeS2VTransformation(mri);

		if(debug) {
			console.log("dir",mri.dir);
			console.log("ori",mri.ori);
			console.log("s2v",mri.s2v);
		}
	} else {
		console.log("ok");
	}
}
var S2V = function(s,mri) {
	var s2v=mri.s2v;
	var i,w,s,v,v1=[];
	w=mulMatVec(s2v.s2w,subVecVec(s,s2v.sori)); // screen to world: w=s2w*(s-sori)
	v=mulMatVec(s2v.w2v,subVecVec(w,s2v.wori)); // world to voxel
	v1=[Math.round(v[0]),Math.round(v[1]),Math.round(v[2])]; // round to integer
	return v1;
}
var S2I = function(s,mri) {
	var s2v=mri.s2v;
	var i=null,w,s,v;
	w=mulMatVec(s2v.s2w,subVecVec(s,s2v.sori)); // screen to world: w=s2w*(s-sori)
	v=mulMatVec(s2v.w2v,subVecVec(w,s2v.wori)); // world to voxel
	v=[Math.round(v[0]),Math.round(v[1]),Math.round(v[2])]; // round to integer
	if(v[0]>=0&&v[0]<mri.dim[0]&&v[0]>=0&&v[0]<mri.dim[0]&&v[0]>=0&&v[0]<mri.dim[0])
		i= v[2]*mri.dim[1]*mri.dim[0]+ v[1]*mri.dim[0] +v[0];
	return i;
}
var drawSlice = function(brain,view,slice) {
	var x,y,i,j;
	var brain_W, brain_H, brain_D;
	var ys,ya,yc;
	var val;
	var s,s2v=brain.s2v;
	
	switch(view) {
		case 'sag':	brain_W=s2v.sdim[1]; brain_H=s2v.sdim[2]; brain_D=s2v.sdim[0]; break; // sagital
		case 'cor':	brain_W=s2v.sdim[0]; brain_H=s2v.sdim[2]; brain_D=s2v.sdim[1]; break; // coronal
		case 'axi':	brain_W=s2v.sdim[0]; brain_H=s2v.sdim[1]; brain_D=s2v.sdim[2]; break; // axial
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
			case 'sag': s=[ys,x,s2v.sdim[2]-1-y]; break;
			case 'cor': s=[x,yc,s2v.sdim[2]-1-y]; break;
			case 'axi': s=[x,s2v.sdim[1]-1-y,ya]; break;
		}
		i=S2I(s,brain);
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

return this;
}
module.exports = atlasMakerServer();

/*
	Atlases
		.name:		string
		.dirname:	string
		.hdr:		Analyze hdr
		.dim[3]:	3 uint16s
		.data:		Analyze img
		.sum:		value sum
	
	US
		.uid
		.socket
		.User
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
