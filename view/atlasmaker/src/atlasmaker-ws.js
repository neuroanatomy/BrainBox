/* eslint-disable max-lines */
/* global AtlasMakerWidget MozWebSocket */
/*! AtlasMaker: WebSockets */
import * as DOMPurify from 'dompurify';
import * as pako from 'pako';

const isUnknown = (value) => value === null || typeof value === 'undefined';

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
   * Update the "Chat (N connected)" status label, if the current toolbar has one.
   * Lighter toolbars (e.g. the read-only embed viewer) have no chat UI at all.
   * @param {string} text The text to display
   * @returns {void}
   */
  _setNotificationsText: function (text) {
    const el = document.getElementById('notifications');
    if (el) { el.textContent = text; }
  },

  /**
   * Append a line to the chat log, if the current toolbar has one: an
   * optional link, a name in bold, then a text. Names and messages come from
   * other users: they are set as text, never as HTML
   * @param {object} parts { name, text, href }: href, if set, wraps the name
   * @returns {void}
   */
  appendChatLine: function ({ name, text, href }) {
    const me = AtlasMakerWidget;
    const chatText = document.querySelector('#logChat .text');
    if (!chatText) { return; }
    chatText.appendChild(me._chatLine({ name, text, href }));
    chatText.scrollTop = chatText.scrollHeight;
  },

  /**
   * The nodes of a line of the chat log (see appendChatLine)
   * @param {object} parts { name, text, href }
   * @returns {object} A DocumentFragment
   */
  _chatLine: function ({ name, text, href }) {
    const line = document.createDocumentFragment();
    let nameHolder = line;
    if (href) {
      const a = document.createElement('a');
      a.href = href;
      line.appendChild(a);
      nameHolder = a;
    }
    if (!isUnknown(name)) {
      const b = document.createElement('b');
      b.textContent = String(name);
      nameHolder.appendChild(b);
    }
    if (!isUnknown(text)) {
      line.appendChild(document.createTextNode(String(text)));
    }
    line.appendChild(document.createElement('br'));

    return line;
  },

  /**
   * The name another user is shown under: their username, or their
   * connection's id if they are anonymous
   * @param {object} user The other user's data (me.Collab[uid]), if known
   * @param {string} uid The other user's connection id
   * @returns {string} The name
   */
  _collabName: function (user, uid) {
    if (!user || isUnknown(user.username) || user.username === 'Anonymous') {
      return uid;
    }

    return user.username;
  },

  /**
   * The link to what another user is looking at: the MRI page on this
   * BrainBox, with their source, view and slice
   * @param {object} user The other user's data (me.Collab[uid]), if known
   * @returns {string|null} The link, or null if there is none to give
   */
  _collabViewLink: function (user) {
    const me = AtlasMakerWidget;
    if (!user || typeof user.source !== 'string') { return null; }
    try {
      const base = new URL(me.hostname, window.location.href);
      if (base.protocol !== 'http:' && base.protocol !== 'https:') { return null; }
      const link = new URL('/mri', base);
      link.search = new URLSearchParams({ url: user.source, view: String(user.view), slice: String(user.slice) }).toString();

      return link.host === base.host ? link.href : null;
    } catch (err) {
      return null;
    }
  },

  /**
   * @returns {void}
   */
  initSocketConnection: function () {
    const me = AtlasMakerWidget;

    // eslint-disable-next-line max-statements
    return new Promise(function (resolve, reject) {
      // WS connection
      let host;
      if(me.secure) {
        host = 'wss://' + me.wshostname;
      } else {
        host = 'ws://' + me.wshostname;
      }
      if (me.embedTicket) {
        host += '?embedTicket=' + encodeURIComponent(me.embedTicket);
      }

      if (me.debug) { console.log('[initSocketConnection] host:', host); }
      if (me.progress) { me.progress.innerHTML = 'Connecting...'; }

      try {
        me.socket = me.createSocket(host);

        me.socket.onopen = function (msg) {
          if (me.debug) { console.log('[initSocketConnection] connection open', msg); }
          // me.progress is null when the page has no progress link
          if (me.progress) { me.progress.innerHTML = '<img src=\'' + me.downloadIcon + '\' style=\'vertical-align:middle\'/>MRI'; }
          me._setNotificationsText('Chat (1 connected)');
          me.flagConnected = 1;
          me.connectedAt = Date.now();
          resolve();
          // the metadata saved while disconnected: after what the code waiting
          // for the connection sends first (on a reconnection, the user data
          // and the atlas request)
          queueMicrotask(me._sendPendingMetadataSaves);
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
        me.receiveFunctions.writeRefused = me.receiveWriteRefusedMessage;
        me.receiveFunctions.readRefused = me.receiveReadRefusedMessage;
        me.receiveFunctions.sliceFailed = me.receiveSliceFailedMessage;

        me.receiveFunctions.requestSlice = function (data) { console.log('requestSlice', data); };
        me.receiveFunctions.requestSlice2 = function (data) { console.log('requestSlice2', data); };

        me.socket.onmessage = me.receiveSocketMessage;

        me.socket.onclose = function () {
          me.flagConnected = 0;
          // the answer to a request on its way cannot arrive any more
          me.flagLoadingImg.loading = false;

          me._scheduleReconnection();
        };

        window.onbeforeunload = function () {
          // me.socket.onclose = function () { }; // disable onclose handler first
          me.socket.close();
        };
      } catch (ex) {
        me._setNotificationsText('Chat (not connected - connection error)');
        reject(ex);
      }
    });
  },

  /**
   * The wait before the next reconnection (ms), as microdraw's: 1 s, 2 s,
   * 4 s ... up to 30 s; it starts again from 1 s only after a connection
   * that stayed open 10 s (see _scheduleReconnection), so a server that
   * accepts and drops connections at once is not retried quickly. Up to 1 s
   * more, at random, spreads the reconnections of the pages open when the
   * server restarts; never more than 30 s in all
   * @returns {number} The wait
   */
  _reconnectionWait: function () {
    const me = AtlasMakerWidget;
    const wait = Math.min(me.reconnectionTimeout + Math.floor(1000 * Math.random()), me.reconnectionMaxTimeout);
    me.reconnectionTimeout = Math.min(2 * me.reconnectionTimeout, me.reconnectionMaxTimeout);

    return wait;
  },

  /**
   * After the socket closed: count down the wait (_reconnectionWait) in the
   * notifications, then reconnect, send the user data and ask for the atlas
   * @returns {void}
   */
  _scheduleReconnection: function () {
    const me = AtlasMakerWidget;
    if (typeof me.connectedAt === 'number' && Date.now() - me.connectedAt >= me.stableConnectionTime) {
      me.reconnectionTimeout = me.reconnectionMinTimeout;
    }
    me.connectedAt = null;
    const wait = me._reconnectionWait();
    const deadline = Date.now() + wait;
    const countDown = () => {
      me._setNotificationsText('Disconnected. Try to reconnect in ' + Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) + ' s...');
    };
    if (me.timer) {
      clearInterval(me.timer);
    }
    countDown();
    me.timer = setInterval(countDown, 1000);
    setTimeout(function () {
      clearInterval(me.timer);
      me._setNotificationsText('Reconnecting...');
      me.socket = null;
      me.initSocketConnection()
        .then(function () {
          me.sendUserDataMessage('allUserData');
          if (me.User.atlasFilename) { me.sendUserDataMessage('sendAtlas'); }
          // The arrival of the atlas draws the slice. Without one nothing else asks
          // for it, and an embed's may not come: the server refuses sendAtlas until
          // it has read the new connection's ticket. After the user data, which the
          // server needs for the request
          if (!me.User.atlasFilename || me.embedTicket) { me.drawImages(); }
        })
        .catch(function () {
          // the socket could not be made: try again later
          me._scheduleReconnection();
        });
    }, wait);
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
    const receive = me.receiveFunctions[data.type];
    if (typeof receive === 'function') {
      receive(data);
    } else if (me.debug) {
      console.log('Ignoring message of unknown type', data.type);
    }
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

      if(me.debug>1) { console.log('type: '+ext); }

      switch(ext) {
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

        me.brainImg.img=null;
        me.drawImages();

        // compute total segmented volume
        const vol=me.computeSegmentedVolume();
        me.info.volume=parseInt(vol, 10)+' mm3';

        // setup download link
        const link = me.container.querySelector('span#download_atlas');
        if (link) {
          link.innerHTML = [
            '<a class=\'download\' href=\'' + me.User.dirname + me.User.atlasFilename + '\'>',
            '<img src=\'' + me.downloadIcon + '\' style=\'vertical-align:middle\'/>',
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
          const flagFirstImage = (me.brainImg.img === null);
          me.brainImg.img = img;
          me.brainImg.view = me.flagLoadingImg.view;
          me.brainImg.slice = me.flagLoadingImg.slice;

          me.drawImages();

          me.flagLoadingImg.loading = false;

          if (flagFirstImage || me.flagLoadingImg.view !== me.User.view || me.flagLoadingImg.slice !== me.User.slice) {
            me.sendRequestSliceMessage();
          }

          // a drawn slice is the first honest proof that the viewer works
          me.setViewerState({ state: 'ready' });
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
        me.appendChatLine({ name: me._collabName(data.user, data.uid), text: ' entered' });
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
        nusers+=1;
      }
    }
    me._setNotificationsText('Chat (' + nusers + ' connected)');
  },

  /**
    * @returns {void}
    */
  sendChatMessage: function () {
    const me = AtlasMakerWidget;
    if (me.flagConnected === 0) { return; }
    // sent as typed: every page shows it as text (the server says who sent it)
    const msg = document.getElementById('msg').value;
    try {
      me.socket.send(JSON.stringify({ 'type': 'chat', 'msg': msg }));
      me.appendChatLine({ name: 'me: ', text: msg });
      document.getElementById('msg').value = '';
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
    if (me.debug) { console.log(data); }

    const user = me.Collab[data.uid];
    const theUsername = (isUnknown(data.username) || data.username === 'Anonymous') ? data.uid : data.username;
    me.appendChatLine({ name: theUsername + ':', text: ' ' + data.msg, href: me._collabViewLink(user) });
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
      me.socket.send(JSON.stringify({type:'paint', data:msg}));
    } catch (ex) {
      console.log('ERROR: Unable to sendPaintMessage', ex);
    }
  },

  sendVectorialAnnotationMessage: function (msg) {
    const me = AtlasMakerWidget;
    if(me.flagConnected === 0) { return; }
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
    const {uid:u, data:msg}=data; // user

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
      me.socket.send(JSON.stringify({type:'show', data:msg}));
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
    const {uid:u, data:msg} = data; // user

    if(me.Collab[u]) { me.showxy(u, msg.c, msg.x, msg.y, me.Collab[u]); }
  },

  /**
   * @param {object} data List of voxels to paint
   * @returns {void}
   */
  receivePaintVolumeMessage: function (data) {
    const me = AtlasMakerWidget;

    const voxels=data.data;
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
      me.socket.send(JSON.stringify({type:'paint', data:{c:'u'}}));
    } catch (ex) {
      console.log('ERROR: Unable to sendUndoMessage', ex);
    }
  },

  /**
   * @returns {void}
   */
  sendSaveMessage: function () {
    const me = AtlasMakerWidget;
    if(me.flagConnected === 0) { return; }
    try {
      me.socket.send(JSON.stringify({type:'save'}));
    } catch (ex) {
      console.log('ERROR: Unable to sendSaveMessage', ex);
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
        type:'requestMRI',
        source:'sendRequestMRIMessage'
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
    if(me.flagConnected === 0) { return; }
    if(me.flagLoadingImg.loading === true) { return; }
    // Unknown until configureBrainImage (a redraw can come before it, e.g. when
    // the window is resized), whose redraw makes the request
    if(isUnknown(me.User.view) || isUnknown(me.User.slice)) { return; }
    try {
      me.socket.send(JSON.stringify({

        type:'requestSlice',

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
      console.log('ERROR: Unable to sendRequestSliceMessage', ex);
    }
  },

  /**
   * The server could not give the slice on its way. There is one request at a
   * time, so me.flagLoadingImg is that request: without an answer, no other
   * request would go out. It is asked again only for another slice than the
   * one that failed, which cannot go on without the user changing slice.
   * @returns {void}
   */
  receiveSliceFailedMessage: function () {
    const me = AtlasMakerWidget;
    const { loading, view, slice } = me.flagLoadingImg;
    // nothing on its way: the answer to a request for the previous brain
    if(loading !== true) { return; }
    me.flagLoadingImg.loading = false;

    // Object.is: a NaN slice is the same slice, not a new one to ask for
    if(!Object.is(view, me.User.view) || !Object.is(slice, me.User.slice)) {
      me.sendRequestSliceMessage();
    } else if(!me.brainImg.img) {
      me.setViewerState({ state: 'error' });
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
   * While the socket is closed (e.g. reconnecting), the save is held and sent
   * once it is open again, in order (see _sendPendingMetadataSaves)
   * @param {object} info Metadata object, as generated by brainbox
   * @param {string} method Method "patch" or "append"
   * @param {object} patch Path object used in case method is "patch"
   * @returns {Promise<void>} Resolves once the message is handed to the socket
   * (at once, or after reconnecting); rejects only if the document cannot be
   * serialised
   */
  sendSaveMetadataMessage: function (info, method, patch) {
    const me = AtlasMakerWidget;
    const msg = {
      type: 'saveMetadata',
      metadata: info,
      method: method || 'append',
      rnd: Math.random().toString(36)
        .slice(2)
    };
    if (method === 'patch') {
      msg.patch = patch;
    }
    if (me.debug > 1) {
      console.log(msg.rnd);
      console.log(info);
    }
    let text;
    try {
      // the message as it is now: the document may change before it is sent
      text = JSON.stringify(msg);
    } catch (ex) {
      console.log('ERROR: Unable to sendSaveMetadataMessage', ex);

      return Promise.reject(ex);
    }
    // after the saves held before it, if any
    const held = me._holdMetadataSave({ info, method: msg.method, text });
    me._sendPendingMetadataSaves();

    return held;
  },

  /**
   * @returns {boolean} Whether messages can be sent now
   */
  _isSocketOpen: function () {
    const me = AtlasMakerWidget;

    return me.flagConnected !== 0 && Boolean(me.socket) &&
      (typeof me.socket.readyState === 'undefined' || me.socket.readyState === 1); // 1: WebSocket.OPEN
  },

  _pendingMetadataSaves: [], // saveMetadata messages waiting for the socket: { info, method, text, resolves }
  metadataPendingMessage: 'Not connected: your changes will be saved when the connection is back',

  /**
   * Queue a saveMetadata message, sent by _sendPendingMetadataSaves at once
   * or once the socket is open again. An 'append'
   * sends the whole document, so a later 'append' of the same document
   * replaces the one waiting (and is sent in its place, last); patches are
   * all kept, in order
   * @param {object} save { info, method, text }
   * @returns {Promise<void>} Resolves once the message is sent
   */
  _holdMetadataSave: function ({ info, method, text }) {
    const me = AtlasMakerWidget;

    return new Promise((resolve) => {
      let resolves = [resolve];
      if (method === 'append') {
        const i = me._pendingMetadataSaves.findIndex((save) => save.method === 'append' && save.info === info);
        if (i >= 0) {
          resolves = me._pendingMetadataSaves[i].resolves.concat(resolves);
          me._pendingMetadataSaves.splice(i, 1);
        }
      }
      me._pendingMetadataSaves.push({ info, method, text, resolves });
    });
  },

  /**
   * Send, in order, the saveMetadata messages queued: at once if the socket
   * is open, else once it is open again, after the messages that reopen the
   * session (see initSocketConnection). Shows the notice while some wait
   * @returns {void}
   */
  _sendPendingMetadataSaves: function () {
    const me = AtlasMakerWidget;
    while (me._pendingMetadataSaves.length > 0 && me._isSocketOpen()) {
      const [save] = me._pendingMetadataSaves;
      try {
        me.socket.send(save.text);
      } catch (ex) {
        console.log('ERROR: Unable to send the metadata, will send it when connected', ex);
        break;
      }
      me._pendingMetadataSaves.shift();
      save.resolves.forEach((resolve) => resolve());
    }
    const pending = me._pendingMetadataSaves.length > 0;
    if (pending && !document.getElementById('metadataPending')) {
      console.warn('Not connected: the metadata will be saved when the connection is back');
    }
    me._showMetadataPending(pending);
  },

  /**
   * Warn before leaving the page while metadata saves are held
   * @param {Event} e The beforeunload event
   * @returns {void}
   */
  _warnMetadataPending: function (e) {
    e.preventDefault();
    e.returnValue = ''; // older browsers need it to show the warning
  },

  /**
   * Show, or remove, the notice saying that changes wait for the connection,
   * and the warning on leaving the page
   * @param {boolean} pending Whether saves are held
   * @returns {void}
   */
  _showMetadataPending: function (pending) {
    const me = AtlasMakerWidget;
    let el = document.getElementById('metadataPending');
    if (!pending) {
      if (el) { el.remove(); }
      window.removeEventListener('beforeunload', me._warnMetadataPending);

      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'metadataPending';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translate(-50%,0);' +
        'background-color:#333;color:white;border:thin solid lightgrey;padding:6px 12px;z-index:20;font-size:small';
      el.textContent = me.metadataPendingMessage;
      document.body.appendChild(el);
    }
    window.addEventListener('beforeunload', me._warnMetadataPending); // added once: same listener
  },

  /**
   * @param {object} data Message data
   * @returns {void}
   */
  // eslint-disable-next-line max-statements
  receiveDisconnectMessage: function (data) {
    const me = AtlasMakerWidget;
    const {uid} = data; // user
    const name = me._collabName(me.Collab[uid], uid);
    delete me.Collab[uid];
    let v;
    let nusers=1;
    for(v in me.Collab) {
      if({}.hasOwnProperty.call(me.Collab, v)) {
        nusers+=1;
      }
    }
    me._setNotificationsText('Chat ('+nusers+' connected)');
    me.appendChatLine({ name, text: ' left' });
  },

  /**
   * Show a dialog
   * @param {object} params Parameters
   * @param {string} [params.msg] The message, as HTML
   * @param {string} [params.text] The message, as text (shown in a paragraph, never as HTML): used instead of msg if given
   * @param {boolean} params.modal Whether the dialog waits for its OK button
   * @param {number} params.delay How long it is shown (ms), if not modal
   * @param {boolean} params.doFadeOut Whether it fades out
   * @returns {Promise<void>} Resolved once closed
   */
  displayDialog: async ({msg, text, modal, delay, doFadeOut}) => {

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
    let message = msg;
    if (typeof text !== 'undefined') {
      message = document.createElement('p');
      message.textContent = String(text);
    }
    await me.dialog({ el, message, modal, delay, doFadeOut });
    document.body.removeChild(el);
  },

  /**
   * Receives notifications from the server (an admin's notice, 'Atlas
   * saved'...): shown as text, never as HTML
   * @param {object} data Message data
   * @returns {void}
   */
  receiveServerMessage: function (data) {
    const me = AtlasMakerWidget;
    const {msg, dialogType} = data;

    if (dialogType === 'modal') {
      me.displayDialog({
        text: msg,
        modal: true,
        delay: 0,
        doFadeOut: 0
      });
    } else if (dialogType === 'info') {
      const notifications = document.getElementById('notifications');
      if (notifications) {
        const prevMsg = notifications.textContent;
        notifications.textContent = msg;
        setTimeout(function() {
          notifications.textContent = prevMsg;
        }, 2000);
      }
    } else {
      me.displayDialog({
        text: msg,
        modal: false,
        delay: 2000,
        doFadeOut: true
      });
    }
  },

  writeRefusedMessage: 'You can\'t edit this layer: your changes are not saved. Reload the page or log in again.',
  metadataRefusedMessage: 'Some of your changes to this brain\'s information were not saved',

  /**
   * The server refused a write (paint, save...): what this page shows is not
   * what the others see and it will not be saved. Stop editing, and say so
   * until the page is reloaded. The strokes already drawn stay on screen
   * (reloading the page shows the saved layer)
   * @param {object} data { write, atlas, reason }: atlas is the layer's
   * dirname and filename, or null if the refusal is not about one layer
   * @returns {void}
   */
  receiveWriteRefusedMessage: function (data) {
    const me = AtlasMakerWidget;
    if (data.write === 'saveMetadata') {
      me._receiveMetadataRefused(data);

      return;
    }
    const shownAtlas = me.User ? me.User.dirname + me.User.atlasFilename : null;
    if (data.atlas && data.atlas !== shownAtlas) {
      // about a layer this page no longer shows
      return;
    }
    console.warn('The server refused a write (' + data.write + '): ' + data.reason);
    me.editMode = 0;
    me.writeRefused = { write: data.write, atlas: data.atlas, reason: data.reason };

    const text = me.writeRefusedMessage;
    me.appendChatLine({ name: text });
    if (!me._writeRefusedDialogShown) {
      me._writeRefusedDialogShown = true;
      me.displayDialog({ msg: '<p>' + DOMPurify.sanitize(text) + '</p>', modal: true, delay: 0, doFadeOut: false })
        .finally(() => { me._writeRefusedDialogShown = false; });
    }
  },

  readRefusedMessage: 'You can\'t see this layer',

  /**
   * The server did not send the layer asked for: the user may not see it (e.g.
   * they logged out, or their access changed, since the page was loaded). The
   * page shows the brain without the layer; say why, and stop editing
   * @param {object} data { atlas, reason }: atlas is the layer's dirname and filename
   * @returns {void}
   */
  receiveReadRefusedMessage: function (data) {
    const me = AtlasMakerWidget;
    const shownAtlas = me.User ? me.User.dirname + me.User.atlasFilename : null;
    if (data.atlas && data.atlas !== shownAtlas) {
      // about a layer this page no longer shows
      return;
    }
    console.warn('The server did not send the layer: ' + data.reason);
    me.editMode = 0;
    me.readRefused = { atlas: data.atlas, reason: data.reason };
    const text = me.readRefusedMessage + ': ' + data.reason + '. Reload the page or log in again.';
    me.appendChatLine({ name: text });
    me.displayDialog({ msg: '<p>' + DOMPurify.sanitize(text) + '</p>', modal: true, delay: 0, doFadeOut: false });
  },

  /**
   * The server did not save some changes to the MRI's information (its name,
   * a layer's settings, text annotations): say which, without stopping the
   * editing of the layer shown (its strokes are still saved)
   * @param {object} data { write: 'saveMetadata', atlas: null, reason }
   * @returns {void}
   */
  _receiveMetadataRefused: function (data) {
    const me = AtlasMakerWidget;
    console.warn('The server did not save some changes to the metadata: ' + data.reason);
    me.writeRefused = { write: data.write, atlas: data.atlas, reason: data.reason };
    const text = me.metadataRefusedMessage + ': ' + data.reason + '.';
    me.appendChatLine({ name: text });
    me.displayDialog({ msg: '<p>' + DOMPurify.sanitize(text) + '</p>', modal: false, delay: 5000, doFadeOut: true });
  },

  /**
   * Replays websocket traffic recorded at the served. Used for debugging
   * @param {array} recorded An array of websocket messages recorded in the server
   * @returns {void}
   */
  replayWSTraffic: function (recorded) {
    const me = AtlasMakerWidget;
    let i;
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
    const me = AtlasMakerWidget;

    return fetch(me.hostname + '/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: me.User.username,
        key: key,
        value: value
      })
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(response.statusText);
        }

        return response.text().then((text) => (text ? JSON.parse(text) : {}));
      });
  }
};
