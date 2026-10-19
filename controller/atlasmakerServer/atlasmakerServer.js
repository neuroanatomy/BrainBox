/* eslint-disable max-lines */
const fs = require('fs');
const os = require('os');
const url = require('url');
const zlib = require('zlib');
const tracer = require('tracer').console({ format: '[{{file}}:{{line}}]  {{message}}' });
const jpeg = require('jpeg-js'); // jpeg-js library: https://github.com/eugeneware/jpeg-js
const merge = require('merge');
const _ = require('lodash');
const path = require('path');
const keypress = require('keypress');

const amri = require('./atlasmaker-mri');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();
const EmbedAccessService = require('../../services/EmbedAccessService');
const { usernameFromCookie, atlasAccessLevel, atlasReadAccess, canEdit } = require('./atlas-write-access');
const { mergeMetadata, projectsForMetadata, savedView } = require('./metadata-save-access');

// WebSocket message types that write to an atlas/annotation - never applied on
// a connection tagged isEmbed, regardless of what the client claims about editMode.
const embedWriteBlockedTypes = ['paint', 'vectorial', 'save', 'saveMetadata', 'atlas'];

// WebSocket message types that write to the atlas the user has open: applied
// only if the user, as the HTTP session says, has 'edit' access to that atlas.
const atlasWriteTypes = ['paint', 'vectorial', 'save', 'atlas'];
// how long an access decision is used before it is checked again (access can change)
const writeAccessMaxAge = 10 * 1000;
// WebSocket message types relayed to the other users that carry the content of
// the sender's atlas: relayed only to users who may see that atlas
const atlasContentTypes = ['paint', 'vectorial', 'atlas'];
// what other users are not told about a user's state: the layer they have open
// (its file name is the only protection of the layer's file until /data is checked)
const privateUserFields = ['atlasFilename', 'iAtlas'];

// Get whitelist and blacklist
const useWhitelist = false;
const useBlacklist = true;
const whitelist = JSON.parse(fs.readFileSync(path.join(__dirname, 'whitelist.json')));
const blacklist = JSON.parse(fs.readFileSync(path.join(__dirname, 'blacklist.json')));

// var http = require('http');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;
let websocketserver;

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const { window } = (new JSDOM('', {
  features: {
    FetchExternalResources: false, // disables resource loading over HTTP / filesystem
    ProcessExternalResources: false // do not execute JS within script blocks
  }
}));
const DOMPurify = createDOMPurify(window);

const jsonpatch = require('fast-json-patch');

const bufferTag = function (str, sz) {
  const buf = Buffer.alloc(sz).fill(32);
  buf.write(str);

  return buf;
};

