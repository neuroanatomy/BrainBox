/* eslint-disable max-lines */
/* global AtlasMakerWidget MozWebSocket*/
/*! AtlasMaker: WebSockets */
import DOMPurify from 'dompurify';
import pako from 'pako';

/**
 * @page AtlasMaker: WebSockets
 */
export const AtlasMakerWS = {
  //====================================================================================
  // Web sockets
  //====================================================================================
  /**
   * Create a WebSocket connection using the WebSocket object or the MozWebSocket object
   * @param {string} host Websocket host
   * @returns {object} Websocket
   */
  createSocket: function (host) {
    let ws;

    if (window.WebSocket) {
      ws = new WebSocket(host);
    } else if (window.MozWebSocket) {
      ws = new MozWebSocket(host);
    } else {
      console.log('ERROR: browser does not support WebSockets');
    }

    return ws;
  },

  /**
   * @returns {void}
   */
  initSocketConnection: function () {
    const me = AtlasMakerWidget;

    // eslint-disable-next-line max-statements
    return new Promise(function (resolve, reject) {
      // WS connection
      const host = me.wshostname;

      if (me.debug) { console.log('[initSocketConnection] host:', host); }
      if (me.progress) { me.progress.innerHTML = 'Connecting...'; }

      try {
        me.socket = me.createSocket(host);

        me.socket.onopen = function (msg) {
          if (me.debug) { console.log('[initSocketConnection] connection open', msg); }
          if (me.progress) { me.progress.innerHTML = '<img src=\'' + me.hostname + '/img/download.svg\' style=\'vertical-align:middle\'/>MRI'; }
          me.setNotification('Chat (1 connected)');
          me.flagConnected = 1;
          me.reconnectionTimeout = 5;
          resolve();
        };

        me.receiveFunctions.saveMetadata = me.receiveMetadata;
        me.receiveFunctions.userData = me.receiveUserDataMessage;
        me.receiveFunctions.volInfo = function (data) { console.log('volInfo', data); };
        me.receiveFunctions.chat = me.receiveChatMessage;
        me.receiveFunctions.show = me.receiveShowMessage;
        me.receiveFunctions.paint = me.receivePaintMessage;
        me.receiveFunctions.paintvol = me.receivePaintVolumeMessage;
        me.receiveFunctions.disconnect = me.receiveDisconnectMessage;
        me.receiveFunctions.serverMessage = me.receiveServerMessage;
        me.receiveFunctions.vectorial = me.receiveVectorialAnnotationMessage;

        me.receiveFunctions.requestSlice = function (data) { console.log('requestSlice', data); };
        me.receiveFunctions.requestSlice2 = function (data) { console.log('requestSlice2', data); };

        me.socket.onmessage = me.receiveSocketMessage;

        me.socket.onclose = function () {
          me.flagConnected = 0;

          // Try to reconnect: wait a random initial time, to prevent an avalanche
          // of reconnections in case of server crash
          const rand = 1000 + 5000 * Math.random();
          console.log('Initial random time:', rand);
          setTimeout(function () {
            let timeout = me.reconnectionTimeout;
            me.setNotification('Disconnected. Try to reconnect in ' + (timeout -= 1) + ' s...');
            if (me.timer) {
              clearInterval(me.timer);
            }
            me.timer = setInterval(function () {
              if (timeout < 0) {
                me.setNotification('Reconnecting...');
                me.socket = null;
                clearInterval(me.timer);
                setTimeout(function () {
                  // should we limit the inflation of the timeout?
                  me.reconnectionTimeout *= 2;
                  me.initSocketConnection()
                    .then(function () {
                      me.sendUserDataMessage('allUserData');
                      me.sendUserDataMessage('sendAtlas');
                      clearInterval(me.timer);
                    })
                    .catch(function () {
                      timeout = me.reconnectionTimeout;
                      me.setNotification('Disconnected. Try to reconnect in ' + (timeout -= 1) + ' s...');
                    });
                }, 1000);
              } else {
                me.setNotification('Disconnected. Try to reconnect in ' + (timeout -= 1) + ' s...');
              }
            }, 1000);
          }, rand);
        };

        window.onbeforeunload = function () {
          // me.socket.onclose = function () { }; // disable onclose handler first
          me.socket.close();
        };
      } catch (ex) {
        me.setNotification('Chat (not connected - connection error)');
        reject(ex);
      }
    });
  },

  /**
    * @param {object} msg The message received
    * @returns {void}
    */
  receiveSocketMessage: function (msg) {
    const me = AtlasMakerWidget;
    // Message: atlas data initialisation
    if (msg.data instanceof Blob) {
      me.receiveBinaryMessage(msg.data);

      return;
    }

    // Message: interaction message
    const data = JSON.parse(msg.data);
    me.receiveFunctions[data.type](data);
  },

  /**
   * @param {string} description The type of user data message to send
   * @returns {void}
   */
  sendUserDataMessage: function (description) {
    const me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }

    if (me.debug > 1) { console.log('message: ' + description); }
    let msg;
    if (description === 'allUserData') {
      msg = { type: 'userData', user: me.User, description };
    } else {
      msg = { type: 'userData', description };
    }
    try {
      me.socket.send(JSON.stringify(msg));
    } catch (ex) {
      console.log('ERROR: Unable to sendUserDataMessage', ex);
    }
  },

  /**
   * @param {object} msgData Binary data received
   * @returns {void}
   */
  receiveBinaryMessage: function (msgData) {
    const me = AtlasMakerWidget;
    const fileReader = new FileReader();
    // eslint-disable-next-line max-statements
    fileReader.onload = function () {
      const data = new Uint8Array(this.result);
      const sz = data.length;
      const ext = String.fromCharCode(data[sz - 8], data[sz - 7], data[sz - 6]);

      if (me.debug > 1) { console.log('type: ' + ext); }

      if (me.debug > 1) { console.log('type: ' + ext); }

      switch (ext) {
      case 'nii': {
        const inflate = new pako.Inflate();
        inflate.push(data, true);
        const atlas = {};
        atlas.data = inflate.result;
        atlas.name = me.atlasFilename;
        atlas.dim = me.brainDim;

        me.atlas = atlas;

        me.configureBrainImage();
        me.configureAtlasImage();
        me.resizeWindow();

        me.brainImg.img = null;
        me.drawImages();

        // compute total segmented volume
        const vol = me.computeSegmentedVolume();
        me.info.volume = parseInt(vol, 10) + ' mm3';

        // setup download link
        const link = me.container.querySelector('span#download_atlas');
        if (link) {
          link.innerHTML = [
            '<a class=\'download\' href=\'' + me.User.dirname + me.User.atlasFilename + '\'>',
            '<img src=\'' + me.hostname + '/img/download.svg\' style=\'vertical-align:middle\'/>',
            '</a>' + atlas.name
          ].join('');
        }

        break;
      }
      case 'jpg': {
        const urlCreator = window.URL || window.webkitURL;
        const imageUrl = urlCreator.createObjectURL(msgData);
        const img = new Image();

        me.isMRILoaded = true; // receiving a jpg is proof of a loaded MRI

        img.onload = function () {
          me.brainImg.img = img;
          me.brainImg.view = me.flagLoadingImg.view;
          me.brainImg.slice = me.flagLoadingImg.slice;

          me.drawImages();

          me.flagLoadingImg.loading = false;

          if (me.flagLoadingImg.view !== me.User.view || me.flagLoadingImg.slice !== me.User.slice) {
            me.sendRequestSliceMessage();
          }

          // remove loading indicator
          me.sendFinishedLoadingEvent();
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
  // eslint-disable-next-line max-statements
  receiveUserDataMessage: function (data) {
    const me = AtlasMakerWidget;
    if (me.debug > 1) { console.log('description: ' + data.description, data); }

    const u = data.uid;

    // First time the user is observed
    if (typeof me.Collab[u] === 'undefined') {
      try {
        //var    msg="<b>"+data.user.username+"</b> entered atlas "+data.user.specimenName+"/"+data.user.atlasFilename+"<br />"
        let msg;
        if (typeof data.user === 'undefined' || data.user.username === 'Anonymous') {
          msg = '<b>' + data.uid + '</b> entered';
        } else {
          msg = '<b>' + data.user.username + '</b> entered';
        }
        me.appendChatMessage(msg);
      } catch (e) {
        console.log('data:', data);
        console.log(e);
      }
    }

    if (data.description === 'allUserData') {
      // all data from another user. Received upon their first connection
      me.Collab[u] = data.user;
    } else {
      // partial data update from another user.
      try {
        const changes = JSON.parse(data.description);
        let i;
        for (i in changes) {
          if ({}.hasOwnProperty.call(changes, i)) {
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
      if ({}.hasOwnProperty.call(me.Collab, v)) {
        nusers += 1;
      }
    }
    me.setNotification('Chat (' + nusers + ' connected)');
  },

  /**
    * @param {string} message The message to be sent
    * @returns {void}
    */
  sendChatMessage: function (message) {
    const me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }
    let msg = DOMPurify.sanitize(message);
    try {
      me.socket.send(JSON.stringify({ 'type': 'chat', 'msg': msg, 'username': me.User.username }));
      msg = '<b>me: </b>' + msg;
      me.appendChatMessage(msg);
    } catch (ex) {
      console.log('ERROR: Unable to sendChatMessage', ex);
    }
  },

  /**
    * @param {object} data Data received
    * @returns {void}
    */
  receiveChatMessage: function (data) {
    const me = AtlasMakerWidget;
    console.log(data);

    const theSource = me.Collab[data.uid].source;
    const theView = me.Collab[data.uid].view;
    const theSlice = me.Collab[data.uid].slice;
    const link = me.hostname + '/mri?url=' + theSource + '&view=' + theView + '&slice=' + theSlice;
    const theUsername = (data.username === 'Anonymous') ? data.uid : data.username;
    const msg = '<a href=\'' + link + '\'><b>' + theUsername + ':</b></a> ' + data.msg + '<br />';
    me.appendChatMessage(msg);
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
    if (me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({ type: 'paint', data: msg }));
    } catch (ex) {
      console.log('ERROR: Unable to sendPaintMessage', ex);
    }
  },

  sendVectorialAnnotationMessage: function (msg) {
    const me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({
        type: 'vectorial',
        data: msg
      }));
    } catch (ex) {
      console.log('ERROR: Unable to sendVectorialAnnotationMessage', ex);
    }
  },

  /**
   * @param {array} atlasData Atlas data
   * @returns {void}
   */
  sendAtlasDataMessage: function (atlasData) {
    const me = AtlasMakerWidget;
    me.socket.binaryType = 'arraybuffer';
    me.socket.send(pako.deflate(atlasData));
    me.socket.binaryType = 'blob';
  },

  /**
   * Receive paint events from other connected users
   * @param {object} data Paint message received
   * @returns {void}
   */
  receivePaintMessage: function (data) {
    const me = AtlasMakerWidget;
    const { uid: u, data: msg } = data; // user

    if (me.Collab[u]) { me.paintxy(u, msg.c, msg.x, msg.y, me.Collab[u]); }
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
    if (me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({ type: 'show', data: msg }));
    } catch (ex) {
      console.log('ERROR: Unable to sendShowMessage', ex);
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
    const { uid: u, data: msg } = data; // user

    if (me.Collab[u]) { me.showxy(u, msg.c, msg.x, msg.y, me.Collab[u]); }
  },

  /**
   * @param {object} data List of voxels to paint
   * @returns {void}
   */
  receivePaintVolumeMessage: function (data) {
    const me = AtlasMakerWidget;

    const voxels = data.data;
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
    ({ data: me.User.vectorial } = data);
    me.displayInformation();
  },

  /**
   * @returns {void}
   */
  sendUndoMessage: function () {
    const me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({ type: 'paint', data: { c: 'u' } }));
    } catch (ex) {
      console.log('ERROR: Unable to sendUndoMessage', ex);
    }
  },

  /**
   * @returns {void}
   */
  sendSaveMessage: function () {
    const me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({ type: 'save' }));
    } catch (ex) {
      console.log('ERROR: Unable to sendSaveMessage', ex);
    }
  },

  /**
   * @returns {void}
   */
  sendRequestMRIMessage: function () {
    const me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }

    try {
      me.socket.send(JSON.stringify({
        type: 'requestMRI',
        source: 'sendRequestMRIMessage'
      }));
    } catch (ex) {
      console.log('ERROR: Unable to sendRequestMRIMessage', ex);
    }
  },

  /**
   * @returns {void}
   */
  sendRequestSliceMessage: function () {
    const me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }
    if (me.flagLoadingImg.loading === true) { return; }
    try {
      me.socket.send(JSON.stringify({

        type: 'requestSlice',

        /*
                TEST
        */
        //type:"requestSlice2",

        view: me.User.view,
        slice: me.User.slice
      }));
      me.flagLoadingImg.loading = true;
      me.flagLoadingImg.view = me.User.view;
      me.flagLoadingImg.slice = me.User.slice;

    } catch (ex) {
      console.log('ERROR: Unable to sendRequestSliceMessage', ex);
    }
  },

  _metadataChangeSubscribers: [],

  /**
   * @param {object} data The metadata received
   * @returns {void}
   */
  receiveMetadata: function (data) {
    const me = AtlasMakerWidget;
    for (const subscriberCallback of me._metadataChangeSubscribers) {
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
   *    brain: string, a filename like "mri.nii.gz", same as the root filename (no longer used because uselessly redundant)
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
   * No reason to return a promise since the function does not do any asynchronous task
   */
  sendSaveMetadataMessage: function (info, method, patch) {
    const me = AtlasMakerWidget;

    return new Promise(function (resolve, reject) {
      if (me.flagConnected === 0) {
        console.log('WARNING: Not connected: will not save metadata');

        return reject(new Error('Not connected'));
      }

      try {
        const rnd = Math.random().toString(36)
          .slice(2);
        const met = method || 'append';
        if (method === 'patch') {
          me.socket.send(JSON.stringify({
            type: 'saveMetadata',
            metadata: info,
            method: met,
            patch: patch,
            rnd: rnd
          }));
        } else {
          me.socket.send(JSON.stringify({
            type: 'saveMetadata',
            metadata: info,
            method: met,
            rnd: rnd
          }));
        }
        if (me.debug > 1) {
          console.log(rnd);
          console.log(info);
        }
        resolve();

      } catch (ex) {
        console.log('ERROR: Unable to sendSaveMetadataMessage', ex);
        reject(ex);
      }
    });
  },

  /**
   * @param {object} data Message data
   * @returns {void}
   */
  // eslint-disable-next-line max-statements
  receiveDisconnectMessage: function (data) {
    const me = AtlasMakerWidget;
    const { uid } = data; // user
    let msg;
    if (me.Collab[uid]) {
      if (typeof me.Collab[uid].username === 'undefined' || me.Collab[uid].username === 'Anonymous') {
        msg = '<b>' + me.Collab[uid].uid + '</b> left<br />';
      } else {
        msg = '<b>' + me.Collab[uid].username + '</b> left<br />';
      }
    } else {
      msg = '<b>' + uid + '</b> left<br />';
    }
    delete me.Collab[uid];
    let v;
    let nusers = 1;
    for (v in me.Collab) {
      if ({}.hasOwnProperty.call(me.Collab, v)) {
        nusers += 1;
      }
    }
    me.setNotification('Chat (' + nusers + ' connected)');
    me.appendChatMessage(msg);
  },

  displayDialog: async ({ msg, modal, delay, doFadeOut }) => {

    /*
      Use like this:
      const date = new Date();
      const time = `${date.getHours()}:${('00' + date.getMinutes()).slice(-2)}`;
      AtlasMakerWidget._displayServerModal({
        type:"alert",
        msg:`<p>⚠️ Server is going to restart at ${time}`
      });
    */

    const me = AtlasMakerWidget;
    const el = document.createElement('div');
    el.style = `
      display: none;
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translate(-50%,0);
      background-color: #333;
      color: white;
      text-align: center;
      border: thin solid lightgrey;
      z-index: 20;
      line-height: 20px;
      padding: 20px;
      `;
    document.body.appendChild(el);
    await me.dialog({ el, message: msg, modal, delay, doFadeOut });
    document.body.removeChild(el);
  },

  /**
   * Receives notifications from the server
   * @param {object} data Message data
   * @returns {void}
   */
  receiveServerMessage: function (data) {
    const me = AtlasMakerWidget;
    const { msg, dialogType } = data;

    if (dialogType === 'modal') {
      me.displayDialog({
        msg: `<p>${msg}</p>`,
        modal: true,
        delay: 0,
        doFadeOut: 0
      });
    } else if (dialogType === 'info') {
      const prevMsg = document.querySelector('.tools .notifications').textContent;
      me.setNotification(msg);
      setTimeout(function () {
        me.setNotification(prevMsg);
      }, 2000);
    } else {
      me.displayDialog({
        msg: `<p>${msg}</p>`,
        modal: false,
        delay: 2000,
        doFadeOut: true
      });
    }
  },

  /**
   * Replays websocket traffic recorded at the served. Used for debugging
   * @param {array} recorded An array of websocket messages recorded in the server
   * @returns {void}
   */
  replayWSTraffic: function (recorded) {
    const me = AtlasMakerWidget;
    let i;
    for (i = 0; i < recorded.length; i++) {
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
    const me = AtlasMakerWidget;

    return fetch(me.hostname + '/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: me.User.username,
        key: key,
        value: value
      })
    }).then((res) => res.json());
  }
};
