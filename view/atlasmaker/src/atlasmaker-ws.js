/* global AtlasMakerWidget projectInfo info_proxy MozWebSocket $*/
/*! AtlasMaker: WebSockets */
import * as DOMPurify from 'dompurify';
import * as pako from 'pako';

/**
 * @page AtlasMaker: WebSockets
 */
export var AtlasMakerWS = {
    //====================================================================================
    // Web sockets
    //====================================================================================
    /**
     * @function createSocket
     * @desc  Create a WebSocket connection using the WebSocket object or the MozWebSocket
     *        object.
     * @param {string} host Websocket host
     * @returns {object} Websocket
     */
    createSocket: function createSocket(host) {
        var ws;

        if (window.WebSocket) {
            ws = new WebSocket(host);
        } else if (window.MozWebSocket) {
            ws = new MozWebSocket(host);
        } else {
            console.log("ERROR: browser does not support WebSockets");
        }

        return ws;
    },

    /**
    * @function initSocketConnection
    * @returns {void}
    */
    initSocketConnection: function initSocketConnection() {
        var me = AtlasMakerWidget;

        return new Promise(function (resolve, reject) {
            // WS connection
            let host;
            if(me.secure) {
                host = "wss://" + me.wshostname;
            } else {
                host = "ws://" + me.wshostname;
            }

            if (me.debug) { console.log("[initSocketConnection] host:", host); }
            if (me.progress) { me.progress.html("Connecting..."); }

            try {
                me.socket = me.createSocket(host);

                me.socket.onopen = function (msg) {
                    if (me.debug) { console.log("[initSocketConnection] connection open", msg); }
                    me.progress.html("<img src='" + me.hostname + "/img/download.svg' style='vertical-align:middle'/>MRI");
                    $("#notifications").text("Chat (1 connected)");
                    me.flagConnected = 1;
                    me.reconnectionTimeout = 5;
                    resolve();
                };

                me.receiveFunctions.saveMetadata = me.receiveMetadata;
                me.receiveFunctions.userData = me.receiveUserDataMessage;
                me.receiveFunctions.volInfo = function (data) { console.log("volInfo", data); };
                me.receiveFunctions.chat = me.receiveChatMessage;
                me.receiveFunctions.show = me.receiveShowMessage;
                me.receiveFunctions.paint = me.receivePaintMessage;
                me.receiveFunctions.paintvol = me.receivePaintVolumeMessage;
                me.receiveFunctions.disconnect = me.receiveDisconnectMessage;
                me.receiveFunctions.serverMessage = me.receiveServerMessage;

                me.receiveFunctions.requestSlice = function (data) { console.log("requestSlice", data); };
                me.receiveFunctions.requestSlice2 = function (data) { console.log("requestSlice2", data); };

                me.socket.onmessage = me.receiveSocketMessage;

                me.socket.onclose = function () {
                    me.flagConnected = 0;

                    // Try to reconnect
                    // wait a random initial time, to prevent an avalanche
                    // of reconnections in case of server crash
                    var rand = 1000 + 5000 * Math.random();
                    console.log("Initial random time:", rand);
                    setTimeout(function () {
                        var timeout = me.reconnectionTimeout;
                        $("#notifications").text("Disconnected. Try to reconnect in " + (timeout--) + " s...");
                        if (me.timer) {
                            clearInterval(me.timer);
                            setTimeout(function() {
                                me.reconnectionTimeout *= 2;
                                me.initSocketConnection()
                                .then(function() {
                                    me.sendUserDataMessage("allUserData");
                                    me.sendUserDataMessage("sendAtlas");
                                    clearInterval(me.timer);
                                })
                                .catch(function() {
                                    timeout=me.reconnectionTimeout;
                                    $("#notifications").text("Disconnected. Try to reconnect in "+(timeout--)+" s...");
                                });
                            }, 1000);
                        } else {
                            $("#notifications").text("Disconnected. Try to reconnect in "+(timeout--)+" s...");
                        }
                        me.timer = setInterval(function () {
                            if (timeout < 0) {
                                $("#notifications").text("Reconnecting...");
                                me.socket = null;
                                clearInterval(me.timer);
                                setTimeout(function () {
                                    me.reconnectionTimeout *= 2;
                                    me.initSocketConnection()
                                        .then(function () {
                                            me.sendUserDataMessage("allUserData");
                                            me.sendUserDataMessage("sendAtlas");
                                            clearInterval(me.timer);
                                        })
                                        .catch(function () {
                                            timeout = me.reconnectionTimeout;
                                            $("#notifications").text("Disconnected. Try to reconnect in " + (timeout--) + " s...");
                                        });
                                }, 1000);
                            } else {
                                $("#notifications").text("Disconnected. Try to reconnect in " + (timeout--) + " s...");
                            }
                        }, 1000);
                    }, rand);
                };

                window.onbeforeunload = function () {
                    // me.socket.onclose = function () { }; // disable onclose handler first
                    me.socket.close();
                };
            } catch (ex) {
                $("#notifications").text("Chat (not connected - connection error)");
                reject(ex);
            }
        });
    },

    /**
    * @function receiveSocketMessage
    * @param {object} msg The message received
    * @returns {void}
    */
    receiveSocketMessage: function receiveSocketMessage(msg) {
        var me = AtlasMakerWidget;
        // Message: atlas data initialisation
        if (msg.data instanceof Blob) {
            me.receiveBinaryMessage(msg.data);

            return;
        }

        // Message: interaction message
        var data = JSON.parse(msg.data);
        me.receiveFunctions[data.type](data);
    },

    /**
    * @function sendUserDataMessage
    * @param {string} description The type of user data message to send
    * @returns {void}
    */
    sendUserDataMessage: function sendUserDataMessage(description) {
        var me = AtlasMakerWidget;
        if (me.flagConnected === 0) { return; }

        if (me.debug > 1) { console.log("message: " + description); }
        var msg;
        if (description === "allUserData") {
            msg = { type: "userData", user: me.User, description };
        } else {
            msg = { type: "userData", description };
        }
        try {
            me.socket.send(JSON.stringify(msg));
        } catch (ex) {
            console.log("ERROR: Unable to sendUserDataMessage", ex);
        }
    },

    /**
    * @function receiveBinaryMessage
    * @param {object} msgData Binary data received
    * @returns {void}
    */
    receiveBinaryMessage: function receiveBinaryMessage(msgData) {
        var me = AtlasMakerWidget;
        var fileReader = new FileReader();
        fileReader.onload = function () {
            var data = new Uint8Array(this.result);
            var sz = data.length;
            var ext = String.fromCharCode(data[sz - 8], data[sz - 7], data[sz - 6]);

            if (me.debug > 1) { console.log("type: " + ext); }

            if(me.debug>1) console.log("type: "+ext);
            
            switch(ext) {
                case 'nii': {
                    var inflate = new pako.Inflate();
                    inflate.push(data, true);
                    var atlas = {};
                    atlas.data = inflate.result;
                    atlas.name = me.atlasFilename;
                    atlas.dim = me.brain_dim;

                    me.atlas = atlas;

                    me.configureBrainImage();
                    me.configureAtlasImage();
                    me.resizeWindow();

                    me.brain_img.img=null;
                    me.drawImages();
                    
                    // compute total segmented volume
                    var vol=me.computeSegmentedVolume();
                    me.info.volume=parseInt(vol)+" mm3";

                    // setup download link
                    var link = me.container.find("span#download_atlas");
                    link.html([
                        "<a class='download' href='" + me.User.dirname + me.User.atlasFilename + "'>",
                        "<img src='" + me.hostname + "/img/download.svg' style='vertical-align:middle'/>",
                        "</a>" + atlas.name
                    ].join(''));

                    break;
                }
                case 'jpg': {
                    var urlCreator = window.URL || window.webkitURL;
                    var imageUrl = urlCreator.createObjectURL(msgData);
                    var img = new Image();

                    me.isMRILoaded = true; // receiving a jpg is proof of a loaded MRI

                    img.onload = function () {
                        var flagFirstImage = (me.brain_img.img === null);
                        me.brain_img.img = img;
                        me.brain_img.view = me.flagLoadingImg.view;
                        me.brain_img.slice = me.flagLoadingImg.slice;

                        me.drawImages();
                                                            
                        me.flagLoadingImg.loading=false;

                        me.flagLoadingImg.loading = false;

                        if (flagFirstImage || me.flagLoadingImg.view !== me.User.view || me.flagLoadingImg.slice !== me.User.slice) {
                            me.sendRequestSliceMessage();
                        }
                        
                        // remove loading indicator
                        $("#loadingIndicator").hide();
                    };
                    img.src = imageUrl;

                    break;
                }
            }
        };
        fileReader.readAsArrayBuffer(msgData);
    },

    /**
    * @function receiveUserDataMessage
    * @param {object} data Data received
    * @returns {void}
    */
    receiveUserDataMessage: function receiveUserDataMessage(data) {
        var me = AtlasMakerWidget;
        if (me.debug > 1) { console.log("description: " + data.description, data); }

        var u = data.uid;

        // First time the user is observed
        if (typeof me.Collab[u] === 'undefined') {
            try {
                //var    msg="<b>"+data.user.username+"</b> entered atlas "+data.user.specimenName+"/"+data.user.atlasFilename+"<br />"
                var msg;
                if (typeof data.user === 'undefined' || data.user.username === "Anonymous") {
                    msg = "<b>" + data.uid + "</b> entered<br />";
                } else {
                    msg = "<b>" + data.user.username + "</b> entered<br />";
                }
                $("#logChat").append(msg);
                $("#logChat").scrollTop($("#logChat")[0].scrollHeight);
            } catch (e) {
                console.log("data:", data);
                console.log(e);
            }
        }

        if (data.description === "allUserData") { me.Collab[u] = data.user; } else {
            try {
                var changes = JSON.parse(data.description);
                var i;
                for (i in changes) {
                    if({}.hasOwnProperty.call(changes, i)) {
                        me.Collab[u][i] = changes[i];
                    }
                }
            } catch (e) {
                console.log(e);
            }
        }

        let v;
        let nusers = 1;
        for (v in me.Collab) {
            if({}.hasOwnProperty.call(me.Collab, v)) {
                nusers++;
            }
        }
        $("#notifications").text("Chat (" + nusers + " connected)");
    },

    /**
    * @function sendChatMessage
    * @returns {void}
    */
    sendChatMessage: function sendChatMessage() {
        var me = AtlasMakerWidget;
        if (me.flagConnected === 0) { return; }
        var msg = DOMPurify.sanitize($('input#msg')[0].value);
        try {
            me.socket.send(JSON.stringify({ "type": "chat", "msg": msg, "username": me.User.username }));
            msg = "<b>me: </b>" + msg + "<br />";
            $("#logChat").append(msg);
            $("#logChat").scrollTop($("#logChat")[0].scrollHeight);
            $('input#msg').val("");
        } catch (ex) {
            console.log("ERROR: Unable to sendChatMessage", ex);
        }
    },

    /**
    * @function receiveChatMessage
    * @param {object} data Data received
    * @returns {void}
    */
    receiveChatMessage: function receiveChatMessage(data) {
        var me = AtlasMakerWidget;
        console.log(data);

        var theSource = me.Collab[data.uid].source;
        var theView = me.Collab[data.uid].view;
        var theSlice = me.Collab[data.uid].slice;
        var link = me.hostname + "/mri?url=" + theSource + "&view=" + theView + "&slice=" + theSlice;
        var theUsername = (data.username === "Anonymous")?data.uid:data.username;
        var msg = "<a href='" +link+"'><b>"+theUsername+":</b></a> "+data.msg+"<br />";
        $("#logChat").append(msg);
        $("#logChat").scrollTop($("#logChat")[0].scrollHeight);
    },

    /**
    * @function sendPaintMessage
    * @desc On user painting, this function broadcasts the painting event to all other connected users
    * @param {object} msg Painting event object: {"c":c,"x":x,"y":y}, where "c" is the command (l,e,lf,ef) and x and y are the coordinates in slice space
    * @returns {void}
    */
    sendPaintMessage: function sendPaintMessage(msg) {
        var me=AtlasMakerWidget;
        if(me.flagConnected === 0) { return; }
        try {
            me.socket.send(JSON.stringify({type:"paint", data:msg}));
        } catch (ex) {
            console.log("ERROR: Unable to sendPaintMessage", ex);
        }
    },

    /**
     * @function sendAtlasDataMessage
     * @param {array} atlasData Atlas data
     * @returns {void}
     */
    sendAtlasDataMessage: function sendAtlasDataMessage(atlasData) {
        var me=AtlasMakerWidget;
        me.socket.binaryType = "arraybuffer";
        me.socket.send(pako.deflate(atlasData));
        me.socket.binaryType = "blob";
    },

    /**
    * @function receivePaintMessage
    * @desc Receive paint events from other connected users
    * @param {object} data Paint message received
    * @returns {void}
    */
    receivePaintMessage: function receivePaintMessage(data) {
        var me=AtlasMakerWidget;
        var {uid:u, data:msg}=data; // user

        if(me.Collab[u]) { me.paintxy(u, msg.c, msg.x, msg.y, me.Collab[u]); }
    },

    /**
    * @function sendShowMessage
    * @desc On user showing, this function broadcasts the showing event to all other connected users
    * @param {object} msg Showing event object: {"x":x,"y":y}, where x and y are the coordinates in slice space
    * @returns {void}
    */
    sendShowMessage: function sendShowMessage(msg) {
        var me=AtlasMakerWidget;
        if(me.flagConnected === 0) { return; }
        try {
            me.socket.send(JSON.stringify({type:"show", data:msg}));
        } catch (ex) {
            console.log("ERROR: Unable to sendShowMessage", ex);
        }
    },

    /**
    * @function receiveShowMessage
    * @desc Receive show events from other connected users
    * @param {object} data Show message received with x and y coordinates of the location to show
    * @returns {void}
    */
    receiveShowMessage: function receiveShowMessage(data) {
        var me=AtlasMakerWidget;
        var {uid:u, data:msg} = data; // user

        if(me.Collab[u]) { me.showxy(u, msg.c, msg.x, msg.y, me.Collab[u]); }
    },

    /**
    * @function receivePaintVolumeMessage
    * @param {object} data List of voxels to paint
    * @returns {void}
    */
    receivePaintVolumeMessage: function receivePaintVolumeMessage(data) {
        var me=AtlasMakerWidget;
        var voxels;

        voxels=data.data;
        me.paintvol(voxels.data);

        /*
            TEST
        */
        me.sendRequestSliceMessage();
    },

    /**
    * @function sendUndoMessage
    * @returns {void}
    */
    sendUndoMessage: function sendUndoMessage() {
        var me=AtlasMakerWidget;
        if(me.flagConnected === 0) { return; }
        try {
            me.socket.send(JSON.stringify({type:"paint", data:{c:"u"}}));
        } catch (ex) {
            console.log("ERROR: Unable to sendUndoMessage", ex);
        }
    },

    /**
    * @function sendSaveMessage
    * @returns {void}
    */
    sendSaveMessage: function sendSaveMessage() {
        var me=AtlasMakerWidget;
        if(me.flagConnected === 0) { return; }
        try {
            me.socket.send(JSON.stringify({type:"save"}));
        } catch (ex) {
            console.log("ERROR: Unable to sendSaveMessage", ex);
        }
    },

    /**
    * @function sendRequestMRIMessage
    * @returns {void}
    */
    sendRequestMRIMessage: function sendRequestMRIMessage() {
        var me=AtlasMakerWidget;
        if(me.flagConnected === 0) { return; }

        try {
            me.socket.send(JSON.stringify({
                type:"requestMRI",
                source:"sendRequestMRIMessage"
            }));
        } catch (ex) {
            console.log("ERROR: Unable to sendRequestMRIMessage", ex);
        }
    },

    /**
    * @function sendRequestSliceMessage
    * @returns {void}
    */
    sendRequestSliceMessage: function sendRequestSliceMessage() {
        var me=AtlasMakerWidget;
        if(me.flagConnected === 0) { return; }
        if(me.flagLoadingImg.loading === true) { return; }
        try {
            me.socket.send(JSON.stringify({

                type:"requestSlice",

                /*
                    TEST
                */
                //type:"requestSlice2",

                view:me.User.view,
                slice:me.User.slice
            }));
            me.flagLoadingImg.loading=true;
            me.flagLoadingImg.view=me.User.view;
            me.flagLoadingImg.slice=me.User.slice;

        } catch (ex) {
            console.log("ERROR: Unable to sendRequestSliceMessage", ex);
        }
    },

    /**
    * @function receiveMetadata
    * @param {object} data The metadata to send
    * @returns {void}
    * @todo This is really not the place for some of this code. The receiveMetadata
    *       function is ok, but the direct references to projectInfo -- a structure
    *       exclusively used by project.mustache -- should go to that file. Now, the
    *       mechanism for uncoupling the 2 pieces of code is not clear. It could be
    *       a subscription, for example.
    */
    receiveMetadata: function receiveMetadata(data) {
        var projShortname = projectInfo.shortname;
        for (var i in projectInfo.files.list) {
            if (projectInfo.files.list[i].source === data.metadata.source) {
                for (var key in projectInfo.files.list[i].mri.annotations[projShortname]) {
                    if({}.hasOwnProperty.call(projectInfo.files.list[i].mri.annotations[projShortname], key)) {
                        info_proxy["files.list." + i + ".mri.annotations." + projShortname + "." + key] = data.metadata.mri.annotations[projShortname][key];
                    }
                }
                info_proxy["files.list." + i + ".name"] = data.metadata.name;
                break;
            }
        }
    },

    /**
    * @function sendSaveMetadataMessage
    * @param {object} info Metadata
    * @param {string} method Method "patch" or "append"
    * @param {object} patch Path object used in case method is "patch"
    * @returns {void}
    */
    sendSaveMetadataMessage: function sendSaveMetadataMessage(info, method, patch) {
        var me=AtlasMakerWidget;

        return new Promise(function(resolve, reject) {
            if(me.flagConnected === 0) {
                console.log("WARNING: Not connected: will not save metadata");

                return reject(new Error("Not connected"));
            }

            try {
                var rnd = Math.random()
                            .toString(36)
                            .slice(20);
                var met = method || "append";
                if(method === "patch") {
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
                resolve();

            } catch (ex) {
                console.log("ERROR: Unable to sendSaveMetadataMessage", ex);
                reject(ex);
            }
        });
    },

    /**
    * @function receiveDisconnectMessage
    * @param {object} data Message data
    * @returns {void}
    */
    receiveDisconnectMessage: function receiveDisconnectMessage(data) {
        var me=AtlasMakerWidget;
        var {uid} = data; // user
        let msg;
        if(me.Collab[uid]) {
            if(typeof me.Collab[uid].username === 'undefined' || me.Collab[uid].username === "Anonymous") {
                msg = "<b>"+me.Collab[uid].uid+"</b> left<br />";
            } else {
                msg = "<b>"+me.Collab[uid].username+"</b> left<br />";
            }
        } else {
            msg="<b>"+uid+"</b> left<br />";
        }
        delete me.Collab[uid];
        let v;
        let nusers=1;
        for(v in me.Collab) {
            if({}.hasOwnProperty.call(me.Collab, v)) {
                nusers++;
            }
        }
        $("#notifications").text("Chat ("+nusers+" connected)");
        $("#logChat").append(msg);
        $("#logChat").scrollTop($("#logChat")[0].scrollHeight);
    },

    /**
    * @function receiveServerMessage
    * @param {object} data Message data
    * @returns {void}
    */
    receiveServerMessage: function receiveServerMessage(data) {
        var {msg}=data;
        var prevMsg=$("#notifications").text();
        $("#notifications").text(msg);
        setTimeout(function() { $("#notifications").text(prevMsg); }, 5000);
    },

    /**
    * @function replayWSTraffic
    * @desc Replays websocket traffic recorded at the served. Used for debugging
    * @param {array} recorded An array of websocket messages recorded in the server
    * @returns {void}
    */
    replayWSTraffic: function replayWSTraffic(recorded) {
        var me=AtlasMakerWidget;
        var i;
        for(i=0; i<recorded.length; i++) {
            me.socket.send(JSON.stringify(recorded[i]));
        }
    },

    //==========
    // Database
    //==========

    /**
    * @function logToDatabase
    * @desc Logs a key-value pair to the 'log' database
    * @param {string} key The key
    * @param {string} value The value
    * @returns {void}
    */
    logToDatabase: function logToDatabase(key, value) {
        return new Promise(function(resolve, reject) {
            var me=AtlasMakerWidget;
            $.ajax({
                url: me.hostname + "/api/log",
                type: "POST",
                data: {
                    username: me.User.username,
                    key: key,
                    value: value
            }})
            .done(function(data) {
                resolve(data);
            })
            .fail((err) => {
                reject(err);
            });
        });
    }
};
