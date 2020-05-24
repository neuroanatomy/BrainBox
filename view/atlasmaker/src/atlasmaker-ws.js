/* global AtlasMakerWidget MozWebSocket $*/
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
   * Create a WebSocket connection using the WebSocket object or the MozWebSocket object
   * @param {string} host Websocket host
   * @returns {object} Websocket
   */
  createSocket: function (host) {
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
   * @returns {void}
   */
  initSocketConnection: function () {
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
        me.receiveFunctions.serverMessage = me.receiveServerMessage;
        me.receiveFunctions.vectorial = me.receiveVectorialAnnotationMessage;

        me.receiveFunctions.requestSlice = function (data) { console.log("requestSlice", data); };
        me.receiveFunctions.requestSlice2 = function (data) { console.log("requestSlice2", data); };

        me.socket.onmessage = me.receiveSocketMessage;

        me.socket.onclose = function () {
          me.flagConnected = 0;

          // Try to reconnect: wait a random initial time, to prevent an avalanche
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
    * @param {object} msg The message received
    * @returns {void}
    */
  receiveSocketMessage: function (msg) {
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
   * @param {string} description The type of user data message to send
   * @returns {void}
   */
  sendUserDataMessage: function (description) {
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
   * @param {object} msgData Binary data received
   * @returns {void}
   */
  receiveBinaryMessage: function (msgData) {
    var me = AtlasMakerWidget;
    var fileReader = new FileReader();
    fileReader.onload = function () {
      var data = new Uint8Array(this.result);
      var sz = data.length;
      var ext = String.fromCharCode(data[sz - 8], data[sz - 7], data[sz - 6]);

      if (me.debug > 1) { console.log("type: " + ext); }

      if(me.debug>1) { console.log("type: "+ext); }

      switch(ext) {
      case 'nii': {
        var inflate = new pako.Inflate();
        inflate.push(data, true);
        var atlas = {};
        atlas.data = inflate.result;
        atlas.name = me.atlasFilename;
        atlas.dim = me.brainDim;

        me.atlas = atlas;

        me.configureBrainImage();
        me.configureAtlasImage();
        me.resizeWindow();

        me.brainImg.img=null;
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
          var flagFirstImage = (me.brainImg.img === null);
          me.brainImg.img = img;
          me.brainImg.view = me.flagLoadingImg.view;
          me.brainImg.slice = me.flagLoadingImg.slice;

          me.drawImages();

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
    * Receive real-time data from other connected users
    * @param {object} data Data received
    * @returns {void}
    */
  receiveUserDataMessage: function (data) {
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
        $("#logChat .text").append(msg);
        $("#logChat .text").scrollTop($("#logChat .text")[0].scrollHeight);
      } catch (e) {
        console.log("data:", data);
        console.log(e);
      }
    }

    if (data.description === "allUserData") {
      // all data from another user. Received upon their first connection
      me.Collab[u] = data.user;
    } else {
      // partial data update from another user.
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

    // update number of connected users
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
    * @returns {void}
    */
  sendChatMessage: function () {
    var me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }
    var msg = DOMPurify.sanitize($('input#msg')[0].value);
    try {
      me.socket.send(JSON.stringify({ "type": "chat", "msg": msg, "username": me.User.username }));
      msg = "<b>me: </b>" + msg + "<br />";
      $("#logChat .text").append(msg);
      $("#logChat .text").scrollTop($("#logChat .text")[0].scrollHeight);
      $('input#msg').val("");
    } catch (ex) {
      console.log("ERROR: Unable to sendChatMessage", ex);
    }
  },

  /**
    * @param {object} data Data received
    * @returns {void}
    */
  receiveChatMessage: function (data) {
    var me = AtlasMakerWidget;
    console.log(data);

    var theSource = me.Collab[data.uid].source;
    var theView = me.Collab[data.uid].view;
    var theSlice = me.Collab[data.uid].slice;
    var link = me.hostname + "/mri?url=" + theSource + "&view=" + theView + "&slice=" + theSlice;
    var theUsername = (data.username === "Anonymous")?data.uid:data.username;
    var msg = "<a href='" +link+"'><b>"+theUsername+":</b></a> "+data.msg+"<br />";
    $("#logChat .text").append(msg);
    $("#logChat .text").scrollTop($("#logChat .text")[0].scrollHeight);
  },

  /**
    * On user painting, this function broadcasts the painting event to all
    * other connected users
    * @param {object} msg Painting event object: {"c":c,"x":x,"y":y}, where
    * "c" is the command (l,e,lf,ef) and x and y are the coordinates in slice space
    * @returns {void}
    */
  sendPaintMessage: function (msg) {
    const me = AtlasMakerWidget;
    if(me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({type:"paint", data:msg}));
    } catch (ex) {
      console.log("ERROR: Unable to sendPaintMessage", ex);
    }
  },

  sendVectorialAnnotationMessage: function (msg) {
    const me = AtlasMakerWidget;
    if(me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({
        type: "vectorial",
        data: msg
      }));
    } catch (ex) {
      console.log("ERROR: Unable to sendVectorialAnnotationMessage", ex);
    }
  },

  /**
   * @param {array} atlasData Atlas data
   * @returns {void}
   */
  sendAtlasDataMessage: function (atlasData) {
    const me = AtlasMakerWidget;
    me.socket.binaryType = "arraybuffer";
    me.socket.send(pako.deflate(atlasData));
    me.socket.binaryType = "blob";
  },

  /**
   * Receive paint events from other connected users
   * @param {object} data Paint message received
   * @returns {void}
   */
  receivePaintMessage: function (data) {
    const me = AtlasMakerWidget;
    var {uid:u, data:msg}=data; // user

    if(me.Collab[u]) { me.paintxy(u, msg.c, msg.x, msg.y, me.Collab[u]); }
  },

  /**
   * On user showing, this function broadcasts the showing event to all other
   * connected users
   * @param {object} msg Showing event object: {"x":x,"y":y}, where x and y
   * are the coordinates in slice space
   * @returns {void}
   */
  sendShowMessage: function (msg) {
    const me = AtlasMakerWidget;
    if(me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({type:"show", data:msg}));
    } catch (ex) {
      console.log("ERROR: Unable to sendShowMessage", ex);
    }
  },

  /**
   * Receive show events from other connected users
   * @param {object} data Show message received with x and y coordinates of
   * the location to show
   * @returns {void}
   */
  receiveShowMessage: function (data) {
    const me = AtlasMakerWidget;
    var {uid:u, data:msg} = data; // user

    if(me.Collab[u]) { me.showxy(u, msg.c, msg.x, msg.y, me.Collab[u]); }
  },

  /**
   * @param {object} data List of voxels to paint
   * @returns {void}
   */
  receivePaintVolumeMessage: function (data) {
    const me = AtlasMakerWidget;
    var voxels;

    voxels=data.data;
    me.paintvol(voxels.data);

    // TEST
    me.sendRequestSliceMessage();
  },

  /**
   * @param {object} data Object with vectorial annotations
   * @returns {void}
   */
  receiveVectorialAnnotationMessage: function (data) {
    const me = AtlasMakerWidget;
    ({data: me.User.vectorial} = data);
    me.displayInformation();
  },

  /**
   * @returns {void}
   */
  sendUndoMessage: function () {
    const me = AtlasMakerWidget;
    if(me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({type:"paint", data:{c:"u"}}));
    } catch (ex) {
      console.log("ERROR: Unable to sendUndoMessage", ex);
    }
  },

  /**
   * @returns {void}
   */
  sendSaveMessage: function () {
    const me = AtlasMakerWidget;
    if(me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({type:"save"}));
    } catch (ex) {
      console.log("ERROR: Unable to sendSaveMessage", ex);
    }
  },

  /**
   * @returns {void}
   */
  sendRequestMRIMessage: function () {
    const me = AtlasMakerWidget;
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
   * @returns {void}
   */
  sendRequestSliceMessage: function () {
    const me = AtlasMakerWidget;
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

  _metadataChangeSubscribers: [],

  /**
   * @param {object} data The metadata received
   * @returns {void}
   */
  receiveMetadata: function (data) {
    const me = AtlasMakerWidget;
    for(const subscriberCallback of me._metadataChangeSubscribers) {
      subscriberCallback(data);
    }
  },

  /**
   * Sends metadata to the server for saving. Can work in "patch" mode, where
   * only a difference object is send, or "append" mode, where the complete
   * metadata object is sent. The metadata object corresponds to an MRI entry
   * in the database, and has the following structure:
   * {
   *  filename: string, a filename like "mri.nii.gz"
   *  success: boolean, true if the mri was successfuly downloaded
   *  source: string, url like "https://..."
   *  url: "string", a server path with the pattern "/data/${hash}/"
   *  dim: [3 integers]
   *  pixdim: [3 reals]
   *  voxel2world: [3x3 reals]
   *  worldOrigin: [3 reals]
   *  owner: string, a GitHub username
   *  included: string, a date string
   *  modified: string, a date string
   *  modifiedBy: string, a GitHub username
   *  mri: {
   *    brain: string, a filename like "mri.nii.gz", same as the root filename
   *    atlas: [
   *      {
   *        created: string, date string
   *        modified: string, date string
   *        access: string, either none, view, edit, add or remove
   *        type: string, only "volume", for the moment
   *        name: string, a name like "Cerebrum"
   *        filename: string, a filename like "cerebrum.nii.gz"
   *        labels: string, a labelset name from among the available ones
   *        project: string, a project shortname like "testproject"
   *      }
   *    ],
   *    annotations: {
   *      "projectname": {
   *        "ann1": {
   *          access: string, among none, view, edit, add, remove
   *          created: string, a date
   *          modified: string, a date
   *          owner: string, GitHub username
   *          type: string, a textual data type among "text", "multiple choices" or "hidden text"
   *          data: string, the annotation proper
   *        },
   *        "ann2": ...
   *      }
   *    }
   *  }
   * }
   * @param {object} info Metadata object, as generated by brainbox
   * @param {string} method Method "patch" or "append"
   * @param {object} patch Path object used in case method is "patch"
   * @returns {void}
   */
  sendSaveMetadataMessage: function (info, method, patch) {
    const me = AtlasMakerWidget;

    return new Promise(function(resolve, reject) {
      if(me.flagConnected === 0) {
        console.log("WARNING: Not connected: will not save metadata");

        return reject(new Error("Not connected"));
      }

      try {
        const rnd = Math.random().toString(36)
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
   * @param {object} data Message data
   * @returns {void}
   */
  receiveDisconnectMessage: function (data) {
    const me = AtlasMakerWidget;
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
    $("#logChat .text").append(msg);
    $("#logChat .text").scrollTop($("#logChat .text")[0].scrollHeight);
  },

  /**
   * Receives notifications from the server
   * @param {object} data Message data
   * @returns {void}
   */
  receiveServerMessage: function (data) {
    var {msg}=data;
    var prevMsg=$("#notifications").text();
    $("#notifications").text(msg);
    setTimeout(function() { $("#notifications").text(prevMsg); }, 5000);
  },

  /**
   * Replays websocket traffic recorded at the served. Used for debugging
   * @param {array} recorded An array of websocket messages recorded in the server
   * @returns {void}
   */
  replayWSTraffic: function (recorded) {
    const me = AtlasMakerWidget;
    var i;
    for(i=0; i<recorded.length; i++) {
      me.socket.send(JSON.stringify(recorded[i]));
    }
  },

  //==========
  // Database
  //==========

  /**
   * Logs a key-value pair to the 'log' database
   * @param {string} key The key
   * @param {string} value The value
   * @returns {void}
   */
  logToDatabase: function (key, value) {
    return new Promise(function(resolve, reject) {
      const me = AtlasMakerWidget;
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
