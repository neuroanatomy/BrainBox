var request = require('request');
var http = require('http'),
	server = http.createServer(),
	url = require('url'),
	WebSocketServer = require('ws').Server,
	websocket,
	port = 8080;
var os=require('os');
var fs=require('fs');
var zlib=require('zlib');
var fileType=require('file-type');
var jpeg=require('jpeg-js'); // jpeg-js library: https://github.com/eugeneware/jpeg-js
var keypress = require('keypress');
var dateFormat = require('dateformat');
var async = require('async');
var Struct = require('struct');
var child_process = require('child_process');

var mongo = require('mongodb');
var monk = require('monk');
var db = monk('localhost:27017/brainbox');

const createDOMPurify = require('dompurify');
const jsdom = require('jsdom');
const window = jsdom.jsdom('', {
  features: {
    FetchExternalResources: false, // disables resource loading over HTTP / filesystem
    ProcessExternalResources: false // do not execute JS within script blocks
  }
}).defaultView;
const DOMPurify = createDOMPurify(window);

var atlasMakerServer = function() {

var	debug = 1;
this.dataDirectory = "";
var	Atlases = [];
this.Brains = [];
var	US = [];
var	uidcounter = 1;
var enterCommands = false;
var UndoStack = [];

var NiiHdr = new Struct()
    .word32Sle('sizeof_hdr')        // Size of the header. Must be 348 (bytes)
    .chars('data_type',10)          // Not used; compatibility with analyze.
    .chars('db_name',18)            // Not used; compatibility with analyze.
    .word32Sle('extents')           // Not used; compatibility with analyze.
    .word16Sle('session_error')     // Not used; compatibility with analyze.
    .word8('regular')               // Not used; compatibility with analyze.
    .word8('dim_info')              // Encoding directions (phase, frequency, slice).
    .array('dim',8,'word16Sle')     // Data array dimensions.
    .floatle('intent_p1')           // 1st intent parameter.
    .floatle('intent_p2')           // 2nd intent parameter.
    .floatle('intent_p3')           // 3rd intent parameter.
    .word16Sle('intent_code')       // nifti intent.
    .word16Sle('datatype')	        // Data type.
    .word16Sle('bitpix')	        // Number of bits per voxel.
    .word16Sle('slice_start')	    // First slice index.
    .array('pixdim',8,'floatle')    // Grid spacings (unit per dimension).
    .floatle('vox_offset')	        // Offset into a .nii file.
    .floatle('scl_slope')	        // Data scaling, slope.
    .floatle('scl_inter')	        // Data scaling, offset.
    .word16Sle('slice_end')	        // Last slice index.
    .word8('slice_code')	        // Slice timing order.
    .word8('xyzt_units')	        // Units of pixdim[1..4].
    .floatle('cal_max')	            // Maximum display intensity.
    .floatle('cal_min')	            // Minimum display intensity.
    .floatle('slice_duration')	    // Time for one slice.
    .floatle('toffset')	            // Time axis shift.
    .word32Sle('glmax')	            // Not used; compatibility with analyze.
    .word32Sle('glmin')	            // Not used; compatibility with analyze.
    .chars('descrip',80)	        // Any text.
    .chars('aux_file',24)	        // Auxiliary filename.
    .word16Sle('qform_code')	    // Use the quaternion fields.
    .word16Sle('sform_code')	    // Use of the affine fields.
    .floatle('quatern_b')	        // Quaternion b parameter.
    .floatle('quatern_c')	        // Quaternion c parameter.
    .floatle('quatern_d')	        // Quaternion d parameter.
    .floatle('qoffset_x')	        // Quaternion x shift.
    .floatle('qoffset_y')	        // Quaternion y shift.
    .floatle('qoffset_z')	        // Quaternion z shift.
    .array('srow_x',4,'floatle')    // 1st row affine transform
    .array('srow_y',4,'floatle')    // 2nd row affine transform.
    .array('srow_z',4,'floatle')    // 3rd row affine transform.
    .chars('intent_name',16)	    // Name or meaning of the data.
    .chars('magic',4);	            // Magic string.
var MghHdr = Struct()
    .word32Sbe('v')
    .word32Sbe('ndim1')
    .word32Sbe('ndim2')
    .word32Sbe('ndim3')
    .word32Sbe('nframes')
    .word32Sbe('type')
    .word32Sbe('dof')
    .word16Sbe('ras_good_flag')
    .array('delta',3,'floatbe')
    .array('Mdc',9,'floatbe')
    .array('Pxyz_c',3,'floatbe');


console.log("atlasMakerServer.js");
console.log(new Date());
setInterval(function(){console.log(new Date())},60*60*1000); // time mark every 60 minutes
console.log("free memory",os.freemem());

function traceLog(f, l) {
    if(l==undefined || debug>l)
        console.log("ams> "+(f.name)+" "+(f.caller?(f.caller.name||"annonymous"):"root"));
};

var bufferTag = function bufferTag(str, sz) {
    traceLog(bufferTag);
    
	var buf=new Buffer(sz).fill(32);
	buf.write(str);
	return buf;
};
var niiTag=bufferTag("nii",8);
var mghTag=bufferTag("mgh",8);
var jpgTag=bufferTag("jpg",8);

var displayAtlases = function displayAtlases() {
    traceLog(displayAtlases);
	console.log("\n"+Atlases.filter(function(o){return o!==undefined}).length+" Atlases:");
	for(var i in Atlases) {
		var sum=numberOfUsersConnectedToAtlas(Atlases[i].dirname,Atlases[i].name);
		console.log("Atlases["+i+"] path:"+Atlases[i].dirname+Atlases[i].name+", "+sum+" users connected");
	}
	for(var i in Atlases) {
		console.log(Atlases[i]);
	}
};
var displayBrains = function displayBrains() {
    traceLog(displayBrains);
	console.log("\n"+Brains.filter(function(o){return o!==undefined}).length+" Brains:");
	var i;
	for(i in Brains) {
		var sum=numberOfUsersConnectedToMRI(Brains[i].path);
		console.log("Brains["+i+"].path="+Brains[i].path+", "+sum+" users connected");
	}
	for(i in Brains) {
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
};
var displayUsers = function displayUsers() {
    traceLog(displayUsers);
	console.log("\n"+US.filter(function(o){return o!==undefined}).length+" User Sockets:");
	for(var i in US) {
		console.log("US["+i+"].uid=",US[i].uid);
		console.log("US["+i+"]=",US[i].User);
	}
}
keypress(process.stdin);
process.stdin.on('keypress', function (ch, key) {
	if(key) {
	    // console.log(ch,key);
		if(key.name === 'c' && key.ctrl) {
			console.log("Exit.");
			process.exit();
		}
		if(key.name === 'escape') {
			enterCommands = !enterCommands;
			console.log("enterCommands: "+enterCommands);
		}
		if(key.name === 'backspace') {
		    process.stdout.write('\b');
		}
		if(enterCommands === false) {
			if(key.name === 'return')
				console.log();
		}
	}
	
	if(ch) {
        if(enterCommands) {
            switch (ch) {
                case 'a':
                    displayAtlases();
                    break;
                case 'b':
                    displayBrains();
                    break;
                case 'u':
                    displayUsers();
                    break;
                case '0':
                    debug=0;
                    console.log("debug level:",debug);
                    break;
                case '1':
                    debug=1;
                    console.log("debug level:",debug);
                    break;
                case '2':
                    debug=2;
                    console.log("debug level:",debug);
                    break;
                case '3':
                    debug=3;
                    console.log("debug level:",debug);
                    break;
            }
        } else {    
            process.stdout.write(ch);
        }
    }
});
process.stdin.setRawMode(true);
process.stdin.resume();

//========================================================================================
// Web socket
//========================================================================================
var getUserFromSocket = function getUserFromSocket(socket) {
    traceLog(getUserFromSocket,1);
	for(var i in US) {
		if(socket === US[i].socket)
			return US[i];
	}
	return -1;
};
var getUserFromUserId = function getUserFromUserId(uid) {
    traceLog(getUserFromUserId,1);
	for(var i in US) {
		if(uid === US[i].uid)
			return US[i];
	}
	return null;
};
var getUserIdFromSocket = function getUserIdFromSocket(socket) {
    traceLog(getUserIdFromSocket);
	for(var i in US) {
		if(socket === US[i].socket)
			return US[i].uid;
	}
	return null;
};
var removeUser = function removeUser(socket) {
    traceLog(removeUser);
	for(var i in US) {
		if(socket === US[i].socket) {
			delete US[i];
			break;
		}
	}
};
var numberOfUsersConnectedToMRI = function numberOfUsersConnectedToMRI(path) {
    traceLog(numberOfUsersConnectedToMRI);
	var sum=0;

	if(path == undefined)
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
};
var unloadMRI = function unloadMRI(path) {
    traceLog(unloadMRI);
		
	var i;
	for(i in Brains) {
		if(Brains[i].path===path) {
			delete Brains[i];
			console.log("    free memory",os.freemem());
			break;
		}
	}
}

var numberOfUsersConnectedToAtlas = function numberOfUsersConnectedToAtlas(dirname,atlasFilename) {
    traceLog(numberOfUsersConnectedToAtlas);
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
};
var unloadAtlas = function unloadAtlas(dirname,atlasFilename) {
    traceLog(unloadAtlas);

	var i;
	for(i in Atlases) {
		if(Atlases[i].dirname===dirname && Atlases[i].name===atlasFilename) {
			saveNifti(Atlases[i])
                .then(function () {
                    console.log("    Atlas saved. Unloading it");
                    clearInterval(Atlases[i].timer);
                    delete Atlases[i];
                    console.log("    free memory",os.freemem());
                });
			break;
		}
	}
};
var initSocketConnection = function initSocketConnection() {
    traceLog(initSocketConnection);
    
	// WS connection
	try {
		websocket = new WebSocketServer({ server: server });
		
		websocket.on("connection",function connection_fromInitSocketConnection(s) {
		    traceLog(connection_fromInitSocketConnection);

			console.log("    remote_address",s.upgradeReq.connection.remoteAddress);
			var	newUS={"uid":"u"+uidcounter++,"socket":s};
			US.push(newUS);
			console.log("    User id "+newUS.uid+" connected, total: "+US.filter(function(o){return o!=undefined}).length+" users");
			
			// send data from previous users
			sendPreviousUserDataMessage(newUS);
			
			s.on('message',function message_fromInitSocketConnection(msg) {
			    traceLog(message_fromInitSocketConnection,1);
			    var sender = this;
				var sourceUS=getUserFromSocket(this);
				var data={};
				
				if(msg instanceof Buffer) { // Handle binary data: a user uploaded an atlas file
					data.data=msg;
					data.type="atlas";
				} else
					data=JSON.parse(msg);
				data.uid=sourceUS.uid;
				
				if(debug>1) {
				    console.log();
				    console.log("data type:",data.type);
				}

				switch(data.type) {
					case "userData":
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
					case "userNameQuery":
						var result = queryUserName(data)
						.then(function(obj){
							data.metadata = obj;
							sender.send(JSON.stringify(data));
                        })
						.catch(function(){});
						break;
					case "projectNameQuery":
						var result = queryProjectName(data)
						.then(function(obj){
							data.metadata = obj;
							sender.send(JSON.stringify(data));
                        })
						.catch(function(){});
						break;
					default :
						break;
				}

				// broadcast
				var n=0;
				for(var i in websocket.clients) {
					// i-th user
					var targetUS=getUserFromSocket(websocket.clients[i]);
					
					// do not auto-broadcast
					if(sourceUS.uid===targetUS.uid) {
						sender = websocket.clients[i];
						if(debug>1) console.log("    no broadcast to self");
						continue;
					}
					
					// do not broadcast to unknown users
					if( sourceUS.User===undefined || targetUS.User===undefined) {
						if(debug) console.log("    User "+sourceUS.uid+": "+(sourceUS.User===undefined)?"undefined":"defined");
						if(debug) console.log("    User "+targetUS.uid+": "+(targetUS.User===undefined)?"undefined":"defined");
						continue;
					}
					
					if( targetUS.User.iAtlas!==sourceUS.User.iAtlas && data.type!=="chat" && data.type!=="userData" ) {
						if(debug>1) console.log("    no broadcast to user "+targetUS.User.username+" [uid: "+targetUS.uid+"] of atlas "+targetUS.User.specimenName+"/"+targetUS.User.atlasFilename);
						continue;
					}
					
					if(data.type==="atlas") {
						sendAtlasToUser(data.data,websocket.clients[i],false);
					} 
					else {
					    // sanitise data
					    const cleanData=DOMPurify.sanitize(JSON.stringify(data));
						websocket.clients[i].send(cleanData);
					}
					n++;
				}
				if(debug>2) console.log("    broadcasted to",n,"users");
			});
			
			s.on('close',function close_fromInitSocketConnection(msg) {
			    traceLog(close_fromInitSocketConnection);

				var i, sum, nusers, sourceUS;
				
				console.log("A user is disconnecting");
				console.log("There are "+US.filter(function(o){return o!=undefined}).length+" connected");
				
				sourceUS=getUserFromSocket(this);
				console.log("    The user disconnecting is: "+sourceUS.uid);
				
				if(sourceUS.User===undefined) {
					console.log("<WARNING: The 'User' structure for "+sourceUS.uid+" is undefined. Maybe never assigned?");
					console.log("    US:",US);
					console.log(" WARNING>");
				} else {
                    if(sourceUS.User.dirname) {
                        console.log("    User was connected to MRI "+ sourceUS.User.dirname+sourceUS.User.mri);
                        console.log("    User was connected to atlas "+ sourceUS.User.dirname+sourceUS.User.atlasFilename);

                        // count how many users remain connected to the MRI after user leaves
                        sum=numberOfUsersConnectedToMRI(sourceUS.User.dirname+sourceUS.User.mri);
                        sum-=1; // subtract current user
                        if(sum) {
                            console.log("    There remain "+sum+" users connected to that MRI");
                        } else {
                            console.log("    No user connected to MRI "
                                        + sourceUS.User.dirname
                                        + sourceUS.User.mri+": unloading it");
                            unloadMRI(sourceUS.User.dirname+sourceUS.User.mri);
                        }

                        // count how many users remain connected to the atlas after user leaves
                        sum=numberOfUsersConnectedToAtlas(sourceUS.User.dirname,sourceUS.User.atlasFilename);
                        sum-=1; // subtract current user
                        if(sum) {
                            console.log("    There remain "+sum+" users connected to that atlas");
                        } else {
                            console.log("    No user connected to atlas "
                                        + sourceUS.User.dirname
                                        + sourceUS.User.atlasFilename+": unloading it");
                            unloadAtlas(sourceUS.User.dirname,sourceUS.User.atlasFilename);
                        }
                    } else {
                        console.log("<ERROR: dirname was not defined>");
                    }
                }
            
                // send user disconnect message to remaining users
                sendDisconnectMessage(sourceUS.uid);

                // remove the user from the list
                removeUser(this);
        
                // display the total number of connected users
                console.log("    "+US.filter(function(o){return o!=undefined}).length+" remain connected");
                console.log();
				
			});
		});
		server.listen(port, function _fromInitSocketConnection() { console.log('Listening on ' + server.address().port,server.address()) });
	} catch (ex) {
		console.log("ERROR: Unable to create a server",ex);
	}
}
this.initSocketConnection = initSocketConnection;

var queryUserName = function queryUserName(data){
	return new Promise(function(resolve, reject){
		if (data.metadata && data.metadata.nickname) {
			db.get('user')
			.find(
				{"nickname": {'$regex': data.metadata.nickname}},
				{fields:["nickname", "name"],limit:10})
				.then(function(obj){
					console.log(obj);
					resolve(obj);
				});
		}
		else if (data.metadata && data.metadata.name) {
			db.get('user')
			.find(
				{"name": {'$regex': data.metadata.name}},
				{fields:["nickname", "name"],limit:10})
				.then(function(obj){
					console.log(obj);
					resolve(obj);
				});
		}
		else
			reject();
	});
}
var queryProjectName = function queryProjectName(data){
	return new Promise(function(resolve, reject){
		if (data.metadata && data.metadata.name) {
			db.get('project')
                .findOne({"shortname": data.metadata.name},{fields:["name","shortname"]})
				.then(function(obj) {
					resolve(obj);
				});
		} else
			reject();
	});
}

var receivePaintMessage = function receivePaintMessage(data) {
    traceLog(receivePaintMessage,2);

	var	msg=data.data;
	var	sourceUS=getUserFromUserId(data.uid);			// user data
	var c=msg.c;		// command
	var x=msg.x;		// x coordinate
	var y=msg.y;		// y coordinate
	var undoLayer=getCurrentUndoLayer(sourceUS.User);	// current undoLayer for user
	
	paintxy(sourceUS.uid,c,x,y,sourceUS.User,undoLayer);
};
var receiveRequestSliceMessage = function receiveRequestSliceMessage(data,user_socket) {
    traceLog(receiveRequestSliceMessage,1);

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
	if(debug>1) console.log(sourceUS.User.view,sourceUS.User.slice);

	// getBrainAtPath() uses a client-side path, starting with "/data/[md5hash]"
	getBrainAtPath(brainPath)
	    .then(function promise_fromReceiveRequestSliceMessage(data) {
    		sendSliceToUser(data,view,slice,user_socket);
	    })
};
var receiveSaveMetadataMessage = function receiveSaveMetadataMessage(data,user_socket) {
    traceLog(receiveSaveMetadataMessage);

	var sourceUS=getUserFromUserId(data.uid);
	var json=data.metadata;
	json.modified=(new Date()).toJSON();
	json.modifiedBy=sourceUS.User.username||"unknown";
	// sanitise json
	json=JSON.parse(DOMPurify.sanitize(JSON.stringify(json))); // sanitize works on strings, not objects
	// mark previous one as backup
	db.get('mri').update({url:json.url,backup:{$exists:false}},{$set:{backup:true}},{multi:true});
	// insert new one
	db.get('mri').insert(json);
};
var receiveAtlasFromUserMessage = function receiveAtlasFromUserMessage(data,user_socket) {
    traceLog(receiveAtlasFromUserMessage);

	zlib.inflate(data.data,function (err, atlasData){
		// Save current atlas
		var sourceUS=getUserFromUserId(data.uid);
		var iAtlas=sourceUS.User.iAtlas;
		var atlas=Atlases[iAtlas];
		saveNifti(atlas)
            .then(function () {
                console.log("    Replace current atlas with new atlas");
                atlas.data=atlasData;
            });
	});
};

var unloadUnusedBrains = function unloadUnusedBrains() {
    traceLog(unloadUnusedBrains);
	var i;
	for(i in Brains) {
		var sum=numberOfUsersConnectedToMRI(Brains[i].path);

		if(sum===0) {
			console.log("    No user connected to MRI "+Brains[i].path+": unloading it");
			unloadMRI(Brains[i].path);
		}
	}
};
var unloadUnusedAtlases = function unloadUnusedAtlases() {
    traceLog(unloadUnusedAtlases);
	var i;
	for(i in Atlases) {
		var sum=numberOfUsersConnectedToAtlas(Atlases[i].dirname,Atlases[i].name);
		if(sum===0) {
			console.log("    No user connected to Atlas "+Atlases[i].dirname+Atlases[i].name+": unloading it");
			unloadAtlas(Atlases[i].dirname,Atlases[i].name);
		}
	}
};
var sendSliceToUser = function sendSliceToUser(brain, view, slice, user_socket) {
    traceLog(sendSliceToUser,1);
    
	try {
		var jpegImageData=drawSlice(brain,view,slice);
		var length=jpegImageData.data.length+jpgTag.length;
		var bin=Buffer.concat([jpegImageData.data,jpgTag],length);
		user_socket.send(bin, {binary: true,mask:false});
	} catch(e) {
		console.log("ERROR: Cannot send slice to user");
	}
}

var receiveUserDataMessage = function receiveUserDataMessage(data, user_socket) {
    traceLog(receiveUserDataMessage,1);
    if(debug>1) console.log("    data.description:", data.description);
	
	var sourceUS=getUserFromUserId(data.uid);

    var User,
        i,
		atlasLoadedFlag,
		firstConnectionFlag=false,
		switchingAtlasFlag=false;
	
	if(sourceUS.User===undefined) {
		firstConnectionFlag=true;
	} else if(sourceUS.User.isMRILoaded===false) {
		firstConnectionFlag=true;
	}
	
    if(data.description === "allUserData" ) {
	    User=data.user;
        User.uid=data.uid;
    } else {
	    User=sourceUS.User;
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
                addAtlas(User)
                    .then(function(atlas) {
                        sendAtlasToUser(atlas.data,user_socket,true);
                        sourceUS.User.isMRILoaded=true;
                    });
            }
        } else {
            var changes = JSON.parse(data.description);
            for(i in changes)
                User[i]=changes[i];
        }
    }
	
	// 3. Update user data
	// If the user didn't have a name (wasn't logged in), but now has one,
	// display the name in the log
	if(User.hasOwnProperty('username')) {
		if(sourceUS.User===undefined) {
			console.log("    No User yet for id "+data.uid);
		} else if(!sourceUS.User.hasOwnProperty('username')) {
			console.log("    User "+User.username+", id "+data.uid+" logged in");
		}
	}
	if(sourceUS.hasOwnProperty('User')===false) {
		sourceUS.User={};
	}
	for(var prop in User) {
		sourceUS.User[prop]=User[prop];
	}

/*
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
*/

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
var sendPreviousUserDataMessage = function sendPreviousUserDataMessage(newUS) {
    traceLog(sendPreviousUserDataMessage);
	
	var i,n=0;
	for(i in US) {
		if(US[i].socket==newUS.socket)
			continue;
		var msg=JSON.stringify({type:"userData",user:US[i].User,uid:US[i].uid,description:"allUserData"});
		newUS.socket.send(msg);
		n++;
	}
	if(debug) console.log("    send user data from "+n+" users");		
};
var sendAtlasToUser = function sendAtlasToUser(atlasdata, user_socket, flagCompress) {
    traceLog(sendAtlasToUser);
	
	if(flagCompress) {
		zlib.gzip(atlasdata, function (err,atlasdatagz) {
			try {
				user_socket.send(Buffer.concat([atlasdatagz,niiTag]), {binary: true, mask: false});
			} catch(e) {
				console.log("<WARNING: Cannot send atlas data to user. Maybe already disconnected? (1)>");
			}
		});
	} else {
		try {
			user_socket.send(Buffer.concat([atlasdata,niiTag]), {binary: true, mask: false});
		} catch(e) {
			console.log("<WARNING: Cannot send atlas data to user. Maybe already disconnected? (2)>");
		}
	}
};
var broadcastPaintVolumeMessage = function broadcastPaintVolumeMessage(msg, User) {
    traceLog(broadcastPaintVolumeMessage);
	
	try {
		var n=0,i,msg=JSON.stringify({"type":"paintvol","data":msg});
		for(i in US) {
			if( US[i].User!=undefined &&
				US[i].User.iAtlas!=User.iAtlas )
				continue;
			US[i].socket.send(msg);
			n++;
		}
		if(debug) console.log("    paintVolume message broadcasted to "+n+" users");
		
	} catch (ex) {
		console.log("ERROR: Unable to broadcastPaintVolumeMessage",ex);
	}
};
var sendDisconnectMessage = function sendDisconnectMessage(uid) {
    traceLog(sendDisconnectMessage);
	
	try {
		var n=0,i,msg=JSON.stringify({type:"disconnect",uid:uid});
		for(i in US) {
		    if(US[i].uid != uid ) {
                US[i].socket.send(msg);
                n++;
            }
		}
		if(debug) console.log("    user disconnect message sent to "+n+" users");
		
	} catch (ex) {
		console.log("ERROR: Unable to sendDisconnectMessage",ex);
	}
}

//========================================================================================
// Load & Save
//========================================================================================
var addAtlas = function addAtlas(User) {
    traceLog(addAtlas);

    /*
        addAtlas
        input: A User structure providing information about the requested atlas
        process: an atlas is obtained, and added to the Atlases[] array if it
                wasn't already loaded.
        output: an atlas (mri structure) 
    */

    var atlas = {
        name:User.atlasFilename,
        specimen:User.specimenName,
        dirname:User.dirname,
        dim:User.dim
    };
    console.log("    User requests atlas "+atlas.name+" from "+atlas.dirname);

    var pr = new Promise(function promise_fromAddAtlas(resolve,reject) {
        loadAtlas(User)
            .then(function (atlas) {
                Atlases.push(atlas);
                User.iAtlas=Atlases.indexOf(atlas);
                atlas.timer=setInterval(function () {saveNifti(atlas)},60*60*1000); // 60 minutes
                
                resolve(atlas);
            });
    });
    
    return pr;
};
var getBrainAtPath = function getBrainAtPath(brainPath) {
    traceLog(getBrainAtPath,1);
	
    /*
        getBrainAtPath
        input: A client-side path identifying the requested brain
        process: a brain is obtained, and added to the Brains[] array if it
                wasn't already loaded.
        output: a brain (mri structure) 
    */
	var i;
	for(i in Brains) {
		if(Brains[i].path===brainPath) {
			if(debug>1) console.log("    brain already loaded");
			return Promise.resolve(Brains[i].data);
		}
	}
	
	if(debug) {
		console.log("    Loading brain at",brainPath);
	}
    var pr = new Promise(function promise_fromGetBrainAtPath(resolve, reject) {
        loadBrain(this.dataDirectory+brainPath)
            .then(function _fromGetBrainAtPath(mri) {
                var brain={path:brainPath,data:mri};
                Brains.push(brain);
                resolve(mri); // callback: sendSliceToUser
            })
            .catch(function (err) {
                console.log("ERROR: getBrainAtPath cannot load brain. Corrupted file?",err);
                reject(err);
            });
    });
		
	return pr;
}
this.getBrainAtPath = getBrainAtPath;

var loadAtlas = function loadAtlas(User) {
    traceLog(loadAtlas);
		
    /*
        loadAtlas
        input: A User structure providing information about the requested atlas
        process: the requested atlas is sent if it was already loaded, loaded from disk
                if it was already downloaded but not yet loaded, or created if it's a
                new atlas.
        output: an atlas (mri structure) 
    */
    var pr = new Promise(function promise_fromloadAtlas(resolve,reject) {
        var path=this.dataDirectory+User.dirname+User.atlasFilename;
    
        if(!fs.existsSync(path)) {
            // Create new empty atlas
            console.log("    Atlas "+path+" does not exists. Create a new one");
            var brainPath=User.dirname+User.mri;
            getBrainAtPath(brainPath)
                .then(function _fromLoadAtlas(mri) {
                    createNifti(mri)
                        .then(function (newAtlas) {
                            newAtlas.name = User.atlasFilename;
                            newAtlas.dirname = User.dirname;
                            
                            // log atlas creation
                            db.get('log').insert({
                                key: "createAtlas",
                                value: DOMPurify.sanitize(JSON.stringify({atlasDirectory:User.dirname,atlasFilename:User.atlasFilename})),
                                username: User.username,
                                date: (new Date()).toJSON()
                            });

                            resolve(newAtlas);
                       })
                        .catch(function (err) {
                            console.log("ERROR Cannot create nifti",err);
                            reject(err);
                            return;
                        });
                })
                .catch(function (err) {
                    console.log("ERROR Cannot get template brain for new atlas", err);
                    reject(err);
                });
        } else {
            // Load existing atlas
            console.log("    Atlas found. Loading it");
            readNifti(path)
                .then(function (loadedAtlas) {
                    loadedAtlas.name = User.atlasFilename;
                    loadedAtlas.dirname = User.dirname;
                    resolve(loadedAtlas);
                })
                .catch(function (err) {
                    console.log("ERROR Cannot read nifti", err);
                    reject(err);
                });
        }
    });
    return pr;
};
var loadBrain = function loadBrain(path) {
    traceLog(loadBrain);
    
    /*
        loadBrain
        input: path to an mri file, .nii.gz and .mgz formats are recognised
        output: an mri structure
    */
	var pr = new Promise(function promise_fromloadBrain(resolve, reject) {
        if(path.match(/.nii.gz$/)) {
            readNifti(path)
                .then(function (mri) {
                    resolve(mri);
                })
                .catch(function (err) {
                    console.log("ERROR reading nii.gz file:",err);
                    reject();
                });
        } else
        if(path.match(/.mgz$/)) {
            readMGZ(path)
                .then(function(mri) {
                    resolve(mri);
                })
                .catch(function (err) {
                    console.log("ERROR reading mgz file:",err);
                });
        } else {
            reject();
        }
    });

	return pr;
}

var readNifti = function readNifti(path) {
    traceLog(readNifti);
    
    /*
        readNifti
        input: path to a .nii.gz file
        output: an mri structure
    */

	var pr = new Promise(function (resolve, reject) {
        try {
            var niigz=fs.readFileSync(path);
            zlib.gunzip(niigz, function (err, nii) {
                var i, j, tmp, sum, mri={};

                // standard nii header
                try {
                    NiiHdr.allocate();
                    NiiHdr._setBuff(nii);
                    var h=JSON.parse(JSON.stringify(NiiHdr.fields));
                    
                    var	sizeof_hdr=h.sizeof_hdr;
                    mri.dim=[h.dim[1],h.dim[2],h.dim[3]];
                    mri.pixdim=[h.pixdim[1],h.pixdim[2],h.pixdim[3]];
                    mri.vox_offset=h.vox_offset;

                    // nrrd-compatible header, computes space directions and space origin
                    if(h.sform_code>0) {
                        mri.dir = [
                            [h.srow_x[0], h.srow_y[0], h.srow_z[0]],
                            [h.srow_x[1], h.srow_y[1], h.srow_z[1]],
                            [h.srow_x[2], h.srow_y[2], h.srow_z[2]]
                        ];
                        mri.ori = [h.srow_x[3], h.srow_y[3], h.srow_z[3]];
                    } else {
                        mri.dir=[[mri.pixdim[0],0,0],[0,mri.pixdim[1],0],[0,0,mri.pixdim[2]]];
                        mri.ori=[0,0,0];
                    }
                } catch(err) {
                    console.log("ERROR Cannot read nifti header:", err);
                    reject("ERROR Cannot read nifti header: " + err);
                    return;
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
                        tmp=nii.slice(mri.vox_offset);
                        mri.data=new Int16Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
                        for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
                            mri.data[j]=tmp.readInt16LE(j*2);
                        break;
                    case 8: // INT
                        tmp=nii.slice(mri.vox_offset);
                        mri.data=new Uint32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
                        for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
                            mri.data[j]=tmp.readUInt32LE(j*4);
                        break;
                    case 16: // FLOAT
                        tmp=nii.slice(mri.vox_offset);
                        mri.data=new Float32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
                        for(j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
                            mri.data[j]=tmp.readFloatLE(j*4);
                        break;
                    default: {
                        reject("ERROR: Unknown dataType: "+mri.datatype);
                        return;
                    }
                }

                // compute sum, min and max
                var i,sum=0,min,max;
                min=mri.data[0];
                max=min;
                for(i=0;i<mri.dim[0]*mri.dim[1]*mri.dim[2];i++) {
                    sum+=mri.data[i];
        
                    if(mri.data[i]<min) min=mri.data[i];
                    if(mri.data[i]>max) max=mri.data[i];
                }
                mri.sum=sum;
                mri.min=min;
                mri.max=max;

                resolve(mri);
            });
        } catch(e) {
            reject("ERROR Cannot uncompress nifti file:" + e);
        }
    });
    return pr;
};
this.readNifti = readNifti;

var readMGZ = function readMGZ(path) {
    traceLog(readMGZ);
    
    /*
        readMGZ
        input: path to a .mgz file
        output: an mri structure
    */

	var pr = new Promise(function (resolve, reject) {
        try {
            child_process.execFile("gunzip", ["-c",path], {encoding: 'binary', maxBuffer: 200*1024*1024}, function(err, stdout) {
                var mgh = new Buffer(stdout, 'binary');
                var i, j, tmp, sum, mri = {};
                var sz;
                var hdr_sz=284;
                MghHdr.allocate();
                MghHdr._setBuff(mgh);
                var h=JSON.parse(JSON.stringify(MghHdr.fields));
    
                // Equations from freesurfer/matlab/load_mgh.m
                var Pcrs_c = [h.ndim1/2,h.ndim2/2,h.ndim3/2];
                var D = [[h.delta[0],0,0],[0,h.delta[1],0],[0,0,h.delta[2]]];
                var MdcD = [
                    [h.Mdc[0]*h.delta[0], h.Mdc[3]*h.delta[1], h.Mdc[6]*h.delta[2]],
                    [h.Mdc[1]*h.delta[0], h.Mdc[4]*h.delta[1], h.Mdc[7]*h.delta[2]],
                    [h.Mdc[2]*h.delta[0], h.Mdc[5]*h.delta[1], h.Mdc[8]*h.delta[2]]
                ];
                var Pxyz_0 = subVecVec(h.Pxyz_c,mulMatVec(MdcD,Pcrs_c));
                var M = [
                    h.Mdc[0]*h.delta[0], h.Mdc[3]*h.delta[1], h.Mdc[6]*h.delta[2], Pxyz_0[0],
                    h.Mdc[1]*h.delta[0], h.Mdc[4]*h.delta[1], h.Mdc[7]*h.delta[2], Pxyz_0[1],
                    h.Mdc[2]*h.delta[0], h.Mdc[5]*h.delta[1], h.Mdc[8]*h.delta[2], Pxyz_0[2],
                    0, 0, 0, 1
                ];

                mri.dim=[h.ndim1,h.ndim2,h.ndim3];
                mri.pixdim=[h.delta[0],h.delta[1],h.delta[2]];
                mri.dir=[[M[0],M[4],M[8]],[M[1],M[5],M[9]],[M[2],M[6],M[10]]];
                mri.ori=[M[3],M[7],M[11]];
                
                 // compute the transformation from voxel space to screen space
                computeS2VTransformation(mri);

                // test if the transformation looks incorrect. Reset it if it does
                testS2VTransformation(mri);
               
                sz = mri.dim[0]*mri.dim[1]*mri.dim[2];

                switch(h.type) {
                    case 0: // MGHUCHAR
                        mri.data=mgh.slice(hdr_sz);
                        break;
                    case 1: // MGHINT
                        tmp=mgh.slice(hdr_sz);
                        mri.data=new Uint32Array(sz);
                        for(j=0;j<sz;j++)
                            mri.data[j]=tmp.readUInt32BE(j*4);
                        break;
                    case 3: // MGHFLOAT
                        tmp=mgh.slice(hdr_sz);
                        mri.data=new Float32Array(sz);
                        for(j=0;j<sz;j++)
                            mri.data[j]=tmp.readFloatBE(j*4);
                        break;
                    case 4: // MGHSHORT
                        tmp=mgh.slice(hdr_sz);
                        mri.data=new Int16Array(sz);
                        for(j=0;j<sz;j++)
                            mri.data[j]=tmp.readInt16BE(j*2);
                        break;
                    default:
                        console.log("ERROR: Unknown dataType: "+datatype);
                }

                var i,sum=0,min,max;
                min=mri.data[0];
                max=min;
                for(i=0;i<sz;i++) {
                    sum+=mri.data[i];

                    if(mri.data[i]<min) min=mri.data[i];
                    if(mri.data[i]>max) max=mri.data[i];
                }
                mri.sum=sum;
                mri.min=min;
                mri.max=max;
                
                resolve(mri);
            });
        } catch(e) {
            reject("ERROR Cannot uncompress mgz file: "+e);
        }
    });
	
	return pr;
};

var createNifti = function createNifti(templateMRI) {
    traceLog(createNifti);
	
    /*
        createNifti
        input: a template mri structure
        output: a new empty mri structure, datatype=2 (1 byte per voxel), same dimensions as template
    */

    var mri = {},
        props = ["dim", "pixdim", "hdr"],
        datatype = 2,
        vox_offset = 352,
        sz,i, niihdr;
    var newHdr =     {
            sizeof_hdr: 348,
            data_type: '',
            db_name: '',
            extents: 0,
            session_error: 0,
            regular: 0,
            dim_info: 0,
            dim: [3, templateMRI.dim[0], templateMRI.dim[1], templateMRI.dim[2], 1, 1, 1, 1],
            intent_p1: 0,
            intent_p2: 0,
            intent_p3: 0,
            intent_code: 0,
            datatype: 2,    // uchar
            bitpix: 8,
            slice_start: 0,
            pixdim: [-1, templateMRI.pixdim[0], templateMRI.pixdim[1], templateMRI.pixdim[2], 0, 1, 1, 1],
            vox_offset: 352,
            scl_slope: 0,
            scl_inter: 0,
            slice_end: 0,
            slice_code: 0,
            xyzt_units: 10,
            cal_max: 0,
            cal_min: 0,
            slice_duration: 0,
            toffset: 0,
            glmax: 0,
            glmin: 0,
            descrip: 'BrainBox, 20 August 2016',
            aux_file: '',
            qform_code: 0,
            sform_code: 1,
            quatern_b: 0,
            quatern_c: 0,
            quatern_d: 0,
            qoffset_x: 0,
            qoffset_y: 0,
            qoffset_z: 0,
            srow_x: [templateMRI.dir[0][0], templateMRI.dir[0][1], templateMRI.dir[0][2], templateMRI.ori[0]],
            srow_y: [templateMRI.dir[1][0], templateMRI.dir[1][1], templateMRI.dir[1][2], templateMRI.ori[1]],
            srow_z: [templateMRI.dir[2][0], templateMRI.dir[2][1], templateMRI.dir[2][2], templateMRI.ori[2]],
            intent_name: '',
            magic: 'n+1'
        };
        
    NiiHdr.allocate();
    niihdr = NiiHdr.buffer();
    for(i in newHdr)
        NiiHdr.fields[i] = newHdr[i];
        
    // copy information from templateMRI
    for( i in props)
        mri[props[i]] = templateMRI[props[i]];
    
    // get volume size
    sz = mri.dim[0]*mri.dim[1]*mri.dim[2];

    // update the header
    mri.hdr = niihdr;
    mri.hdr.writeUInt16LE(datatype,70,2);	// set datatype to 2:unsigned char (8 bits/voxel)
    mri.hdr.writeFloatLE(vox_offset,108,4);	// set voxel_offset to 352 (minimum size of a nii header)
    
    // zero the data
    mri.data = new Buffer(sz);
    for(i = 0; i<sz; i++)
        mri.data[i] = 0;
    
    // zero statistics
    mri.sum = 0;
    mri.min = 0;
    mri.max = 0;

    return Promise.resolve(mri);
};
var saveNifti = function saveNifti(atlas) {
    traceLog(saveNifti);

    /*
        saveNifti
        input: an mri structure
        process: a .nii.gz file is saved at the position indicated in the mri structure
        output: success message
    */

	if(atlas && atlas.dim ) {
		if(atlas.data==undefined) {
			console.log("ERROR: [saveNifti] atlas in Atlas array has no data");
			if(debug) console.log(atlas);
			return Promise.reject("ERROR: [saveNifti] atlas in Atlas array has no data");
		} else {
			var i,sum=0;
			for(i=0;i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2];i++)
				sum+=atlas.data[i];
			if(sum==atlas.sum) {
				console.log("    Atlas",atlas.dirname,atlas.name,
							"no change, no save, freemem",os.freemem());
				return Promise.resolve("Done. No save required");
			}
			atlas.sum=sum;

			var	voxel_offset=352;
			var	nii=new Buffer(atlas.dim[0]*atlas.dim[1]*atlas.dim[2]+voxel_offset);
			console.log("    Atlas",atlas.dirname,atlas.name,
						"data length",atlas.data.length+voxel_offset,
						"buff length",nii.length);
			atlas.hdr.copy(nii);
			atlas.data.copy(nii,voxel_offset);
			
			var pr=new Promise(function (resolve, reject) {
				zlib.gzip(nii, function (err,niigz) {
					var	ms=+new Date;
					var path1=this.dataDirectory+atlas.dirname+atlas.name;
					var	path2=this.dataDirectory+atlas.dirname+ms+"_"+atlas.name;
					fs.rename(path1,path2, function () {
						fs.writeFileSync(path1,niigz);
						resolve("Atlas saved");
					});
				});
			});
		}
	} else {
		return Promise.reject("ERROR: No atlas to save");
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

var pushUndoLayer = function pushUndoLayer(User) {
    traceLog(pushUndoLayer);

	var undoLayer={User:User,actions:[]};
	UndoStack.push(undoLayer);

	if(debug) console.log("    Number of layers: "+UndoStack.length);
	
	return undoLayer;
};
var getCurrentUndoLayer = function getCurrentUndoLayer(User) {
    traceLog(getCurrentUndoLayer,1);
		
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
		console.log("    No previous undo layer for "+User.username+", "+User.atlasFilename+", "+User.specimenName+": Create and push one");
		undoLayer=pushUndoLayer(User);
	}	
	return undoLayer;
};
var undo = function undo(User) {
    traceLog(undo);
    
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
			if(debug) console.log("    Found undo layer for "+User.username+", "+User.specimenName+", "+User.atlasFilename+", with "+undoLayer.actions.length+" actions");
			break;
		}
	}
	if(!found) {
		// There was no undoLayer for this user.
		if(debug) console.log("    No undo layers for user "+User.username+" in "+User.specimenName+", "+User.atlasFilename);
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
	    
	    if(debug>=3) console.log("    Undo:",i%User.dim[0],parseInt(i/User.dim[0])%User.dim[1],parseInt(i/User.dim[0]/User.dim[1])%User.dim[2]);
	}
	msg={"data":arr};
	broadcastPaintVolumeMessage(msg,User);

	if(debug) console.log("    "+UndoStack.length+" undo layers remaining (all users)");	
}

