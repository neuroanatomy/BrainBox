/* eslint-disable max-lines */
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const tracer = require('tracer').console({format: '[{{file}}:{{line}}]  {{message}}'});
const jpeg = require('jpeg-js'); // jpeg-js library: https://github.com/eugeneware/jpeg-js
const Struct = require('struct');
const merge = require('merge');
const path = require('path');
const monk = require('monk');
const db = monk('localhost:27017/brainbox');
const keypress = require('keypress');

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
const {JSDOM} = require('jsdom');
const {window} = (new JSDOM('', {
  features: {
    FetchExternalResources: false, // disables resource loading over HTTP / filesystem
    ProcessExternalResources: false // do not execute JS within script blocks
  }
}));
const DOMPurify = createDOMPurify(window);

const jsonpatch = require('fast-json-patch');

function bufferTag(str, sz) {
  const buf = Buffer.alloc(sz).fill(32);
  buf.write(str);

  return buf;
}

const atlasmakerServer = (function() {
  const me = {
    debug: 0,
    dataDirectory: '',
    Atlases: [],
    Brains: [],
    US: [],
    uidcounter: 0,
    atlascounter: 0,
    backupInterval: 15*60*1000, // 15 minutes in milliseconds
    timeMarkInterval: 60*60*1000, // 60 minutes in milliseconds
    enterCommands: false,
    UndoStack: [],
    recordWS: false,
    recordedWSTraffic: [],
    colormap: [{ r: 0, g: 0, b: 0 }],

    /*eslint-disable no-multi-spaces*/
    NiiHdr: new Struct()
      .word32Sle('sizeof_hdr')        // Size of the header. Must be 348 (bytes)
      .chars('data_type', 10)         // Not used; compatibility with analyze.
      .chars('db_name', 18)           // Not used; compatibility with analyze.
      .word32Sle('extents')           // Not used; compatibility with analyze.
      .word16Sle('session_error')     // Not used; compatibility with analyze.
      .word8('regular')               // Not used; compatibility with analyze.
      .word8('dim_info')              // Encoding directions (phase, frequency, slice).
      .array('dim', 8, 'word16Sle')   // Data array dimensions.
      .floatle('intent_p1')           // 1st intent parameter.
      .floatle('intent_p2')           // 2nd intent parameter.
      .floatle('intent_p3')           // 3rd intent parameter.
      .word16Sle('intent_code')       // nifti intent.
      .word16Sle('datatype')          // Data type.
      .word16Sle('bitpix')            // Number of bits per voxel.
      .word16Sle('slice_start')       // First slice index.
      .array('pixdim', 8, 'floatle')  // Grid spacings (unit per dimension).
      .floatle('vox_offset')          // Offset into a .nii file.
      .floatle('scl_slope')           // Data scaling, slope.
      .floatle('scl_inter')           // Data scaling, offset.
      .word16Sle('slice_end')         // Last slice index.
      .word8('slice_code')            // Slice timing order.
      .word8('xyzt_units')            // Units of pixdim[1..4].
      .floatle('cal_max')             // Maximum display intensity.
      .floatle('cal_min')             // Minimum display intensity.
      .floatle('slice_duration')      // Time for one slice.
      .floatle('toffset')             // Time axis shift.
      .word32Sle('glmax')             // Not used; compatibility with analyze.
      .word32Sle('glmin')             // Not used; compatibility with analyze.
      .chars('descrip', 80)           // Any text.
      .chars('aux_file', 24)          // Auxiliary filename.
      .word16Sle('qform_code')        // Use the quaternion fields.
      .word16Sle('sform_code')        // Use of the affine fields.
      .floatle('quatern_b')           // Quaternion b parameter.
      .floatle('quatern_c')           // Quaternion c parameter.
      .floatle('quatern_d')           // Quaternion d parameter.
      .floatle('qoffset_x')           // Quaternion x shift.
      .floatle('qoffset_y')           // Quaternion y shift.
      .floatle('qoffset_z')           // Quaternion z shift.
      .array('srow_x', 4, 'floatle')  // 1st row affine transform
      .array('srow_y', 4, 'floatle')  // 2nd row affine transform.
      .array('srow_z', 4, 'floatle')  // 3rd row affine transform.
      .chars('intent_name', 16)       // Name or meaning of the data.
      .chars('magic', 4),             // Magic string.
    /*eslint-enable no-multi-spaces*/
    MghHdr: new Struct()
      .word32Sbe('v')
      .word32Sbe('ndim1')
      .word32Sbe('ndim2')
      .word32Sbe('ndim3')
      .word32Sbe('nframes')
      .word32Sbe('type')
      .word32Sbe('dof')
      .word16Sbe('ras_good_flag')
      .array('delta', 3, 'floatbe')
      .array('Mdc', 9, 'floatbe')
      .array('Pxyz_c', 3, 'floatbe'),
    // const MghFtr = Struct().array('mrparms', 4, 'floatbe');
    traceLog: function (f, l) {
      if(typeof l === 'undefined' || me.debug>l) {
        tracer.log(String(f.name) + " " + (f.caller?(f.caller.name||"annonymous"): "root"));
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

      if(typeof dirname === 'undefined' || typeof atlasFilename === 'undefined') {
        return sum;
      }

      for(const i in me.US) {
        if({}.hasOwnProperty.call(me.US, i)) {
          if(typeof me.US[i].User === 'undefined') {
            tracer.log(`WARNING: When counting the number of users connected to the atlas, user ${me.US[i].uid} was not defined`);
          } else if(typeof me.US[i].User.dirname === 'undefined') {
            tracer.log(`WARNING: For user uid ${i} dirname is unknown`);
          } else if(typeof me.US[i].User.atlasFilename === 'undefined') {
            tracer.log(`WARNING: For user uid ${i} atlasFilename is unknown`);
          } else if(me.US[i].User.dirname === dirname && me.US[i].User.atlasFilename === atlasFilename) {
            sum += 1;
          }
        }
      }

      return sum;
    },
    numberOfUsersConnectedToMRI: function (mriPath) {
      let sum = 0;

      if(typeof mriPath === 'undefined') {
        return sum;
      }

      for(const i in me.US) {
        if({}.hasOwnProperty.call(me.US, i)) {
          if(typeof me.US[i].User === 'undefined') {
            tracer.log(`WARNING: When counting the number of users connected to MRI, user ${me.US[i].uid} was not defined`);
            continue;
          }
          if(typeof me.US[i].User.dirname === 'undefined') {
            tracer.log(`WARNING: A user uid ${i} dirname is unknown`);
            continue;
          }
          if(typeof me.US[i].User.mri === 'undefined') {
            tracer.log(`WARNING: A user uid ${i} MRI is unknown`);
            continue;
          }
          if(me.US[i].User.dirname + me.US[i].User.mri === mriPath) {
            sum += 1;
          }
        }
      }

      return sum;
    },
    displayAtlases: function () {
      tracer.log("\n" + me.Atlases.filter( function(o) { return typeof o !== 'undefined'; } ).length + " Atlases:");
      for(const i in me.Atlases) {
        if({}.hasOwnProperty.call(me.Atlases, i)) {
          const sum = me.numberOfUsersConnectedToAtlas(me.Atlases[i].dirname, me.Atlases[i].filename);
          tracer.log("Atlases[" + i + "] path:" + me.Atlases[i].dirname + me.Atlases[i].filename + ", " + sum + " users connected");
        }
      }
      for(const i in me.Atlases) {
        if({}.hasOwnProperty.call(me.Atlases, i)) {
          tracer.log("atlas", i, me.Atlases[i]);
        }
      }
    },
    displayBrains: function () {
      tracer.log("\n" + me.Brains.filter(function(o) { return typeof o !== 'undefined'; }).length + " Brains:");
      for(const i in me.Brains) {
        if({}.hasOwnProperty.call(me.Brains, i)) {
          const sum = me.numberOfUsersConnectedToMRI(me.Brains[i].path);
          tracer.log(`Brains[${i}].path=${me.Brains[i].path}, ${sum} users connected`);
        }
      }
      for(const i in me.Brains) {
        if({}.hasOwnProperty.call(me.Brains, i)) {
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
      tracer.log("\n" + me.US.filter(function(o) { return typeof o !== 'undefined'; }).length + " User Sockets:");
      for(const i in me.US) {
        if({}.hasOwnProperty.call(me.US, i)) {
          tracer.log("US[" + i + "].uid=", me.US[i].uid);
          tracer.log("US[" + i + "]=", me.US[i].User);
        }
      }
    },
    toggleWebsocketRecording: function () {
      me.recordWS = !me.recordWS;
      if(me.recordWS) {
        tracer.log("recording WebSocket traffic");
      } else {
        tracer.log(JSON.stringify(me.recordedWSTraffic));
        tracer.log("finished recording WebSocket traffic");
        me.recordedWSTraffic = [];
      }
    },
    saveAllAtlases: async () => {
      for(const iAtlas in me.Atlases) {
        if({}.hasOwnProperty.call(me.Atlases, iAtlas)) {
          console.log(`me.saveAtlasAtIndex(${iAtlas})`);
          await me.saveAtlasAtIndex(iAtlas);
        }
      }
      await new Promise((resolve) => { setTimeout(() => resolve(), 10000); });
    },
    broadcastServerMessage: ({msg, dialogType}) => {
      console.log(`Ready to broadcast [${msg}]`);
      me.broadcastMessage({
        type: "serverMessage",
        dialogType: dialogType,
        msg: `Server message: ${msg}`
      });
    },

    //========================================================================================
    // Web socket
    //========================================================================================
    getUserFromSocket: function (socket) {
      for(const key in me.US) {
        if({}.hasOwnProperty.call(me.US, key)) {
          const user = me.US[key];
          if(typeof user === "undefined") {
            console.log("WARNING: trying to get socket of undefined user. Deleting it.");
            delete me.US[key];
            continue;
          }
          if(socket === user.socket) {
            return user;
          }
        }
      }

      return -1;
    },
    getUserFromUserId: function (uid) {
      for(const key in me.US) {
        if({}.hasOwnProperty.call(me.US, key)) {
          const user = me.US[key];
          if(typeof user === "undefined") {
            console.log("WARNING: trying to get uid of undefined user. Deleting it.");
            delete me.US[key];
            continue;
          }
          if(uid === user.uid) {
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
      for(const i in me.US) {
        if({}.hasOwnProperty.call(me.US, i)) {
          if(socket === me.US[i].socket) {
            delete me.US[i];
            break;
          }
        }
      }
    },
    indexOfAtlasAtPath: function(dirname, atlasFilename) {
      for(const key in me.Atlases) {
        if({}.hasOwnProperty.call(me.Atlases, key)) {
          if(me.Atlases[key].dirname === dirname && me.Atlases[key].filename === atlasFilename) {
            return key;
          }
        }
      }
    },
    removeAtlasAtIndex: function(iAtlas) {
      console.log(`INFO: Removing atlas ${me.Atlases[iAtlas].filename}`);
      clearInterval(me.Atlases[iAtlas].timer);
      delete me.Atlases[iAtlas];
    },
    unloadMRI: function (mriPath) {
      for(const i in me.Brains) {
        if({}.hasOwnProperty.call(me.Brains, i)) {
          if(me.Brains[i].path === mriPath) {
            delete me.Brains[i];
            tracer.log("Free memory", os.freemem());
            break;
          }
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
      if(typeof iAtlas === "undefined") {
        return;
      }

      try {
        await me.saveAtlasAtIndex(iAtlas);
      } catch(err) {
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

    _saveAtlasVectorialData: async function (atlas) {
      if(typeof atlas === "undefined"
      || typeof atlas.vectorial === "undefined") {

        throw new Error("No vectorial atlas to save");
      }
      const {vectorial} = atlas;

      // check if atlas has changed since the last time and
      // if it hasn't return
      // if the atlas is not present, it may have been deleted by the user.
      // remove it from the Atlases array and return
      let mri;
      try {
        mri = await db.get('mri').findOne({source: atlas.source, backup: { $exists: 0 }}, { _id: 0 });
      } catch (err) {
        throw new Error("Can't find entry for atlas voxel data in DB", err);
      }

      if(mri === null) {
        tracer.log(`WARNING: There's not DB entry for MRI with source ${atlas.source}`);

        return;
      }

      if({}.hasOwnProperty.call(mri, "_id")) {
        delete mri._id;
      }

      let index = -1;
      for(let i=0; i<mri.mri.atlas.length; i++) {
        if(mri.mri.atlas[i].filename === atlas.filename) {
          index = i;
          break;
        }
      }

      if(index === -1) {
        // atlas was removed from MRI object, return
        // const iAtlas = me.indexOfAtlasAtPath(atlas.dirname, atlas.filename);
        // me.removeAtlasAtIndex(iAtlas);

        return;
      }

      if(typeof mri.mri.atlas[index].vectorial !== "undefined") {
        const patch = jsonpatch.compare(mri.mri.atlas[index].vectorial, vectorial);
        if (patch.length === 0) {
          console.log("INFO: No vectorial atlas change, no save");

          return;
        }
      }

      // if has changed: update it and save to DB
      mri.mri.atlas[index].vectorial = vectorial;
      try {
        await db.get('mri').update({ source: atlas.source }, { $set: { backup: true }}, { multi: true });
        await db.get('mri').insert(mri);
      } catch (err) {
        throw new Error("Can't log update and save to DB");
      }
    },

    /**
     * @function _saveAtlasVoxelData
     * @param {object} atlas An mri object structure
     * @returns {promise} success message
     */
    _saveAtlasVoxelData: async function (atlas) {
      if(typeof atlas === "undefined"
      || typeof atlas.dim === "undefined") {

        throw new Error("No voxel atlas to save");
      }

      if(typeof atlas.data === "undefined") {
        throw new Error("atlas entry in Atlas array has no voxel data");
      }

      // check if atlas has changed since the last time and
      // if it has not, return.
      let sum = 0;
      for(let i = 0; i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2]; i += 1) {
        sum += atlas.data[i];
      }
      if(sum === atlas.sum) {
        console.log("INFO: No voxel atlas change, no save");

        return;
      }

      // atlas changed: save a backup copy.
      atlas.sum = sum;
      const {hdrSz} = atlas;
      const dataSz = atlas.data.length;
      let ftrSz;
      if(atlas.ftr) {
        ftrSz = atlas.ftr.length;
      } else {
        ftrSz = 0;
      }
      const mri = Buffer.alloc(atlas.dim[0]*atlas.dim[1]*atlas.dim[2] + hdrSz + ftrSz);
      atlas.hdr.copy(mri);
      atlas.data.copy(mri, hdrSz);
      if(ftrSz) {
        atlas.ftr.copy(mri, hdrSz + dataSz);
      }

      // compress it
      let mrigz;
      try {
        mrigz = await new Promise(function (resolve, reject) {
          zlib.gzip(mri, function (err, result) {
            if(err) {
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
      if(fs.existsSync(path1)) {
        const path2 = me.dataDirectory + atlas.dirname + ms + "_" + atlas.filename;
        fs.renameSync(path1, path2);
      }

      // save the new version
      fs.writeFileSync(path1, mrigz);

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
        for(const i in me.US) {
          if({}.hasOwnProperty.call(me.US, i)) {
            if( typeof me.US[i].User !== 'undefined' &&
                            me.US[i].User.iAtlas !== User.iAtlas ) {
              continue;
            }
            me.US[i].socket.send(msg2);
            n += 1;
          }
        }
        if(me.debug) {
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

      if(info.req.connection.remoteAddress) {
        ip = info.req.connection.remoteAddress;
      } else if(info.req.socket._peername) {
        ip = info.req.socket._peername.address;
      } else {

        return true;
      }

      ip = ip.split(":").pop();

      if(useWhitelist && !whitelist[ip]) {
        tracer.log("REJECTING ip not in whitelist ", ip);

        return false;
      }

      if(useBlacklist && blacklist[ip]) {
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

      if(me.debug) {
        tracer.log(`Number of layers: ${me.UndoStack.length}`);
      }

      return undoLayer;
    },
    getCurrentUndoLayer: function (User) {
      let undoLayer;
      let found = false;

      for(let i = me.UndoStack.length-1; i>=0; i -= 1) {
        undoLayer = me.UndoStack[i];
        if(typeof undoLayer === 'undefined') {
          break;
        }
        if( undoLayer.User.username === User.username &&
                    undoLayer.User.atlasFilename === User.atlasFilename &&
                    undoLayer.User.specimenName === User.specimenName) {
          found = true;
          break;
        }
      }
      if(!found) {
        // There was no undoLayer for this user. This may be the
        // first user's action. Create an appropriate undoLayer for it.
        tracer.log(`No previous undo layer for ${User.username}, ${User.atlasFilename}: Create and push one`);
        undoLayer = me.pushUndoLayer(User);
      }

      return undoLayer;
    },
    undo: function (User) {
      let undoLayer;
      let found = false;

      // find latest undo layer for user
      for(let i = me.UndoStack.length-1; i>=0; i -= 1) {
        undoLayer = me.UndoStack[i];
        if(typeof undoLayer === 'undefined') {
          break;
        }
        if( undoLayer.User.username === User.username
            && undoLayer.User.atlasFilename === User.atlasFilename
            && undoLayer.User.specimenName === User.specimenName
            && Object.keys(undoLayer.actions).length>0) {
          found = true;
          me.UndoStack.splice(i, 1); // remove layer from me.UndoStack
          if(me.debug) {
            tracer.log(`Found undo layer for ${User.username}, ${User.atlasFilename}, with ${Object.keys(undoLayer.actions).length} actions`);
          }
          break;
        }
      }
      if(!found) {
        // There was no undoLayer for this user.
        if(me.debug) {
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

      for(const j in undoLayer.actions) {
        if({}.hasOwnProperty.call(undoLayer.actions, j)) {
          const i = parseInt(j);
          val = undoLayer.actions[i];
          arr.push([i, val]);

          // The actual undo having place:
          vol[i] = val;

          if(me.debug>=3) {
            tracer.log(`Undo: ${i%User.dim[0]}, ${parseInt(i/User.dim[0])%User.dim[1]}, ${parseInt(i/User.dim[0]/User.dim[1])%User.dim[2]}`);
          }
        }
      }
      const msg = { data: arr };
      me.broadcastPaintVolumeMessage(msg, User);

      if(me.debug) {
        tracer.log(`${me.UndoStack.length} undo layers remaining`);
      }
    },

    //========================================================================================
    // Painting
    //========================================================================================
    _screen2index: function (s, mri) {
      const {s2v} = mri;
      const v = [s2v.X + s2v.dx*s[s2v.x], s2v.Y + s2v.dy*s[s2v.y], s2v.Z + s2v.dz*s[s2v.z]];
      const index = v[0] + v[1]*mri.dim[0] + v[2]*mri.dim[0]*mri.dim[1];

      return index;
    },
    paintVoxel: function (mx, my, mz, User, vol, val, undoLayer) {
      const {view} = User;
      let x, y, z;
      const {sdim} = User.s2v;

      switch(view) {
      case 'sag': x = mz; y = mx; z = sdim[2]-1-my; break; // sagital
      case 'cor': x = mx; y = mz; z = sdim[2]-1-my; break; // coronal
      case 'axi': x = mx; y = sdim[1]-1-my; z = mz; break; // axial
      }

      const s = [x, y, z];
      const i = me._screen2index(s, User);
      if(vol[i] !== val) {
        undoLayer.actions[i] = vol[i];
        vol[i] = val;
      }
    },
    line: function (x, y, val, User, undoLayer) {
      // Bresenham's line algorithm adapted from
      // http://stackoverflow.com/questions/4672279/bresenham-algorithm-in-javascript

      const atlas = me.Atlases[User.iAtlas];
      const vol = atlas.data;
      let x1 = User.x0; // screen coords
      let y1 = User.y0; // screen coords
      const z = User.slice; // screen coords
      const {view} = User; // view: sag, cor or axi
      const {sdim} = User.s2v;
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

      switch(view) {
      case 'sag': [brainWidth, brainHeight] = [sdim[1], sdim[2]]; break; // sagital
      case 'cor': [brainWidth, brainHeight] = [sdim[0], sdim[2]]; break; // coronal
      case 'axi': [brainWidth, brainHeight] = [sdim[0], sdim[1]]; break; // axial
      }

      for(let j = 0; j<Math.min(User.penSize, brainWidth-x1); j += 1) {
        for(let k = 0; k<Math.min(User.penSize, brainHeight-y1); k += 1) {
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
        for(let j = 0; j<Math.min(User.penSize, brainWidth-x1); j += 1) {
          for(let k = 0; k<Math.min(User.penSize, brainHeight-y1); k += 1) {
            me.paintVoxel(x1 + j, y1 + k, z, User, vol, val, undoLayer);
          }
        }
      }
    },
    _sliceXYZ2index: function (mx, my, mz, User) {
      const {view} = User;
      let x, y, z;
      const {sdim} = User.s2v;

      switch(view) {
      case 'sag': x = mz; y = mx; z = sdim[2]-1-my; break; // sagital
      case 'cor': x = mx; y = mz; z = sdim[2]-1-my; break; // coronal
      case 'axi': x = mx; y = sdim[1]-1-my; z = mz; break; // axial
      }

      return me._screen2index([x, y, z], User);
    },
    fill: function (x, y, z, val, User, undoLayer) {
      const {view} = User;
      const vol = me.Atlases[User.iAtlas].data;
      let brainWidth;
      let brainHeight;
      const {sdim} = User.s2v;
      switch(view) {
      case 'sag': [brainWidth, brainHeight] = [sdim[1], sdim[2]]; break; // sagital
      case 'cor': [brainWidth, brainHeight] = [sdim[0], sdim[2]]; break; // coronal
      case 'axi': [brainWidth, brainHeight] = [sdim[0], sdim[1]]; break; // axial
      }

      const Q = [];
      let left, right;
      let n;
      let max = 0;
      const bval = vol[me._sliceXYZ2index(x, y, z, User)]; // background-value: value of the voxel where the click occurred

      if(bval === val) { // nothing to do

        return;
      }

      Q.push({ x: x, y: y });
      while(Q.length>0) {
        if(Q.length>max) {
          max = Q.length;
        }
        n = Q.shift();
        if(vol[me._sliceXYZ2index(n.x, n.y, z, User)] !== bval) {
          continue;
        }
        left = n.x;
        right = n.x;
        ({y} = n);
        while (left-1>=0 && vol[me._sliceXYZ2index(left-1, y, z, User)] === bval) {
          left--;
        }
        while (right + 1<brainWidth && vol[me._sliceXYZ2index(right + 1, y, z, User)] === bval) {
          right += 1;
        }
        for(x = left; x<=right; x += 1) {
          me.paintVoxel(x, y, z, User, vol, val, undoLayer);
          if(y-1>=0 && vol[me._sliceXYZ2index(x, y-1, z, User)] === bval) {
            Q.push({ x: x, y: y-1 });
          }
          if(y + 1<brainHeight && vol[me._sliceXYZ2index(x, y + 1, z, User)] === bval) {
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
      if(typeof atlas.data === 'undefined') {
        tracer.log("ERROR: No atlas to draw into");

        return;
      }

      const coord = { "x": x, "y": y, "z": User.slice };
      if(User.x0<0) {
        User.x0 = coord.x;
        User.y0 = coord.y;
      }

      switch(c) {
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
        User.x0-=1;
        break;
      case 'f': // Fill, painting
        me.fill(coord.x, coord.y, coord.z, User.penValue, User, undoLayer);
        User.x0-=1;
        break;
      case 'mu': // Mouse up (touch ended)
        me.pushUndoLayer(User);
        User.x0-=1;
        break;
      case 'u':
        me.undo(User);
        User.x0-=1;
        break;
      }
    },

    //========================================================================================
    // MRI I/O
    //========================================================================================
    mulMatVec: function (m, v) {
      return [
        m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
        m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
        m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2]
      ];
    },
    invMat: function (m) {
      const w = [[], [], []];
      const det = m[0][1]*m[1][2]*m[2][0] + m[0][2]*m[1][0]*m[2][1] + m[0][0]*m[1][1]*m[2][2] - m[0][2]*m[1][1]*m[2][0] - m[0][0]*m[1][2]*m[2][1] - m[0][1]*m[1][0]*m[2][2];

      w[0][0] = (m[1][1]*m[2][2] - m[1][2]*m[2][1])/det;
      w[0][1] = (m[0][2]*m[2][1] - m[0][1]*m[2][2])/det;
      w[0][2] = (m[0][1]*m[1][2] - m[0][2]*m[1][1])/det;

      w[1][0] = (m[1][2]*m[2][0] - m[1][0]*m[2][2])/det;
      w[1][1] = (m[0][0]*m[2][2] - m[0][2]*m[2][0])/det;
      w[1][2] = (m[0][2]*m[1][0] - m[0][0]*m[1][2])/det;

      w[2][0] = (m[1][0]*m[2][1] - m[1][1]*m[2][0])/det;
      w[2][1] = (m[0][1]*m[2][0] - m[0][0]*m[2][1])/det;
      w[2][2] = (m[0][0]*m[1][1] - m[0][1]*m[1][0])/det;

      return w;
    },
    subVecVec: function (a, b) {
      return [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
    },
    addVecVec: function (a, b) {
      return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    },
    computeS2VTransformation: function (mri) {

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
      const wori = mri.ori;
      // space directions are transposed!
      const v2w = [[], [], []];
      //for(b in mri.dir) for(a in mri.dir[b]) v2w[a][b] = mri.dir[b][a]; // transpose
      for(const b in mri.dir) {
        if({}.hasOwnProperty.call(mri.dir, b)) {
          for(const a in mri.dir[b]) {
            if({}.hasOwnProperty.call(mri.dir[b], a)) {
              v2w[a][b] = mri.dir[a][b]; // do not transpose
            }
          }
        }
      }
      const wpixdim = me.subVecVec(me.mulMatVec(v2w, [1, 1, 1]), me.mulMatVec(v2w, [0, 0, 0]));
      // min and max world coordinates
      const wvmax = me.addVecVec(me.mulMatVec(v2w, [mri.dim[0]-1, mri.dim[1]-1, mri.dim[2]-1]), wori);
      const wvmin = me.addVecVec(me.mulMatVec(v2w, [0, 0, 0]), wori);
      const wmin = [Math.min(wvmin[0], wvmax[0]), Math.min(wvmin[1], wvmax[1]), Math.min(wvmin[2], wvmax[2])];
      //        var wmax = [Math.max(wvmin[0], wvmax[0]), Math.max(wvmin[1], wvmax[1]), Math.max(wvmin[2], wvmax[2])];
      const w2s = [[1/Math.abs(wpixdim[0]), 0, 0], [0, 1/Math.abs(wpixdim[1]), 0], [0, 0, 1/Math.abs(wpixdim[2])]];

      // tracer.log(["v2w", v2w, "wori", wori, "wpixdim", wpixdim, "wvmax", wvmax, "wvmin", wvmin, "wmin", wmin, "wmax", wmax, "w2s", w2s]);

      const [i, j, k] = v2w;
      let mi = { i: 0, v: 0 }; i.forEach(function(o, n) { if(Math.abs(o)>Math.abs(mi.v)) { mi = { i: n, v: o }; } });
      let mj = { i: 0, v: 0 }; j.forEach(function(o, n) { if(Math.abs(o)>Math.abs(mj.v)) { mj = { i: n, v: o }; } });
      let mk = { i: 0, v: 0 }; k.forEach(function(o, n) { if(Math.abs(o)>Math.abs(mk.v)) { mk = { i: n, v: o }; } });

      mri.s2v = {
        // old s2v fields
        s2w: me.invMat(w2s),
        sdim: [],
        sori: [-wmin[0]/Math.abs(wpixdim[0]), -wmin[1]/Math.abs(wpixdim[1]), -wmin[2]/Math.abs(wpixdim[2])],
        w2v: me.invMat(v2w),
        wori: wori,

        // new s2v transformation
        x: mi.i, // correspondence between space coordinate x and voxel coordinate i
        y: mj.i, // same for y
        z: mk.i, // same for z
        dx: (mi.v>0)?1: (-1), // direction of displacement in space coordinate x with displacement in voxel coordinate i
        dy: (mj.v>0)?1: (-1), // same for y
        dz: (mk.v>0)?1: (-1), // same for z
        X: (mi.v>0)?0: (mri.dim[0]-1), // starting value for space coordinate x when voxel coordinate i starts
        Y: (mj.v>0)?0: (mri.dim[1]-1), // same for y
        Z: (mk.v>0)?0: (mri.dim[2]-1) // same for z
      };
      mri.v2w = v2w;
      mri.wori = wori;
      [mri.s2v.sdim[mi.i], mri.s2v.sdim[mj.i], mri.s2v.sdim[mk.i]] = mri.dim;
    },
    // testS2VTransformation: function (mri) {
    //     //  check the S2V transformation to see if it looks correct.
    //     //  If it does not, reset it
    //     var doReset = false;

    //     tracer.log("    Transformation TEST:");

    //     if(me.debug) {
    //         process.stdout.write("  1. transformation volume: ");
    //     }
    //     var vv = mri.dim[0]*mri.dim[1]*mri.dim[2];
    //     var vs = mri.s2v.sdim[0]*mri.s2v.sdim[1]*mri.s2v.sdim[2];
    //     var diff = (vs-vv)/vv;
    //     if(Math.abs(diff)>0.001) {
    //         doReset = true;
    //         if(me.debug) {
    //             tracer.log("    fail. Voxel volume:", vv, "Screen volume:", vs, "Difference (%):", diff);
    //         }
    //     } else {
    //         if(me.debug) {
    //             tracer.log("    ok");
    //         }
    //     }

    //     if(me.debug) {
    //         process.stdout.write("  2. transformation origin: ");
    //     }
    //     if(    mri.s2v.sori[0]<0||mri.s2v.sori[0]>mri.s2v.sdim[0] ||
    //         mri.s2v.sori[1]<0||mri.s2v.sori[1]>mri.s2v.sdim[1] ||
    //         mri.s2v.sori[2]<0||mri.s2v.sori[2]>mri.s2v.sdim[2]) {
    //         doReset = true;
    //         if(me.debug) {
    //             tracer.log("    fail");
    //         }
    //     } else {
    //         if(me.debug) {
    //             tracer.log("    ok");
    //         }
    //     }

    //     if(doReset) {
    //         tracer.log("    FAIL: TRANSFORMATION WILL BE RESET");
    //         tracer.log(mri.dir);
    //         tracer.log(mri.ori);
    //         mri.dir = [[mri.pixdim[0], 0, 0], [0, -mri.pixdim[1], 0], [0, 0, -mri.pixdim[2]]];
    //         mri.ori = [0, mri.dim[1]-1, mri.dim[2]-1];
    //         me.computeS2VTransformation(mri);

    //         if(me.debug>2) {
    //             tracer.log("dir", mri.dir);
    //             tracer.log("ori", mri.ori);
    //             tracer.log("s2v", mri.s2v);
    //         }
    //     } else {
    //         tracer.log("    ok");
    //     }
    // },
    _filetypeFromFilename: function (mriPath) {
      if(mriPath.match(/.nii.gz$/)) {
        return "nii.gz";
      } else
      if(mriPath.match(/.mgz$/)) {
        return "mgz";
      }
    },
    _readNiftiHeader: function ({nii, mri}) {
      // read standard nii header
      let success = true;
      try {
        me.NiiHdr.allocate();
        me.NiiHdr._setBuff(nii);
        const h = JSON.parse(JSON.stringify(me.NiiHdr.fields));

        //var sizeof_hdr = h.sizeof_hdr;
        mri.dim = [h.dim[1], h.dim[2], h.dim[3]];
        mri.pixdim = [h.pixdim[1], h.pixdim[2], h.pixdim[3]];
        // eslint-disable-next-line camelcase
        mri.vox_offset = h.vox_offset;

        // nrrd-compatible header, computes space directions and space origin
        if(h.sform_code>0) {
          mri.dir = [
            [h.srow_x[0], h.srow_y[0], h.srow_z[0]],
            [h.srow_x[1], h.srow_y[1], h.srow_z[1]],
            [h.srow_x[2], h.srow_y[2], h.srow_z[2]]
          ];
          mri.ori = [h.srow_x[3], h.srow_y[3], h.srow_z[3]];
        } else {
          mri.dir = [[mri.pixdim[0], 0, 0], [0, mri.pixdim[1], 0], [0, 0, mri.pixdim[2]]];
          mri.ori = [0, 0, 0];
        }
      } catch(err) {
        tracer.log("ERROR Cannot read nifti header:", err);
        success = false;
      }

      return success;
    },
    _readNiftiData: function ({nii, mri}) {
      let success = true;
      let j;
      let tmp;

      switch(mri.datatype) {
      case 2: // UCHAR
        mri.data = nii.slice(mri.vox_offset);
        break;
      case 4: // SHORT
        tmp = nii.slice(mri.vox_offset);
        mri.data = new Int16Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
        for(j = 0; j<mri.dim[0]*mri.dim[1]*mri.dim[2]; j += 1) {
          mri.data[j] = tmp.readInt16LE(j*2);
        }
        break;
      case 8: // INT
        tmp = nii.slice(mri.vox_offset);
        mri.data = new Uint32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
        for(j = 0; j<mri.dim[0]*mri.dim[1]*mri.dim[2]; j += 1) {
          mri.data[j] = tmp.readUInt32LE(j*4);
        }
        break;
      case 16: // FLOAT
        tmp = nii.slice(mri.vox_offset);
        mri.data = new Float32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
        for(j = 0; j<mri.dim[0]*mri.dim[1]*mri.dim[2]; j += 1) {
          mri.data[j] = tmp.readFloatLE(j*4);
        }
        break;
      case 64: // FLOAT64
        tmp = nii.slice(mri.vox_offset);
        mri.data = new Float64Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
        for(j = 0; j<mri.dim[0]*mri.dim[1]*mri.dim[2]; j += 1) {
          mri.data[j] = tmp.readDoubleLE(j*8);
        }
        break;
      case 256: // INT8
        tmp = nii.slice(mri.vox_offset);
        mri.data = new Int8Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
        for(j = 0; j<mri.dim[0]*mri.dim[1]*mri.dim[2]; j += 1) {
          mri.data[j] = tmp.readInt8(j);
        }
        break;
      case 512: // UINT16
        tmp = nii.slice(mri.vox_offset);
        mri.data = new Uint16Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
        for(j = 0; j<mri.dim[0]*mri.dim[1]*mri.dim[2]; j += 1) {
          mri.data[j] = tmp.readUInt16LE(j*2);
        }
        break;
      default:
        success = false;
        tracer.log("ERROR: Unknown dataType: " + mri.datatype);
      }

      return success;
    },
    _computeVolumeStats: function ({mri}) {
      let sum = 0;
      let [min, max] = [mri.data[0], mri.data[0]];
      for(let i = 0; i<mri.dim[0]*mri.dim[1]*mri.dim[2]; i += 1) {
        sum += mri.data[i];

        if(mri.data[i]<min) {
          min = mri.data[i];
        }

        if(mri.data[i]>max) {
          max = mri.data[i];
        }
      }
      [mri.sum, mri.min, mri.max] = [sum, min, max];
    },
    readNifti: function (mriPath) {

      /*
                readNifti
                input: path to a .nii.gz file
                output: an mri structure
            */

      const pr = new Promise(function (resolve, reject) {
        let niigz;

        try {
          niigz = fs.readFileSync(mriPath);
        } catch(e) {
          reject(e);
        }

        try {
          zlib.gunzip(niigz, function (err, nii) {
            if(err) {
              reject(err);

              return;
            }

            const mri = {};

            // read header
            if(!me._readNiftiHeader({nii, mri})) {
              reject(new Error("Cannot read nifti header"));

              return;
            }

            // compute the transformation from voxel space to screen space
            me.computeS2VTransformation(mri);

            // test if the transformation looks incorrect. Reset it if it does
            //testS2VTransformation(mri);

            // manually parsed information
            mri.hdr = nii.slice(0, 352);
            mri.hdrSz = 352;
            mri.datatype = nii.readUInt16LE(70);

            // read binary data
            if(!me._readNiftiData({nii, mri})) {
              reject(new Error("Cannot read nifti binary data"));

              return;
            }

            // compute stats: sum, min and max
            me._computeVolumeStats({mri});

            resolve(mri);
          });
        } catch(e) {
          reject(e);
        }
      });

      return pr;
    },
    _readMGZHeader: function({mgh, mri, hdr}) {
      let success = true;

      me.MghHdr.allocate();
      me.MghHdr._setBuff(mgh);
      const h = JSON.parse(JSON.stringify(me.MghHdr.fields));
      for(const prop in h) {
        if({}.hasOwnProperty.call(h, prop)) {
          hdr[prop] = h[prop];
        }
      }

      // Test Header
      if(h.v<1 || h.v>100) {
        tracer.log("ERROR: Wrong MGH Header", h);
        success = false;
      } else {
        // Equations from freesurfer/matlab/load_mgh.m
        const PcrsC = [h.ndim1/2, h.ndim2/2, h.ndim3/2];
        //var D = [[h.delta[0], 0, 0], [0, h.delta[1], 0], [0, 0, h.delta[2]]];
        const MdcD = [
          [h.Mdc[0]*h.delta[0], h.Mdc[3]*h.delta[1], h.Mdc[6]*h.delta[2]],
          [h.Mdc[1]*h.delta[0], h.Mdc[4]*h.delta[1], h.Mdc[7]*h.delta[2]],
          [h.Mdc[2]*h.delta[0], h.Mdc[5]*h.delta[1], h.Mdc[8]*h.delta[2]]
        ];
        const Pxyz0 = me.subVecVec(h.Pxyz_c, me.mulMatVec(MdcD, PcrsC));
        const M = [
          h.Mdc[0]*h.delta[0], h.Mdc[3]*h.delta[1], h.Mdc[6]*h.delta[2], Pxyz0[0],
          h.Mdc[1]*h.delta[0], h.Mdc[4]*h.delta[1], h.Mdc[7]*h.delta[2], Pxyz0[1],
          h.Mdc[2]*h.delta[0], h.Mdc[5]*h.delta[1], h.Mdc[8]*h.delta[2], Pxyz0[2],
          0, 0, 0, 1
        ];

        mri.dim = [h.ndim1, h.ndim2, h.ndim3];
        mri.pixdim = [h.delta[0], h.delta[1], h.delta[2]];
        mri.dir = [[M[0], -M[1], -M[2]], [M[4], -M[5], -M[6]], [M[8], -M[9], -M[10]]];
        mri.ori = [M[3], M[7], M[11]];
      }

      return success;
    },
    _readMGZData: function ({mgh, mri, hdr}) {
      let success = true;
      const hdrSize = 284;
      let tmp;

      const sz = mri.dim[0]*mri.dim[1]*mri.dim[2];
      const bpv = [1, 4, 0, 4, 2][hdr.type]; // bytes per voxel

      // keep the header
      mri.hdr = mgh.slice(0, hdrSize);
      mri.hdrSz = hdrSize;

      // keep the footer
      const ftrSz = mgh.length-hdrSize-sz*bpv;
      mri.ftr = mgh.slice(hdrSize + sz*bpv);

      // print info
      // tracer.log("    mgh.length:", mgh.length);
      // tracer.log("       hdrSize:", hdrSize);
      // tracer.log("        sz*bpv:", sz*bpv);
      // tracer.log("         ftrSz:", ftrSz);
      // tracer.log("mri.ftr.length:", mri.ftr.length);

      switch(hdr.type) {
      case 0: // MGHUCHAR
        mri.data = mgh.slice(hdrSize, -ftrSz);
        break;
      case 1: // MGHINT
        tmp = mgh.slice(hdrSize, -ftrSz);
        mri.data = new Uint32Array(sz);
        for(let j = 0; j<sz; j += 1) {
          mri.data[j] = tmp.readUInt32BE(j*4);
        }
        break;
      case 3: // MGHFLOAT
        tmp = mgh.slice(hdrSize, -ftrSz);
        mri.data = new Float32Array(sz);
        for(let j = 0; j<sz; j += 1) {
          mri.data[j] = tmp.readFloatBE(j*4);
        }
        break;
      case 4: // MGHSHORT
        tmp = mgh.slice(hdrSize, -ftrSz);
        mri.data = new Int16Array(sz);
        for(let j = 0; j<sz; j += 1) {
          mri.data[j] = tmp.readInt16BE(j*2);
        }
        break;
      default:
        success = false;
        tracer.log("ERROR: Unknown dataType: " + hdr.type);
      }

      return success;
    },

    /*
            readMGZ
            input: path to a .mgz file
            output: an mri structure
        */
    readMGZ: function (mriPath) {
      const pr = new Promise(function (resolve, reject) {
        try {

        /*
          MGZ data sometimes has an error which makes gunzip throw
          a "invalid compressed data--crc error" message. However,
          the data is correctly uncompressed. We will ignore errors.
        */

          var bufs = [];
          const readable = fs.createReadStream(mriPath).pipe(zlib.createGunzip());
          readable.on('data', function(d) { bufs.push(d); });
          readable.on('error', function (err) {
            if (err.code === "Z_DATA_ERROR") {
              readable.emit("end");
            } else {
              reject(err);
            }
          });
          readable.on('end', function() {
            const mgh = Buffer.concat(bufs);
            const mri = {};
            const hdr = {};

            // read header
            if(!me._readMGZHeader({mgh, mri, hdr})) {
              reject(new Error("Failed to read MGZ header"));

              return;
            }

            // compute the transformation from voxel space to screen space
            me.computeS2VTransformation(mri);

            // test if the transformation looks incorrect. Reset it if it does
            //testS2VTransformation(mri);

            // read binary data
            if(!me._readMGZData({mgh, mri, hdr})) {
              reject(new Error("Failed to read MGZ binary data"));

              return;
            }

            // compute volume stats
            me._computeVolumeStats({mri});

            resolve(mri);
          });
        } catch(e) {
          reject(new Error("ERROR Cannot uncompress mgz file: ", e));
        }
      });

      return pr;
    },

    /*
            createNifti
            input: a template mri structure
            output: a new empty mri structure, datatype = 2 (1 byte per voxel), same dimensions as template
        */
    createNifti: function (templateMRI) {

      /*eslint-disable camelcase*/
      const mri = {};
      const props = ["dim", "pixdim", "hdr"];
      const datatype = 2;
      const vox_offset = 352;
      let i;
      const newHdr = {
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
        datatype: 2, // uchar
        bitpix: 8,
        slice_start: 0,
        pixdim: [-1, templateMRI.pixdim[0], templateMRI.pixdim[1], templateMRI.pixdim[2], 0, 1, 1, 1],
        vox_offset: 352,
        scl_slope: 1,
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
        magic: 'n+1\0'
      };
      /*eslint-enable camelcase*/

      me.NiiHdr.allocate();
      const niihdr = me.NiiHdr.buffer();
      for(i in newHdr) {
        if({}.hasOwnProperty.call(newHdr, i)) {
          me.NiiHdr.fields[i] = newHdr[i];
        }
      }

      // copy information from templateMRI
      for( i in props) {
        if({}.hasOwnProperty.call(props, i)) {
          mri[props[i]] = templateMRI[props[i]];
        }
      }

      // get volume size
      const sz = mri.dim[0]*mri.dim[1]*mri.dim[2];

      // update the header
      mri.hdr = niihdr;
      mri.hdr.writeUInt16LE(datatype, 70, 2); // set datatype to 2:unsigned char (8 bits/voxel)
      mri.hdr.writeFloatLE(vox_offset, 108, 4); // set voxel_offset to 352 (minimum size of a nii header)
      // eslint-disable-next-line camelcase
      mri.hdrSz = vox_offset;

      // zero the data
      mri.data = Buffer.alloc(sz);
      for(i = 0; i<sz; i += 1) {
        mri.data[i] = 0;
      }

      // zero statistics
      mri.sum = 0;
      mri.min = 0;
      mri.max = 0;

      return Promise.resolve(mri);
    },
    loadMRI: function (mriPath) {

      /*
                loadMRI
                input: path to an mri file, .nii.gz and .mgz formats are recognised
                output: an mri structure
            */
      const pr = new Promise(function (resolve, reject) {
        switch(me._filetypeFromFilename(mriPath)) {
        case "nii.gz":
          tracer.log("reading nii");
          me.readNifti(mriPath)
            .then(function (mri) {
              resolve(mri);
            })
            .catch(function (err) {
              reject(err);
            });
          break;
        case "mgz":
          tracer.log("reading mgz");
          me.readMGZ(mriPath)
            .then(function(mri) {
              resolve(mri);
            })
            .catch(function (err) {
              tracer.log("ERROR reading mgz file:", err);
              reject(err);
            });
          break;
        default:
          tracer.log("ERROR: nothing we can read");
          reject(new Error("ERROR: nothing we can read"));
        }
      });

      return pr;
    },

    //========================================================================================
    // DB querying
    //========================================================================================
    queryUserName: function (data) {
      return new Promise(function(resolve, reject) {
        if (data.metadata && data.metadata.nickname) {
          db.get('user')
            .find(
              { "nickname": { '$regex': data.metadata.nickname }},
              { fields: ["nickname", "name"], limit: 10 })
            .then(function(obj) {
              resolve(obj);
            }
            );
        } else if (data.metadata && data.metadata.name) {
          db.get('user')
            .find(
              { "name": { '$regex': data.metadata.name }},
              { fields: ["nickname", "name"], limit: 10 })
            .then(function(obj) {
              resolve(obj);
            });
        } else {
          reject(new Error("Can't find user"));
        }
      });
    },
    queryProjectName: function (data) {
      return new Promise(function(resolve, reject) {
        if (data.metadata && data.metadata.name) {
          db.get('project')
            .findOne({
              shortname: data.metadata.name,
              backup: { $exists: 0 }
            }, {
              fields: ["name", "shortname"]
            })
            .then(function(obj) {
              resolve(obj);
            });
        } else {
          reject(new Error("Bad metadata"));
        }
      });
    },
    querySimilarProjectNames: function (data) {
      return new Promise(function(resolve, reject) {
        if (data.metadata && data.metadata.projectName) {
          db.get('project')
            .find({
              shortname: { $regex: data.metadata.projectName },
              backup: { $exists: 0 }
            }, {
              fields: ["name", "shortname"],
              limit: 10
            })
            .then(function(obj) {
              resolve(obj);
            });
        } else {
          reject(new Error("can't find similar project names"));
        }
      });
    },
    getBrainAtPath: function (brainPath) {

      /*
                getBrainAtPath
                input: A client-side path identifying the requested brain
                process: a brain is obtained, and added to the me.Brains[] array if it
                        wasn't already loaded.
                output: a brain (mri structure)
            */
      for(const i in me.Brains) {
        if({}.hasOwnProperty.call(me.Brains, i)) {
          if(me.Brains[i].path === brainPath) {
            if(me.debug>1) {
              tracer.log("brain already loaded");
            }

            return Promise.resolve(me.Brains[i].data);
          }
        }
      }

      const pr = new Promise(function (resolve, reject) {
        me.loadMRI(me.dataDirectory + brainPath)
          .then(function (mri) {
            const brain = { path: brainPath, data: mri };
            me.Brains.push(brain);
            resolve(mri); // callback: sendSliceToUser
          })
          .catch(function (err) {
            tracer.log("ERROR: getBrainAtPath cannot load brain. Corrupted file?", err);
            reject(err);
          });
      });

      return pr;
    },

    //========================================================================================
    // Volume slice server
    //========================================================================================
    drawSlice: function (brain, view, slice) {
      let x, y;
      let i, j;
      let brainWidth;
      let brainHeight; //, brainD;
      let ya, yc, ys;
      let val;
      let s;
      const {s2v} = brain;

      switch(view) {
      case 'sag': [brainWidth, brainHeight] = [s2v.sdim[1], s2v.sdim[2]]; break; //brainD = s2v.sdim[0]; break; // sagital
      case 'cor': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[2]]; break; //brainD = s2v.sdim[1]; break; // coronal
      case 'axi': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[1]]; break; //brainD = s2v.sdim[2]; break; // axial
      }

      const frameData = Buffer.alloc(brainWidth * brainHeight * 4);

      j = 0;
      switch(view) {
      case 'sag': ys = slice; break;
      case 'cor': yc = slice; break;
      case 'axi': ya = slice; break;
      }

      for(y = 0; y<brainHeight; y += 1) {
        for(x = 0; x<brainWidth; x += 1) {
          switch(view) {
          case 'sag': s = [ys, x, s2v.sdim[2]-1-y]; break;
          case 'cor': s = [x, yc, s2v.sdim[2]-1-y]; break;
          case 'axi': s = [x, s2v.sdim[1]-1-y, ya]; break;
          }
          i = me._screen2index(s, brain);

          val = 255*(brain.data[i]-brain.min)/(brain.max-brain.min);
          frameData[4*j + 0] = val; // red
          frameData[4*j + 1] = val; // green
          frameData[4*j + 2] = val; // blue
          frameData[4*j + 3] = 0xFF; // alpha - ignored in JPEGs
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
      const {s2v} = brain;
      const t = 0.5;

      switch(view) {
      case 'sag': [brainWidth, brainHeight] = [s2v.sdim[1], s2v.sdim[2]]; break; //brainD = s2v.sdim[0]; break; // sagital
      case 'cor': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[2]]; break; //brainD = s2v.sdim[1]; break; // coronal
      case 'axi': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[1]]; break; //brainD = s2v.sdim[2]; break; // axial
      }

      const frameData = Buffer.alloc(brainWidth * brainHeight * 4);

      j = 0;
      switch(view) {
      case 'sag': ys = slice; break;
      case 'cor': yc = slice; break;
      case 'axi': ya = slice; break;
      }

      for(y = 0; y<brainHeight; y += 1) {
        for(x = 0; x<brainWidth; x += 1) {
          switch(view) {
          case 'sag': s = [ys, x, s2v.sdim[2]-1-y]; break;
          case 'cor': s = [x, yc, s2v.sdim[2]-1-y]; break;
          case 'axi': s = [x, s2v.sdim[1]-1-y, ya]; break;
          }
          i = me._screen2index(s, brain);

          // brain data
          val = (brain.data[i]-brain.min)/(brain.max-brain.min);

          // atlas data
          if(atlas.data[i]) {
            rgb = me.colormap[atlas.data[i]];
            if(!rgb || !rgb.r) {
              frameData[4*j + 0] = 0;
              frameData[4*j + 0] = 255;
              frameData[4*j + 0] = 0;
            } else {
              frameData[4*j + 0] = t*rgb.r + (1-t)*rgb.r*val; // red
              frameData[4*j + 1] = t*rgb.g + (1-t)*rgb.g*val; // green
              frameData[4*j + 2] = t*rgb.b + (1-t)*rgb.b*val; // blue
            }
          } else {
            frameData[4*j + 0] = 255*val; // red
            frameData[4*j + 1] = 255*val; // green
            frameData[4*j + 2] = 255*val; // blue
          }
          frameData[4*j + 3] = 0xFF; // alpha - ignored in JPEGs
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
      const {c, x, y} = msg; // command, x coordinate, y coordinate
      const undoLayer = me.getCurrentUndoLayer(sourceUS.User); // current undoLayer for user

      me.paintxy(sourceUS.uid, c, x, y, sourceUS.User, undoLayer);
    },
    receiveVectorialAnnotationMessage: function (message) {
      const {data} = message;
      const sourceUS = me.getUserFromUserId(message.uid); // source user data
      me.updateVectorialAnnotations(data, sourceUS.User);
    },
    sendSliceToUser: function (brain, view, slice, userSocket) {
      try {
        const jpegImageData = me.drawSlice(brain, view, slice);
        const length = jpegImageData.data.length + me.jpgTag.length;
        const bin = Buffer.concat([jpegImageData.data, me.jpgTag], length);
        userSocket.send(bin, { binary: true, mask: false });
      } catch(e) {
        tracer.log("ERROR: Cannot send slice to user");
      }
    },
    receiveRequestSliceMessage: function (data, userSocket) {
      // get slice information from message
      const {view} = data; // user view
      const slice = parseInt(data.slice, 10); // user slice

      // get User object
      const sourceUS = me.getUserFromUserId(data.uid);

      // get brainPath from User object
      const brainPath = sourceUS.User.dirname + sourceUS.User.mri;

      // update User object
      sourceUS.User.view = view;
      sourceUS.User.slice = slice;
      if(me.debug>1) {
        tracer.log("view, slice:", sourceUS.User.view, sourceUS.User.slice);
      }

      // getBrainAtPath() uses a client-side path, starting with "/data/[md5hash]"
      me.getBrainAtPath(brainPath)
        .then(function (theData) {
          me.sendSliceToUser(theData, view, slice, userSocket);
        });
    },
    receiveRequestSlice2Message: function (data, userSocket) {
      const {view} = data; // user view
      const slice = parseInt(data.slice, 10); // user slice
      const sourceUS = me.getUserFromUserId(data.uid);
      const brainPath = sourceUS.User.dirname + sourceUS.User.mri;
      const {dirname, atlasFilename} = sourceUS.User;
      let atlas;

      sourceUS.User.view = view;
      sourceUS.User.slice = slice;
      if(me.debug>1) {
        tracer.log("view, slice:", sourceUS.User.view, sourceUS.User.slice);
      }

      me.getBrainAtPath(brainPath)
        .then(function (brain) {
          const iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
          if(typeof iAtlas !== "undefined") {
            atlas = me.Atlases[iAtlas];
          }

          try {
            const jpegImageData = me.drawSlice2(brain, atlas, view, slice); // TEST: to draw the server version of the atlas together with the anatomy
            const length = jpegImageData.data.length + me.jpgTag.length;
            const bin = Buffer.concat([jpegImageData.data, me.jpgTag], length);
            userSocket.send(bin, { binary: true, mask: false });
          } catch(e) {
            tracer.log("ERROR: Cannot send slice to user", e);
          }
        });
    },
    broadcastMessage: function (msg, uid) {
      let n = 0;
      for(const i in me.US) {
        if({}.hasOwnProperty.call(me.US, i)) {
          if(me.US[i].uid !== uid && me.US[i].socket.readyState === WebSocket.OPEN) {
            try {
              me.US[i].socket.send(JSON.stringify(msg));
              n += 1;
            } catch (ex) {
              tracer.log(`WARNING: Unable to broadcast message from ${uid} to ${me.US[i].uid}`, ex, msg);
            }
          }
        }
      }
      if(me.debug) {
        tracer.log("    message broadcasted to " + n + " users", msg);
      }
    },
    receiveSaveMessage: async function (data) {
      const sourceUS = me.getUserFromUserId(data.uid);
      const {dirname, atlasFilename} = sourceUS.User;
      const time = new Date();

      const iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
      if(typeof iAtlas === "undefined") {
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
        dialogType: "notification",
        msg: "Atlas saved " + time
      });

      /** @todo Log the save */
    },
    receiveSaveMetadataMessage: function (data) {
      if(me.debug>1) {
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

      if(data.method === "patch") {
        // deal with patches

        // get original object from db
        db.get('mri').findOne({ source: json.source, backup: { $exists: 0 }}, { _id: 0 })
          .then(function (ret) {
            delete ret._id;
            // apply patch
            jsonpatch.applyPatch( ret, data.patch );
            // sanitise
            ret = JSON.parse(DOMPurify.sanitize(JSON.stringify(ret))); // sanitize works on strings, not objects
            // mark previous as backup
            db.get('mri').update({ source: json.source }, { $set: { backup: true }}, { multi: true })
              .then(function () {
                // insert new
                db.get('mri').insert(ret);
              });
          });
      } else {
        // deal with the complete object

        // sanitise json
        json = JSON.parse(DOMPurify.sanitize(JSON.stringify(json))); // sanitize works on strings, not objects
        // DEBUG:
        if(me.debug>1) {
          tracer.log("metadata:", JSON.stringify(json));
        }

        // mark previous one as backup
        db.get('mri').findOne({ source: json.source, backup: { $exists: 0 }})
          .then(function (ret) {
            // DEBUG: tracer.log("original mri:", JSON.stringify(ret));

            db.get('mri').update({ source: json.source }, { $set: { backup: true }}, { multi: true })
              .then(function () {
                if(data.method === "overwrite") {
                  db.get('mri').insert(json);
                } else {
                  json = merge.recursive(ret, json);
                  delete json._id;
                  db.get('mri').insert(json);
                }
                // DEBUG: tracer.log("inserted mri:", JSON.stringify(json));
              });
          });
      }
    },
    receiveAtlasFromUserMessage: async function (data) {
      const atlasData = await new Promise((resolve, reject) => {
        zlib.inflate(data.data, function (err, result) {
          if(err) {
            return reject(new Error(err));
          }
          resolve(result);
        });
      });

      // Save current atlas
      const sourceUS = me.getUserFromUserId(data.uid);
      const {iAtlas} = sourceUS.User;
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
      for(const i in me.Brains) {
        if({}.hasOwnProperty.call(me.Brains, i)) {
          const sum = me.numberOfUsersConnectedToMRI(me.Brains[i].path);

          if(sum === 0) {
            tracer.log("    No user connected to MRI " + me.Brains[i].path + ": unloading it");
            me.unloadMRI(me.Brains[i].path);
          }
        }
      }
    },
    unloadUnusedAtlases: async function () {
      const results = [];
      for(const i in me.Atlases) {
        if({}.hasOwnProperty.call(me.Atlases, i)) {
          const sum = me.numberOfUsersConnectedToAtlas(me.Atlases[i].dirname, me.Atlases[i].filename);
          if(sum === 0) {
            tracer.log("No user connected to Atlas " + me.Atlases[i].dirname + me.Atlases[i].filename + ": unloading it");
            results.push(me.unloadAtlas(me.Atlases[i].dirname, me.Atlases[i].filename));
          }
        }
      }
      try {
        await Promise.all(results);
      } catch(err) {
        throw new Error("Can't unload atlases", err);
      }
    },
    _sendAtlasVoxelDataToUser: function (atlasdata, userSocket, flagCompress) {
      if(flagCompress) {
        zlib.gzip(atlasdata, function (err, atlasdatagz) {
          if(err) {
            console.error("ERROR:", err);

            return;
          }
          if(userSocket.readyState !== WebSocket.OPEN) {
            const targetUS = me.getUserFromSocket(userSocket);
            tracer.log(`WARNING: Not broadcastinig to user ${targetUS.uid} because it's disconnecting`);

            return;
          }
          try {
            userSocket.send(Buffer.concat([atlasdatagz, me.niiTag]), { binary: true, mask: false });
          } catch(e) {
            console.error("<WARNING: Cannot send atlas data to user. Maybe already disconnected? (1)>", e);
          }
        });
      } else {
        try {
          userSocket.send(Buffer.concat([atlasdata, me.niiTag]), { binary: true, mask: false });
        } catch(e) {
          console.error("<WARNING: Cannot send atlas data to user. Maybe already disconnected? (2)>", e);
        }
      }
    },
    _sendAtlasVectorialDataToUser: function (data, userSocket) {
      try {
        const cleanData = DOMPurify.sanitize(JSON.stringify({type: "vectorial", data}));
        userSocket.send(cleanData);
      } catch(e) {
        console.error("<WARNING: Cannot send atlas data to user. Maybe already disconnected? (1)>", e);
      }
    },
    sendAtlasToUser: function (atlas, userSocket, flagCompress) {
      me._sendAtlasVoxelDataToUser(atlas.data, userSocket, flagCompress);
      if(typeof atlas.vectorial === "undefined") {
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
    loadAtlas: function loadAtlas(User) {
      const pr = new Promise(function (resolve, reject) {
        const mriPath = me.dataDirectory + User.dirname + User.atlasFilename;

        if(typeof User.dirname === 'undefined') {
          tracer.log("ERROR: Rejecting loadAtlas from undefined User.dirname:", User);
          reject(new Error("ERROR: Rejecting loadAtlas from undefined User"));

          return;
        }
        if(typeof User.atlasFilename === 'undefined') {
          tracer.log("ERROR: Rejecting loadAtlas from undefined User.atlasFilename:", User);
          reject(new Error("ERROR: Rejecting loadAtlas from undefined User"));

          return;
        }

        if(!fs.existsSync(mriPath)) {
          // Create new empty atlas
          tracer.log("    Atlas " + mriPath + " does not exists. Create a new one");
          const brainPath = User.dirname + User.mri;
          me.getBrainAtPath(brainPath)
            .then(function (mri) {
              me.createNifti(mri)
                .then(function (newAtlas) {
                  newAtlas.filename = User.atlasFilename;
                  newAtlas.dirname = User.dirname;
                  newAtlas.source = User.source;

                  // log atlas creation
                  db.get('log').insert({
                    key: "createAtlas",
                    value: DOMPurify.sanitize(JSON.stringify({ atlasDirectory: User.dirname, atlasFilename: User.atlasFilename })),
                    username: User.username,
                    date: (new Date()).toJSON()
                  });

                  resolve(newAtlas);
                })
                .catch(function (err) {
                  tracer.log("ERROR Cannot create nifti", err);
                  reject(err);
                });
            })
            .catch(function (err) {
              tracer.log("ERROR Cannot get template brain for new atlas", err);
              reject(err);
            });
        } else {
          // Load existing atlas
          tracer.log("    Atlas found. Loading it");
          me.loadMRI(mriPath)
            .then(async function (loadedAtlas) {
              loadedAtlas.filename = User.atlasFilename;
              loadedAtlas.dirname = User.dirname;
              loadedAtlas.source = User.source;

              const mri = await db.get('mri').findOne({source: loadedAtlas.source, backup:{$exists:0}}, {_id:0});
              let index = -1;
              for(let i=0; i<mri.mri.atlas.length; i++) {
                if(mri.mri.atlas[i].filename === loadedAtlas.filename) {
                  index = i;
                  break;
                }
              }
              if(index === -1) {
                throw new Error("Can't find atlas in mri");
              }
              if(typeof mri.mri.atlas[index].vectorial === "undefined") {
                loadedAtlas.vectorial = [];
              } else {
                loadedAtlas.vectorial = mri.mri.atlas[index].vectorial;
              }

              // cast atlas data to 8bits
              switch(me._filetypeFromFilename(User.atlasFilename)) {
              case "nii.gz":
                me.createNifti(loadedAtlas)
                  .then(function(atlas8bit) {
                    for(let i = 0; i<loadedAtlas.dim[0]*loadedAtlas.dim[1]*loadedAtlas.dim[2]; i += 1) {
                      atlas8bit.data[i] = loadedAtlas.data[i];
                    }
                    loadedAtlas.data = atlas8bit.data;
                    loadedAtlas.hdr = atlas8bit.hdr;
                    resolve(loadedAtlas);
                  });
                break;
              case "mgz":
                resolve(loadedAtlas);

                /*
                                createMGH(loadedAtlas)
                                .then(function(atlas8bit) {
                                });
    */
                break;
              }
            })
            .catch(function (err) {
              reject(err);
            });
        }
      });

      return pr;
    },

    _validateUserAtlas: function (atlas) {
      let validationOK = false;
      if(typeof atlas.name === "undefined") {
        tracer.log("WARNING: atlas does not have a filename");
      } else if(typeof atlas.dirname === "undefined") {
        tracer.log("WARNING: atlas does not have a directory name");
      } else if(typeof atlas.source === "undefined") {
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
      if(me._validateUserAtlas(atlas) === false) {
        tracer.log("WARNING: insufficient information provided for adding atlas", atlas);
      }
      tracer.log("User requests atlas " + atlas.filename + " from " + atlas.dirname, atlas.specimen);

      const pr = new Promise(function (resolve, reject) {
        me.loadAtlas(User)
          .then(function (theAtlas) {
            const {iAtlas} = me._findAtlas(theAtlas);
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

      if(typeof User === 'undefined') {
        firstConnectionFlag = true;
      } else if(User.isMRILoaded === false) {
        firstConnectionFlag = true;
      }

      return firstConnectionFlag;
    },
    _findAtlas: function ({dirname, atlasFilename}) {
      let atlasLoadedFlag = false;
      let iAtlas = me.indexOfAtlasAtPath(dirname, atlasFilename);
      if(typeof iAtlas !== "undefined") {
        atlasLoadedFlag = true;
      } else {
        iAtlas = `a${++me.atlascounter}`;
      }

      return {iAtlas, atlasLoadedFlag};
    },
    receiveUserDataMessage: function (data, userSocket) {
      const sourceUS = me.getUserFromUserId(data.uid);

      let User;
      const firstConnectionFlag = me._isUserFirstConnection(sourceUS.User);
      let switchingAtlasFlag = false;


      if(data.description === "allUserData" ) {
        // receiving the complete User data object
        User = data.user;
        User.uid = data.uid;
      } else {
        ({User} = sourceUS);
        if(data.description === "sendAtlas") {
          // receive an atlas from the user
          // 1. Check if the atlas the user is requesting has not been loaded

          // check whether user is switching atlas.
          switchingAtlasFlag = false;
          if(typeof sourceUS.User !== "undefined") {
            if((sourceUS.User.atlasFilename !== User.atlasFilename)||(sourceUS.User.dirname !== User.dirname)) {
              switchingAtlasFlag = true;
            }
          }

          if(typeof User === "undefined") {
            tracer.log(`WARNING: 'User' structure is not defined for ${data.uid}`);

            return;
          }

          const {iAtlas, atlasLoadedFlag} = me._findAtlas({dirname: User.dirname, atlasFilename: User.atlasFilename});
          User.iAtlas = iAtlas; // value i if it was found, or last available if it wasn't

          // 2. Send the atlas to the user (load it if required)
          if(atlasLoadedFlag) {
            if(firstConnectionFlag || switchingAtlasFlag) {
              // send the new user our data
              me.sendAtlasToUser(me.Atlases[iAtlas], userSocket, true);
              sourceUS.User.isMRILoaded = true;
            }
          } else {
            // The atlas requested has not been loaded before:
            // Load the atlas they requesting
            me.addAtlas(User)
              .then(function(atlas) {
                me.sendAtlasToUser(atlas, userSocket, true);
                sourceUS.User.isMRILoaded = true;
              })
              .catch((err) => console.log(new Error("ERROR: Unable to load atlas", err)));
          }
        } else {
          // receive a specific field of the User data object from the user
          /** @todo If the atlas/mri for the client failed to be sent, `User` is undefined */
          const changes = JSON.parse(data.description);
          for(const i in changes) {
            if({}.hasOwnProperty.call(changes, i)) {
              User[i] = changes[i];
            }
          }
        }
      }

      // 3. Update user data
      // If the user didn't have a name (wasn't logged in), but now has one,
      // display the name in the log
      if({}.hasOwnProperty.call(User, 'username')) {
        if(typeof sourceUS.User === 'undefined') {
          tracer.log(`No "User" data yet received for id ${data.uid}`);
        } else if(!{}.hasOwnProperty.call(sourceUS.User, 'username')) {
          tracer.log(`User ${User.username} (${data.uid}) logged in`);
        }
      }
      if({}.hasOwnProperty.call(sourceUS, 'User') === false) {
        sourceUS.User = {};
      }
      for(const prop in User) {
        if({}.hasOwnProperty.call(User, prop)) {
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
      if(data.description === "sendAtlas") {
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
      for(const i in me.US) {
        if({}.hasOwnProperty.call(me.US, i)) {
          if(me.US[i].socket === newUS.socket) {
            continue;
          }
          const msg = JSON.stringify({ type: "userData", user: me.US[i].User, uid: me.US[i].uid, description: "allUserData" });
          newUS.socket.send(msg);
          n += 1;
        }
      }
      if(me.debug) {
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
      process.stdin.on('keypress', function (ch, key) {
        if(key) {
          // tracer.log(ch, key);
          if(key.name === 'c' && key.ctrl) {
            tracer.log("Exit.");
            // eslint-disable-next-line no-process-exit
            process.exit();
          }
          if(key.name === 'escape') {
            me.enterCommands = !me.enterCommands;
            tracer.log("enterCommands: " + me.enterCommands);
          }
          if(key.name === 'backspace') {
            process.stdout.write('\b');
          }
          if(me.enterCommands === false) {
            if(key.name === 'return') {
              tracer.log();
            }
          }
        }

        if(ch) {
          if(me.enterCommands) {
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
      if(useWhitelist && !whitelist[ip]) {
        tracer.log("--------------------> REJECT ip not in whitelist", ip);
        isInBlacklist = true;
      }
      if(useBlacklist && blacklist[ip]) {
        tracer.log("--------------------> REJECT ip in blacklist", ip);
        isInBlacklist = true;
      }

      return isInBlacklist;
    },
    _handleUserWebSocketMessage: function ({data, ws}) {
      switch(data.type) {
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
          .then(function(obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch((err) => tracer.log(err));
        break;
      case "projectNameQuery":
        me.queryProjectName(data)
          .then(function(obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch(function(err) { tracer.log(err); });
        break;
      case "similarProjectNamesQuery":
        me.querySimilarProjectNames(data)
          .then(function(obj) {
            data.metadata = obj;
            ws.send(JSON.stringify(data)); // sender.send(JSON.stringify(data));
          })
          .catch(function(err) { tracer.log(err); });
        break;
      case "autocompleteClient":
        me.declareAutocompleteClient(data, ws); // sender);
        break;
      default:
        break;
      }
    },
    _fitsBroadcastExclusionCriteria: function ({sourceUS, targetUS}) {
      let exclude = false;

      if(sourceUS.uid === targetUS.uid) {
        // do not auto-broadcast
        exclude = true;
      } else if(sourceUS.autocompleteClient) {
        // do not broadcast to autocomplete clients
        exclude = true;
      } else if(typeof sourceUS.User === 'undefined' || typeof targetUS.User === 'undefined') {
        // do not broadcast to undefined users
        exclude = true;
      }

      return exclude;
    },
    _fitsBroadcastInclusionCriteria: function ({sourceUS, targetUS, data}) {
      let include = false;
      if ( targetUS.User.projectPage && targetUS.User.projectPage === sourceUS.User.projectPage) {
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
    _handleBroadcastWebSocketMessage: function ({data, sourceUS}) {
      // do not broadcast the following messages
      if(data.type === "requestSlice" ||
                data.type === "requestSlice2" ||
                (data.type === "userData" && data.description === "sendAtlas")) {

        return;
      }

      // scan through connected users
      for(const client of websocketserver.clients) {
        const targetUS = me.getUserFromSocket(client);

        // check exclusion criteria
        if(me._fitsBroadcastExclusionCriteria({sourceUS, targetUS})) {
          continue;
        }

        // check inclusion criteria
        if(!me._fitsBroadcastInclusionCriteria({sourceUS, targetUS, data})) {
          continue;
        }

        // do broadcast
        if(data.type === "atlas") {
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
    _handleWebSocketMessage: function ({msg, ws}) {
      // var sender = ws;
      const sourceUS = me.getUserFromSocket(ws);
      let data = {};

      // Handle binary data: a user uploaded an atlas file
      if(msg instanceof Buffer) {
        data.data = msg;
        data.type = "atlas";
      } else {
        data = JSON.parse(msg);
      }
      data.uid = sourceUS.uid;

      // Websocket traffic recorder
      if(me.recordWS) {
        if(data.type === "atlas") {
          me.recordedWSTraffic.push({ type: 'atlas' });
        } else {
          me.recordedWSTraffic.push(data);
        }
      }

      // handle single user Web socket messages
      me._handleUserWebSocketMessage({data, ws});

      // handle broadcast of messages
      me._handleBroadcastWebSocketMessage({data, sourceUS});
    },
    _disconnectUser: async function ({ws}) {
      let sum;
      let nconnected = me.US.filter(function(o) { return typeof o !== 'undefined'; }).length;
      const sourceUS = me.getUserFromSocket(ws);

      tracer.log(`User ${sourceUS.uid} disconnecting. There are ${nconnected} connected`);

      if(typeof sourceUS.User === 'undefined') {
        tracer.log(`WARNING: The 'User' structure for ${sourceUS.uid} is undefined. Maybe never assigned?`);
      } else if(sourceUS.User.dirname) {
        const mriPath = sourceUS.User.dirname + sourceUS.User.mri;
        const {specimenName} = sourceUS;
        const atlasPath = sourceUS.User.dirname + sourceUS.User.atlasFilename;
        tracer.log(`Was connected to MRI: ${mriPath}, atlas: ${atlasPath}, specimen: ${specimenName}`);

        // count how many users remain connected to the MRI after user leaves, remove current user
        sum = me.numberOfUsersConnectedToMRI(sourceUS.User.dirname + sourceUS.User.mri) - 1;
        if(sum) {
          tracer.log("There remain " + sum + " users connected to that MRI");
        } else {
          tracer.log("No user connected to MRI "
                                + sourceUS.User.dirname
                                + sourceUS.User.mri + ": unloading it", sourceUS.specimenName);
          me.unloadMRI(sourceUS.User.dirname + sourceUS.User.mri);
        }

        // count how many users remain connected to the atlas after user leaves, remove current user
        sum = me.numberOfUsersConnectedToAtlas(sourceUS.User.dirname, sourceUS.User.atlasFilename) - 1;
        if(sum) {
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
      nconnected = me.US.filter(function(o) { return typeof o !== 'undefined'; }).length;
      tracer.log(`${nconnected} users remain connected`);
    },
    _connectNewUser: function ({ws}) {
      me.uidcounter += 1;

      const newUS = { "uid": "u" + me.uidcounter, "socket": ws };
      me.US.push(newUS);

      const nconnected = me.US.filter(function(o) { return typeof o !== 'undefined'; }).length;
      tracer.log(`User id ${newUS.uid} connected, total: ${nconnected} users`);

      // send data from previous users
      me.sendPreviousUserDataMessage(newUS);
    },
    _initColorMap: function () {
      for(let i = 1; i<256; i += 1) {
        me.colormap.push({
          r: 100 + Math.random()*155,
          g: 100 + Math.random()*155,
          b: 100 + Math.random()*155
        });
      }
    },
    _handleWebSocketConnection: function (ws, req) {
      if(me._isInBlacklist(req.connection.remoteAddress)) {
        ws.close();

        return;
      }
      me._connectNewUser({ws});
      ws.on('message', function (msg) {
        me._handleWebSocketMessage({msg, ws});
      });
      ws.on('close', async function () {
        try {
          await me._disconnectUser({ws});
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

      setInterval(function() { tracer.log("date:", new Date()); }, me.timeMarkInterval); // time mark
      me._initKeyPressHandler();
      me._initColorMap();

      me.server.on("upgrade", function(req, socket) {
        let ip = req.ip
                    || req.connection.remoteAddress
                    || req.socket.remoteAddress
                    || req.connection.socket.remoteAddress;
        ip = ip.split(":").pop();
        tracer.log("UPGRADING SERVER WITH IP", ip);

        if(useWhitelist && !whitelist[ip]) {
          tracer.log("------------------------------> not in whitelist", ip);
          setTimeout(function() {
            tracer.log("not in whitelist: end");
            socket.destroy();
          }, 5000);
        }

        if (useBlacklist && blacklist[ip]) {
          tracer.log("------------------------------> blacklist", ip);
          setTimeout(function() {
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
  atlasmakerServer.broadcastServerMessage({msg, dialogType: "modal"});
});
module.exports = atlasmakerServer;

// Exit handler
//catches ctrl+c event
const quit = async () => {
  console.log("Will quit in 10 seconds");
  atlasmakerServer.broadcastServerMessage({
    msg: "Server will restart in 10 seconds",
    dialogType: "modal"
  });
  await new Promise((resolve) => { setTimeout(() => resolve(), 10000); });
  await atlasmakerServer.saveAllAtlases();
  console.log("Will quit now");
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
