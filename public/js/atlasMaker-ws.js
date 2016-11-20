/**
 * @page AtlasMaker: WebSockets
 */
var AtlasMakerWS = {
	//====================================================================================
	// Web sockets
	//====================================================================================
    /**
     * @function createSocket
     * @desc  Create a WebSocket connection using the WebSocket object or the MozWebSocket
     *        object.
     */
	createSocket: function createSocket(host) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(createSocket,0,"#aca");if(l)console.log.apply(undefined,l);
	
		var ws;

		if (window.WebSocket) {
			ws=new WebSocket(host);
		} else if (window.MozWebSocket) {
			ws=new MozWebSocket(host);
		} else {
		    console.log("ERROR: browser does not support WebSockets");
		}

		return ws;
	},
	 /**
     * @function initSocketConnection
     */
	initSocketConnection: function initSocketConnection() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(initSocketConnection,0,"#aca");if(l)console.log.apply(undefined,l);
			
		var def=$.Deferred();
	
		// WS connection
		var host = "ws://" + window.location.hostname + ":8080/";
		
		if(me.debug)
			console.log("[initSocketConnection] host:",host);
		if (me.progress)
			me.progress.html("Connecting...");
		
		try {
			me.socket = me.createSocket(host);
			
			me.socket.onopen = function(msg) {
				if(me.debug)
					console.log("[initSocketConnection] connection open",msg);
				me.progress.html("<img src='/img/download.svg' style='vertical-align:middle'/>MRI");
				$("#chat").text("Chat (1 connected)");
				me.flagConnected=1;
				def.resolve();
			};
			
			me.receiveFunctions["saveMetadata"]=me.receiveMetadata;
			me.receiveFunctions["userData"]=me.receiveUserDataMessage;
			me.receiveFunctions["volInfo"]=function(data){console.log("volInfo",data)};
			me.receiveFunctions["chat"]=me.receiveChatMessage;
			me.receiveFunctions["show"]=me.receiveShowMessage;
			me.receiveFunctions["paint"]=me.receivePaintMessage;
			me.receiveFunctions["paintvol"]=me.receivePaintVolumeMessage;
			me.receiveFunctions["disconnect"]=me.receiveDisconnectMessage;
			
			me.receiveFunctions["requestSlice2"]=function(data){console.log("requestSlice2",data)};
			
			me.socket.onmessage = me.receiveSocketMessage;
			
			me.socket.onclose = function(msg) {
				me.flagConnected=0;
                
                // try to reconnect
                me.reconnectionTimeout=5;
				$("#chat").text("Disconnected. Try to reconnect in "+(me.reconnectionTimeout--)+" s...");
                if(me.timer) {
                    clearInterval(me.timer);
                }
                me.timer = setInterval(function() {
                    if(me.reconnectionTimeout <0) {
                        $("#chat").text("Reconnecting...");
                        setTimeout(function() {
                            me.socket = "";
                            me.initSocketConnection()
                            .then(function() {
                                me.sendUserDataMessage("allUserData");
                                me.sendUserDataMessage("sendAtlas");
                                clearInterval(me.timer);
                            })
                            .catch(function() {
                                me.reconnectionTimeout=5;
                                $("#chat").text("Disconnected. Try to reconnect in "+(me.reconnectionTimeout--)+" s...");
                            });
                        }, 1000);
                    } else {
                        $("#chat").text("Disconnected. Try to reconnect in "+(me.reconnectionTimeout--)+" s...");
                    }
                }, 1000);
			};
			
            window.onbeforeunload = function() {
                me.socket.onclose = function () {}; // disable onclose handler first
                me.socket.close()
            };
		}
		catch (ex) {
			$("#chat").text("Chat (not connected - connection error)");
		}
		
		return def.promise();
	},
	/**
     * @function receiveSocketMessage
     */
	receiveSocketMessage: function receiveSocketMessage(msg) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveSocketMessage,1,"#aca");if(l)console.log.apply(undefined,l);

		// Message: atlas data initialisation
		if(msg.data instanceof Blob) {
		    me.receiveBinaryMessage(msg.data);
			return;
		}
	
		// Message: interaction message
		var	data=JSON.parse(msg.data);
	    me.receiveFunctions[data.type](data);
	},
	/**
     * @function sendUserDataMessage
     */
	sendUserDataMessage: function sendUserDataMessage(description) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendUserDataMessage,1,"#aca");if(l)console.log.apply(undefined,l);

		if(me.flagConnected==0)
			return;

		if(me.debug>1) console.log("message: "+description);
		
		if(description === "allUserData")
    		var msg={"type":"userData","user":me.User,"description":description};
    	else
    		var msg={"type":"userData","description":description};
		try {
			me.socket.send(JSON.stringify(msg));
		} catch (ex) {
			console.log("ERROR: Unable to sendUserDataMessage",ex);
		}
	},
	/**
     * @function receiveBinaryMessage
     */
	receiveBinaryMessage: function receiveBinaryMessage(msgData) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveBinaryMessage,1,"#aca");if(l)console.log.apply(undefined,l);
		
        var fileReader = new FileReader();
        fileReader.onload = function from_receiveSocketMessage() {
            var data=new Uint8Array(this.result);
            var sz=data.length;
            var ext=String.fromCharCode(data[sz-8],data[sz-7],data[sz-6]);

            if(me.debug>1) console.log("type: "+ext);
            
            switch(ext) {
                case 'nii': {
                    var	inflate=new pako.Inflate();
                    inflate.push(data,true);
                    var atlas=new Object();
                    atlas.data=inflate.result;
                    atlas.name=me.atlasFilename;
                    atlas.dim=me.brain_dim;
            
                    me.atlas=atlas;

                    me.configureBrainImage();
                    me.configureAtlasImage();
                    me.resizeWindow();

                    me.brain_img.img=null;
                    me.drawImages();
                    
                    // compute total segmented volume
                    var vol=me.computeSegmentedVolume();
                    me.info.volume=parseInt(vol)+" mm3";

                    // setup download link
                    var	link=me.container.find("span#download_atlas");
                    link.html("<a class='download' href='"+me.User.dirname+me.User.atlasFilename+"'><img src='/img/download.svg' style='vertical-align:middle'/></a>"+atlas.name);

                    break;
                }
                case 'jpg': {
                    var urlCreator = window.URL || window.webkitURL;
                    var imageUrl = urlCreator.createObjectURL(msgData);
                    var img = new Image();
                    
                    me.isMRILoaded=true; // receiving a jpg is proof of a loaded MRI
                    
                    img.onload=function from_initSocketConnection(){
                        var flagFirstImage=(me.brain_img.img==null);
                        me.brain_img.img=img;
                        me.brain_img.view=me.flagLoadingImg.view;
                        me.brain_img.slice=me.flagLoadingImg.slice;

                        me.drawImages();
                                                            
                        me.flagLoadingImg.loading=false;

                        if(flagFirstImage || me.flagLoadingImg.view!=me.User.view ||me.flagLoadingImg.slice!=me.User.slice) {
                            me.sendRequestSliceMessage();
                        }
                        
                        // remove loading indicator
                        $("#loadingIndicator").hide();
                    }
                    img.src=imageUrl;

                    break;
                }
            }
        };
        fileReader.readAsArrayBuffer(msgData);
	},
	/**
     * @function receiveUserDataMessage
     */
	receiveUserDataMessage: function receiveUserDataMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveUserDataMessage,0,"#aca");if(l)console.log.apply(undefined,l);

		if(me.debug>1) console.log("description: "+data.description,data);
	
		var u=data.uid;
	
		// First time the user is observed
		if(me.Collab[u]===undefined) {
			try {
				//var	msg="<b>"+data.user.username+"</b> entered atlas "+data.user.specimenName+"/"+data.user.atlasFilename+"<br />"
				var	msg;
				if(data.user === undefined || data.user.username === "Anonymous") {
				    msg="<b>"+data.uid+"</b> entered<br />";
				} else {
				    msg="<b>"+data.user.username+"</b> entered<br />";
				}
				$("#log").append(msg);
				$("#log").scrollTop($("#log")[0].scrollHeight);
			} catch (e) {
			    console.log("data:",data);
				console.log(e);
			}
		}
		
		if(data.description === "allUserData")
    		me.Collab[u]=data.user;
    	else {
    	    try {
                var changes = JSON.parse(data.description);
                var i;
                for(i in changes)
                    me.Collab[u][i] = changes[i];
            } catch (e) {
                console.log(e);
            }
    	}

		var	v,nusers=1;
		for(v in me.Collab)
		    nusers++;
		$("#chat").text("Chat ("+nusers+" connected)");
	},
	/**
     * @function sendChatMessage
     */
	sendChatMessage: function sendChatMessage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendChatMessage,0,"#aca");if(l)console.log.apply(undefined,l);
	
		if(me.flagConnected==0)
			return;
		var msg = DOMPurify.sanitize($('input#msg')[0].value);
		try {
			me.socket.send(JSON.stringify({"type":"chat","msg":msg,"username":me.User.username}));
			var	msg="<b>me: </b>"+msg+"<br />";
			$("#log").append(msg);
			$("#log").scrollTop($("#log")[0].scrollHeight);
			$('input#msg').val("");
		} catch (ex) {
			console.log("ERROR: Unable to sendChatMessage",ex);
		}
	},
	/**
     * @function receiveChatMessage
     */
	receiveChatMessage: function receiveChatMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveChatMessage,0,"#aca");if(l)console.log.apply(undefined,l);
		console.log(data);
	
	    var theSource=me.Collab[data.uid].source;
		var	theView=me.Collab[data.uid].view;
		var	theSlice=me.Collab[data.uid].slice;
		var link = "/mri?url="+theSource+"&view="+theView+"&slice="+theSlice;
		var theUsername=data.username;
		var	msg="<a href='"+link+"'><b>"+theUsername+":</b></a> "+data.msg+"<br />"
		$("#log").append(msg);
		$("#log").scrollTop($("#log")[0].scrollHeight);
	},
	/**
     * @function sendPaintMessage
     * @desc On user painting, this function broadcasts the painting event to all other connected users
     * @param {Object} msg Painting event object: {"c":c,"x":x,"y":y}, where "c" is the command (l,e,lf,ef) and x and y are the coordinates in slice space
     */
	sendPaintMessage: function sendPaintMessage(msg) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendPaintMessage,1,"#aca");if(l)console.log.apply(undefined,l);
	
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"paint",data:msg}));
		} catch (ex) {
			console.log("ERROR: Unable to sendPaintMessage",ex);
		}
	},
	/**
     * @function receivePaintMessage
     * @desc Receive paint events from other connected users
     */
	receivePaintMessage: function receivePaintMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receivePaintMessage,3,"#aca");if(l)console.log.apply(undefined,l);
	
		var	msg=data.data;
		var u=data.uid;	// user
		var c=msg.c;	// command
		var x=parseInt(msg.x);	// x coordinate
		var y=parseInt(msg.y);	// y coordinate

		if(me.Collab[u])
		    me.paintxy(u,c,x,y,me.Collab[u]);
	},
	/**
     * @function sendShowMessage
     * @desc On user showing, this function broadcasts the showing event to all other connected users
     * @param {Object} msg Showing event object: {"x":x,"y":y}, where x and y are the coordinates in slice space
     */
	sendShowMessage: function sendShowMessage(msg) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendShowMessage,1,"#aca");if(l)console.log.apply(undefined,l);
	
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"show",data:msg}));
		} catch (ex) {
			console.log("ERROR: Unable to sendShowMessage",ex);
		}
	},
	/**
     * @function receiveShowMessage
     * @desc Receive show events from other connected users
     */
	receiveShowMessage: function receiveShowMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveShowMessage,3,"#aca");if(l)console.log.apply(undefined,l);
	
		var	msg=data.data;
		var u=data.uid;	// user
		var c=msg.c;	// command
		var x=parseInt(msg.x);	// x coordinate
		var y=parseInt(msg.y);	// y coordinate

		if(me.Collab[u])
    		me.showxy(u,c,x,y,me.Collab[u]);
	},
	/**
     * @function receivePaintVolumeMessage
     */
	receivePaintVolumeMessage: function receivePaintVolumeMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receivePaintVolumeMessage,0,"#aca");if(l)console.log.apply(undefined,l);
	
		var	i,ind,val,voxels;
	
		voxels=data.data;
		me.paintvol(voxels.data);
		
		/*
		    TEST
		*/
		me.sendRequestSliceMessage();
	},
	 /**
     * @function sendUndoMessage
     */
	sendUndoMessage: function sendUndoMessage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendUndoMessage,0,"#aca");if(l)console.log.apply(undefined,l);
	
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"paint",data:{c:"u"}}));
		} catch (ex) {
			console.log("ERROR: Unable to sendUndoMessage",ex);
		}
	},
	/**
     * @function sendRequestMRIMessage
     */
	sendRequestMRIMessage: function sendRequestMRIMessage(source) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendRequestMRIMessage,1,"#aca");if(l)console.log.apply(undefined,l);

		if(me.flagConnected==0)
			return;

		try {
			me.socket.send(JSON.stringify({
				type:"requestMRI",
				source:"sendRequestMRIMessage"
			}));
		} catch (ex) {
			console.log("ERROR: Unable to sendRequestMRIMessage",ex);
		}
	},
	/**
     * @function sendRequestSliceMessage
     */
	sendRequestSliceMessage: function sendRequestSliceMessage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendRequestSliceMessage,1,"#aca");if(l)console.log.apply(undefined,l);

		if(me.flagConnected==0)
			return;
		if(me.flagLoadingImg.loading==true)
			return;
		try {
			me.socket.send(JSON.stringify({
				
				// type:"requestSlice",
				/*
				    TEST
				*/
				type:"requestSlice2",
				
				view:me.User.view,
				slice:me.User.slice
			}));
			me.flagLoadingImg.loading=true;
			me.flagLoadingImg.view=me.User.view;
			me.flagLoadingImg.slice=me.User.slice;

		} catch (ex) {
			console.log("ERROR: Unable to sendRequestSliceMessage",ex);
		}
	},
    /**
     * @todo This is really not the place for some of this code. The receiveMetadata
     *       function is ok, but the direct references to projectInfo -- a structure
     *       exclusively used by project.mustache -- should go to that file. Now, the
     *       mechanism for uncoupling the 2 pieces of code is not clear. It could be
     *       a subscription, for example.
     */
	receiveMetadata: function receiveMetadata(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveMetadata,1,"#aca");if(l)console.log.apply(undefined,l);
        var projShortname = projectInfo.shortname;
		for (var i in projectInfo.files.list) {
			if (projectInfo.files.list[i].source == data.metadata.source) {
				for (var key in projectInfo.files.list[i].mri.annotations[projShortname]) {
					info_proxy["files.list." + i + ".mri.annotations." + projShortname + "." + key] = data.metadata.mri.annotations[projShortname][key];
				}
				info_proxy["files.list." + i + ".name"] = data.metadata.name;
				break;
			}
		}
	},
	/**
     * @function sendSaveMetadataMessage
     */
	sendSaveMetadataMessage: function sendSaveMetadataMessage(info, method, patch) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendSaveMetadataMessage,1,"#aca");if(l)console.log.apply(undefined,l);
			
		var def = $.Deferred();
		if(me.flagConnected==0) {
		    console.log("WARNING: Not connected: will not save metadata");
			return def.reject().promise();
		}
		
		try {
		    var rnd = Math.random().toString(36).slice(20);
		    var met = method || "append";
		    if(method == "patch") {
                me.socket.send(JSON.stringify({
                    type:"saveMetadata",
                    metadata: info,
                    method: met,
                    patch: patch,
                    rnd: rnd
                }));		    
		    } else {
                me.socket.send(JSON.stringify({
                    type:"saveMetadata",
                    metadata: info,
                    method: met,
                    rnd: rnd
                }));
            }
			if(me.debug>1) {
			    console.log(rnd);
                console.log(info);
            }
			def.resolve();
			
		} catch (ex) {
			console.log("ERROR: Unable to sendSaveMetadataMessage",ex);
			def.reject();
		}
        return def.promise();
	},
	/**
     * @function receiveDisconnectMessage
     */
	receiveDisconnectMessage: function receiveDisconnectMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveDisconnectMessage,0,"#aca");if(l)console.log.apply(undefined,l);

		var u=data.uid;	// user
		//var	msg="<b>"+me.Collab[u].username+"</b> left atlas "+me.Collab[u].specimenName+"/"+me.Collab[u].atlasFilename+"<br />"
		if(me.Collab[u])
    		var	msg="<b>"+me.Collab[u].username+"</b> left<br />";
    	else
    		var	msg="<b>"+u+"</b> left<br />";
		me.Collab.splice(u,1);
		var	v,nusers=1; for(v in me.Collab) nusers++;
		$("#chat").text("Chat ("+nusers+" connected)");
		$("#log").append(msg);
		$("#log").scrollTop($("#log")[0].scrollHeight);
	},
	//==========
	// Database
	//==========
    /**
     * @function logToDatabase
     */
	logToDatabase: function logToDatabase(key,value) {
		var def=$.Deferred();
		var me=AtlasMakerWidget;
		var l=me.traceLog(logToDatabase,1,"#bbd");if(l)console.log.apply(undefined,l);
		$.ajax({
			url:"/api/log",
			type:"POST",
			data: {
				username:me.User.username,
				key:key,
				value:value
		}})
		.done(function(data) {
			def.resolve(data);
		})
		.fail(function() {
			def.reject("Error");
		});
		return def.promise();
	}
}