//========================================================================================
// Painting
//========================================================================================
var paintxy = function paintxy(u, c, x, y, User, undoLayer) {
    traceLog(paintxy,3);
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
    if(User.x0<0) {
        User.x0=coord.x;
        User.y0=coord.y;
    }
		
	switch(c) {
		case 'me':
		case 'mf':
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
		case 'e': // Fill, erasing
			fill(coord.x,coord.y,coord.z,0,User,undoLayer);
			User.x0=-1;
			break;
		case 'f': // Fill, painting
			fill(coord.x,coord.y,coord.z,User.penValue,User,undoLayer);
			User.x0=-1;
			break;
		case 'mu': // Mouse up (touch ended)
			pushUndoLayer(User);
			User.x0=-1;
			break;
		case 'u':
			undo(User);
			User.x0=-1;
			break;
	}
};
var paintVoxel = function paintVoxel(mx, my, mz, User, vol, val, undoLayer) {
    traceLog(paintVoxel,3);
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
};
var sliceXYZ2index = function sliceXYZ2index(mx, my, mz, User) {
    traceLog(sliceXYZ2index,3);
    
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
};
var line = function line(x, y, val, User, undoLayer) {
    traceLog(line,3);
    
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
	
	if(Math.pow(x1-x2,2)+Math.pow(y1-y2,2)>10*10) {
		console.log("WARNING: long line from",x1,y1,"to",x2,y2);
		console.log("User.uid:",User.uid);
		displayUsers();
		console.log("END WARNING");
	}

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
};
var fill = function fill(x, y, z, val, User, undoLayer) {
    traceLog(fill);
    
	var view=User.view;
	var	vol=Atlases[User.iAtlas].data;
	var dim=Atlases[User.iAtlas].dim;
	var	Q=[],n;
	var	i;
	var bval=vol[sliceXYZ2index(x,y,z,User)]; // background-value: value of the voxel where the click occurred

	if(bval===val) {	// nothing to do
	    console.log("fill: nothing to do. Asked to fill with value",val,"and the existing value was",bval,"sampled at coordinates",x,y,z);
		return;
	}
	
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
var mulMatVec = function mulMatVec(m, v) {
    traceLog(mulMatVec,3);
	return [
		m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2],
		m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2],
		m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]
	];
};
var invMat = function invMat(m) {
    traceLog(invMat,3);
    
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
};
var subVecVec = function subVecVec(a, b) {
    traceLog(subVecVec,3);
    
	return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
};
var addVecVec = function addVecVec(a, b) {
    traceLog(addVecVec,3);
    
	return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
};
var computeS2VTransformation = function computeS2VTransformation(mri) {
    traceLog(computeS2VTransformation);
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
	var wvmax=addVecVec(mulMatVec(v2w,[mri.dim[0]-1,mri.dim[1]-1,mri.dim[2]-1]),wori);
	var wvmin=addVecVec(mulMatVec(v2w,[0,0,0]),wori);
	var wmin=[Math.min(wvmin[0],wvmax[0]),Math.min(wvmin[1],wvmax[1]),Math.min(wvmin[2],wvmax[2])];
	var wmax=[Math.max(wvmin[0],wvmax[0]),Math.max(wvmin[1],wvmax[1]),Math.max(wvmin[2],wvmax[2])];
	var w2s=[[1/Math.abs(wpixdim[0]),0,0],[0,1/Math.abs(wpixdim[1]),0],[0,0,1/Math.abs(wpixdim[2])]];

	// console.log(["v2w",v2w, "wori",wori, "wpixdim",wpixdim, "wvmax",wvmax, "wvmin",wvmin, "wmin",wmin, "wmax",wmax, "w2s",w2s]);

	mri.s2v = {
		sdim: [(wmax[0]-wmin[0])/Math.abs(wpixdim[0])+1,(wmax[1]-wmin[1])/Math.abs(wpixdim[1])+1,(wmax[2]-wmin[2])/Math.abs(wpixdim[2])+1],
		s2w: invMat(w2s),
		sori: [-wmin[0]/Math.abs(wpixdim[0]),-wmin[1]/Math.abs(wpixdim[1]),-wmin[2]/Math.abs(wpixdim[2])],
		w2v: invMat(v2w),
		wori: wori
	};
	mri.v2w=v2w;
	mri.wori=wori;
};
var testS2VTransformation = function testS2VTransformation(mri) {
    traceLog(testS2VTransformation);
    
	/*
		check the S2V transformation to see if it looks correct.
		If it does not, reset it
	*/
	var doReset=false;
	
	console.log("    Transformation TEST:");

	if(debug) process.stdout.write("  1. transformation volume: ");
	var vv=mri.dim[0]*mri.dim[1]*mri.dim[2];
	var vs=mri.s2v.sdim[0]*mri.s2v.sdim[1]*mri.s2v.sdim[2];
	var diff=(vs-vv)/vv;
	if(Math.abs(diff)>0.001) {
		doReset=true;
		if(debug) console.log("    fail");
	} else {
		if(debug) console.log("    ok");
	}
	
	if(debug) process.stdout.write("  2. transformation origin: ");
	if(	mri.s2v.sori[0]<0||mri.s2v.sori[0]>mri.s2v.sdim[0] ||
		mri.s2v.sori[1]<0||mri.s2v.sori[1]>mri.s2v.sdim[1] ||
		mri.s2v.sori[2]<0||mri.s2v.sori[2]>mri.s2v.sdim[2]) {
		doReset=true;
		if(debug) console.log("    fail");
	} else {
		if(debug) console.log("    ok");
	}

	if(doReset) {
		console.log("    FAIL: TRANSFORMATION WILL BE RESET");
		mri.dir=[[mri.pixdim[0],0,0],[0,-mri.pixdim[1],0],[0,0,-mri.pixdim[2]]];
		mri.ori=[0,mri.dim[1]-1,mri.dim[2]-1];
		computeS2VTransformation(mri);

		if(debug>2) {
			console.log("dir",mri.dir);
			console.log("ori",mri.ori);
			console.log("s2v",mri.s2v);
		}
	} else {
		console.log("    ok");
	}
};
var S2V = function S2V(s, mri) {
    traceLog(S2V,3);
    
	var s2v=mri.s2v;
	var i,w,s,v,v1=[];
	w=mulMatVec(s2v.s2w,subVecVec(s,s2v.sori)); // screen to world: w=s2w*(s-sori)
	v=mulMatVec(s2v.w2v,subVecVec(w,s2v.wori)); // world to voxel
	v1=[Math.round(v[0]),Math.round(v[1]),Math.round(v[2])]; // round to integer
	return v1;
};
var S2I = function S2I(s, mri) {
    traceLog(S2I,3);
    
	var s2v=mri.s2v;
	var i=null,w,s,v;
	w=mulMatVec(s2v.s2w,subVecVec(s,s2v.sori)); // screen to world: w=s2w*(s-sori)
	v=mulMatVec(s2v.w2v,subVecVec(w,s2v.wori)); // world to voxel

/*
	if(flag) {
	    console.log("s",s);
	    console.log("w",w),
	    console.log("v",v);
	    console.log("dim",mri.dim);
	}
*/

	v=[Math.round(v[0]),Math.round(v[1]),Math.round(v[2])]; // round to integer
	if(v[0]>=0&&v[0]<mri.dim[0]&&v[0]>=0&&v[0]<mri.dim[0]&&v[0]>=0&&v[0]<mri.dim[0])
		i= v[2]*mri.dim[1]*mri.dim[0]+ v[1]*mri.dim[0] +v[0];
	return i;
};
var drawSlice = function drawSlice(brain, view, slice) {
    traceLog(drawSlice,1);
    
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
//	console.log("slice:",slice);
	for(y=0;y<brain_H;y++)
	for(x=0;x<brain_W;x++) {
		switch(view) {
			case 'sag': s=[ys,x,s2v.sdim[2]-1-y]; break;
			case 'cor': s=[x,yc,s2v.sdim[2]-1-y]; break;
			case 'axi': s=[x,s2v.sdim[1]-1-y,ya]; break;
		}
		/*
		if(x%(brain_W-1)==0 && y%(brain_H-1)==0) {
    		i=S2I(s,brain);
		    console.log(s,i);
		} else
		*/
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