/**
 * Escape special regex characters for use inside a MongoDB $regex query.
 * @param {string} str - raw user input
 * @returns {string} escaped string safe for $regex
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The instance the notifier handlers (admin broadcast, save all atlases, users
// on an MRI) talk to: the one serving the WebSocket clients. Other instances,
// like the MRI controller's, have no connected users.
let atlasmakerServer;

const AtlasmakerServer = function (nativeDb) {
  const me = {
    debug: 0,
    dataDirectory: 'public',
    Atlases: [],
    Brains: [],
    US: [],
    uidcounter: 0,
    atlascounter: 0,
    backupInterval: 15 * 60 * 1000, // 15 minutes in milliseconds
    timeMarkInterval: 60 * 60 * 1000, // 60 minutes in milliseconds
    enterCommands: false,
    UndoStack: [],
    recordWS: false,
    recordedWSTraffic: [],
    colormap: [{ r: 0, g: 0, b: 0 }],
    // the app's session middleware, to know who opened a connection (set by app.js)
    sessionParser: null,
    // 'enforce': refuse writes without edit access; 'log': only log them
    writeAccessMode: process.env.WS_ACCESS_CHECK === 'log' ? 'log' : 'enforce',

    traceLog: function (f, l) {
      if (typeof l === 'undefined' || me.debug > l) {
        tracer.log(String(f.name) + ' ' + (f.caller ? (f.caller.name || 'annonymous') : 'root'));
      }
    },
    niiTag: bufferTag('nii', 8),
    // const mghTag = bufferTag("mgh", 8);
    jpgTag: bufferTag('jpg', 8),

    //========================================================================================
    // Admin
    //========================================================================================
    numberOfUsersConnectedToAtlas: function (dirname, atlasFilename) {
      let sum = 0;

      if (typeof dirname === 'undefined' || typeof atlasFilename === 'undefined') {
        return sum;
      }

      for (const i in me.US) {
        if ({}.hasOwnProperty.call(me.US, i)) {
          if (typeof me.US[i].User === 'undefined') {
            tracer.log(`WARNING: When counting the number of users connected to the atlas, user ${me.US[i].uid} was not defined`);
          } else if (typeof me.US[i].User.dirname === 'undefined') {
            tracer.log(`WARNING: For user uid ${i} dirname is unknown`);
          } else if (typeof me.US[i].User.atlasFilename === 'undefined') {
            tracer.log(`WARNING: For user uid ${i} atlasFilename is unknown`);
          } else if (me.US[i].User.dirname === dirname && me.US[i].User.atlasFilename === atlasFilename) {
            sum += 1;
          }
        }
      }

      return sum;
    },
    // eslint-disable-next-line max-statements
    numberOfUsersConnectedToMRI: function (mriPath) {
      let sum = 0;

      if (typeof mriPath === 'undefined') {
        return sum;
      }

      for (const i in me.US) {
        if ({}.hasOwnProperty.call(me.US, i)) {
          if (typeof me.US[i].User === 'undefined') {
            tracer.log(`WARNING: When counting the number of users connected to MRI, user ${me.US[i].uid} was not defined`);
            continue;
          }
          if (typeof me.US[i].User.dirname === 'undefined') {
            tracer.log(`WARNING: A user uid ${i} dirname is unknown`);
            continue;
          }
          if (typeof me.US[i].User.mri === 'undefined') {
            tracer.log(`WARNING: A user uid ${i} MRI is unknown`);
            continue;
          }
          if (me.US[i].User.dirname + me.US[i].User.mri === mriPath) {
            sum += 1;
          }
        }
      }

      return sum;
    },
    displayAtlases: function () {
      tracer.log('\n' + me.Atlases.filter(function (o) { return typeof o !== 'undefined'; }).length + ' Atlases:');
      for (const i in me.Atlases) {
        if ({}.hasOwnProperty.call(me.Atlases, i)) {
          const sum = me.numberOfUsersConnectedToAtlas(me.Atlases[i].dirname, me.Atlases[i].filename);
          tracer.log('Atlases[' + i + '] path:' + me.Atlases[i].dirname + me.Atlases[i].filename + ', ' + sum + ' users connected');
        }
      }
      for (const i in me.Atlases) {
        if ({}.hasOwnProperty.call(me.Atlases, i)) {
          tracer.log('atlas', i, me.Atlases[i]);
        }
      }
    },
    displayBrains: function () {
      tracer.log('\n' + me.Brains.filter(function (o) { return typeof o !== 'undefined'; }).length + ' Brains:');
      for (const i in me.Brains) {
        if ({}.hasOwnProperty.call(me.Brains, i)) {
          const sum = me.numberOfUsersConnectedToMRI(me.Brains[i].path);
          tracer.log(`Brains[${i}].path=${me.Brains[i].path}, ${sum} users connected`);
        }
      }
      for (const i in me.Brains) {
        if ({}.hasOwnProperty.call(me.Brains, i)) {
          tracer.log(`
Brains[${i}]:
           path: ${me.Brains[i].path}
       data.dim: ${me.Brains[i].data.dim}
    data.pixdim: ${me.Brains[i].data.pixdim}
data.vox_offset: ${me.Brains[i].data.vox_offset}
       data.dir: ${me.Brains[i].data.dir}
       data.ori: ${me.Brains[i].data.ori}
       data.s2v: ${me.Brains[i].data.s2v}
       data.v2w: ${me.Brains[i].data.v2w}
      data.wori: ${me.Brains[i].data.wori}
  data.datatype: ${me.Brains[i].data.datatype}
       data.sum: ${me.Brains[i].data.sum}
`);
        }
      }
    },
    displayUsers: function () {
      tracer.log('\n' + me.US.filter(function (o) { return typeof o !== 'undefined'; }).length + ' User Sockets:');
      for (const i in me.US) {
        if ({}.hasOwnProperty.call(me.US, i)) {
          tracer.log('US[' + i + '].uid=', me.US[i].uid);
          tracer.log('US[' + i + ']=', me.US[i].User);
        }
      }
    },
    toggleWebsocketRecording: function () {
      me.recordWS = !me.recordWS;
      if (me.recordWS) {
        tracer.log('recording WebSocket traffic');
      } else {
        tracer.log(JSON.stringify(me.recordedWSTraffic));
        tracer.log('finished recording WebSocket traffic');
        me.recordedWSTraffic = [];
      }
    },
    saveAllAtlases: async () => {
      for (const iAtlas in me.Atlases) {
        if ({}.hasOwnProperty.call(me.Atlases, iAtlas)) {
          console.log(`me.saveAtlasAtIndex(${iAtlas})`);
          try {
            // eslint-disable-next-line no-await-in-loop
            await me.saveAtlasAtIndex(iAtlas);
          } catch (err) {
            tracer.log(`ERROR: Can't save atlas ${iAtlas}`, err);
          }
        }
      }
    },
    // Returns the number of users the message was sent to
    broadcastServerMessage: ({ msg, dialogType }) => {
      console.log(`Ready to broadcast [${msg}]`);

      return me.broadcastMessage({
        type: 'serverMessage',
        dialogType: dialogType,
        msg
      });
    },

    //========================================================================================
    // Web socket
    //========================================================================================
    getUserFromSocket: function (socket) {
      for (const key in me.US) {
        if ({}.hasOwnProperty.call(me.US, key)) {
          const user = me.US[key];
          if (typeof user === 'undefined') {
            console.log('WARNING: trying to get socket of undefined user. Deleting it.');
            delete me.US[key];
            continue;
          }
          if (socket === user.socket) {
            return user;
          }
        }
      }

      return -1;
    },
    _isSendAtlasOutOfEmbedScope: function (sourceUS, User) {
      if (!sourceUS.isEmbed) {
        return false;
      }

      return !sourceUS.embedScope || sourceUS.embedScope.dirname !== User.dirname;
    },
    getUserFromUserId: function (uid) {
      for (const key in me.US) {
        if ({}.hasOwnProperty.call(me.US, key)) {
          const user = me.US[key];
          if (typeof user === 'undefined') {
            console.log('WARNING: trying to get uid of undefined user. Deleting it.');
            delete me.US[key];
            continue;
          }
          if (uid === user.uid) {
            return user;
          }
        }
      }

      return null;
    },

    /**
     * The connection that sent a message, if it has already sent its User
     * structure. Messages that need it are ignored otherwise.
     * @param {string} uid Id of the connection
     * @param {string} messageType Type of the message, for the log
     * @returns {object|null} The connection, or null
     */
    _getUserWithUserData: function (uid, messageType) {
      const sourceUS = me.getUserFromUserId(uid);
      if (!sourceUS || typeof sourceUS.User === 'undefined') {
        tracer.log(`WARNING: Ignoring '${messageType}' message from ${uid}: no User structure yet`);

        return null;
      }

      return sourceUS;
    },

    /*
            getUserIdFromSocket: function (socket) {
                for(const i in me.US) {
                    if({}.hasOwnProperty.call(me.US, i)) {
                        if(socket === me.US[i].socket)
                            return me.US[i].uid;
                    }
                }

                return null;
            },
        */
    removeUser: function (socket) {
      for (const i in me.US) {
        if ({}.hasOwnProperty.call(me.US, i)) {
          if (socket === me.US[i].socket) {
            delete me.US[i];
            break;
          }
        }
      }
    },
    indexOfAtlasAtPath: function (dirname, atlasFilename) {
      for (const key in me.Atlases) {
        if ({}.hasOwnProperty.call(me.Atlases, key)) {
          if (me.Atlases[key].dirname === dirname && me.Atlases[key].filename === atlasFilename) {
            return key;
          }
        }
      }
    },
    removeAtlasAtIndex: function (iAtlas) {
      console.log(`INFO: Removing atlas ${me.Atlases[iAtlas].filename}`);
      clearInterval(me.Atlases[iAtlas].timer);
      delete me.Atlases[iAtlas];
    },
    unloadMRI: function (mriPath) {
      for (let i = 0; i < me.Brains.length; i++) {
        if (me.Brains[i].path === mriPath) {
          me.Brains.splice(i, 1);
          tracer.log('Free memory', os.freemem());
          break;
        }
      }
    },

    /**
     * Unloading the atlas involves saving its file and removing it
     * from the Atlases array.
     * @param {string} dirname Local directory where the atlas file is saved
     * @param {string} atlasFilename Name of the atlas file
     * @returns {void}
     */
    unloadAtlas: async function (dirname, atlasFilename) {
      const iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
      if (typeof iAtlas === 'undefined') {
        return;
      }

      try {
        await me.saveAtlasAtIndex(iAtlas);
      } catch (err) {
        throw new Error('Saving atlas failed', { cause: err });
      }

      me.removeAtlasAtIndex(iAtlas);
      tracer.log('Atlas saved, unloading it. Free memory', os.freemem());
    },

    /**
     * A .nii.gz or .mgz file is saved at the position indicated in the mri structure
     * @function saveAtlasAtIndex
     * @param {string} iAtlas index of the atlas in the Atlases to save
     * @returns {promise} success message
     */
    saveAtlasAtIndex: async function (iAtlas) {
      const atlas = me.Atlases[iAtlas];
      try {
        await me._saveAtlasVoxelData(atlas);
      } catch (err) {
        throw new Error('Can\'t save atlas voxel data', { cause: err });
      }
      try {
        await me._saveAtlasVectorialData(atlas);
      } catch (err) {
        throw new Error('Can\'t save atlas vectorial data', { cause: err });
      }
    },

    // eslint-disable-next-line max-statements
    _saveAtlasVectorialData: async function (atlas) {
      if (typeof atlas === 'undefined'
        || typeof atlas.vectorial === 'undefined') {

        throw new Error('No vectorial atlas to save');
      }
      const { vectorial } = atlas;

      // eslint-disable-next-line max-statements
      await lock.acquire('mri', async function () {

        // check if atlas has changed since the last time and
        // if it hasn't return
        // if the atlas is not present, it may have been deleted by the user.
        // remove it from the Atlases array and return
        let mri;
        try {
          mri = await nativeDb.collection('mri')
            .findOne({ source: atlas.source, backup: { $exists: 0 } }, { projection: { _id: 0 } });
        } catch (err) {
          throw new Error('Can\'t find entry for atlas voxel data in DB', { cause: err });
        }

        if (mri === null) {
          tracer.log(`WARNING: There's not DB entry for MRI with source ${atlas.source}`);

          return;
        }

        let index = -1;
        for (let i = 0; i < mri.mri.atlas.length; i++) {
          if (mri.mri.atlas[i].filename === atlas.filename) {
            index = i;
            break;
          }
        }

        if (index === -1) {
          // atlas was removed from MRI object, return
          // const iAtlas = me.indexOfAtlasAtPath(atlas.dirname, atlas.filename);
          // me.removeAtlasAtIndex(iAtlas);

          return;
        }

        if (typeof mri.mri.atlas[index].vectorial !== 'undefined') {
          const patch = jsonpatch.compare(mri.mri.atlas[index].vectorial, vectorial);
          if (patch.length === 0) {
            console.log('INFO: No vectorial atlas change, no save');

            return;
          }
        }

        // if has changed: update it and save to DB
        mri.mri.atlas[index].vectorial = vectorial;
        try {
          await nativeDb.collection('mri').updateMany({ source: atlas.source }, { $set: { backup: true } });
          await nativeDb.collection('mri').insertOne(mri);
        } catch (err) {
          throw new Error('Can\'t log update and save to DB');
        }
      });
    },

    /**
     * @function _saveAtlasVoxelData
     * @param {object} atlas An mri object structure
     * @returns {promise} success message
     */
    // eslint-disable-next-line max-statements
    _saveAtlasVoxelData: async function (atlas) {
      if (typeof atlas === 'undefined'
        || typeof atlas.dim === 'undefined') {

        throw new Error('No voxel atlas to save');
      }

      if (typeof atlas.data === 'undefined') {
        throw new Error('atlas entry in Atlas array has no voxel data');
      }

      // check if atlas has changed since the last time and
      // if it has not, return.
      let sum = 0;
      for (let i = 0; i < atlas.dim[0] * atlas.dim[1] * atlas.dim[2]; i += 1) {
        sum += atlas.data[i];
      }
      if (sum === atlas.sum) {
        console.log('INFO: No voxel atlas change, no save');

        return;
      }

      // atlas changed: save a backup copy.
      atlas.sum = sum;
      const { hdrSz } = atlas;
      const dataSz = atlas.data.length;
      let ftrSz;
      if (atlas.ftr) {
        ftrSz = atlas.ftr.length;
      } else {
        ftrSz = 0;
      }
      const mri = Buffer.alloc(atlas.dim[0] * atlas.dim[1] * atlas.dim[2] + hdrSz + ftrSz);
      atlas.hdr.copy(mri);
      atlas.data.copy(mri, hdrSz);
      if (ftrSz) {
        atlas.ftr.copy(mri, hdrSz + dataSz);
      }

      // compress it
      let mrigz;
      try {
        mrigz = await new Promise(function (resolve, reject) {
          zlib.gzip(mri, function (err, result) {
            if (err) {
              return reject(err);
            }
            resolve(result);
          });
        });
      } catch (err) {
        throw new Error('Atlas compression failed');
      }

      const path1 = me.dataDirectory + atlas.dirname + atlas.filename;
      const ms = Number(new Date()); // timestamp

      // if there's a previous version, keep if for backup
      // eslint-disable-next-line no-sync
      if (fs.existsSync(path1)) {
        const path2 = me.dataDirectory + atlas.dirname + ms + '_' + atlas.filename;
        // eslint-disable-next-line no-sync
        fs.renameSync(path1, path2);
      }

      // save the new version
      await fs.promises.writeFile(path1, mrigz);

      // log the saving
      try {
        await nativeDb.collection('log').insertOne({
          key: 'saveAtlasBackup',
          value: {
            atlasDirectory: atlas.dirname,
            atlasFilename: atlas.filename,
            timestamp: ms
          },
          date: (new Date()).toJSON()
        });
      } catch (err) {
        throw new Error('Logging atlas backup in DB failed');
      }
    },

    // eslint-disable-next-line max-statements
    broadcastPaintVolumeMessage: function (msg, User) {
      try {
        let n = 0;
        const msg2 = JSON.stringify({ 'type': 'paintvol', 'data': msg });
        const atlas = me.Atlases[User.iAtlas];
        const target = atlas ? { dirname: atlas.dirname, filename: atlas.filename } : null;
        for (const i in me.US) {
          if ({}.hasOwnProperty.call(me.US, i)) {
            if (typeof me.US[i].User !== 'undefined' &&
              me.US[i].User.iAtlas !== User.iAtlas) {
              continue;
            }
            // the user who undid, and the others only if they may see the atlas
            if (me.US[i].uid !== User.uid && !(target && me._mayRelayAtlas(me.US[i], target))) {
              continue;
            }
            me.US[i].socket.send(msg2);
            n += 1;
          }
        }
        if (me.debug) {
          tracer.log(`paintVolume message broadcasted to ${n} users`);
        }

      } catch (ex) {
        tracer.log('WARNING: Unable to broadcastPaintVolumeMessage', ex);
      }
    },

    //========================================================================================
    // Black list
    //========================================================================================
    verifyClient: function (info) {
      let ip;

      if (info.req.connection.remoteAddress) {
        ip = info.req.connection.remoteAddress;
      } else if (info.req.socket._peername) {
        ip = info.req.socket._peername.address;
      } else {

        return true;
      }

      ip = ip.split(':').pop();

      if (useWhitelist && !whitelist[ip]) {
        tracer.log('REJECTING ip not in whitelist ', ip);

        return false;
      }

      if (useBlacklist && blacklist[ip]) {
        tracer.log('REJECTING ip in blacklist', ip);

        return false;
      }

      return true;
    },

    //========================================================================================
    // Undo
    //========================================================================================

    /**
     * @function pushUndoLayer
     * @param {object} User User object
     * @returns {void}
     * @todo
     * UndoStacks should be stored separately for each user, in that way
     * when a user leaves, its undo stack is disposed. With the current
     * implementation, we'll be storing undo stacks for long gone users...
     */
    pushUndoLayer: function (User) {
      const undoLayer = { User: User, actions: [] };
      me.UndoStack.push(undoLayer);

      if (me.debug) {
        tracer.log(`Number of layers: ${me.UndoStack.length}`);
      }

      return undoLayer;
    },
    getCurrentUndoLayer: function (User) {
      let undoLayer;
      let found = false;

      for (let i = me.UndoStack.length - 1; i >= 0; i -= 1) {
        undoLayer = me.UndoStack[i];
        if (typeof undoLayer === 'undefined') {
          break;
        }
        if (undoLayer.User.username === User.username &&
          undoLayer.User.atlasFilename === User.atlasFilename &&
          undoLayer.User.specimenName === User.specimenName) {
          found = true;
          break;
        }
      }
      if (!found) {
        // There was no undoLayer for this user. This may be the
        // first user's action. Create an appropriate undoLayer for it.
        tracer.log(`No previous undo layer for ${User.username}, ${User.atlasFilename}: Create and push one`);
        undoLayer = me.pushUndoLayer(User);
      }

      return undoLayer;
    },
    // eslint-disable-next-line max-statements
    undo: function (User) {
      let undoLayer;
      let found = false;

      // find latest undo layer for user
      for (let i = me.UndoStack.length - 1; i >= 0; i -= 1) {
        undoLayer = me.UndoStack[i];
        if (typeof undoLayer === 'undefined') {
          break;
        }
        if (undoLayer.User.username === User.username
          && undoLayer.User.atlasFilename === User.atlasFilename
          && undoLayer.User.specimenName === User.specimenName
          && Object.keys(undoLayer.actions).length > 0) {
          found = true;
          me.UndoStack.splice(i, 1); // remove layer from me.UndoStack
          if (me.debug) {
            tracer.log(`Found undo layer for ${User.username}, ${User.atlasFilename}, with ${Object.keys(undoLayer.actions).length} actions`);
          }
          break;
        }
      }
      if (!found) {
        // There was no undoLayer for this user.
        if (me.debug) {
          tracer.log(`No undo layer for user ${User.username}, ${User.atlasFilename}`);
        }

        return;
      }

      // undo latest actions
      /*
        undoLayer.actions is a sparse array, with many undefined values.
        Here I take each of the values in actions, and add them to arr.
        Each element of arr is an array of 2 elements, index and value.
      */
      const arr = [];
      const atlas = me.Atlases[User.iAtlas];
      const vol = atlas.data;
      let val;

      for (const j in undoLayer.actions) {
        if ({}.hasOwnProperty.call(undoLayer.actions, j)) {
          // eslint-disable-next-line radix
          const i = parseInt(j);
          val = undoLayer.actions[i];
          arr.push([i, val]);

          // The actual undo having place:
          vol[i] = val;

          if (me.debug >= 3) {
            // eslint-disable-next-line radix
            tracer.log(`Undo: ${i % User.dim[0]}, ${parseInt(i / User.dim[0]) % User.dim[1]}, ${parseInt(i / User.dim[0] / User.dim[1]) % User.dim[2]}`);
          }
        }
      }
      const msg = { data: arr };
      me.broadcastPaintVolumeMessage(msg, User);

      if (me.debug) {
        tracer.log(`${me.UndoStack.length} undo layers remaining`);
      }
    },

    //========================================================================================
    // Painting
    //========================================================================================
    _screen2index: function (s, mri) {
      const { s2v } = mri;
      const v = [s2v.X + s2v.dx * s[s2v.x], s2v.Y + s2v.dy * s[s2v.y], s2v.Z + s2v.dz * s[s2v.z]];
      const index = v[0] + v[1] * mri.dim[0] + v[2] * mri.dim[0] * mri.dim[1];

      return index;
    },
    paintVoxel: function (mx, my, mz, User, vol, val, undoLayer) {
      const { view } = User;
      let x, y, z;
      const { sdim } = User.s2v;

      switch (view) {
      case 'sag': x = mz; y = mx; z = sdim[2] - 1 - my; break; // sagital
      case 'cor': x = mx; y = mz; z = sdim[2] - 1 - my; break; // coronal
      case 'axi': x = mx; y = sdim[1] - 1 - my; z = mz; break; // axial
      }

      const s = [x, y, z];
      const i = me._screen2index(s, User);
      if (vol[i] !== val) {
        undoLayer.actions[i] = vol[i];
        vol[i] = val;
      }
    },
    // eslint-disable-next-line max-statements
    line: function (x, y, val, User, undoLayer) {
      // Bresenham's line algorithm adapted from
      // http://stackoverflow.com/questions/4672279/bresenham-algorithm-in-javascript

      const atlas = me.Atlases[User.iAtlas];
      const vol = atlas.data;
      let x1 = User.x0; // screen coords
      let y1 = User.y0; // screen coords
      const z = User.slice; // screen coords
      const { view } = User; // view: sag, cor or axi
      const { sdim } = User.s2v;
      const x2 = x;
      const y2 = y;
      let brainWidth;
      let brainHeight;

      // Define differences and error check
      const dx = Math.abs(x2 - x1);
      const dy = Math.abs(y2 - y1);
      const sx = (x1 < x2) ? 1 : -1;
      const sy = (y1 < y2) ? 1 : -1;
      let err = dx - dy;

      switch (view) {
      case 'sag': [brainWidth, brainHeight] = [sdim[1], sdim[2]]; break; // sagital
      case 'cor': [brainWidth, brainHeight] = [sdim[0], sdim[2]]; break; // coronal
      case 'axi': [brainWidth, brainHeight] = [sdim[0], sdim[1]]; break; // axial
      }

      for (let j = 0; j < Math.min(User.penSize, brainWidth - x1); j += 1) {
        for (let k = 0; k < Math.min(User.penSize, brainHeight - y1); k += 1) {
          me.paintVoxel(x1 + j, y1 + k, z, User, vol, val, undoLayer);
        }
      }

      while (!((x1 === x2) && (y1 === y2))) {
        const e2 = err << 1;
        if (e2 > -dy) {
          err -= dy;
          x1 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y1 += sy;
        }
        for (let j = 0; j < Math.min(User.penSize, brainWidth - x1); j += 1) {
          for (let k = 0; k < Math.min(User.penSize, brainHeight - y1); k += 1) {
            me.paintVoxel(x1 + j, y1 + k, z, User, vol, val, undoLayer);
          }
        }
      }
    },
    _sliceXYZ2index: function (mx, my, mz, User) {
      const { view } = User;
      let x, y, z;
      const { sdim } = User.s2v;

      switch (view) {
      case 'sag': x = mz; y = mx; z = sdim[2] - 1 - my; break; // sagital
      case 'cor': x = mx; y = mz; z = sdim[2] - 1 - my; break; // coronal
      case 'axi': x = mx; y = sdim[1] - 1 - my; z = mz; break; // axial
      }

      return me._screen2index([x, y, z], User);
    },
    // eslint-disable-next-line max-statements
    fill: function (x, y, z, val, User, undoLayer) {
      const { view } = User;
      const vol = me.Atlases[User.iAtlas].data;
      let brainWidth;
      let brainHeight;
      const { sdim } = User.s2v;
      switch (view) {
      case 'sag': [brainWidth, brainHeight] = [sdim[1], sdim[2]]; break; // sagital
      case 'cor': [brainWidth, brainHeight] = [sdim[0], sdim[2]]; break; // coronal
      case 'axi': [brainWidth, brainHeight] = [sdim[0], sdim[1]]; break; // axial
      }

      const Q = [];
      let left, right;
      let n;
      let max = 0;
      const bval = vol[me._sliceXYZ2index(x, y, z, User)]; // background-value: value of the voxel where the click occurred

      if (bval === val) { // nothing to do

        return;
      }

      Q.push({ x: x, y: y });
      while (Q.length > 0) {
        if (Q.length > max) {
          max = Q.length;
        }
        n = Q.shift();
        if (vol[me._sliceXYZ2index(n.x, n.y, z, User)] !== bval) {
          continue;
        }
        left = n.x;
        right = n.x;
        ({ y } = n);
        while (left - 1 >= 0 && vol[me._sliceXYZ2index(left - 1, y, z, User)] === bval) {
          left -= 1;
        }
        while (right + 1 < brainWidth && vol[me._sliceXYZ2index(right + 1, y, z, User)] === bval) {
          right += 1;
        }
        for (x = left; x <= right; x += 1) {
          me.paintVoxel(x, y, z, User, vol, val, undoLayer);
          if (y - 1 >= 0 && vol[me._sliceXYZ2index(x, y - 1, z, User)] === bval) {
            Q.push({ x: x, y: y - 1 });
          }
          if (y + 1 < brainHeight && vol[me._sliceXYZ2index(x, y + 1, z, User)] === bval) {
            Q.push({ x: x, y: y + 1 });
          }
        }
      }
      tracer.log(`Max array size for fill: ${max}`);
    },

    /**
     *
     * @param {object} data Vectorial annotations
     * @param {object} User User object
     * @returns {void}
     */
    updateVectorialAnnotations: function (data, User) {
      const atlas = me.Atlases[User.iAtlas];
      if (typeof atlas === 'undefined') {
        tracer.log('ERROR: No atlas to add vectorial annotations to');

        return;
      }
      atlas.vectorial = data;
    },

    /*
      From 'User' we know slice, atlas, vol, view, dim.
      [issue: undoLayer also has a User field. Maybe only undoLayer should be kept?]
    */
    paintxy: function (u, c, x, y, User, undoLayer) {
      const atlas = me.Atlases[User.iAtlas];
      if (typeof atlas?.data === 'undefined') {
        tracer.log('ERROR: No atlas to draw into');

        return;
      }

      const coord = { 'x': x, 'y': y, 'z': User.slice };
      if (User.x0 < 0) {
        User.x0 = coord.x;
        User.y0 = coord.y;
      }

      switch (c) {
      case 'me':
      case 'mf':
        User.x0 = coord.x;
        User.y0 = coord.y;
        break;
      case 'le': // Line, erasing
        me.line(coord.x, coord.y, 0, User, undoLayer);
        User.x0 = coord.x;
        User.y0 = coord.y;
        break;
      case 'lf': // Line, painting
        me.line(coord.x, coord.y, User.penValue, User, undoLayer);
        User.x0 = coord.x;
        User.y0 = coord.y;
        break;
      case 'e': // Fill, erasing
        me.fill(coord.x, coord.y, coord.z, 0, User, undoLayer);
        User.x0 -= 1;
        break;
      case 'f': // Fill, painting
        me.fill(coord.x, coord.y, coord.z, User.penValue, User, undoLayer);
        User.x0 -= 1;
        break;
      case 'mu': // Mouse up (touch ended)
        me.pushUndoLayer(User);
        User.x0 -= 1;
        break;
      case 'u':
        me.undo(User);
        User.x0 -= 1;
        break;
      }
    },

    //========================================================================================
    // DB querying
    //========================================================================================
    queryUserName: function (data) {
      return new Promise(function (resolve, reject) {
        if (data.metadata && data.metadata.nickname) {
          nativeDb.collection('user')
            .find(
              { 'nickname': { '$regex': escapeRegex(data.metadata.nickname) } },
              { projection: { _id: 0, nickname: 1, name: 1 }, limit: 10 })
            .toArray()
            .then(function (obj) {
              resolve(obj);
            }
            );
        } else if (data.metadata && data.metadata.name) {
          nativeDb.collection('user')
            .find(
              { 'name': { '$regex': escapeRegex(data.metadata.name) } },
              { projection: { _id: 0, nickname: 1, name: 1 }, limit: 10 })
            .toArray()
            .then(function (obj) {
              resolve(obj);
            });
        } else {
          reject(new Error('Can\'t find user'));
        }
      });
    },
    queryProjectName: function (data) {
      return new Promise(function (resolve, reject) {
        if (data.metadata && data.metadata.name) {
          nativeDb.collection('project')
            .findOne({
              shortname: data.metadata.name,
              backup: { $exists: false }
            }, {
              projection: { name: 1, shortname: 1 }
            })
            .then(function (obj) {
              resolve(obj);
            });
        } else {
          reject(new Error('Bad metadata'));
        }
      });
    },
    querySimilarProjectNames: function (data) {
      return new Promise(function (resolve, reject) {
        if (data.metadata && data.metadata.projectName) {
          nativeDb.collection('project')
            .find({
              shortname: { $regex: escapeRegex(data.metadata.projectName) },
              backup: { $exists: false }
            }, {
              projection: { name: 1, shortname: 1 },
              limit: 10
            })
            .toArray()
            .then(function (obj) {
              resolve(obj);
            });
        } else {
          reject(new Error('can\'t find similar project names'));
        }
      });
    },

    /*
      getBrainAtPath
      input: A client-side path identifying the requested brain
      process: a brain is obtained, and added to the me.Brains[] array if it
              wasn't already loaded.
      output: a brain (mri structure)
    */
    getBrainAtPath: async function (brainPath) {
      for (const brain of me.Brains) {
        if (brain.path === brainPath) {
          if (me.debug > 1) {
            tracer.log('brain already loaded');
          }

          return brain.data;
        }
      }
      try {
        const mri = await amri.loadMRI(path.join(me.dataDirectory, brainPath));
        const brain = { path: brainPath, data: mri };
        me.Brains.push(brain);

        return mri; // callback: sendSliceToUser
      } catch (err) {
        tracer.log('ERROR: getBrainAtPath cannot load brain. Corrupted file?', err);
        throw err;
      }
    },

    //========================================================================================
    // Volume slice server
    //========================================================================================
    // eslint-disable-next-line max-statements
    drawSlice: function (brain, view, slice) {
      let x, y;
      let i, j;
      let brainWidth;
      let brainHeight; //, brainD;
      let ya, yc, ys;
      let val;
      let s;
      const { s2v } = brain;

      switch (view) {
      case 'sag': [brainWidth, brainHeight] = [s2v.sdim[1], s2v.sdim[2]]; break; //brainD = s2v.sdim[0]; break; // sagital
      case 'cor': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[2]]; break; //brainD = s2v.sdim[1]; break; // coronal
      case 'axi': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[1]]; break; //brainD = s2v.sdim[2]; break; // axial
      }

      const frameData = Buffer.alloc(brainWidth * brainHeight * 4);

      j = 0;
      switch (view) {
      case 'sag': ys = slice; break;
      case 'cor': yc = slice; break;
      case 'axi': ya = slice; break;
      }

      for (y = 0; y < brainHeight; y += 1) {
        for (x = 0; x < brainWidth; x += 1) {
          switch (view) {
          case 'sag': s = [ys, x, s2v.sdim[2] - 1 - y]; break;
          case 'cor': s = [x, yc, s2v.sdim[2] - 1 - y]; break;
          case 'axi': s = [x, s2v.sdim[1] - 1 - y, ya]; break;
          }
          i = me._screen2index(s, brain);

          val = 255 * (brain.data[i] - brain.min) / (brain.max - brain.min);
          frameData[4 * j + 0] = val; // red
          frameData[4 * j + 1] = val; // green
          frameData[4 * j + 2] = val; // blue
          frameData[4 * j + 3] = 0xFF; // alpha - ignored in JPEGs
          j += 1;
        }
      }
      const rawImageData = {
        data: frameData,
        width: brainWidth,
        height: brainHeight
      };

      return jpeg.encode(rawImageData, 99);
    },
    // eslint-disable-next-line max-statements
    drawSlice2: function (brain, atlas, view, slice) {
      let x, y;
      let i, j;
      let brainWidth;
      let brainHeight; //, brainD;
      let ys;
      let ya;
      let yc;
      let val;
      let rgb;
      let s;
      const { s2v } = brain;
      const t = 0.5;

      switch (view) {
      case 'sag': [brainWidth, brainHeight] = [s2v.sdim[1], s2v.sdim[2]]; break; //brainD = s2v.sdim[0]; break; // sagital
      case 'cor': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[2]]; break; //brainD = s2v.sdim[1]; break; // coronal
      case 'axi': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[1]]; break; //brainD = s2v.sdim[2]; break; // axial
      }

      const frameData = Buffer.alloc(brainWidth * brainHeight * 4);

      j = 0;
      switch (view) {
      case 'sag': ys = slice; break;
      case 'cor': yc = slice; break;
      case 'axi': ya = slice; break;
      }

      for (y = 0; y < brainHeight; y += 1) {
        for (x = 0; x < brainWidth; x += 1) {
          switch (view) {
          case 'sag': s = [ys, x, s2v.sdim[2] - 1 - y]; break;
          case 'cor': s = [x, yc, s2v.sdim[2] - 1 - y]; break;
          case 'axi': s = [x, s2v.sdim[1] - 1 - y, ya]; break;
          }
          i = me._screen2index(s, brain);

          // brain data
          val = (brain.data[i] - brain.min) / (brain.max - brain.min);

          // atlas data
          if (atlas.data[i]) {
            rgb = me.colormap[atlas.data[i]];
            if (!rgb || !rgb.r) {
              frameData[4 * j + 0] = 0;
              frameData[4 * j + 0] = 255;
              frameData[4 * j + 0] = 0;
            } else {
              frameData[4 * j + 0] = t * rgb.r + (1 - t) * rgb.r * val; // red
              frameData[4 * j + 1] = t * rgb.g + (1 - t) * rgb.g * val; // green
              frameData[4 * j + 2] = t * rgb.b + (1 - t) * rgb.b * val; // blue
            }
          } else {
            frameData[4 * j + 0] = 255 * val; // red
            frameData[4 * j + 1] = 255 * val; // green
            frameData[4 * j + 2] = 255 * val; // blue
          }
          frameData[4 * j + 3] = 0xFF; // alpha - ignored in JPEGs
          j += 1;
        }
      }

      const rawImageData = {
        data: frameData,
        width: brainWidth,
        height: brainHeight
      };

      return jpeg.encode(rawImageData, 99);
    },
    receivePaintMessage: function (data) {
      const msg = data.data;
      const sourceUS = me._getUserWithUserData(data.uid, 'paint'); // user data
      if (!sourceUS) {
        return;
      }
      const { c, x, y } = msg; // command, x coordinate, y coordinate
      const undoLayer = me.getCurrentUndoLayer(sourceUS.User); // current undoLayer for user

      me.paintxy(sourceUS.uid, c, x, y, sourceUS.User, undoLayer);
    },
    receiveVectorialAnnotationMessage: function (message) {
      const { data } = message;
      const sourceUS = me._getUserWithUserData(message.uid, 'vectorial'); // source user data
      if (!sourceUS) {
        return;
      }
      me.updateVectorialAnnotations(data, sourceUS.User);
    },
    sendSliceToUser: function (brain, view, slice, userSocket) {
      try {
        const jpegImageData = me.drawSlice(brain, view, slice);
        const length = jpegImageData.data.length + me.jpgTag.length;
        const bin = Buffer.concat([jpegImageData.data, me.jpgTag], length);
        userSocket.send(bin, { binary: true, mask: false });
      } catch (e) {
        tracer.log('ERROR: Cannot send slice to user');
      }
    },
    receiveRequestSliceMessage: function (data, userSocket) {
      // get slice information from message
      const { view } = data; // user view
      const slice = parseInt(data.slice, 10); // user slice

      // get User object
      const sourceUS = me._getUserWithUserData(data.uid, 'requestSlice');
      if (!sourceUS) {
        return;
      }

      // get brainPath from User object
      const brainPath = sourceUS.User.dirname + sourceUS.User.mri;

      // update User object
      sourceUS.User.view = view;
      sourceUS.User.slice = slice;
      if (me.debug > 1) {
        tracer.log('view, slice:', sourceUS.User.view, sourceUS.User.slice);
      }

      // getBrainAtPath() uses a client-side path, starting with "/data/[md5hash]"
      me.getBrainAtPath(brainPath)
        .then(function (theData) {
          me.sendSliceToUser(theData, view, slice, userSocket);
        })
        .catch((err) => console.error(err));
    },
    receiveRequestSlice2Message: function (data, userSocket) {
      const { view } = data; // user view
      const slice = parseInt(data.slice, 10); // user slice
      const sourceUS = me._getUserWithUserData(data.uid, 'requestSlice2');
      if (!sourceUS) {
        return;
      }
      const brainPath = sourceUS.User.dirname + sourceUS.User.mri;
      const { dirname, atlasFilename } = sourceUS.User;
      let atlas;

      sourceUS.User.view = view;
      sourceUS.User.slice = slice;
      if (me.debug > 1) {
        tracer.log('view, slice:', sourceUS.User.view, sourceUS.User.slice);
      }

      me.getBrainAtPath(brainPath)
        .then(function (brain) {
          const iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
          // the atlas is drawn only for a user who may see it (as the last check says)
          if (typeof iAtlas !== 'undefined' && me._mayRead(sourceUS, { dirname, filename: atlasFilename, source: sourceUS.User.source }, 'requestSlice2')) {
            atlas = me.Atlases[iAtlas];
          }

          try {
            const jpegImageData = me.drawSlice2(brain, atlas, view, slice); // TEST: to draw the server version of the atlas together with the anatomy
            const length = jpegImageData.data.length + me.jpgTag.length;
            const bin = Buffer.concat([jpegImageData.data, me.jpgTag], length);
            userSocket.send(bin, { binary: true, mask: false });
          } catch (e) {
            tracer.log('ERROR: Cannot send slice to user', e);
          }
        })
        .catch((err) => tracer.log('ERROR: Cannot get brain', err));
    },
    broadcastMessage: function (msg, uid) {
      let n = 0;
      for (const i in me.US) {
        if ({}.hasOwnProperty.call(me.US, i)) {
          if (me.US[i].uid !== uid && me.US[i].socket.readyState === WebSocket.OPEN) {
            try {
              me.US[i].socket.send(JSON.stringify(msg));
              n += 1;
            } catch (ex) {
              tracer.log(`WARNING: Unable to broadcast message from ${uid} to ${me.US[i].uid}`, ex, msg);
            }
          }
        }
      }
      if (me.debug) {
        tracer.log('    message broadcasted to ' + n + ' users', msg);
      }

      return n;
    },
    receiveSaveMessage: async function (data) {
      const sourceUS = me._getUserWithUserData(data.uid, 'save');
      if (!sourceUS) {
        return;
      }
      const { dirname, atlasFilename } = sourceUS.User;
      const time = new Date();

      const iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
      if (typeof iAtlas === 'undefined') {
        throw new Error('Trying to save an atlas that does not exist');
      }

      try {
        await me.saveAtlasAtIndex(iAtlas);
      } catch (err) {
        throw new Error('Atlas saving failed', { cause: err });
      }
      tracer.log('Atlas saved');

      // clearInterval(me.Atlases[iAtlas].timer);

      me.broadcastMessage({
        type: 'serverMessage',
        dialogType: 'info',
        msg: 'Atlas saved ' + time
      });

      /** @todo Log the save */
    },

    /**
     * Save an MRI document a user sent. In "enforce" mode (the default) the
     * client's copy is merged into the stored document, keeping what the user
     * may not change (see metadata-save-access.js), and the user is told once
     * what was not saved. In "log" mode (WS_ACCESS_CHECK=log) what would be
     * refused is logged, and the document is saved as before. Once saved, the
     * other users on the same project page or atlas are sent what was saved
     * @param {object} data The message: { uid, metadata, method, patch }
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line max-statements
    receiveSaveMetadataMessage: async function (data) {
      if (me.debug > 1) {
        tracer.log('metadata type: ' + data.type);
        tracer.log('rnd: ' + data.rnd);
        tracer.log('method: ' + data.method);
        tracer.log('patch: ' + JSON.stringify(data.patch));
      }

      /**
       * @todo Currently metadata is a complete object, but it is also possible to
       *       send a patch computed using jsonpatch. In the future, only the patch
       *       method will be used
       */

      if (!_.isPlainObject(data.metadata) || typeof data.metadata.source !== 'string') {
        throw new Error('saveMetadata without an MRI source');
      }
      const sourceUS = me.getUserFromUserId(data.uid);
      const enforce = (me.writeAccessMode !== 'log');
      // the user as the session says, not as the client says
      const username = await usernameFromCookie(me.sessionParser, sourceUS ? sourceUS.cookie : null);
      // sanitise json
      const json = JSON.parse(DOMPurify.sanitize(JSON.stringify(data.metadata))); // sanitize works on strings, not objects
      const { source } = json;
      if (me.debug > 1) {
        tracer.log('metadata:', JSON.stringify(json));
      }

      let saved = null;
      let refused = [];
      // eslint-disable-next-line max-statements
      await lock.acquire('mri', async function () {
        const stored = await nativeDb.collection('mri').findOne({ source, backup: { $exists: false } }, { projection: { _id: 0 } });
        let incoming = json;
        if (data.method === 'patch') {
          // deal with patches
          const addingORremovingLayerOrAnnotations = data.patch.some((operation) => {
            if (operation.path === null) { return false; }

            return (operation.op === 'remove' || operation.op === 'add') &&
              (operation.path.startsWith('/mri/atlas/') || operation.path.startsWith('/mri/annotations/'));
          });
          if (addingORremovingLayerOrAnnotations) {
            throw new Error('Refusing to apply patch - cannot directly remove or add annotation layers on MRI files');
          }
          // apply the patch to the stored document
          incoming = _.cloneDeep(stored);
          jsonpatch.applyPatch(incoming, data.patch);
          incoming = JSON.parse(DOMPurify.sanitize(JSON.stringify(incoming)));
        }

        if (stored) {
          const projects = await projectsForMetadata(nativeDb, source, [stored, incoming]);
          let doc;
          ({ doc, refused } = mergeMetadata({ stored, incoming, username, projects }));
          saved = enforce ? doc : me._legacyMetadataDocument({ data, stored, incoming, sourceUS });
        } else {
          refused = [{ path: 'source', reason: 'no such MRI', userReason: 'this MRI is not in the database', notify: true }];
          saved = enforce ? null : me._legacyMetadataDocument({ data, stored, incoming, sourceUS });
        }
        if (saved) {
          // mark previous one as backup, insert new
          await nativeDb.collection('mri').updateMany({ source }, { $set: { backup: true } });
          await nativeDb.collection('mri').insertOne(saved);
          delete saved._id;
        }
      });

      me._logRefusedMetadata(sourceUS, { source, refused });

      if (saved && sourceUS) {
        // the other users see what was saved, from the sender's copy
        const metadata = enforce ? savedView(saved, json) : data.metadata;
        me._handleBroadcastWebSocketMessage({ data: { ...data, metadata }, sourceUS });
      }

      // the atlases' access may have changed (and a project page saves the
      // layers it creates only after opening them)
      me.refreshWriteAccessToMRI(source);
    },

    /**
     * The document saveMetadata stored before its changes were checked (still
     * used in "log" mode): the client's copy ('append'), merged into the stored
     * one ('overwrite'), or the stored one patched ('patch')
     * @param {object} params Parameters
     * @param {object} params.data The message
     * @param {object|null} params.stored The stored document
     * @param {object} params.incoming The client's copy (sanitised), or the patched document
     * @param {object} params.sourceUS The connection
     * @returns {object} The document to store
     */
    _legacyMetadataDocument: function ({ data, stored, incoming, sourceUS }) {
      if (data.method === 'patch') {
        return incoming;
      }
      let json = _.cloneDeep(incoming);
      json.modified = (new Date()).toJSON();
      json.modifiedBy = (sourceUS && sourceUS.User && sourceUS.User.username) ? sourceUS.User.username : 'anonymous';
      if (data.method === 'overwrite' && stored) {
        json = merge.recursive(_.cloneDeep(stored), json);
      }
      delete json._id;

      return json;
    },

    /**
     * Log the changes of a saveMetadata that were not applied, and tell the
     * user, once per reason, those they asked for (not in "log" mode)
     * @param {object} sourceUS The connection
     * @param {object} params Parameters
     * @param {string} params.source The MRI's source
     * @param {Array} params.refused The changes not applied (see mergeMetadata)
     * @returns {void}
     */
    // eslint-disable-next-line max-statements
    _logRefusedMetadata: function (sourceUS, { source, refused }) {
      const uid = sourceUS ? sourceUS.uid : 'unknown connection';
      const describe = (list) => list.map((r) => `${r.path}: ${r.reason}`).join('; ');
      const notified = refused.filter((r) => r.notify);
      const ignored = refused.filter((r) => !r.notify);
      if (notified.length > 0) {
        const what = (me.writeAccessMode === 'log') ? 'WOULD REJECT' : 'REJECTED';
        tracer.log(`${what} changes in saveMetadata of ${source} from ${uid}: ${describe(notified)}`);
      }
      if (ignored.length > 0) {
        tracer.log(`IGNORED changes in saveMetadata of ${source} from ${uid}: ${describe(ignored)}`);
      }
      if (!sourceUS || me.writeAccessMode === 'log' || notified.length === 0) {
        return;
      }
      if (!sourceUS.metadataRefusalsSent) {
        sourceUS.metadataRefusalsSent = new Set();
      }
      const reasons = [...new Set(notified.map((r) => r.userReason))].filter((r) => !sourceUS.metadataRefusalsSent.has(r));
      if (reasons.length > 0) {
        reasons.forEach((r) => sourceUS.metadataRefusalsSent.add(r));
        me._sendWriteRefused(sourceUS, { write: 'saveMetadata', atlas: null, reason: reasons.join('; ') });
      }
    },
    receiveAtlasFromUserMessage: async function (data) {
      const atlasData = await new Promise((resolve, reject) => {
        zlib.inflate(data.data, function (err, result) {
          if (err) {
            return reject(new Error(err));
          }
          resolve(result);
        });
      });

      // Save current atlas
      const sourceUS = me._getUserWithUserData(data.uid, 'atlas');
      if (!sourceUS) {
        return;
      }
      const { iAtlas } = sourceUS.User;
      const atlas = me.Atlases[iAtlas];
      try {
        await me.saveAtlasAtIndex(iAtlas);
      } catch (err) {
        throw new Error('Save atlas failed', { cause: err });
      }

      tracer.log('    Replace current atlas with new atlas');
      atlas.data = atlasData;
    },
    unloadUnusedBrains: function () {
      for (const i in me.Brains) {
        if ({}.hasOwnProperty.call(me.Brains, i)) {
          const sum = me.numberOfUsersConnectedToMRI(me.Brains[i].path);

          if (sum === 0) {
            tracer.log('    No user connected to MRI ' + me.Brains[i].path + ': unloading it');
            me.unloadMRI(me.Brains[i].path);
          }
        }
      }
    },
    unloadUnusedAtlases: async function () {
      const results = [];
      for (const i in me.Atlases) {
        if ({}.hasOwnProperty.call(me.Atlases, i)) {
          const sum = me.numberOfUsersConnectedToAtlas(me.Atlases[i].dirname, me.Atlases[i].filename);
          if (sum === 0) {
            tracer.log('No user connected to Atlas ' + me.Atlases[i].dirname + me.Atlases[i].filename + ': unloading it');
            results.push(me.unloadAtlas(me.Atlases[i].dirname, me.Atlases[i].filename));
          }
        }
      }
      try {
        await Promise.all(results);
      } catch (err) {
        // called without waiting for it, when a user loads an atlas: log only
        tracer.log('ERROR: Can\'t unload atlases', err);
      }
    },
    _sendAtlasVoxelDataToUser: function (atlasdata, userSocket, flagCompress) {
      if (flagCompress) {
        zlib.gzip(atlasdata, function (err, atlasdatagz) {
          if (err) {
            console.error('ERROR:', err);

            return;
          }
          if (userSocket.readyState !== WebSocket.OPEN) {
            const targetUS = me.getUserFromSocket(userSocket);
            tracer.log(`WARNING: Not broadcastinig to user ${targetUS.uid} because it's disconnecting`);

            return;
          }
          try {
            userSocket.send(Buffer.concat([atlasdatagz, me.niiTag]), { binary: true, mask: false });
          } catch (e) {
            console.error('<WARNING: Cannot send atlas data to user. Maybe already disconnected? (1)>', e);
          }
        });
      } else {
        try {
          userSocket.send(Buffer.concat([atlasdata, me.niiTag]), { binary: true, mask: false });
        } catch (e) {
          console.error('<WARNING: Cannot send atlas data to user. Maybe already disconnected? (2)>', e);
        }
      }
    },
    _sendAtlasVectorialDataToUser: function (data, userSocket) {
      try {
        const cleanData = DOMPurify.sanitize(JSON.stringify({ type: 'vectorial', data }));
        userSocket.send(cleanData);
      } catch (e) {
        console.error('<WARNING: Cannot send atlas data to user. Maybe already disconnected? (1)>', e);
      }
    },
    sendAtlasToUser: function (atlas, userSocket, flagCompress) {
      me._sendAtlasVoxelDataToUser(atlas.data, userSocket, flagCompress);
      if (typeof atlas.vectorial === 'undefined') {
        atlas.vectorial = [];
      }
      me._sendAtlasVectorialDataToUser(atlas.vectorial, userSocket);
    },

    //========================================================================================
    // Load & Save
    //========================================================================================
    /**
     * @function loadAtlas
     * @description The requested atlas is sent if it was already loaded, loaded from disk
     *       if it was already downloaded but not yet loaded, or created if it's a
     *       new atlas.
     * @param {Object} User A User object providing information about the requested atlas
     * @returns {Object} An atlas (mri structure)
     */
    // eslint-disable-next-line max-statements
    loadAtlas: async function loadAtlas(User) {
      const mriPath = path.join(me.dataDirectory, User.dirname, User.atlasFilename);

      if (typeof User.dirname === 'undefined') {
        tracer.log('ERROR: Rejecting loadAtlas from undefined User.dirname:', User);
        throw (new Error('ERROR: Rejecting loadAtlas from undefined User'));
      }
      if (typeof User.atlasFilename === 'undefined') {
        tracer.log('ERROR: Rejecting loadAtlas from undefined User.atlasFilename:', User);
        throw (new Error('ERROR: Rejecting loadAtlas from undefined User'));
      }

      // eslint-disable-next-line no-sync
      if (!fs.existsSync(mriPath)) {
        // Create new empty atlas
        tracer.log('    Atlas ' + mriPath + ' does not exists. Create a new one');
        const brainPath = User.dirname + User.mri;
        let mri;
        try {
          mri = await me.getBrainAtPath(brainPath);
        } catch (err) {
          tracer.log('ERROR Cannot get template brain for new atlas', err);
          throw (err);
        }
        let newAtlas;
        try {
          newAtlas = await amri.createNifti(mri);
        } catch (err) {
          tracer.log('ERROR Cannot create nifti', err);
          throw (err);
        }
        newAtlas.filename = User.atlasFilename;
        newAtlas.dirname = User.dirname;
        newAtlas.source = User.source;

        // log atlas creation
        await nativeDb.collection('log').insertOne({
          key: 'createAtlas',
          value: DOMPurify.sanitize(JSON.stringify({ atlasDirectory: User.dirname, atlasFilename: User.atlasFilename })),
          username: User.username,
          date: (new Date()).toJSON()
        });

        return (newAtlas);
      }
      // Load existing atlas
      tracer.log('    Atlas found. Loading it');
      const loadedAtlas = await amri.loadMRI(mriPath);
      loadedAtlas.filename = User.atlasFilename;
      loadedAtlas.dirname = User.dirname;
      loadedAtlas.source = User.source;

      const mri = await nativeDb.collection('mri').findOne({ source: loadedAtlas.source, backup: { $exists: false } }, { projection: { _id: 0 } });
      let index = -1;
      for (let i = 0; i < mri.mri.atlas.length; i++) {
        if (mri.mri.atlas[i].filename === loadedAtlas.filename) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        throw new Error('Can\'t find atlas in mri');
      }
      if (typeof mri.mri.atlas[index].vectorial === 'undefined') {
        loadedAtlas.vectorial = [];
      } else {
        loadedAtlas.vectorial = mri.mri.atlas[index].vectorial;
      }

      // cast atlas data to 8bits
      switch (amri.filetypeFromFilename(User.atlasFilename)) {
      case 'nii.gz': {
        const atlas8bit = await amri.createNifti(loadedAtlas);
        for (let i = 0; i < loadedAtlas.dim[0] * loadedAtlas.dim[1] * loadedAtlas.dim[2]; i += 1) {
          atlas8bit.data[i] = loadedAtlas.data[i];
        }
        loadedAtlas.data = atlas8bit.data;
        loadedAtlas.hdr = atlas8bit.hdr;
      }
        break;
      case 'mgz':

        /*
          createMGH(loadedAtlas)
          .then(function(atlas8bit) {
          });
        */
        break;
      }

      return loadedAtlas;
    },

    _validateUserAtlas: function (atlas) {
      let validationOK = false;
      if (typeof atlas.name === 'undefined') {
        tracer.log('WARNING: atlas does not have a filename');
      } else if (typeof atlas.dirname === 'undefined') {
        tracer.log('WARNING: atlas does not have a directory name');
      } else if (typeof atlas.source === 'undefined') {
        tracer.log('WARNING: atlas does not have a source URL');
      } else {
        validationOK = true;
      }

      return validationOK;
    },

    /**
         * @func addAtlas
         * @description An atlas is obtained, and added to the me.Atlases[] array if it
         *          wasn't already loaded.
         * @param {Object} User A User structure providing information about the requested atlas
         * @returns {Object} An atlas (mri structure)
         */
    addAtlas: function (User) {
      const atlas = {
        name: User.atlasFilename,
        specimen: User.specimenName,
        dirname: User.dirname,
        dim: User.dim,
        source: User.source
      };
      if (me._validateUserAtlas(atlas) === false) {
        tracer.log('WARNING: insufficient information provided for adding atlas', atlas);
      }
      tracer.log('User requests atlas ' + atlas.name + ' from ' + atlas.dirname, atlas.specimen);

      const pr = new Promise(function (resolve, reject) {
        me.loadAtlas(User)
          .then(function (theAtlas) {
            const { iAtlas } = me._findAtlas(theAtlas);
            me.Atlases[iAtlas] = theAtlas;
            User.iAtlas = iAtlas; // `a${me.Atlases.indexOf(theAtlas)}`;
            theAtlas.timer = setInterval(function () {
              me.saveAtlasAtIndex(User.iAtlas)
                .catch((err) => tracer.log('ERROR: Periodic atlas backup failed', err));
            }, me.backupInterval);

            resolve(theAtlas);
          })
          .catch((err) => { reject(err); });
      });

      return pr;
    },

    //========================================================================================
    // Web socket handling
    //========================================================================================
    _isUserFirstConnection: function (User) {
      let firstConnectionFlag = false;

      if (typeof User === 'undefined') {
        firstConnectionFlag = true;
      } else if (User.isMRILoaded === false) {
        firstConnectionFlag = true;
      }

      return firstConnectionFlag;
    },
    _findAtlas: function ({ dirname, atlasFilename }) {
      let atlasLoadedFlag = false;
      let iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
      if (typeof iAtlas !== 'undefined') {
        atlasLoadedFlag = true;
      } else {
        // eslint-disable-next-line no-plusplus
        iAtlas = `a${++me.atlascounter}`;
      }

      return { iAtlas, atlasLoadedFlag };
    },
    // eslint-disable-next-line max-statements
    _handleSendAtlasRequest: function ({ sourceUS, User, userSocket, firstConnectionFlag }) {
      // An embed connection may only ever pull data for the single MRI it was
      // granted a ticket for - never anything else reachable over the same socket.
      if (me._isSendAtlasOutOfEmbedScope(sourceUS, User)) {
        tracer.log(`REJECTED sendAtlas for out-of-scope dirname from embed connection ${sourceUS.uid}`);

        return;
      }

      // receive an atlas from the user
      // 1. Check if the atlas the user is requesting has not been loaded

      // check whether user is switching atlas.
      let switchingAtlasFlag = false;
      if (typeof sourceUS.User !== 'undefined') {
        if ((sourceUS.User.atlasFilename !== User.atlasFilename) || (sourceUS.User.dirname !== User.dirname)) {
          switchingAtlasFlag = true;
        }
      }

      const { iAtlas, atlasLoadedFlag } = me._findAtlas({ dirname: User.dirname, atlasFilename: User.atlasFilename });
      User.iAtlas = iAtlas; // value i if it was found, or last available if it wasn't

      // check now whether the user may edit it, before the first stroke
      const target = { dirname: User.dirname, filename: User.atlasFilename, source: User.source };
      me.refreshWriteAccess(sourceUS, target);

      // and whether they may see it: the atlas is sent only once that is known
      const readCheck = me.refreshReadAccess(sourceUS, target);
      const sendIfReadable = (atlas) => readCheck.then(() => {
        if (sourceUS.User.dirname !== target.dirname || sourceUS.User.atlasFilename !== target.filename) {
          // the user has opened another atlas since
          return;
        }
        if (!me._mayRead(sourceUS, target, 'sendAtlas')) {
          return;
        }
        me.sendAtlasToUser(atlas, userSocket, true);
        sourceUS.User.isMRILoaded = true;
      });

      // 2. Send the atlas to the user (load it if required)
      if (atlasLoadedFlag) {
        if (firstConnectionFlag || switchingAtlasFlag) {
          // send the new user our data
          sendIfReadable(me.Atlases[iAtlas])
            .catch((err) => console.error('ERROR: Unable to send atlas', err));
        }
      } else {
        // The atlas requested has not been loaded before:
        // Load the atlas they requesting
        me.addAtlas(User)
          .then(sendIfReadable)
          .catch((err) => console.error('ERROR: Unable to load atlas', err));
      }
    },
    // eslint-disable-next-line max-statements
    receiveUserDataMessage: function (data, userSocket) {
      const sourceUS = me.getUserFromUserId(data.uid);
      if (!sourceUS) {
        tracer.log(`WARNING: Ignoring 'userData' message from unknown connection ${data.uid}`);

        return;
      }

      let User;
      const firstConnectionFlag = me._isUserFirstConnection(sourceUS.User);

      if (data.description === 'allUserData') {
        // receiving the complete User data object
        User = data.user;
        if (typeof User !== 'object' || User === null) {
          tracer.log(`WARNING: 'allUserData' without a user object from ${data.uid}`);

          return;
        }
        User.uid = data.uid;
      } else {
        ({ User } = sourceUS);

        if (typeof User === 'undefined') {
          tracer.log(`WARNING: 'User' structure is not defined for ${data.uid}`);

          return;
        }

        if (data.description === 'sendAtlas') {
          me._handleSendAtlasRequest({ sourceUS, User, userSocket, firstConnectionFlag });
        } else {
          // receive a specific field of the User data object from the user
          /** @todo If the atlas/mri for the client failed to be sent, `User` is undefined */
          let changes;
          try {
            changes = JSON.parse(data.description);
          } catch (err) {
            tracer.log(`WARNING: Ignoring 'userData' message with an invalid description from ${data.uid}`);

            return;
          }
          for (const i in changes) {
            if ({}.hasOwnProperty.call(changes, i)) {
              User[i] = changes[i];
            }
          }
        }
      }

      // 3. Update user data
      // If the user didn't have a name (wasn't logged in), but now has one,
      // display the name in the log
      if ({}.hasOwnProperty.call(User, 'username')) {
        if (typeof sourceUS.User === 'undefined') {
          tracer.log(`No "User" data yet received for id ${data.uid}`);
        } else if (!{}.hasOwnProperty.call(sourceUS.User, 'username')) {
          tracer.log(`User ${User.username} (${data.uid}) logged in`);
        }
      }
      if ({}.hasOwnProperty.call(sourceUS, 'User') === false) {
        sourceUS.User = {};
      }
      for (const prop in User) {
        if ({}.hasOwnProperty.call(User, prop)) {
          sourceUS.User[prop] = User[prop];
        }
      }

      /*
            // 4. Update number of users connected to atlas
            if(firstConnectionFlag) {
                var sumAtlas = 0,
                    sumMRI = 0;
                for(const i in me.US) {
                    if({}.hasOwnProperty.call(me.US, i)) {
                        if(me.US[i].User.dirname === User.dirname && me.US[i].User.atlasFilename === User.atlasFilename) {
                            sumAtlas += 1;
                        }
                        if(me.US[i].User.dirname === User.dirname && me.US[i].User.mri === User.mri) {
                            sumMRI += 1;
                        }
                    }
                }
                tracer.log(sumMRI + " user" + ((sumMRI === 1)?" is":"s are") + " requesting MRI " + User.dirname + User.mri);
                tracer.log(sumAtlas + " user" + ((sumAtlas === 1)?" is":"s are") + " requesting atlas " + User.dirname + User.atlasFilename);
            }
        */

      // 5. Unload unused data (the check is only done if new data has been added)
      if (data.description === 'sendAtlas') {
        me.unloadUnusedBrains();
        me.unloadUnusedAtlases();
      }
    },
    declareAutocompleteClient: function (data/*, userSocket*/) {
      const sourceUS = me.getUserFromUserId(data.uid);
      if (!sourceUS) {
        tracer.log(`WARNING: Ignoring 'autocompleteClient' message from unknown connection ${data.uid}`);

        return;
      }

      sourceUS.User = {
        autocompleteClient: true,
        uid: data.uid
      };
    },

    /*
         send new user information to old users,
         and old users information to new user.
        */
    sendPreviousUserDataMessage: function (newUS) {
      let n = 0;
      for (const i in me.US) {
        if ({}.hasOwnProperty.call(me.US, i)) {
          if (me.US[i].socket === newUS.socket) {
            continue;
          }
          const msg = JSON.stringify(me._publicUserData({ type: 'userData', user: me.US[i].User, uid: me.US[i].uid, description: 'allUserData' }));
          newUS.socket.send(msg);
          n += 1;
        }
      }
      if (me.debug) {
        tracer.log('    send user data from ' + n + ' users');
      }
    },
    sendDisconnectMessage: function (uid) {
      me.broadcastMessage({
        type: 'disconnect',
        uid: uid
      }, uid);
    },
    _initKeyPressHandler: function () {
      keypress(process.stdin);
      // eslint-disable-next-line max-statements
      process.stdin.on('keypress', function (ch, key) {
        if (key) {
          // tracer.log(ch, key);
          if (key.name === 'c' && key.ctrl) {
            tracer.log('Exit.');
            // eslint-disable-next-line no-process-exit
            process.exit();
          }
          if (key.name === 'escape') {
            me.enterCommands = !me.enterCommands;
            tracer.log('enterCommands: ' + me.enterCommands);
          }
          if (key.name === 'backspace') {
            process.stdout.write('\b');
          }
          if (me.enterCommands === false) {
            if (key.name === 'return') {
              tracer.log();
            }
          }
        }

        if (ch) {
          if (me.enterCommands) {
            switch (ch) {
            case 'a':
              me.displayAtlases();
              break;
            case 'b':
              me.displayBrains();
              break;
            case 'u':
              me.displayUsers();
              break;
            case 'r':
              me.toggleWebsocketRecording();
              break;
            case '0':
              me.debug = 0;
              tracer.log('debug level:', me.debug);
              break;
            case '1':
              me.debug = 1;
              tracer.log('debug level:', me.debug);
              break;
            case '2':
              me.debug = 2;
              tracer.log('debug level:', me.debug);
              break;
            case '3':
              me.debug = 3;
              tracer.log('debug level:', me.debug);
              break;
            }
          } else {
            process.stdout.write(ch);
          }
        }
      });
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
    },
    _isInBlacklist: function (remoteAddress) {
      let isInBlacklist = false;
      const ip = remoteAddress.split(':').pop();
      if (useWhitelist && !whitelist[ip]) {
        tracer.log('--------------------> REJECT ip not in whitelist', ip);
        isInBlacklist = true;
      }
      if (useBlacklist && blacklist[ip]) {
        tracer.log('--------------------> REJECT ip in blacklist', ip);
        isInBlacklist = true;
      }

      return isInBlacklist;
    },
    //========================================================================================
    // Read access
    //========================================================================================
    /**
     * Who a connection reads as: for an embed connection, the user its page was
     * rendered for (in its ticket: a framed page may not send the site's
     * cookie); else the user of the session cookie sent when the socket was
     * opened (read again each time, so a logout counts)
     * @param {object} sourceUS The connection
     * @returns {Promise<string|null>} The username, or null for an anonymous visitor
     */
    _readerUsername: function (sourceUS) {
      if (sourceUS.isEmbed && sourceUS.embedScope && typeof sourceUS.embedScope.username === 'string') {
        return Promise.resolve(sourceUS.embedScope.username);
      }

      return usernameFromCookie(me.sessionParser, sourceUS.cookie);
    },

    /**
     * Check again whether a connection may see an atlas (its content, as the
     * HTTP API hides the layers of projects whose annotations the user cannot see)
     * @param {object} sourceUS The connection
     * @param {object} target { dirname, filename, source } of the atlas
     * @returns {Promise<boolean>} True if the connection may see the atlas
     */
    refreshReadAccess: function (sourceUS, target) {
      if (!sourceUS.readAccess) {
        sourceUS.readAccess = {};
      }
      const key = target.dirname + target.filename;
      let entry = sourceUS.readAccess[key];
      if (!entry) {
        entry = { readable: false, checkedAt: 0, pending: null };
        sourceUS.readAccess[key] = entry;
      }
      entry.target = target;
      if (entry.pending) {
        return entry.pending;
      }
      entry.pending = (async () => {
        try {
          const username = await me._readerUsername(sourceUS);
          const { hidden, level } = await atlasReadAccess(nativeDb, { username, ...target });
          entry.readable = !hidden;
          entry.description = `${username || 'anonymous'} has '${level}' access to the annotations of its project`;
          // what the user is told: about their own access only
          entry.reason = `your access to the annotations of its project is '${level}'`;
        } catch (err) {
          tracer.log(`ERROR: Can't check whether ${sourceUS.uid} may see ${key}`, err);
          entry.readable = false;
          entry.description = 'access unknown';
          entry.reason = 'your access to this layer could not be checked';
        }
        entry.checkedAt = Date.now();
        entry.refusalLogged = false;
        entry.pending = null;

        return entry.readable;
      })();

      return entry.pending;
    },

    /**
     * Whether an atlas may be sent to a connection, as the last check says
     * (checked again in the background when it is old). A refusal is logged
     * once per check, and the user told once per check for a sendAtlas (not in
     * "log" mode, where the atlas is sent)
     * @param {object} sourceUS The connection
     * @param {object} target { dirname, filename, source } of the atlas
     * @param {string} what What would be sent ('sendAtlas', 'requestSlice2', 'relay')
     * @returns {boolean} True if it may be sent
     */
    // eslint-disable-next-line max-statements
    _mayRead: function (sourceUS, target, what) {
      const key = target.dirname + target.filename;
      const entry = sourceUS.readAccess && sourceUS.readAccess[key];
      if (!entry || (!entry.pending && Date.now() - entry.checkedAt > writeAccessMaxAge)) {
        me.refreshReadAccess(sourceUS, target)
          .catch((err) => tracer.log('ERROR: read access check', err));
      }
      if (entry && entry.checkedAt && entry.readable) {
        return true;
      }
      const reason = (entry && entry.checkedAt) ? entry.description : 'access not checked yet';
      const logged = entry ? entry.refusalLogged : sourceUS.uncheckedReadLogged && sourceUS.uncheckedReadLogged[key];
      if (!logged) {
        const word = (me.writeAccessMode === 'log') ? 'WOULD REJECT' : 'REJECTED';
        tracer.log(`${word} read (${what}) of ${key} by ${sourceUS.uid}: ${reason}`);
        if (entry) {
          entry.refusalLogged = true;
        } else {
          sourceUS.uncheckedReadLogged = { ...sourceUS.uncheckedReadLogged, [key]: true };
        }
        if (what === 'sendAtlas' && entry && entry.checkedAt && me.writeAccessMode !== 'log') {
          me._sendReadRefused(sourceUS, { atlas: key, reason: entry.reason });
        }
      }

      return me.writeAccessMode === 'log';
    },

    /**
     * Whether the content of an atlas (a stroke, an undo...) another user
     * changed may be relayed to a connection: only if the connection has opened
     * it and may see it
     * @param {object} targetUS The connection
     * @param {object} target { dirname, filename } of the atlas
     * @returns {boolean} True if it may be relayed
     */
    _mayRelayAtlas: function (targetUS, target) {
      const key = target.dirname + target.filename;
      const entry = targetUS.readAccess && targetUS.readAccess[key];
      if (!entry) {
        // the connection has not opened this atlas
        return me.writeAccessMode === 'log';
      }

      return me._mayRead(targetUS, entry.target, 'relay');
    },

    /**
     * Tell a connection that the atlas it asked for is not sent: the user may
     * not see it. Browsers that do not know the message type ignore it
     * @param {object} sourceUS The connection
     * @param {object} notice { atlas, reason }: the atlas' dirname and filename, and why (about this user only)
     * @returns {void}
     */
    _sendReadRefused: function (sourceUS, { atlas, reason }) {
      try {
        sourceUS.socket.send(JSON.stringify({ type: 'readRefused', atlas, reason }));
      } catch (err) {
        tracer.log(`ERROR: Can't tell ${sourceUS.uid} that a read was refused`, err);
      }
    },

    /**
     * A userData message as the other users get it: without the layer the
     * user has open
     * @param {object} data A userData message
     * @returns {object} A copy without privateUserFields
     */
    _publicUserData: function (data) {
      const copy = { ...data };
      if (copy.user && typeof copy.user === 'object') {
        copy.user = _.omit(copy.user, privateUserFields);
      }
      if (typeof copy.description === 'string' && copy.description.startsWith('{')) {
        try {
          const changes = JSON.parse(copy.description);
          if (changes && typeof changes === 'object' && privateUserFields.some((f) => f in changes)) {
            copy.description = JSON.stringify(_.omit(changes, privateUserFields));
          }
        } catch (err) {
          // not JSON: relayed as it is (the receivers ignore it)
        }
      }

      return copy;
    },

    //========================================================================================
    // Write access
    //========================================================================================
    /**
     * The atlas a write message from this connection would change
     * @param {object} sourceUS The connection
     * @param {string} type The message type
     * @returns {object|null} { dirname, filename, source }, or null if there is none
     */
    _writeTarget: function (sourceUS, type) {
      const { User } = sourceUS;
      if (!User) {
        return null;
      }
      let atlas;
      if (type === 'save') {
        const iAtlas = me.indexOfAtlasAtPath(User.dirname, User.atlasFilename);
        atlas = (typeof iAtlas === 'undefined') ? null : me.Atlases[iAtlas];
      } else if ({}.hasOwnProperty.call(me.Atlases, User.iAtlas)) {
        atlas = me.Atlases[User.iAtlas];
      }
      if (!atlas) {
        return null;
      }

      return { dirname: atlas.dirname, filename: atlas.filename, source: User.source };
    },

    /**
     * Check again whether a connection may edit an atlas: the user from the
     * session cookie sent when the socket was opened (read again each time, so
     * a logout counts), the access from the database
     * @param {object} sourceUS The connection
     * @param {object} target { dirname, filename, source } of the atlas
     * @returns {Promise<boolean>} True if the connection may edit the atlas
     */
    refreshWriteAccess: function (sourceUS, target) {
      if (!sourceUS.writeAccess) {
        sourceUS.writeAccess = {};
      }
      const key = target.dirname + target.filename;
      let entry = sourceUS.writeAccess[key];
      if (!entry) {
        entry = { allowed: false, checkedAt: 0, pending: null };
        sourceUS.writeAccess[key] = entry;
      }
      entry.target = target;
      if (entry.pending) {
        return entry.pending;
      }
      entry.pending = (async () => {
        try {
          const username = await usernameFromCookie(me.sessionParser, sourceUS.cookie);
          const level = await atlasAccessLevel(nativeDb, { username, ...target });
          entry.allowed = canEdit(level);
          entry.description = `${username || 'anonymous'} has '${level}' access`;
          // what the user is told: about their own access only
          entry.reason = `your access to this layer is '${level}'`;
        } catch (err) {
          tracer.log(`ERROR: Can't check the access of ${sourceUS.uid} to ${key}`, err);
          entry.allowed = false;
          entry.description = 'access unknown';
          entry.reason = 'your access to this layer could not be checked';
        }
        entry.checkedAt = Date.now();
        entry.refusalLogged = false;
        entry.pending = null;

        return entry.allowed;
      })();

      return entry.pending;
    },

    /**
     * Check again the access of every connection to the atlases of an MRI,
     * after its document changed
     * @param {string} source The MRI's source
     * @returns {void}
     */
    refreshWriteAccessToMRI: function (source) {
      for (const US of me.US) {
        if (US && US.writeAccess) {
          for (const entry of Object.values(US.writeAccess)) {
            if (entry.target && entry.target.source === source) {
              me.refreshWriteAccess(US, entry.target);
            }
          }
        }
      }
    },

    /**
     * What a write message from a connection must wait for before it is
     * decided: it is not allowed yet, but the access is being checked (the
     * atlas was just opened, or the last check is old), or the connection is
     * saving the MRI document, which may list the atlas. Without this, the
     * first strokes of an editor could be refused
     * @param {object} sourceUS The connection
     * @param {string} type The message type
     * @returns {Promise|null} The promise to wait for, or null to decide now
     */
    _writeAccessPending: function (sourceUS, type) {
      if (!atlasWriteTypes.includes(type) || sourceUS.isEmbed) {
        return null;
      }
      const target = me._writeTarget(sourceUS, type);
      if (!target) {
        return null;
      }
      const key = target.dirname + target.filename;
      let entry = sourceUS.writeAccess && sourceUS.writeAccess[key];
      if (entry && entry.checkedAt && entry.allowed) {
        return null;
      }
      if (sourceUS.metadataSave) {
        return sourceUS.metadataSave;
      }
      if (!entry || (!entry.pending && Date.now() - entry.checkedAt > writeAccessMaxAge)) {
        me.refreshWriteAccess(sourceUS, target);
        entry = sourceUS.writeAccess[key];
      }

      return entry.pending;
    },

    /**
     * Whether a write message from a connection may be applied. Decides from
     * the last check (made when the atlas was opened, and again when it is
     * older than writeAccessMaxAge), so messages are handled in order
     * @param {object} sourceUS The connection
     * @param {string} type The message type
     * @returns {boolean} True if the message may be applied
     */
    _mayWrite: function (sourceUS, type) {
      const target = me._writeTarget(sourceUS, type);
      if (!target) {
        return me._refuseWriteWithoutAtlas(sourceUS, type);
      }
      const key = target.dirname + target.filename;
      let entry = sourceUS.writeAccess && sourceUS.writeAccess[key];
      if (!entry || (!entry.pending && Date.now() - entry.checkedAt > writeAccessMaxAge)) {
        me.refreshWriteAccess(sourceUS, target);
        entry = sourceUS.writeAccess[key];
      }
      if (entry.checkedAt && entry.allowed) {
        return true;
      }
      // log and tell the user once per check, not for every stroke
      if (!entry.refusalLogged) {
        me._logRefusedWrite(sourceUS, {
          type,
          atlasPath: key,
          reason: entry.checkedAt ? entry.description : 'access not checked yet',
          userReason: entry.checkedAt ? entry.reason : 'your access to this layer has not been checked yet'
        });
        entry.refusalLogged = true;
      }

      return me.writeAccessMode === 'log';
    },

    /**
     * A write from a connection that has no atlas open: refused (logged every
     * time, the user told once)
     * @param {object} sourceUS The connection
     * @param {string} type The message type
     * @returns {boolean} True if the message may be applied anyway ("log" mode)
     */
    _refuseWriteWithoutAtlas: function (sourceUS, type) {
      me._logRefusedWrite(sourceUS, {
        type,
        atlasPath: null,
        reason: 'no atlas open',
        userReason: sourceUS.noAtlasRefusalSent ? null : 'no layer is open'
      });
      sourceUS.noAtlasRefusalSent = true;

      return me.writeAccessMode === 'log';
    },

    /**
     * Log a refused write, and tell the user (not in "log" mode)
     * @param {object} sourceUS The connection
     * @param {object} refusal The refusal
     * @param {string} refusal.type The message type
     * @param {string|null} refusal.atlasPath The atlas it would have changed
     * @param {string} refusal.reason Why, for the log
     * @param {string|null} refusal.userReason Why, for the user (about them only), or null not to tell them
     * @returns {void}
     */
    _logRefusedWrite: function (sourceUS, { type, atlasPath, reason, userReason }) {
      const what = (me.writeAccessMode === 'log') ? 'WOULD REJECT' : 'REJECTED';
      tracer.log(`${what} write (${type}) to ${atlasPath || 'no atlas'} from ${sourceUS.uid}: ${reason}`);
      if (userReason && me.writeAccessMode !== 'log') {
        me._sendWriteRefused(sourceUS, { write: type, atlas: atlasPath, reason: userReason });
      }
    },

    /**
     * Tell a connection that a write it sent was refused, so that the page stops
     * showing changes nobody else sees and that are not saved (not in "log"
     * mode, where the write is applied). Browsers that do not know the message
     * type ignore it
     * @param {object} sourceUS The connection
     * @param {object} notice The notice
     * @param {string} notice.write The type of the message refused ('paint', 'save', ...)
     * @param {string|null} notice.atlas The atlas it would have changed (its dirname and filename), if any
     * @param {string} notice.reason Why, about this user only
     * @returns {void}
     */
    _sendWriteRefused: function (sourceUS, { write, atlas, reason }) {
      try {
        sourceUS.socket.send(JSON.stringify({ type: 'writeRefused', write, atlas, reason }));
      } catch (err) {
        tracer.log(`ERROR: Can't tell ${sourceUS.uid} that a write was refused`, err);
      }
    },

    /**
     * Whether a message from a connection must be refused: writes from embed
     * connections, and writes to an atlas the user may not edit
     * @param {object} sourceUS The connection
     * @param {string} type The message type
     * @returns {boolean} True if the message must be refused
     */
    _isRefused: function (sourceUS, type) {
      if (!sourceUS) {
        return false;
      }
      if (sourceUS.isEmbed && embedWriteBlockedTypes.includes(type)) {
        tracer.log(`REJECTED write attempt (${type}) from embed-only connection ${sourceUS.uid}`);
        if (!sourceUS.embedRefusalSent) {
          // refused whatever the mode: an embedded viewer is never editable
          me._sendWriteRefused(sourceUS, { write: type, atlas: null, reason: 'an embedded viewer cannot edit' });
          sourceUS.embedRefusalSent = true;
        }

        return true;
      }

      return atlasWriteTypes.includes(type) && !me._mayWrite(sourceUS, type);
    },

    /**
     * Apply a message from a connection
     * @param {object} params Parameters
     * @param {object} params.data The message
     * @param {object} params.ws The socket
     * @param {object} params.sourceUS The connection
     * @returns {boolean} False if the message must not be broadcast now (refused, or a saveMetadata, broadcast once saved)
     */
    _handleUserWebSocketMessage: function ({ data, ws, sourceUS }) {
      if (me._isRefused(sourceUS, data.type)) {
        return false;
      }
      switch (data.type) {
      case 'userData':
        me.receiveUserDataMessage(data, ws); // sender);
        break;
      case 'show':
        // no action performed
        break;
      case 'paint':
        me.receivePaintMessage(data);
        break;
      case 'vectorial':
        me.receiveVectorialAnnotationMessage(data);
        break;
      case 'requestSlice':
        me.receiveRequestSliceMessage(data, ws); // sender);
        break;
      case 'requestSlice2':
        me.receiveRequestSlice2Message(data, ws); // sender);
        break;
      case 'save':
        me.receiveSaveMessage(data, ws)
          .catch((err) => tracer.log('ERROR: save message failed', err));
        break;
      case 'saveMetadata': {
        // the writes that follow wait for it if the user may not write yet:
        // a project page saves the layers it creates after opening them.
        // It waits for the connection's previous save, so that the saves are
        // stored in the order they were sent (a page sends those it held
        // while disconnected all at once)
        const previous = sourceUS && sourceUS.metadataSave;
        const receive = () => me.receiveSaveMetadataMessage(data, ws); // sender);
        const save = (previous ? previous.then(receive) : receive())
          .catch((err) => tracer.log('ERROR: saveMetadata message failed', err));
        if (sourceUS) {
          sourceUS.metadataSave = save;
          save.then(() => {
            if (sourceUS.metadataSave === save) {
              sourceUS.metadataSave = null;
            }
          });
        }

        // broadcast once saved, as it was saved (see receiveSaveMetadataMessage)
        return false;
      }
      case 'atlas':
        me.receiveAtlasFromUserMessage(data, ws) // sender);
          .catch((err) => tracer.log('ERROR: atlas message failed', err));
        break;
      case 'echo':
        tracer.log(`ECHO: "${data.msg}" from user ${data.username} (${data.uid})`);
        break;
      case 'userNameQuery':
        me.queryUserName(data)
          .then(function (obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch((err) => tracer.log(err));
        break;
      case 'projectNameQuery':
        me.queryProjectName(data)
          .then(function (obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch(function (err) { tracer.log(err); });
        break;
      case 'similarProjectNamesQuery':
        me.querySimilarProjectNames(data)
          .then(function (obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch(function (err) { tracer.log(err); });
        break;
      case 'autocompleteClient':
        me.declareAutocompleteClient(data, ws); // sender);
        break;
      default:
        break;
      }

      return true;
    },
    _fitsBroadcastExclusionCriteria: function ({ sourceUS, targetUS }) {
      let exclude = false;

      if (sourceUS.uid === targetUS.uid) {
        // do not auto-broadcast
        exclude = true;
      } else if (sourceUS.autocompleteClient) {
        // do not broadcast to autocomplete clients
        exclude = true;
      } else if (typeof sourceUS.User === 'undefined' || typeof targetUS.User === 'undefined') {
        // do not broadcast to undefined users
        exclude = true;
      }

      return exclude;
    },
    _fitsBroadcastInclusionCriteria: function ({ sourceUS, targetUS, data }) {
      let include = false;
      if (targetUS.User.projectPage && targetUS.User.projectPage === sourceUS.User.projectPage) {
        // users are annotating on the same project page
        include = true;
      } else if (targetUS.User.iAtlas === sourceUS.User.iAtlas) {
        // users are annotating the same atlas
        include = true;
      } else if (data.type === 'userData') {
        // users are exchanging identity information
        include = true;
      } else if (data.type === 'chat') {
        // users are chatting
        include = true;
      }

      return include;
    },
    // eslint-disable-next-line max-statements
    _handleBroadcastWebSocketMessage: function ({ data, sourceUS }) {
      // do not broadcast the following messages
      if (data.type === 'requestSlice' ||
        data.type === 'requestSlice2' ||
        (data.type === 'userData' && data.description === 'sendAtlas')) {

        return;
      }

      // scan through connected users
      for (const client of websocketserver.clients) {
        const targetUS = me.getUserFromSocket(client);

        // check exclusion criteria
        if (me._fitsBroadcastExclusionCriteria({ sourceUS, targetUS })) {
          continue;
        }

        // check inclusion criteria
        if (!me._fitsBroadcastInclusionCriteria({ sourceUS, targetUS, data })) {
          continue;
        }

        // the content of an atlas goes only to the users who may see it
        if (atlasContentTypes.includes(data.type)) {
          const target = me._writeTarget(sourceUS, data.type);
          if (!target || !me._mayRelayAtlas(targetUS, target)) {
            continue;
          }
        }

        // do broadcast
        if (data.type === 'atlas') {
          me.sendAtlasToUser(data, client, false);
        } else {
          // sanitise data
          const cleanData = DOMPurify.sanitize(JSON.stringify(data.type === 'userData' ? me._publicUserData(data) : data));
          try {
            client.send(cleanData);
          } catch (err) {
            tracer.log('ERROR:', err);
          }
        }
      }
    },
    // eslint-disable-next-line max-statements
    _handleWebSocketMessage: function ({ msg, ws }) {
      // var sender = ws;
      const sourceUS = me.getUserFromSocket(ws);
      let data = {};

      if (sourceUS === -1) {
        tracer.log('WARNING: Ignoring message from a socket that is not connected');

        return;
      }

      // Handle binary data: a user uploaded an atlas file
      if (msg instanceof Buffer) {
        data.data = msg;
        data.type = 'atlas';
      } else {
        try {
          data = JSON.parse(msg);
        } catch (err) {
          tracer.log(`WARNING: Ignoring message that is not JSON from ${sourceUS.uid}`);

          return;
        }
        if (typeof data !== 'object' || data === null) {
          tracer.log(`WARNING: Ignoring message that is not an object from ${sourceUS.uid}`);

          return;
        }
      }
      data.uid = sourceUS.uid;

      // Websocket traffic recorder
      if (me.recordWS) {
        if (data.type === 'atlas') {
          me.recordedWSTraffic.push({ type: 'atlas' });
        } else {
          me.recordedWSTraffic.push(data);
        }
      }

      // a write waiting for an access check holds back the messages that follow it
      if (sourceUS.messageQueue) {
        sourceUS.messageQueue.push(data);

        return;
      }
      me._handleMessages({ queue: [data], ws, sourceUS });
    },

    /**
     * Handle, in order, messages from a connection. A write that cannot be
     * decided yet (see _writeAccessPending) and the messages after it wait in
     * sourceUS.messageQueue until it can
     * @param {object} params Parameters
     * @param {Array} params.queue The messages
     * @param {object} params.ws The socket
     * @param {object} params.sourceUS The connection
     * @returns {void}
     */
    _handleMessages: function ({ queue, ws, sourceUS }) {
      while (queue.length > 0) {
        const pending = me._writeAccessPending(sourceUS, queue[0].type);
        if (pending) {
          sourceUS.messageQueue = queue;
          pending.then(() => {
            sourceUS.messageQueue = null;
            if (me.US.includes(sourceUS)) {
              me._handleMessages({ queue, ws, sourceUS });
            }
          });

          return;
        }
        const data = queue.shift();

        // handle single user Web socket messages; refused writes are not broadcast either
        if (me._handleUserWebSocketMessage({ data, ws, sourceUS }) !== false) {
          // handle broadcast of messages
          me._handleBroadcastWebSocketMessage({ data, sourceUS });
        }
      }
    },
    // eslint-disable-next-line max-statements
    _disconnectUser: async function ({ ws }) {
      let sum;
      let nconnected = me.US.filter(function (o) { return typeof o !== 'undefined'; }).length;
      const sourceUS = me.getUserFromSocket(ws);

      tracer.log(`User ${sourceUS.uid} disconnecting. There are ${nconnected} connected`);

      if (typeof sourceUS.User === 'undefined') {
        tracer.log(`WARNING: The 'User' structure for ${sourceUS.uid} is undefined. Maybe never assigned?`);
      } else if (sourceUS.User.dirname) {
        const mriPath = sourceUS.User.dirname + sourceUS.User.mri;
        const { specimenName } = sourceUS;
        const atlasPath = sourceUS.User.dirname + sourceUS.User.atlasFilename;
        tracer.log(`Was connected to MRI: ${mriPath}, atlas: ${atlasPath}, specimen: ${specimenName}`);

        // count how many users remain connected to the MRI after user leaves, remove current user
        sum = me.numberOfUsersConnectedToMRI(sourceUS.User.dirname + sourceUS.User.mri) - 1;
        if (sum) {
          tracer.log('There remain ' + sum + ' users connected to that MRI');
        } else {
          tracer.log('No user connected to MRI '
            + sourceUS.User.dirname
            + sourceUS.User.mri + ': unloading it', sourceUS.specimenName);
          me.unloadMRI(sourceUS.User.dirname + sourceUS.User.mri);
        }

        // count how many users remain connected to the atlas after user leaves, remove current user
        sum = me.numberOfUsersConnectedToAtlas(sourceUS.User.dirname, sourceUS.User.atlasFilename) - 1;
        if (sum) {
          tracer.log('There remain ' + sum + ' users connected to that atlas');
        } else {
          tracer.log('No user connected to atlas '
            + sourceUS.User.dirname
            + sourceUS.User.atlasFilename + ': unloading it', sourceUS.specimenName);
          try {
            await me.unloadAtlas(sourceUS.User.dirname, sourceUS.User.atlasFilename, sourceUS.specimenName);
          } catch (err) {
            // log, and still remove the user
            tracer.log('ERROR: Can\'t unload atlas', err);
          }
        }
      } else {
        tracer.log('WARNING: dirname was not defined', sourceUS.User);
      }

      // inform about the disconnect to the remaining users
      me.sendDisconnectMessage(sourceUS.uid);

      // remove the user from the list
      me.removeUser(ws);

      // display the total number of connected users
      nconnected = me.US.filter(function (o) { return typeof o !== 'undefined'; }).length;
      tracer.log(`${nconnected} users remain connected`);
    },
    _connectNewUser: function ({ ws, req }) {
      me.uidcounter += 1;

      const newUS = { 'uid': 'u' + me.uidcounter, 'socket': ws };

      // The session cookie the browser sent with the upgrade request: who the
      // user is, for the write access checks (never the username the client sends)
      if (req && req.headers && typeof req.headers.cookie === 'string') {
        newUS.cookie = req.headers.cookie;
      }

      // Tag the connection as embed-only from a server-verified ticket, never from
      // anything the client sends afterward over the socket itself. An unknown/expired
      // ticket still tags the connection isEmbed (fail closed): presenting this
      // parameter can only ever narrow a connection's rights, never widen them.
      const embedTicket = req && req.url && url.parse(req.url, true).query.embedTicket;
      if (embedTicket) {
        newUS.isEmbed = true;
        newUS.embedScope = null;
        EmbedAccessService.findWsTicket(nativeDb, embedTicket)
          .then((ticket) => {
            if (ticket) {
              newUS.embedScope = { dirname: ticket.dirname, mriSource: ticket.mriSource };
              // the user the page was rendered for (tickets minted before this was kept have none)
              if (typeof ticket.username === 'string') {
                newUS.embedScope.username = ticket.username;
              }
            }
          })
          .catch((err) => tracer.log('ERROR: embed ticket lookup failed', err));
      }

      me.US.push(newUS);

      const nconnected = me.US.filter(function (o) { return typeof o !== 'undefined'; }).length;
      tracer.log(`User id ${newUS.uid} connected, total: ${nconnected} users`);

      // send data from previous users
      me.sendPreviousUserDataMessage(newUS);
    },
    _initColorMap: function () {
      for (let i = 1; i < 256; i += 1) {
        me.colormap.push({
          r: 100 + Math.random() * 155,
          g: 100 + Math.random() * 155,
          b: 100 + Math.random() * 155
        });
      }
    },
    _handleWebSocketConnection: function (ws, req) {
      if (me._isInBlacklist(req.connection.remoteAddress)) {
        ws.close();

        return;
      }
      me._connectNewUser({ ws, req });
      ws.on('message', function (msg) {
        // an exception here would stop the server
        try {
          me._handleWebSocketMessage({ msg, ws });
        } catch (err) {
          tracer.log('ERROR: Can\'t handle WebSocket message', err);
        }
      });
      ws.on('close', async function () {
        try {
          await me._disconnectUser({ ws });
        } catch (err) {
          tracer.log('ERROR: Can\'t disconnect user', err);
        }
      });
    },
    initSocketConnection: function () {

      tracer.log(`
===================================
Starting atlasmakerServer.js
date: ${new Date()}
free memory: ${os.freemem()}
===================================
`);

      setInterval(function () { tracer.log('date:', new Date()); }, me.timeMarkInterval).unref(); // time mark
      atlasmakerServer = me;
      me._initKeyPressHandler();
      me._initColorMap();

      me.server.on('upgrade', function (req, socket) {
        let ip = req.ip
          || req.connection.remoteAddress
          || req.socket.remoteAddress
          || req.connection.socket.remoteAddress;
        ip = ip.split(':').pop();
        tracer.log('UPGRADING SERVER WITH IP', ip);

        if (useWhitelist && !whitelist[ip]) {
          tracer.log('------------------------------> not in whitelist', ip);
          setTimeout(function () {
            tracer.log('not in whitelist: end');
            socket.destroy();
          }, 5000);
        }

        if (useBlacklist && blacklist[ip]) {
          tracer.log('------------------------------> blacklist', ip);
          setTimeout(function () {
            tracer.log('blacklist: end');
            socket.destroy();
          }, 5000);
        }
      });

      // Init WS connection
      try {
        websocketserver = new WebSocketServer({
          server: me.server,
          verifyClient: me.verifyClient
        });
        me.websocketserver = websocketserver;
        websocketserver.on('connection', me._handleWebSocketConnection);
      } catch (ex) {
        tracer.log('ERROR: Unable to create a Web socket server', ex);
      }
    }
  };
  if (!atlasmakerServer) {
    atlasmakerServer = me;
  }

  return me;
};

// Notifications
const notifier = require('../../notifier');
notifier.on('saveAllAtlases', () => {
  atlasmakerServer.saveAllAtlases();
});
// The callback receives the number of connected users the message was sent to
notifier.on('broadcastMessage', (msg, callback) => {
  const users = atlasmakerServer ? atlasmakerServer.broadcastServerMessage({ msg, dialogType: 'modal' }) : 0;
  if (typeof callback === 'function') {
    return callback(users);
  }
});
// The callback receives the number of connected users who have open the MRI with that source
notifier.on('usersOnMRI', (source, callback) => {
  const users = atlasmakerServer ? atlasmakerServer.US.filter((us) => us.User && us.User.source === source) : [];
  callback(users.length);
});
module.exports = AtlasmakerServer;

// Exit handler
//catches ctrl+c event
const quit = async () => {
  // atlasmakerServer.broadcastServerMessage({
  //   msg: "Server will restart in 10 seconds",
  //   dialogType: "modal"
  // });
  atlasmakerServer.broadcastServerMessage({
    msg: 'Server will restart. Saving changes...',
    dialogType: 'info'
  });
  await atlasmakerServer.saveAllAtlases();
  // eslint-disable-next-line no-process-exit
  process.exit();
};

process.on('SIGINT', () => { quit(); });

/*
    Atlases
      .filename:    string, like 'atlas.nii.gz'
      .dirname: string, like '/data/[hash]/'
      .hdr:     Analyze hdr
      .dim[3]:  3 uint16s
      .data:    Analyze img
      .sum:     value sum

    US
      .uid
      .socket
      .User
        .view:          string, either 'sag', 'axi' or 'cor'
        .tool:          string, either 'paint' or 'erase'
        .slice:         slice which the user is editing
        .penSize:       integer, for example, 5
        .penValue:      integer, value used to paint, for example, 1
        .doFill:        boolean, indicates whether 'paint' or 'erase' fill their target
        .mouseIsDown:   boolean, indicates whether the user's mouse button is down
        .x0:            previous x coordinate for painting, -1 if no previous
        .y0:            previous y coordinate for painting, -1 if no previous
        .mri:           normally, MRI-n4.nii.gz
        .dirname:       string, atlas file directory, for example, /data/Gorilla/
        .username:      string, for example, roberto
        .specimenName:  string, for example, Crab-eating_macaque
        .atlasFilename: string, atlas filename, for example, Cerebellum.nii.gz
        .iAtlas:        string, the `a${i}` where i is an integer points to an element in Atlases
        .dim:           array, size of the mri the user is editing, for example, [160, 224, 160]

    undoBuffer
      .type: line, slice, volume
      .data:
*/
