/* eslint-disable max-lines */
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const tracer = require('tracer').console({ format: '[{{file}}:{{line}}]  {{message}}' });
const jpeg = require('jpeg-js'); // jpeg-js library: https://github.com/eugeneware/jpeg-js
const merge = require('merge');
const path = require('path');
const monk = require('monk');
const db = monk('localhost:27017/brainbox');
const keypress = require('keypress');

const amri = require("./atlasmaker-mri");
var AsyncLock = require('async-lock');
var lock = new AsyncLock();

// Get whitelist and blacklist
const useWhitelist = false;
const useBlacklist = true;
const whitelist = JSON.parse(fs.readFileSync(path.join(__dirname, "whitelist.json")));
const blacklist = JSON.parse(fs.readFileSync(path.join(__dirname, "blacklist.json")));

// var http = require('http');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;
var websocketserver;

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

const atlasmakerServer = (function () {
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

    traceLog: function (f, l) {
      if (typeof l === 'undefined' || me.debug > l) {
        tracer.log(String(f.name) + " " + (f.caller ? (f.caller.name || "annonymous") : "root"));
      }
    },
    niiTag: bufferTag("nii", 8),
    // const mghTag = bufferTag("mgh", 8);
    jpgTag: bufferTag("jpg", 8),

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
      tracer.log("\n" + me.Atlases.filter(function (o) { return typeof o !== 'undefined'; }).length + " Atlases:");
      for (const i in me.Atlases) {
        if ({}.hasOwnProperty.call(me.Atlases, i)) {
          const sum = me.numberOfUsersConnectedToAtlas(me.Atlases[i].dirname, me.Atlases[i].filename);
          tracer.log("Atlases[" + i + "] path:" + me.Atlases[i].dirname + me.Atlases[i].filename + ", " + sum + " users connected");
        }
      }
      for (const i in me.Atlases) {
        if ({}.hasOwnProperty.call(me.Atlases, i)) {
          tracer.log("atlas", i, me.Atlases[i]);
        }
      }
    },
    displayBrains: function () {
      tracer.log("\n" + me.Brains.filter(function (o) { return typeof o !== 'undefined'; }).length + " Brains:");
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
      tracer.log("\n" + me.US.filter(function (o) { return typeof o !== 'undefined'; }).length + " User Sockets:");
      for (const i in me.US) {
        if ({}.hasOwnProperty.call(me.US, i)) {
          tracer.log("US[" + i + "].uid=", me.US[i].uid);
          tracer.log("US[" + i + "]=", me.US[i].User);
        }
      }
    },
    toggleWebsocketRecording: function () {
      me.recordWS = !me.recordWS;
      if (me.recordWS) {
        tracer.log("recording WebSocket traffic");
      } else {
        tracer.log(JSON.stringify(me.recordedWSTraffic));
        tracer.log("finished recording WebSocket traffic");
        me.recordedWSTraffic = [];
      }
    },
    saveAllAtlases: async () => {
      for (const iAtlas in me.Atlases) {
        if ({}.hasOwnProperty.call(me.Atlases, iAtlas)) {
          console.log(`me.saveAtlasAtIndex(${iAtlas})`);
          // eslint-disable-next-line no-await-in-loop
          await me.saveAtlasAtIndex(iAtlas);
        }
      }
    },
    broadcastServerMessage: ({ msg, dialogType }) => {
      console.log(`Ready to broadcast [${msg}]`);
      me.broadcastMessage({
        type: "serverMessage",
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
          if (typeof user === "undefined") {
            console.log("WARNING: trying to get socket of undefined user. Deleting it.");
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
    getUserFromUserId: function (uid) {
      for (const key in me.US) {
        if ({}.hasOwnProperty.call(me.US, key)) {
          const user = me.US[key];
          if (typeof user === "undefined") {
            console.log("WARNING: trying to get uid of undefined user. Deleting it.");
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
      for (let i=0; i<me.Brains.length; i++) {
        if (me.Brains[i].path === mriPath) {
          me.Brains.splice(i, 1);
          tracer.log("Free memory", os.freemem());
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
      if (typeof iAtlas === "undefined") {
        return;
      }

      try {
        await me.saveAtlasAtIndex(iAtlas);
      } catch (err) {
        throw new Error("Saving atlas failed");
      }

      me.removeAtlasAtIndex(iAtlas);
      tracer.log("Atlas saved, unloading it. Free memory", os.freemem());
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
        throw new Error("Can't save atlas voxel data", err);
      }
      try {
        await me._saveAtlasVectorialData(atlas);
      } catch (err) {
        throw new Error("Can't save atlas vectorial data", err);
      }
    },

    // eslint-disable-next-line max-statements
    _saveAtlasVectorialData: async function (atlas) {
      if (typeof atlas === "undefined"
      || typeof atlas.vectorial === "undefined") {

        throw new Error("No vectorial atlas to save");
      }
      const { vectorial } = atlas;

      // eslint-disable-next-line max-statements
      await lock.acquire('mri', async function() {

        // check if atlas has changed since the last time and
        // if it hasn't return
        // if the atlas is not present, it may have been deleted by the user.
        // remove it from the Atlases array and return
        let mri;
        try {
          mri = await db.get('mri').findOne({ source: atlas.source, backup: { $exists: 0 } }, { _id: 0 });
        } catch (err) {
          throw new Error("Can't find entry for atlas voxel data in DB", err);
        }

        if (mri === null) {
          tracer.log(`WARNING: There's not DB entry for MRI with source ${atlas.source}`);

          return;
        }

        if ({}.hasOwnProperty.call(mri, "_id")) {
          delete mri._id;
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

        if (typeof mri.mri.atlas[index].vectorial !== "undefined") {
          const patch = jsonpatch.compare(mri.mri.atlas[index].vectorial, vectorial);
          if (patch.length === 0) {
            console.log("INFO: No vectorial atlas change, no save");

            return;
          }
        }

        // if has changed: update it and save to DB
        mri.mri.atlas[index].vectorial = vectorial;
        try {
          await db.get('mri').update({ source: atlas.source }, { $set: { backup: true } }, { multi: true });
          await db.get('mri').insert(mri);
        } catch (err) {
          throw new Error("Can't log update and save to DB");
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
      if (typeof atlas === "undefined"
      || typeof atlas.dim === "undefined") {

        throw new Error("No voxel atlas to save");
      }

      if (typeof atlas.data === "undefined") {
        throw new Error("atlas entry in Atlas array has no voxel data");
      }

      // check if atlas has changed since the last time and
      // if it has not, return.
      let sum = 0;
      for (let i = 0; i < atlas.dim[0] * atlas.dim[1] * atlas.dim[2]; i += 1) {
        sum += atlas.data[i];
      }
      if (sum === atlas.sum) {
        console.log("INFO: No voxel atlas change, no save");

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
        throw new Error("Atlas compression failed");
      }

      const path1 = me.dataDirectory + atlas.dirname + atlas.filename;
      const ms = Number(new Date()); // timestamp

      // if there's a previous version, keep if for backup
      // eslint-disable-next-line no-sync
      if (fs.existsSync(path1)) {
        const path2 = me.dataDirectory + atlas.dirname + ms + "_" + atlas.filename;
        // eslint-disable-next-line no-sync
        fs.renameSync(path1, path2);
      }

      // save the new version
      await fs.promises.writeFile(path1, mrigz);

      // log the saving
      try {
        await db.get('log').insert({
          key: "saveAtlasBackup",
          value: {
            atlasDirectory: atlas.dirname,
            atlasFilename: atlas.filename,
            timestamp: ms
          },
          date: (new Date()).toJSON()
        });
      } catch (err) {
        throw new Error("Logging atlas backup in DB failed");
      }
    },

    broadcastPaintVolumeMessage: function (msg, User) {
      try {
        let n = 0;
        const msg2 = JSON.stringify({ "type": "paintvol", "data": msg });
        for (const i in me.US) {
          if ({}.hasOwnProperty.call(me.US, i)) {
            if (typeof me.US[i].User !== 'undefined' &&
              me.US[i].User.iAtlas !== User.iAtlas) {
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
        tracer.log("WARNING: Unable to broadcastPaintVolumeMessage", ex);
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

      ip = ip.split(":").pop();

      if (useWhitelist && !whitelist[ip]) {
        tracer.log("REJECTING ip not in whitelist ", ip);

        return false;
      }

      if (useBlacklist && blacklist[ip]) {
        tracer.log("REJECTING ip in blacklist", ip);

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
          left--;
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
      atlas.vectorial = data;
    },

    /*
      From 'User' we know slice, atlas, vol, view, dim.
      [issue: undoLayer also has a User field. Maybe only undoLayer should be kept?]
    */
    paintxy: function (u, c, x, y, User, undoLayer) {
      const atlas = me.Atlases[User.iAtlas];
      if (typeof atlas.data === 'undefined') {
        tracer.log("ERROR: No atlas to draw into");

        return;
      }

      const coord = { "x": x, "y": y, "z": User.slice };
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
          db.get('user')
            .find(
              { "nickname": { '$regex': data.metadata.nickname } },
              { fields: ["nickname", "name"], limit: 10 })
            .then(function (obj) {
              resolve(obj);
            }
            );
        } else if (data.metadata && data.metadata.name) {
          db.get('user')
            .find(
              { "name": { '$regex': data.metadata.name } },
              { fields: ["nickname", "name"], limit: 10 })
            .then(function (obj) {
              resolve(obj);
            });
        } else {
          reject(new Error("Can't find user"));
        }
      });
    },
    queryProjectName: function (data) {
      return new Promise(function (resolve, reject) {
        if (data.metadata && data.metadata.name) {
          db.get('project')
            .findOne({
              shortname: data.metadata.name,
              backup: { $exists: 0 }
            }, {
              fields: ["name", "shortname"]
            })
            .then(function (obj) {
              resolve(obj);
            });
        } else {
          reject(new Error("Bad metadata"));
        }
      });
    },
    querySimilarProjectNames: function (data) {
      return new Promise(function (resolve, reject) {
        if (data.metadata && data.metadata.projectName) {
          db.get('project')
            .find({
              shortname: { $regex: data.metadata.projectName },
              backup: { $exists: 0 }
            }, {
              fields: ["name", "shortname"],
              limit: 10
            })
            .then(function (obj) {
              resolve(obj);
            });
        } else {
          reject(new Error("can't find similar project names"));
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
            tracer.log("brain already loaded");
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
        tracer.log("ERROR: getBrainAtPath cannot load brain. Corrupted file?", err);
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
      const sourceUS = me.getUserFromUserId(data.uid); // user data
      const { c, x, y } = msg; // command, x coordinate, y coordinate
      const undoLayer = me.getCurrentUndoLayer(sourceUS.User); // current undoLayer for user

      me.paintxy(sourceUS.uid, c, x, y, sourceUS.User, undoLayer);
    },
    receiveVectorialAnnotationMessage: function (message) {
      const { data } = message;
      const sourceUS = me.getUserFromUserId(message.uid); // source user data
      me.updateVectorialAnnotations(data, sourceUS.User);
    },
    sendSliceToUser: function (brain, view, slice, userSocket) {
      try {
        const jpegImageData = me.drawSlice(brain, view, slice);
        const length = jpegImageData.data.length + me.jpgTag.length;
        const bin = Buffer.concat([jpegImageData.data, me.jpgTag], length);
        userSocket.send(bin, { binary: true, mask: false });
      } catch (e) {
        tracer.log("ERROR: Cannot send slice to user");
      }
    },
    receiveRequestSliceMessage: function (data, userSocket) {
      // get slice information from message
      const { view } = data; // user view
      const slice = parseInt(data.slice, 10); // user slice

      // get User object
      const sourceUS = me.getUserFromUserId(data.uid);

      // get brainPath from User object
      const brainPath = sourceUS.User.dirname + sourceUS.User.mri;

      // update User object
      sourceUS.User.view = view;
      sourceUS.User.slice = slice;
      if (me.debug > 1) {
        tracer.log("view, slice:", sourceUS.User.view, sourceUS.User.slice);
      }

      // getBrainAtPath() uses a client-side path, starting with "/data/[md5hash]"
      me.getBrainAtPath(brainPath)
        .then(function (theData) {
          me.sendSliceToUser(theData, view, slice, userSocket);
        });
    },
    receiveRequestSlice2Message: function (data, userSocket) {
      const { view } = data; // user view
      const slice = parseInt(data.slice, 10); // user slice
      const sourceUS = me.getUserFromUserId(data.uid);
      const brainPath = sourceUS.User.dirname + sourceUS.User.mri;
      const { dirname, atlasFilename } = sourceUS.User;
      let atlas;

      sourceUS.User.view = view;
      sourceUS.User.slice = slice;
      if (me.debug > 1) {
        tracer.log("view, slice:", sourceUS.User.view, sourceUS.User.slice);
      }

      me.getBrainAtPath(brainPath)
        .then(function (brain) {
          const iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
          if (typeof iAtlas !== "undefined") {
            atlas = me.Atlases[iAtlas];
          }

          try {
            const jpegImageData = me.drawSlice2(brain, atlas, view, slice); // TEST: to draw the server version of the atlas together with the anatomy
            const length = jpegImageData.data.length + me.jpgTag.length;
            const bin = Buffer.concat([jpegImageData.data, me.jpgTag], length);
            userSocket.send(bin, { binary: true, mask: false });
          } catch (e) {
            tracer.log("ERROR: Cannot send slice to user", e);
          }
        });
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
        tracer.log("    message broadcasted to " + n + " users", msg);
      }
    },
    receiveSaveMessage: async function (data) {
      const sourceUS = me.getUserFromUserId(data.uid);
      const { dirname, atlasFilename } = sourceUS.User;
      const time = new Date();

      const iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
      if (typeof iAtlas === "undefined") {
        throw new Error("Trying to save an atlas that does not exist");
      }

      try {
        await me.saveAtlasAtIndex(iAtlas);
      } catch (err) {
        throw new Error("Atlas saving failed");
      }
      tracer.log("Atlas saved");

      // clearInterval(me.Atlases[iAtlas].timer);

      me.broadcastMessage({
        type: "serverMessage",
        dialogType: "info",
        msg: "Atlas saved " + time
      });

      /** @todo Log the save */
    },
    // eslint-disable-next-line max-statements
    receiveSaveMetadataMessage: async function (data) {
      if (me.debug > 1) {
        tracer.log("metadata type: " + data.type);
        tracer.log("rnd: " + data.rnd);
        tracer.log("method: " + data.method);
        tracer.log("patch: " + JSON.stringify(data.patch));
      }

      /**
       * @todo Currently metadata is a complete object, but it is also possible to
       *       send a patch computed using jsonpatch. In the future, only the patch
       *       method will be used
       */

      const sourceUS = me.getUserFromUserId(data.uid);
      let json = data.metadata;
      json.modified = (new Date()).toJSON();
      json.modifiedBy = (sourceUS.User && sourceUS.User.username) ? sourceUS.User.username : "anonymous";

      // eslint-disable-next-line max-statements
      await lock.acquire('mri', async function() {
        if (data.method === "patch") {
        // deal with patches

          // get original object from db
          let ret = await db.get('mri').findOne({ source: json.source, backup: { $exists: 0 } }, { _id: 0 });
          delete ret._id;
          // apply patch
          jsonpatch.applyPatch(ret, data.patch);
          // sanitise
          ret = JSON.parse(DOMPurify.sanitize(JSON.stringify(ret))); // sanitize works on strings, not objects
          // mark previous as backup
          await db.get('mri').update({ source: json.source }, { $set: { backup: true } }, { multi: true });
          // insert new
          await db.get('mri').insert(ret);
        } else {
        // deal with the complete object

          // sanitise json
          json = JSON.parse(DOMPurify.sanitize(JSON.stringify(json))); // sanitize works on strings, not objects
          // DEBUG:
          if (me.debug > 1) {
            tracer.log("metadata:", JSON.stringify(json));
          }

          // mark previous one as backup
          const ret = await db.get('mri').findOne({ source: json.source, backup: { $exists: 0 } });
          // DEBUG: tracer.log("original mri:", JSON.stringify(ret));

          if (data.method === "overwrite") {
            json = merge.recursive(ret, json);
          }
          delete json._id;

          await db.get('mri').update({ source: json.source }, { $set: { backup: true } }, { multi: true });
          await db.get('mri').insert(json);
        // DEBUG: tracer.log("inserted mri:", JSON.stringify(json));
        }
      });
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
      const sourceUS = me.getUserFromUserId(data.uid);
      const { iAtlas } = sourceUS.User;
      const atlas = me.Atlases[iAtlas];
      try {
        await me.saveAtlasAtIndex(iAtlas);
      } catch (err) {
        throw new Error("Save atlas failed");
      }

      tracer.log("    Replace current atlas with new atlas");
      atlas.data = atlasData;
    },
    unloadUnusedBrains: function () {
      for (const i in me.Brains) {
        if ({}.hasOwnProperty.call(me.Brains, i)) {
          const sum = me.numberOfUsersConnectedToMRI(me.Brains[i].path);

          if (sum === 0) {
            tracer.log("    No user connected to MRI " + me.Brains[i].path + ": unloading it");
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
            tracer.log("No user connected to Atlas " + me.Atlases[i].dirname + me.Atlases[i].filename + ": unloading it");
            results.push(me.unloadAtlas(me.Atlases[i].dirname, me.Atlases[i].filename));
          }
        }
      }
      try {
        await Promise.all(results);
      } catch (err) {
        throw new Error("Can't unload atlases", err);
      }
    },
    _sendAtlasVoxelDataToUser: function (atlasdata, userSocket, flagCompress) {
      if (flagCompress) {
        zlib.gzip(atlasdata, function (err, atlasdatagz) {
          if (err) {
            console.error("ERROR:", err);

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
            console.error("<WARNING: Cannot send atlas data to user. Maybe already disconnected? (1)>", e);
          }
        });
      } else {
        try {
          userSocket.send(Buffer.concat([atlasdata, me.niiTag]), { binary: true, mask: false });
        } catch (e) {
          console.error("<WARNING: Cannot send atlas data to user. Maybe already disconnected? (2)>", e);
        }
      }
    },
    _sendAtlasVectorialDataToUser: function (data, userSocket) {
      try {
        const cleanData = DOMPurify.sanitize(JSON.stringify({ type: "vectorial", data }));
        userSocket.send(cleanData);
      } catch (e) {
        console.error("<WARNING: Cannot send atlas data to user. Maybe already disconnected? (1)>", e);
      }
    },
    sendAtlasToUser: function (atlas, userSocket, flagCompress) {
      me._sendAtlasVoxelDataToUser(atlas.data, userSocket, flagCompress);
      if (typeof atlas.vectorial === "undefined") {
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
    loadAtlas: async function loadAtlas (User) {
      const mriPath = path.join(me.dataDirectory, User.dirname, User.atlasFilename);

      if (typeof User.dirname === 'undefined') {
        tracer.log("ERROR: Rejecting loadAtlas from undefined User.dirname:", User);
        throw(new Error("ERROR: Rejecting loadAtlas from undefined User"));
      }
      if (typeof User.atlasFilename === 'undefined') {
        tracer.log("ERROR: Rejecting loadAtlas from undefined User.atlasFilename:", User);
        throw(new Error("ERROR: Rejecting loadAtlas from undefined User"));
      }

      // eslint-disable-next-line no-sync
      if (!fs.existsSync(mriPath)) {
        // Create new empty atlas
        tracer.log("    Atlas " + mriPath + " does not exists. Create a new one");
        const brainPath = User.dirname + User.mri;
        let mri;
        try {
          mri = await me.getBrainAtPath(brainPath);
        } catch(err) {
          tracer.log("ERROR Cannot get template brain for new atlas", err);
          throw(err);
        }
        var newAtlas;
        try {
          newAtlas = await amri.createNifti(mri);
        } catch(err) {
          tracer.log("ERROR Cannot create nifti", err);
          throw(err);
        }
        newAtlas.filename = User.atlasFilename;
        newAtlas.dirname = User.dirname;
        newAtlas.source = User.source;

        // log atlas creation
        await db.get('log').insert({
          key: "createAtlas",
          value: DOMPurify.sanitize(JSON.stringify({ atlasDirectory: User.dirname, atlasFilename: User.atlasFilename })),
          username: User.username,
          date: (new Date()).toJSON()
        });

        return(newAtlas);
      }
      // Load existing atlas
      tracer.log("    Atlas found. Loading it");
      const loadedAtlas = await amri.loadMRI(mriPath);
      loadedAtlas.filename = User.atlasFilename;
      loadedAtlas.dirname = User.dirname;
      loadedAtlas.source = User.source;

      const mri = await db.get('mri').findOne({ source: loadedAtlas.source, backup: { $exists: 0 } }, { _id: 0 });
      let index = -1;
      for (let i = 0; i < mri.mri.atlas.length; i++) {
        if (mri.mri.atlas[i].filename === loadedAtlas.filename) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        throw new Error("Can't find atlas in mri");
      }
      if (typeof mri.mri.atlas[index].vectorial === "undefined") {
        loadedAtlas.vectorial = [];
      } else {
        loadedAtlas.vectorial = mri.mri.atlas[index].vectorial;
      }

      // cast atlas data to 8bits
      switch (amri.filetypeFromFilename(User.atlasFilename)) {
      case "nii.gz": {
        const atlas8bit = await amri.createNifti(loadedAtlas);
        for (let i = 0; i < loadedAtlas.dim[0] * loadedAtlas.dim[1] * loadedAtlas.dim[2]; i += 1) {
          atlas8bit.data[i] = loadedAtlas.data[i];
        }
        loadedAtlas.data = atlas8bit.data;
        loadedAtlas.hdr = atlas8bit.hdr;
      }
        break;
      case "mgz":

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
      if (typeof atlas.name === "undefined") {
        tracer.log("WARNING: atlas does not have a filename");
      } else if (typeof atlas.dirname === "undefined") {
        tracer.log("WARNING: atlas does not have a directory name");
      } else if (typeof atlas.source === "undefined") {
        tracer.log("WARNING: atlas does not have a source URL");
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
        tracer.log("WARNING: insufficient information provided for adding atlas", atlas);
      }
      tracer.log("User requests atlas " + atlas.filename + " from " + atlas.dirname, atlas.specimen);

      const pr = new Promise(function (resolve, reject) {
        me.loadAtlas(User)
          .then(function (theAtlas) {
            const { iAtlas } = me._findAtlas(theAtlas);
            me.Atlases[iAtlas] = theAtlas;
            User.iAtlas = iAtlas; // `a${me.Atlases.indexOf(theAtlas)}`;
            theAtlas.timer = setInterval(function () {
              me.saveAtlasAtIndex(User.iAtlas);
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
      if (typeof iAtlas !== "undefined") {
        atlasLoadedFlag = true;
      } else {
        iAtlas = `a${++me.atlascounter}`;
      }

      return { iAtlas, atlasLoadedFlag };
    },
    // eslint-disable-next-line max-statements
    receiveUserDataMessage: function (data, userSocket) {
      const sourceUS = me.getUserFromUserId(data.uid);

      let User;
      const firstConnectionFlag = me._isUserFirstConnection(sourceUS.User);
      let switchingAtlasFlag = false;


      if (data.description === "allUserData") {
        // receiving the complete User data object
        User = data.user;
        User.uid = data.uid;
      } else {
        ({ User } = sourceUS);
        if (data.description === "sendAtlas") {
          // receive an atlas from the user
          // 1. Check if the atlas the user is requesting has not been loaded

          // check whether user is switching atlas.
          switchingAtlasFlag = false;
          if (typeof sourceUS.User !== "undefined") {
            if ((sourceUS.User.atlasFilename !== User.atlasFilename) || (sourceUS.User.dirname !== User.dirname)) {
              switchingAtlasFlag = true;
            }
          }

          if (typeof User === "undefined") {
            tracer.log(`WARNING: 'User' structure is not defined for ${data.uid}`);

            return;
          }

          const { iAtlas, atlasLoadedFlag } = me._findAtlas({ dirname: User.dirname, atlasFilename: User.atlasFilename });
          User.iAtlas = iAtlas; // value i if it was found, or last available if it wasn't

          // 2. Send the atlas to the user (load it if required)
          if (atlasLoadedFlag) {
            if (firstConnectionFlag || switchingAtlasFlag) {
              // send the new user our data
              me.sendAtlasToUser(me.Atlases[iAtlas], userSocket, true);
              sourceUS.User.isMRILoaded = true;
            }
          } else {
            // The atlas requested has not been loaded before:
            // Load the atlas they requesting
            me.addAtlas(User)
              .then(function (atlas) {
                me.sendAtlasToUser(atlas, userSocket, true);
                sourceUS.User.isMRILoaded = true;
              })
              .catch((err) => console.log(new Error("ERROR: Unable to load atlas", err)));
          }
        } else {
          // receive a specific field of the User data object from the user
          /** @todo If the atlas/mri for the client failed to be sent, `User` is undefined */
          const changes = JSON.parse(data.description);
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
      if (data.description === "sendAtlas") {
        me.unloadUnusedBrains();
        me.unloadUnusedAtlases();
      }
    },
    declareAutocompleteClient: function (data/*, userSocket*/) {
      const sourceUS = me.getUserFromUserId(data.uid);

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
          const msg = JSON.stringify({ type: "userData", user: me.US[i].User, uid: me.US[i].uid, description: "allUserData" });
          newUS.socket.send(msg);
          n += 1;
        }
      }
      if (me.debug) {
        tracer.log("    send user data from " + n + " users");
      }
    },
    sendDisconnectMessage: function (uid) {
      me.broadcastMessage({
        type: "disconnect",
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
            tracer.log("Exit.");
            // eslint-disable-next-line no-process-exit
            process.exit();
          }
          if (key.name === 'escape') {
            me.enterCommands = !me.enterCommands;
            tracer.log("enterCommands: " + me.enterCommands);
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
              tracer.log("debug level:", me.debug);
              break;
            case '1':
              me.debug = 1;
              tracer.log("debug level:", me.debug);
              break;
            case '2':
              me.debug = 2;
              tracer.log("debug level:", me.debug);
              break;
            case '3':
              me.debug = 3;
              tracer.log("debug level:", me.debug);
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
      const ip = remoteAddress.split(":").pop();
      if (useWhitelist && !whitelist[ip]) {
        tracer.log("--------------------> REJECT ip not in whitelist", ip);
        isInBlacklist = true;
      }
      if (useBlacklist && blacklist[ip]) {
        tracer.log("--------------------> REJECT ip in blacklist", ip);
        isInBlacklist = true;
      }

      return isInBlacklist;
    },
    _handleUserWebSocketMessage: function ({ data, ws }) {
      switch (data.type) {
      case "userData":
        me.receiveUserDataMessage(data, ws); // sender);
        break;
      case "show":
        // no action performed
        break;
      case "paint":
        me.receivePaintMessage(data);
        break;
      case "vectorial":
        me.receiveVectorialAnnotationMessage(data);
        break;
      case "requestSlice":
        me.receiveRequestSliceMessage(data, ws); // sender);
        break;
      case "requestSlice2":
        me.receiveRequestSlice2Message(data, ws); // sender);
        break;
      case "save":
        me.receiveSaveMessage(data, ws);
        break;
      case "saveMetadata":
        me.receiveSaveMetadataMessage(data, ws); // sender);
        break;
      case "atlas":
        me.receiveAtlasFromUserMessage(data, ws); // sender);
        break;
      case "echo":
        tracer.log(`ECHO: "${data.msg}" from user ${data.username} (${data.uid})`);
        break;
      case "userNameQuery":
        me.queryUserName(data)
          .then(function (obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch((err) => tracer.log(err));
        break;
      case "projectNameQuery":
        me.queryProjectName(data)
          .then(function (obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch(function (err) { tracer.log(err); });
        break;
      case "similarProjectNamesQuery":
        me.querySimilarProjectNames(data)
          .then(function (obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch(function (err) { tracer.log(err); });
        break;
      case "autocompleteClient":
        me.declareAutocompleteClient(data, ws); // sender);
        break;
      default:
        break;
      }
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
      } else if (data.type === "userData") {
        // users are exchanging identity information
        include = true;
      } else if (data.type === "chat") {
        // users are chatting
        include = true;
      }

      return include;
    },
    _handleBroadcastWebSocketMessage: function ({ data, sourceUS }) {
      // do not broadcast the following messages
      if (data.type === "requestSlice" ||
                data.type === "requestSlice2" ||
                (data.type === "userData" && data.description === "sendAtlas")) {

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

        // do broadcast
        if (data.type === "atlas") {
          me.sendAtlasToUser(data, client, false);
        } else {
          // sanitise data
          const cleanData = DOMPurify.sanitize(JSON.stringify(data));
          try {
            client.send(cleanData);
          } catch (err) {
            tracer.log("ERROR:", err);
          }
        }
      }
    },
    _handleWebSocketMessage: function ({ msg, ws }) {
      // var sender = ws;
      const sourceUS = me.getUserFromSocket(ws);
      let data = {};

      // Handle binary data: a user uploaded an atlas file
      if (msg instanceof Buffer) {
        data.data = msg;
        data.type = "atlas";
      } else {
        data = JSON.parse(msg);
      }
      data.uid = sourceUS.uid;

      // Websocket traffic recorder
      if (me.recordWS) {
        if (data.type === "atlas") {
          me.recordedWSTraffic.push({ type: 'atlas' });
        } else {
          me.recordedWSTraffic.push(data);
        }
      }

      // handle single user Web socket messages
      me._handleUserWebSocketMessage({ data, ws });

      // handle broadcast of messages
      me._handleBroadcastWebSocketMessage({ data, sourceUS });
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
          tracer.log("There remain " + sum + " users connected to that MRI");
        } else {
          tracer.log("No user connected to MRI "
                                + sourceUS.User.dirname
                                + sourceUS.User.mri + ": unloading it", sourceUS.specimenName);
          me.unloadMRI(sourceUS.User.dirname + sourceUS.User.mri);
        }

        // count how many users remain connected to the atlas after user leaves, remove current user
        sum = me.numberOfUsersConnectedToAtlas(sourceUS.User.dirname, sourceUS.User.atlasFilename) - 1;
        if (sum) {
          tracer.log("There remain " + sum + " users connected to that atlas");
        } else {
          tracer.log("No user connected to atlas "
                                + sourceUS.User.dirname
                                + sourceUS.User.atlasFilename + ": unloading it", sourceUS.specimenName);
          try {
            await me.unloadAtlas(sourceUS.User.dirname, sourceUS.User.atlasFilename, sourceUS.specimenName);
          } catch (err) {
            throw new Error("Can't unload atlas", err);
          }
        }
      } else {
        tracer.log("WARNING: dirname was not defined", sourceUS.User);
      }

      // inform about the disconnect to the remaining users
      me.sendDisconnectMessage(sourceUS.uid);

      // remove the user from the list
      me.removeUser(ws);

      // display the total number of connected users
      nconnected = me.US.filter(function (o) { return typeof o !== 'undefined'; }).length;
      tracer.log(`${nconnected} users remain connected`);
    },
    _connectNewUser: function ({ ws }) {
      me.uidcounter += 1;

      const newUS = { "uid": "u" + me.uidcounter, "socket": ws };
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
      me._connectNewUser({ ws });
      ws.on('message', function (msg) {
        me._handleWebSocketMessage({ msg, ws });
      });
      ws.on('close', async function () {
        try {
          await me._disconnectUser({ ws });
        } catch (err) {
          throw new Error("Can't disconnect user", err);
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

      setInterval(function () { tracer.log("date:", new Date()); }, me.timeMarkInterval); // time mark
      me._initKeyPressHandler();
      me._initColorMap();

      me.server.on("upgrade", function (req, socket) {
        let ip = req.ip
                    || req.connection.remoteAddress
                    || req.socket.remoteAddress
                    || req.connection.socket.remoteAddress;
        ip = ip.split(":").pop();
        tracer.log("UPGRADING SERVER WITH IP", ip);

        if (useWhitelist && !whitelist[ip]) {
          tracer.log("------------------------------> not in whitelist", ip);
          setTimeout(function () {
            tracer.log("not in whitelist: end");
            socket.destroy();
          }, 5000);
        }

        if (useBlacklist && blacklist[ip]) {
          tracer.log("------------------------------> blacklist", ip);
          setTimeout(function () {
            tracer.log("blacklist: end");
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
        websocketserver.on("connection", me._handleWebSocketConnection);
      } catch (ex) {
        tracer.log("ERROR: Unable to create a Web socket server", ex);
      }
    }
  };

  return me;
}());

// Notifications
const notifier = require("../../notifier");
notifier.on("saveAllAtlases", () => {
  atlasmakerServer.saveAllAtlases();
});
notifier.on("broadcastMessage", (msg) => {
  atlasmakerServer.broadcastServerMessage({ msg, dialogType: "modal" });
});
module.exports = atlasmakerServer;

// Exit handler
//catches ctrl+c event
const quit = async () => {
  // atlasmakerServer.broadcastServerMessage({
  //   msg: "Server will restart in 10 seconds",
  //   dialogType: "modal"
  // });
  atlasmakerServer.broadcastServerMessage({
    msg: "Server will restart. Saving changes...",
    dialogType: "info"
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
