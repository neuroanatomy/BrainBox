const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const tracer = require('tracer').console({format: '[{{file}}:{{line}}]  {{message}}'});
const jpeg = require('jpeg-js'); // jpeg-js library: https://github.com/eugeneware/jpeg-js
const Struct = require('struct');
const childProcess = require('child_process');
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
tracer.log("Use whitelist:", useWhitelist);
tracer.log(whitelist);
tracer.log("Use blacklist:", useBlacklist);
tracer.log(blacklist);

// var http = require('http');
let server;
const ws_cfg = JSON.parse(fs.readFileSync('ws_cfg.json'));
const {secure, port} = ws_cfg;
if(secure) {
    // wss
    var http = require('https');
    server = http.createServer({
        key: fs.readFileSync(ws_cfg.ssl_key),
        cert: fs.readFileSync(ws_cfg.ssl_cert),
        ca: fs.readFileSync(ws_cfg.ssl_chain)
    }, function(req, res) {
        var ip = req.ip
            || req.connection.remoteAddress
            || req.socket.remoteAddress
            || req.connection.socket.remoteAddress;
    }); //.listen(port);
} else {
    var http = require('http');
    server = http.createServer(function(req, res) {
    var ip = req.ip
        || req.connection.remoteAddress
        || req.socket.remoteAddress
        || req.connection.socket.remoteAddress;
    });
}
const WebSocketServer = require('ws').Server;
var websocket;

server.on("upgrade", function(req, socket, head) {
    var ip = req.ip
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

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = (new JSDOM('', {
    features: {
        FetchExternalResources: false, // disables resource loading over HTTP / filesystem
        ProcessExternalResources: false // do not execute JS within script blocks
    }
})).window;
const DOMPurify = createDOMPurify(window);

const jsonpatch = require('fast-json-patch');

function bufferTag(str, sz) {
    const buf = Buffer.alloc(sz).fill(32);
    buf.write(str);

    return buf;
}

const atlasmakerServer = (function() {
    const me = {
        debug: 2,
        dataDirectory: '',
        Atlases: [],
        Brains: [],
        US: [],
        uidcounter: 1,
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

/*
        const MghFtr = Struct()
            .array('mrparms', 4, 'floatbe');
*/

        traceLog: function (f, l) {
            if(typeof l === 'undefined' || me.debug>l) {
                tracer.log(String(f.name) + " " + (f.caller?(f.caller.name||"annonymous"): "root"));
            }
        },
        niiTag: bufferTag("nii", 8),

/*
        const mghTag = bufferTag("mgh", 8);
*/
        jpgTag: bufferTag("jpg", 8),

        numberOfUsersConnectedToAtlas: function (dirname, atlasFilename) {
            var sum = 0;

            if(typeof dirname === 'undefined' || typeof atlasFilename === 'undefined') {
                return sum;
            }

            for(const i in me.US) {
                if({}.hasOwnProperty.call(me.US, i)) {
                    if(typeof me.US[i].User === 'undefined') {
                        tracer.log("ERROR: When counting the number of users connected to the atlas, user uid " + i + " was not defined");
                    } else if(typeof me.US[i].User.dirname === 'undefined') {
                        tracer.log("ERROR: For user uid " + i + " dirname is unknown");
                    } else if(typeof me.US[i].User.atlasFilename === 'undefined') {
                        tracer.log("ERROR: For user uid " + i + " atlasFilename is unknown");
                    } else if(me.US[i].User.dirname === dirname && me.US[i].User.atlasFilename === atlasFilename) {
                        sum += 1;
                    }
                }
            }

            return sum;
        },
        numberOfUsersConnectedToMRI: function (mriPath) {
            var sum = 0;

            if(typeof mriPath === 'undefined') {
                return sum;
            }

            for(const i in me.US) {
                if({}.hasOwnProperty.call(me.US, i)) {
                    if(typeof me.US[i].User === 'undefined') {
                        tracer.log("ERROR: When counting the number of users connected to MRI, user uid " + i + " was not defined");
                        continue;
                    }
                    if(typeof me.US[i].User.dirname === 'undefined') {
                        tracer.log("ERROR: A user uid " + i + " dirname is unknown");
                        continue;
                    }
                    if(typeof me.US[i].User.mri === 'undefined') {
                        tracer.log("ERROR: A user uid " + i + " MRI is unknown");
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
                    var sum = me.numberOfUsersConnectedToAtlas(me.Atlases[i].dirname, me.Atlases[i].name);
                    tracer.log("Atlases[" + i + "] path:" + me.Atlases[i].dirname + me.Atlases[i].name + ", " + sum + " users connected");
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
                    var sum = me.numberOfUsersConnectedToMRI(me.Brains[i].path);
                    tracer.log("Brains[" + i + "].path=" + me.Brains[i].path + ", " + sum + " users connected");
                }
            }
            for(const i in me.Brains) {
                if({}.hasOwnProperty.call(me.Brains, i)) {
                    tracer.log("Brains[" + i + "]");
                    tracer.log("           path:", me.Brains[i].path);
                    tracer.log("       data.dim:", me.Brains[i].data.dim);
                    tracer.log("    data.pixdim:", me.Brains[i].data.pixdim);
                    tracer.log("data.vox_offset:", me.Brains[i].data.vox_offset);
                    tracer.log("       data.dir:", me.Brains[i].data.dir);
                    tracer.log("       data.ori:", me.Brains[i].data.ori);
                    tracer.log("       data.s2v:", me.Brains[i].data.s2v);
                    tracer.log("       data.v2w:", me.Brains[i].data.v2w);
                    tracer.log("      data.wori:", me.Brains[i].data.wori);
                    tracer.log("  data.datatype:", me.Brains[i].data.datatype);
                    tracer.log("       data.sum:", me.Brains[i].data.sum);
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
        //========================================================================================
        // Web socket
        //========================================================================================
        getUserFromSocket: function (socket) {
            for(const i in me.US) {
                if({}.hasOwnProperty.call(me.US, i)) {
                    if(socket === me.US[i].socket) {
                        return me.US[i];
                    }
                }
            }

            return -1;
        },
        getUserFromUserId: function (uid) {
            for(const i in me.US) {
                if(uid === me.US[i].uid) {
                    return me.US[i];
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
        unloadMRI: function (mriPath) {
            for(const i in me.Brains) {
                if({}.hasOwnProperty.call(me.Brains, i)) {
                    if(me.Brains[i].path === mriPath) {
                        delete me.Brains[i];
                        tracer.log("    free memory", os.freemem());
                        break;
                    }
                }
            }
        },

        saveAtlas: function (atlas) {
            /*
                saveAtlas
                input: an mri structure
                process: a .nii.gz or .mgz file is saved at the position indicated in the mri structure
                output: success message
            */

            if(atlas && atlas.dim ) {
                if(typeof atlas.data === 'undefined') {
                    tracer.log("ERROR: [saveAtlas] atlas in Atlas array has no data");
                    if(me.debug) {
                        tracer.log("atlas:", atlas);
                    }

                    return Promise.reject(new Error("ERROR: [saveAtlas] atlas in Atlas array has no data"));
                } else {
                    // check if atlas has changed since the last time...
                    let sum = 0;
                    for(let i = 0; i<atlas.dim[0]*atlas.dim[1]*atlas.dim[2]; i += 1) {
                        sum+=atlas.data[i];
                    }

                    // ...if it has not, return,
                    if(sum === atlas.sum) {
                        tracer.log("    Atlas", atlas.dirname, atlas.name,
                                    "no change, no save, freemem", os.freemem());

                        return Promise.resolve("Done. No save required");
                    }

                    // ...if it has, save a backup copy.
                    atlas.sum = sum;
                    var {hdrSz} = atlas;
                    var dataSz = atlas.data.length;
                    var ftrSz;
                    var mri;

                    if(atlas.ftr) {
                        ftrSz = atlas.ftr.length;
                    } else {
                        ftrSz = 0;
                    }
                    mri = Buffer.alloc(atlas.dim[0]*atlas.dim[1]*atlas.dim[2] + hdrSz + ftrSz);
                    tracer.log("        sum:", sum);
                    tracer.log("header size:", hdrSz);
                    tracer.log("  data size:", atlas.dim[0]*atlas.dim[1]*atlas.dim[2]);
                    tracer.log("footer size:", ftrSz);
                    tracer.log("        dim:", atlas.dim);
                    tracer.log(" Atlas", atlas.dirname, atlas.name,
                                "hdr+data+ftr length", atlas.data.length + hdrSz + ftrSz,
                                "buff length", mri.length);
                    atlas.hdr.copy(mri);
                    atlas.data.copy(mri, hdrSz);
                    if(ftrSz) {
                        atlas.ftr.copy(mri, hdrSz + dataSz);
                    }
                    var pr = new Promise(function (resolve, reject) {
                        zlib.gzip(mri, function (err, mrigz) {
                            if(err) {
                                reject(err);

                                return;
                            }
                            var ms=Number(new Date());
                            var path1 = me.dataDirectory + atlas.dirname + atlas.name;
                            var path2 = me.dataDirectory + atlas.dirname + ms + "_" + atlas.name;
                            fs.rename(path1, path2, function () {
                                fs.writeFileSync(path1, mrigz);
                                // log backup creation
                                db.get('log').insert({
                                    key: "saveAtlasBackup",
                                    value: {
                                        atlasDirectory: atlas.dirname,
                                        atlasFilename: atlas.name,
                                        timestamp: ms
                                    },
                                    date: (new Date()).toJSON()
                                })
                                .then(()=>tracer.log("backup insertion logged"));
                                resolve("Atlas saved");
                            });
                        });
                    });
                }
            } else {

                return Promise.reject(new Error("ERROR: No atlas to save"));
            }

            return pr;
        },
        unloadAtlas: function (dirname, atlasFilename) {
            for(const i in me.Atlases) {
                if({}.hasOwnProperty.call(me.Atlases, i)) {
                    if(me.Atlases[i].dirname === dirname && me.Atlases[i].name === atlasFilename) {
                        me.saveAtlas(me.Atlases[i])
                            .then(function () {
                                tracer.log("    Atlas saved. Unloading it");
                                clearInterval(me.Atlases[i].timer);
                                delete me.Atlases[i];
                                tracer.log("    free memory", os.freemem());
                            });
                        break;
                    }
                }
            }
        },
        broadcastPaintVolumeMessage: function (msg, User) {
            try {
                var n = 0;
                var msg2 = JSON.stringify({ "type": "paintvol", "data": msg });
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
                    tracer.log("    paintVolume message broadcasted to " + n + " users");
                }

            } catch (ex) {
                tracer.log("ERROR: Unable to broadcastPaintVolumeMessage", ex);
            }
        },

        /*-----------*/
        /* BLACKLIST */
        verifyClient: function (info) {
            var ip;

            if(info.req.connection.remoteAddress) {
                ip = info.req.connection.remoteAddress;
                tracer.log("connection");
            } else if(info.req.socket._peername) {
                ip = info.req.socket._peername.address;
                tracer.log("_peername");
            } else {
                tracer.log("DEJANDO PASAR UN PASTEL...");

                return true;
            }

            ip = ip.split(":").pop();

            if(useWhitelist && !whitelist[ip]) {
                tracer.log("==========> REJECT ip not in whitelist ", ip);

                return false;
            }

            if(useBlacklist && blacklist[ip]) {
                tracer.log("==========> REJECT ip in blacklist", ip);

                return false;
            } else {
                tracer.log("==========> ACCEPT ip ", ip);
            }

            return true;
        },

        /*-----------*/

        //========================================================================================
        // Undo
        //========================================================================================

        /* @todo
         *
         * UndoStacks should be stored separately for each user, in that way
         * when a user leaves, its undo stack is disposed. With the current
         * implementation, we'll be storing undo stacks for long gone users...
        */

        pushUndoLayer: function (User) {
            var undoLayer = { User: User, actions: [] };
            me.UndoStack.push(undoLayer);

            if(me.debug) {
                tracer.log("    Number of layers: " + me.UndoStack.length);
            }

            return undoLayer;
        },
        getCurrentUndoLayer: function (User) {
            var i, undoLayer;
            var found = false;

            for(i = me.UndoStack.length-1; i>=0; i -= 1) {
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
                tracer.log("    No previous undo layer for " + User.username + ", " + User.atlasFilename + ", " + User.specimenName + ": Create and push one");
                undoLayer = me.pushUndoLayer(User);
            }

            return undoLayer;
        },
        undo: function (User) {
            var undoLayer;
            var i;
            var found = false;

            // find latest undo layer for user
            for(i = me.UndoStack.length-1; i>=0; i -= 1) {
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
                        tracer.log("    Found undo layer for " + User.username + ", " + User.specimenName + ", " + User.atlasFilename + ", with " + Object.keys(undoLayer.actions).length + " actions");
                    }
                    break;
                }
            }
            if(!found) {
                // There was no undoLayer for this user.
                if(me.debug) {
                    tracer.log("    No undo layers for user " + User.username + " in " + User.specimenName + ", " + User.atlasFilename);
                }

                return;
            }

            // undo latest actions
            /*
                undoLayer.actions is a sparse array, with many undefined values.
                Here I take each of the values in actions, and add them to arr.
                Each element of arr is an array of 2 elements, index and value.
            */
            var arr = [];
            var msg;
            var atlas = me.Atlases[User.iAtlas];
            var vol = atlas.data;
            var val;

            for(const j in undoLayer.actions) {
                if({}.hasOwnProperty.call(undoLayer.actions, j)) {
                    i = parseInt(j, 10);
                    val = undoLayer.actions[i];
                    arr.push([i, val]);

                    // The actual undo having place:
                    vol[i] = val;

                    if(me.debug>=3) {
                        tracer.log("    Undo:", i%User.dim[0], parseInt(i/User.dim[0], 10)%User.dim[1], parseInt(i/User.dim[0]/User.dim[1], 10)%User.dim[2]);
                    }
                }
            }
            msg = { "data": arr };
            me.broadcastPaintVolumeMessage(msg, User);

            if(me.debug) {
                tracer.log("    " + me.UndoStack.length + " undo layers remaining (all users)");
            }
        },

        S2I: function (s, mri) {
            var {s2v} = mri;
            var v = [s2v.X + s2v.dx*s[s2v.x], s2v.Y + s2v.dy*s[s2v.y], s2v.Z + s2v.dz*s[s2v.z]];
            var index = v[0] + v[1]*mri.dim[0] + v[2]*mri.dim[0]*mri.dim[1];

            return index;
        },


        //========================================================================================
        // Painting
        //========================================================================================
         paintVoxel: function (mx, my, mz, User, vol, val, undoLayer) {
            var {view} = User;
            var i, s, x, y, z;
            var {sdim} = User.s2v;

            switch(view) {
                case 'sag': x = mz; y = mx; z = sdim[2]-1-my; break; // sagital
                case 'cor': x = mx; y = mz; z = sdim[2]-1-my; break; // coronal
                case 'axi': x = mx; y = sdim[1]-1-my; z = mz; break; // axial
            }

            s = [x, y, z];
            i = me.S2I(s, User);
            if(vol[i] !== val) {
                undoLayer.actions[i] = vol[i];
                vol[i] = val;
            }
        },
        sliceXYZ2index: function (mx, my, mz, User) {
            var {view} = User;
            var x, y, z;
            var i = -1;
            var {sdim} = User.s2v;

            switch(view) {
                case 'sag': x = mz; y = mx; z = sdim[2]-1-my; break; // sagital
                case 'cor': x = mx; y = mz; z = sdim[2]-1-my; break; // coronal
                case 'axi': x = mx; y = sdim[1]-1-my; z = mz; break; // axial
            }
            var s;
            s = [x, y, z];
            i = me.S2I(s, User);

            return i;
        },
        line: function (x, y, val, User, undoLayer) {
            // Bresenham's line algorithm adapted from
            // http://stackoverflow.com/questions/4672279/bresenham-algorithm-in-javascript

            var atlas = me.Atlases[User.iAtlas];
            var vol = atlas.data;
            var x1 = User.x0; // screen coords
            var y1 = User.y0; // screen coords
            var z = User.slice; // screen coords
            var {view} = User; // view: sag, cor or axi
            var {sdim} = User.s2v;
            var x2 = x;
            var y2 = y;
            var j, k;
            var brainWidth, brainHeight;

            if(Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2)>20*20) {
                tracer.log("WARNING: long line from", x1, y1, "to", x2, y2);
                tracer.log("User.uid:", User.uid);
                me.displayUsers();
                tracer.log("END WARNING");
            }

            // Define differences and error check
            var dx = Math.abs(x2 - x1);
            var dy = Math.abs(y2 - y1);
            var sx = (x1 < x2) ? 1 : -1;
            var sy = (y1 < y2) ? 1 : -1;
            var err = dx - dy;

            switch(view) {
                case 'sag': [brainWidth, brainHeight] = [sdim[1], sdim[2]]; break; // sagital
                case 'cor': [brainWidth, brainHeight] = [sdim[0], sdim[2]]; break; // coronal
                case 'axi': [brainWidth, brainHeight] = [sdim[0], sdim[1]]; break; // axial
            }

            for(j = 0; j<Math.min(User.penSize, brainWidth-x1); j += 1) {
                for(k = 0; k<Math.min(User.penSize, brainHeight-y1); k += 1) {
                    me.paintVoxel(x1 + j, y1 + k, z, User, vol, val, undoLayer);
                }
            }

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
                for(j = 0; j<Math.min(User.penSize, brainWidth-x1); j += 1) {
                    for(k = 0; k<Math.min(User.penSize, brainHeight-y1); k += 1) {
                        me.paintVoxel(x1 + j, y1 + k, z, User, vol, val, undoLayer);
                    }
                }
            }
        },
        fill: function (x, y, z, val, User, undoLayer) {
            var {view} = User;
            var vol = me.Atlases[User.iAtlas].data;
    //        var dim = me.Atlases[User.iAtlas].dim;
            var brainWidth, brainHeight;
            var {sdim} = User.s2v;
            switch(view) {
                case 'sag': [brainWidth, brainHeight] = [sdim[1], sdim[2]]; break; // sagital
                case 'cor': [brainWidth, brainHeight] = [sdim[0], sdim[2]]; break; // coronal
                case 'axi': [brainWidth, brainHeight] = [sdim[0], sdim[1]]; break; // axial
            }

            var Q = [];
            var left, right;
            var n;
            var max = 0;
            var bval = vol[me.sliceXYZ2index(x, y, z, User)]; // background-value: value of the voxel where the click occurred

            if(bval === val) { // nothing to do

                return;
            }

            Q.push({ x: x, y: y });
            while(Q.length>0) {
                if(Q.length>max) {
                    max = Q.length;
                }
                n = Q.shift();
                if(vol[me.sliceXYZ2index(n.x, n.y, z, User)] !== bval) {
                    continue;
                }
                left = n.x;
                right = n.x;
                y = n.y;
                while (left-1>=0 && vol[me.sliceXYZ2index(left-1, y, z, User)] === bval) {
                    left--;
                }
                while (right + 1<brainWidth && vol[me.sliceXYZ2index(right + 1, y, z, User)] === bval) {
                    right += 1;
                }
                for(x = left; x<=right; x += 1) {
                    me.paintVoxel(x, y, z, User, vol, val, undoLayer);
                    if(y-1>=0 && vol[me.sliceXYZ2index(x, y-1, z, User)] === bval) {
                        Q.push({ x: x, y: y-1 });
                    }
                    if(y + 1<brainHeight && vol[me.sliceXYZ2index(x, y + 1, z, User)] === bval) {
                        Q.push({ x: x, y: y + 1 });
                    }
                }
            }
            tracer.log("Max array size for fill:", max);
        },
        paintxy: function (u, c, x, y, User, undoLayer) {
        /*
            From 'User' we know slice, atlas, vol, view, dim.
            [issue: undoLayer also has a User field. Maybe only undoLayer should be kept?]
        */
            var atlas = me.Atlases[User.iAtlas];
            if(typeof atlas.data === 'undefined') {
                tracer.log("ERROR: No atlas to draw into");

                return;
            }

            var coord = { "x": x, "y": y, "z": User.slice };
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

        mulMatVec: function (m, v) {
            return [
                m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
                m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
                m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2]
            ];
        },
        invMat: function (m) {
            var det;
            var w = [[], [], []];

            det = m[0][1]*m[1][2]*m[2][0] + m[0][2]*m[1][0]*m[2][1] + m[0][0]*m[1][1]*m[2][2] - m[0][2]*m[1][1]*m[2][0] - m[0][0]*m[1][2]*m[2][1] - m[0][1]*m[1][0]*m[2][2];

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
            var wori = mri.ori;
            // space directions are transposed!
            var v2w = [[], [], []];
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
            var wpixdim = me.subVecVec(me.mulMatVec(v2w, [1, 1, 1]), me.mulMatVec(v2w, [0, 0, 0]));
            // min and max world coordinates
            var wvmax = me.addVecVec(me.mulMatVec(v2w, [mri.dim[0]-1, mri.dim[1]-1, mri.dim[2]-1]), wori);
            var wvmin = me.addVecVec(me.mulMatVec(v2w, [0, 0, 0]), wori);
            var wmin = [Math.min(wvmin[0], wvmax[0]), Math.min(wvmin[1], wvmax[1]), Math.min(wvmin[2], wvmax[2])];
    //        var wmax = [Math.max(wvmin[0], wvmax[0]), Math.max(wvmin[1], wvmax[1]), Math.max(wvmin[2], wvmax[2])];
            var w2s = [[1/Math.abs(wpixdim[0]), 0, 0], [0, 1/Math.abs(wpixdim[1]), 0], [0, 0, 1/Math.abs(wpixdim[2])]];

            // tracer.log(["v2w", v2w, "wori", wori, "wpixdim", wpixdim, "wvmax", wvmax, "wvmin", wvmin, "wmin", wmin, "wmax", wmax, "w2s", w2s]);

            var [i, j, k] = v2w;
            var mi = { i: 0, v: 0 }; i.map(function(o, n) { if(Math.abs(o)>Math.abs(mi.v)) { mi = { i: n, v: o }; } });
            var mj = { i: 0, v: 0 }; j.map(function(o, n) { if(Math.abs(o)>Math.abs(mj.v)) { mj = { i: n, v: o }; } });
            var mk = { i: 0, v: 0 }; k.map(function(o, n) { if(Math.abs(o)>Math.abs(mk.v)) { mk = { i: n, v: o }; } });

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

    /*
        testS2VTransformation: function (mri) {
            //  check the S2V transformation to see if it looks correct.
            //  If it does not, reset it
            var doReset = false;

            tracer.log("    Transformation TEST:");

            if(me.debug) {
                process.stdout.write("  1. transformation volume: ");
            }
            var vv = mri.dim[0]*mri.dim[1]*mri.dim[2];
            var vs = mri.s2v.sdim[0]*mri.s2v.sdim[1]*mri.s2v.sdim[2];
            var diff = (vs-vv)/vv;
            if(Math.abs(diff)>0.001) {
                doReset = true;
                if(me.debug) {
                    tracer.log("    fail. Voxel volume:", vv, "Screen volume:", vs, "Difference (%):", diff);
                }
            } else {
                if(me.debug) {
                    tracer.log("    ok");
                }
            }

            if(me.debug) {
                process.stdout.write("  2. transformation origin: ");
            }
            if(    mri.s2v.sori[0]<0||mri.s2v.sori[0]>mri.s2v.sdim[0] ||
                mri.s2v.sori[1]<0||mri.s2v.sori[1]>mri.s2v.sdim[1] ||
                mri.s2v.sori[2]<0||mri.s2v.sori[2]>mri.s2v.sdim[2]) {
                doReset = true;
                if(me.debug) {
                    tracer.log("    fail");
                }
            } else {
                if(me.debug) {
                    tracer.log("    ok");
                }
            }

            if(doReset) {
                tracer.log("    FAIL: TRANSFORMATION WILL BE RESET");
                tracer.log(mri.dir);
                tracer.log(mri.ori);
                mri.dir = [[mri.pixdim[0], 0, 0], [0, -mri.pixdim[1], 0], [0, 0, -mri.pixdim[2]]];
                mri.ori = [0, mri.dim[1]-1, mri.dim[2]-1];
                me.computeS2VTransformation(mri);

                if(me.debug>2) {
                    tracer.log("dir", mri.dir);
                    tracer.log("ori", mri.ori);
                    tracer.log("s2v", mri.s2v);
                }
            } else {
                tracer.log("    ok");
            }
        },
    */
        filetypeFromFilename: function (mriPath) {
            if(mriPath.match(/.nii.gz$/)) {
                return "nii.gz";
            } else
            if(mriPath.match(/.mgz$/)) {
                return "mgz";
            }
        },

        readNifti: function (mriPath) {
            /*
                readNifti
                input: path to a .nii.gz file
                output: an mri structure
            */

            var pr = new Promise(function (resolve, reject) {
                try {
                    var niigz = fs.readFileSync(mriPath);
                    tracer.log("niigz length:", niigz.length);

                    zlib.gunzip(niigz, function (err, nii) {
                        var i, j;
                        var sum, tmp;
                        var mri = {};

                        // standard nii header
                        try {
                            me.NiiHdr.allocate();
                            tracer.log("nii length:", nii.length);
                            me.NiiHdr._setBuff(nii);
                            var h = JSON.parse(JSON.stringify(me.NiiHdr.fields));

                            //var sizeof_hdr = h.sizeof_hdr;
                            mri.dim = [h.dim[1], h.dim[2], h.dim[3]];
                            mri.pixdim = [h.pixdim[1], h.pixdim[2], h.pixdim[3]];
                            mri.vox_offset = h.vox_offset;

                            // nrrd-compatible header, computes space directions and space origin
                            tracer.log("sform code:", h.sform_code);
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
                        } catch(err2) {
                            tracer.log("ERROR Cannot read nifti header:", err2);
                            reject(new Error("ERROR Cannot read nifti header: " + err2));

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

                        tracer.log("reading datatype", mri.datatype);
                        tracer.log("dim:", mri.dim[0], mri.dim[1], mri.dim[2]);
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
                            default: {
                                reject(new Error("ERROR: Unknown dataType: " + mri.datatype));

                                return;
                            }
                        }

                        // compute sum, min and max
                        var min, max;
                        sum = 0;
                        [min, max] = [mri.data[0], mri.data[0]];
                        for(i = 0; i<mri.dim[0]*mri.dim[1]*mri.dim[2]; i += 1) {
                            sum += mri.data[i];

                            if(mri.data[i]<min) { min = mri.data[i]; }
                            if(mri.data[i]>max) { max = mri.data[i]; }
                        }
                        [mri.sum, mri.min, mri.max] = [sum, min, max];

                        resolve(mri);
                    });
                } catch(e) {
                    reject(new Error("ERROR Cannot uncompress nifti file:", e));
                }
            });

            return pr;
        },
//            this.readNifti = readNifti;

        readMGZ: function (mriPath) {
            /*
                readMGZ
                input: path to a .mgz file
                output: an mri structure
            */

            var pr = new Promise(function (resolve, reject) {
                try {
                    childProcess.execFile("gunzip", ["-c", mriPath], { encoding: 'binary', maxBuffer: 200*1024*1024 }, function(err, stdout) {
                        var mgh = Buffer.from(stdout, 'binary');
                        var i, j;
                        var tmp;
                        var sum;
                        var mri = {};
                        var sz;
                        var bpv;
                        var hdrSize = 284;
                        var ftrSz;
                        me.MghHdr.allocate();
                        me.MghHdr._setBuff(mgh);
                        var h = JSON.parse(JSON.stringify(me.MghHdr.fields));

                        // Test Header
                        if(h.v<1 || h.v>100) {
                            tracer.log("ERROR: Wrong MGH Header", h);
                            reject(new Error("ERROR: Wrong MGH Header", h));

                            return;
                        }

                        // Equations from freesurfer/matlab/load_mgh.m
                        var PcrsC = [h.ndim1/2, h.ndim2/2, h.ndim3/2];
                        //var D = [[h.delta[0], 0, 0], [0, h.delta[1], 0], [0, 0, h.delta[2]]];
                        var MdcD = [
                            [h.Mdc[0]*h.delta[0], h.Mdc[3]*h.delta[1], h.Mdc[6]*h.delta[2]],
                            [h.Mdc[1]*h.delta[0], h.Mdc[4]*h.delta[1], h.Mdc[7]*h.delta[2]],
                            [h.Mdc[2]*h.delta[0], h.Mdc[5]*h.delta[1], h.Mdc[8]*h.delta[2]]
                        ];
                        var Pxyz0 = me.subVecVec(h.Pxyz_c, me.mulMatVec(MdcD, PcrsC));
                        var M = [
                            h.Mdc[0]*h.delta[0], h.Mdc[3]*h.delta[1], h.Mdc[6]*h.delta[2], Pxyz0[0],
                            h.Mdc[1]*h.delta[0], h.Mdc[4]*h.delta[1], h.Mdc[7]*h.delta[2], Pxyz0[1],
                            h.Mdc[2]*h.delta[0], h.Mdc[5]*h.delta[1], h.Mdc[8]*h.delta[2], Pxyz0[2],
                            0, 0, 0, 1
                        ];

                        mri.dim = [h.ndim1, h.ndim2, h.ndim3];
                        mri.pixdim = [h.delta[0], h.delta[1], h.delta[2]];
                        mri.dir = [[M[0], -M[1], -M[2]], [M[4], -M[5], -M[6]], [M[8], -M[9], -M[10]]];
                        mri.ori = [M[3], M[7], M[11]];

                         // compute the transformation from voxel space to screen space
                        me.computeS2VTransformation(mri);

                        // test if the transformation looks incorrect. Reset it if it does
                        //testS2VTransformation(mri);

                        sz = mri.dim[0]*mri.dim[1]*mri.dim[2];
                        bpv = [1, 4, 0, 4, 2][h.type]; // bytes per voxel
                        tracer.log("sz:", sz);
                        tracer.log("bpv:", bpv, "type:", h.type);

                        // keep the header
                        mri.hdr = mgh.slice(0, hdrSize);
                        mri.hdrSz = hdrSize;

                        // keep the footer
                        ftrSz = mgh.length-hdrSize-sz*bpv;
                        mri.ftr = mgh.slice(hdrSize + sz*bpv);

                        // print info
                        tracer.log("    mgh.length:", mgh.length);
                        tracer.log("       hdrSize:", hdrSize);
                        tracer.log("        sz*bpv:", sz*bpv);
                        tracer.log("         ftrSz:", ftrSz);
                        tracer.log("mri.ftr.length:", mri.ftr.length);

                        switch(h.type) {
                            case 0: // MGHUCHAR
                                mri.data = mgh.slice(hdrSize, -ftrSz);
                                break;
                            case 1: // MGHINT
                                tmp = mgh.slice(hdrSize, -ftrSz);
                                mri.data = new Uint32Array(sz);
                                for(j = 0; j<sz; j += 1) {
                                    mri.data[j] = tmp.readUInt32BE(j*4);
                                }
                                break;
                            case 3: // MGHFLOAT
                                tmp = mgh.slice(hdrSize, -ftrSz);
                                mri.data = new Float32Array(sz);
                                for(j = 0; j<sz; j += 1) {
                                    mri.data[j] = tmp.readFloatBE(j*4);
                                }
                                break;
                            case 4: // MGHSHORT
                                tmp = mgh.slice(hdrSize, -ftrSz);
                                mri.data = new Int16Array(sz);
                                for(j = 0; j<sz; j += 1) {
                                    mri.data[j] = tmp.readInt16BE(j*2);
                                }
                                break;
                            default:
                                tracer.log("ERROR: Unknown dataType: " + h.type);
                        }

                        var min;
                        var max;
                        sum = 0;
                        [min, max] = [mri.data[0], mri.data[0]];
                        for(i = 0; i<sz; i += 1) {
                            sum+=mri.data[i];

                            if(mri.data[i]<min) { min = mri.data[i]; }
                            if(mri.data[i]>max) { max = mri.data[i]; }
                        }
                        [mri.sum, mri.min, mri.max] = [sum, min, max];

                        resolve(mri);
                    });
                } catch(e) {
                    reject(new Error("ERROR Cannot uncompress mgz file: ", e));
                }
            });

            return pr;
        },

        createNifti: function (templateMRI) {
            /*
                createNifti
                input: a template mri structure
                output: a new empty mri structure, datatype = 2 (1 byte per voxel), same dimensions as template
            */

/*eslint-disable camelcase*/
            var mri = {};
            var props = ["dim", "pixdim", "hdr"];
            var datatype = 2;
            var vox_offset = 352;
            var i, niihdr, sz;
            var newHdr = {
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
            niihdr = me.NiiHdr.buffer();
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
            sz = mri.dim[0]*mri.dim[1]*mri.dim[2];

            // update the header
            mri.hdr = niihdr;
            mri.hdr.writeUInt16LE(datatype, 70, 2); // set datatype to 2:unsigned char (8 bits/voxel)
            mri.hdr.writeFloatLE(vox_offset, 108, 4); // set voxel_offset to 352 (minimum size of a nii header)
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
            var pr = new Promise(function (resolve, reject) {
                switch(me.filetypeFromFilename(mriPath)) {
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
//            this.loadMRI = loadMRI;

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
                            tracer.log("    brain already loaded");
                        }

                        return Promise.resolve(me.Brains[i].data);
                    }
                }
            }

            if(me.debug) {
                tracer.log("    Loading brain at", brainPath);
            }
            var pr = new Promise(function (resolve, reject) {
                me.loadMRI(me.dataDirectory + brainPath)
                    .then(function (mri) {
                        var brain = { path: brainPath, data: mri };
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
//            this.getBrainAtPath = getBrainAtPath;

        /*
            Serve brain slices
        */
        drawSlice: function (brain, view, slice) {
            var x, y;
            var i, j;
            var brainWidth;
            var brainHeight; //, brain_D;
            var ya, yc, ys;
            var val;
            var s;
            var {s2v} = brain;

            switch(view) {
                case 'sag': [brainWidth, brainHeight] = [s2v.sdim[1], s2v.sdim[2]]; break; //brain_D = s2v.sdim[0]; break; // sagital
                case 'cor': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[2]]; break; //brain_D = s2v.sdim[1]; break; // coronal
                case 'axi': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[1]]; break; //brain_D = s2v.sdim[2]; break; // axial
            }

            var frameData = Buffer.alloc(brainWidth * brainHeight * 4);

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
                    i = me.S2I(s, brain);

                    val = 255*(brain.data[i]-brain.min)/(brain.max-brain.min);
                    frameData[4*j + 0] = val; // red
                    frameData[4*j + 1] = val; // green
                    frameData[4*j + 2] = val; // blue
                    frameData[4*j + 3] = 0xFF; // alpha - ignored in JPEGs
                    j += 1;
                }
            }
            var rawImageData = {
              data: frameData,
              width: brainWidth,
              height: brainHeight
            };

            return jpeg.encode(rawImageData, 99);
        },
        drawSlice2: function (brain, atlas, view, slice) {
            var x, y;
            var i, j;
            var brainWidth;
            var brainHeight; //, brain_D;
            var ys;
            var ya;
            var yc;
            var val;
            var rgb;
            var s;
            var {s2v} = brain;
            var t = 0.5;

            switch(view) {
                case 'sag': [brainWidth, brainHeight] = [s2v.sdim[1], s2v.sdim[2]]; break; //brain_D = s2v.sdim[0]; break; // sagital
                case 'cor': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[2]]; break; //brain_D = s2v.sdim[1]; break; // coronal
                case 'axi': [brainWidth, brainHeight] = [s2v.sdim[0], s2v.sdim[1]]; break; //brain_D = s2v.sdim[2]; break; // axial
            }

            var frameData = Buffer.alloc(brainWidth * brainHeight * 4);

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
                    i = me.S2I(s, brain);

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

            var rawImageData = {
              data: frameData,
              width: brainWidth,
              height: brainHeight
            };

            return jpeg.encode(rawImageData, 99);
        },

        receivePaintMessage: function (data) {
            var msg = data.data;
            var sourceUS = me.getUserFromUserId(data.uid); // user data
            var {c, x, y} = msg; // command, x coordinate, y coordinate
            var undoLayer = me.getCurrentUndoLayer(sourceUS.User); // current undoLayer for user

            me.paintxy(sourceUS.uid, c, x, y, sourceUS.User, undoLayer);
        },
        sendSliceToUser: function (brain, view, slice, userSocket) {
            try {
                var jpegImageData = me.drawSlice(brain, view, slice);
                var length = jpegImageData.data.length + me.jpgTag.length;
                var bin = Buffer.concat([jpegImageData.data, me.jpgTag], length);
                userSocket.send(bin, { binary: true, mask: false });
            } catch(e) {
                tracer.log("ERROR: Cannot send slice to user");
            }
        },
        receiveRequestSliceMessage: function (data, userSocket) {
            // get slice information from message
            var {view} = data; // user view
            var slice = parseInt(data.slice, 10); // user slice

            // get User object
            var sourceUS = me.getUserFromUserId(data.uid);

            // get brainPath from User object
            var brainPath = sourceUS.User.dirname + sourceUS.User.mri;

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
            var {view} = data; // user view
            var slice = parseInt(data.slice, 10); // user slice
            var sourceUS = me.getUserFromUserId(data.uid);
            var brainPath = sourceUS.User.dirname + sourceUS.User.mri;
            var atlasPath = sourceUS.User.dirname + sourceUS.User.atlasFilename;
            var atlas;

            sourceUS.User.view = view;
            sourceUS.User.slice = slice;
            if(me.debug>1) {
                tracer.log("view, slice:", sourceUS.User.view, sourceUS.User.slice);
            }

            me.getBrainAtPath(brainPath)
                .then(function (brain) {
                    for(const i in me.Atlases) {
                        if({}.hasOwnProperty.call(me.Atlases, i)) {
                            if(me.Atlases[i].dirname + me.Atlases[i].name === atlasPath) {
                                atlas = me.Atlases[i];
                                break;
                            }
                        }
                    }

                    try {
                        var jpegImageData = me.drawSlice2(brain, atlas, view, slice); // TEST: to draw the server version of the atlas together with the anatomy
                        var length = jpegImageData.data.length + me.jpgTag.length;
                        var bin = Buffer.concat([jpegImageData.data, me.jpgTag], length);
                        userSocket.send(bin, { binary: true, mask: false });
                    } catch(e) {
                        tracer.log("ERROR: Cannot send slice to user", e);
                    }
                });
        },
        broadcastMessage: function (msg, uid) {
            try {
                var n = 0;
                for(const i in me.US) {
                    if({}.hasOwnProperty.call(me.US, i)) {
                        if(me.US[i].uid !== uid ) {
                            me.US[i].socket.send(JSON.stringify(msg));
                            n += 1;
                        }
                    }
                }
                if(me.debug) {
                    tracer.log("    message broadcasted to " + n + " users", msg);
                }
            } catch (ex) {
                tracer.log("ERROR: Unable to broadcast message", ex, msg);
            }
        },
        receiveSaveMessage: function (data /*, userSocket*/) {
            var sourceUS = me.getUserFromUserId(data.uid);
    //        var brainPath = sourceUS.User.dirname + sourceUS.User.mri;
            var atlasPath = sourceUS.User.dirname + sourceUS.User.atlasFilename;

            var time = new Date();
    //        var modified = time.toJSON();
    //        var modifiedBy = (sourceUS.User && sourceUS.User.username) ? sourceUS.User.username : "anonymous";

            for(const i in me.Atlases) {
                if({}.hasOwnProperty.call(me.Atlases, i)) {
                    if(me.Atlases[i].dirname + me.Atlases[i].name === atlasPath) {
                        me.saveAtlas(me.Atlases[i])
                            .then(function () {
                                tracer.log("    Atlas saved");
                                clearInterval(me.Atlases[i].timer);
                                me.broadcastMessage({
                                    type: 'serverMessage',
                                    msg: "Atlas saved " + time
                                });
                            });
                        break;
                    }
                }
            }

            /**
             * @todo Log the save
             */
        },
        receiveSaveMetadataMessage: function (data/*, userSocket*/) {
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

            var sourceUS = me.getUserFromUserId(data.uid);
            var json = data.metadata;
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
        receiveAtlasFromUserMessage: function (data/*, userSocket*/) {
            zlib.inflate(data.data, function (err, atlasData) {
                if(err) {
                    console.error("ERROR:", err);

                    return;
                }
                // Save current atlas
                var sourceUS = me.getUserFromUserId(data.uid);
                var {iAtlas} = sourceUS.User;
                var atlas = me.Atlases[iAtlas];
                me.saveAtlas(atlas)
                .then(function () {
                    tracer.log("    Replace current atlas with new atlas");
                    atlas.data = atlasData;
                });
            });
        },

        unloadUnusedBrains: function () {
            for(const i in me.Brains) {
                if({}.hasOwnProperty.call(me.Brains, i)) {
                    var sum = me.numberOfUsersConnectedToMRI(me.Brains[i].path);

                    if(sum === 0) {
                        tracer.log("    No user connected to MRI " + me.Brains[i].path + ": unloading it");
                        me.unloadMRI(me.Brains[i].path);
                    }
                }
            }
        },
        unloadUnusedAtlases: function () {
            for(const i in me.Atlases) {
                if({}.hasOwnProperty.call(me.Atlases, i)) {
                    var sum = me.numberOfUsersConnectedToAtlas(me.Atlases[i].dirname, me.Atlases[i].name);
                    if(sum === 0) {
                        tracer.log("    No user connected to Atlas " + me.Atlases[i].dirname + me.Atlases[i].name + ": unloading it");
                        me.unloadAtlas(me.Atlases[i].dirname, me.Atlases[i].name);
                    }
                }
            }
        },
        sendAtlasToUser: function (atlasdata, userSocket, flagCompress) {
            if(flagCompress) {
                tracer.log("atlasdata", atlasdata.length);
                zlib.gzip(atlasdata, function (err, atlasdatagz) {
                    if(err) {
                        console.error("ERROR:", err);

                        return;
                    }
                    tracer.log("atlasdatagz", atlasdatagz.length);
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
//========================================================================================
// Load & Save
//========================================================================================
        /**
         * @func loadAtlas
         * @desc The requested atlas is sent if it was already loaded, loaded from disk
         *       if it was already downloaded but not yet loaded, or created if it's a
         *       new atlas.
         * @param { Object } User A User object providing information about the requested atlas
         * @return an atlas (mri structure)
         */
        loadAtlas: function loadAtlas(User) {
            var pr = new Promise(function (resolve, reject) {
                var mriPath = me.dataDirectory + User.dirname + User.atlasFilename;

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
                    var brainPath = User.dirname + User.mri;
                    me.getBrainAtPath(brainPath)
                        .then(function (mri) {
                            me.createNifti(mri)
                            .then(function (newAtlas) {
                                newAtlas.name = User.atlasFilename;
                                newAtlas.dirname = User.dirname;

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
                    .then(function (loadedAtlas) {
                        loadedAtlas.name = User.atlasFilename;
                        loadedAtlas.dirname = User.dirname;

                        // cast atlas data to 8bits
                        switch(me.filetypeFromFilename(User.atlasFilename)) {
                            case "nii.gz":
                                me.createNifti(loadedAtlas)
                                .then(function(atlas8bit) {
                                    var i;
                                    for(i = 0; i<loadedAtlas.dim[0]*loadedAtlas.dim[1]*loadedAtlas.dim[2]; i += 1) {
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

        /**
         * @func addAtlas
         * @desc input: A User structure providing information about the requested atlas
         * process: an atlas is obtained, and added to the me.Atlases[] array if it
         *          wasn't already loaded.
         * @returns {object} An atlas (mri structure)
         */
        addAtlas: function (User) {
            var atlas = {
                name: User.atlasFilename,
                specimen: User.specimenName,
                dirname: User.dirname,
                dim: User.dim
            };
            tracer.log("    User requests atlas " + atlas.name + " from " + atlas.dirname, atlas.specimen);

            var pr = new Promise(function (resolve, reject) {
                me.loadAtlas(User)
                .then(function (theAtlas) {
                    me.Atlases.push(theAtlas);
                    User.iAtlas = me.Atlases.indexOf(theAtlas);
                    atlas.timer = setInterval(function () { me.saveAtlas(theAtlas); }, me.backupInterval);

                    resolve(theAtlas);
                })
                .catch((err) => { reject(err); });
            });

            return pr;
        },
        receiveUserDataMessage: function (data, userSocket) {
            if(me.debug>1) {
                tracer.log("    data.description:", data.description);
            }

            var sourceUS = me.getUserFromUserId(data.uid);

            var User;
            var atlasLoadedFlag;
            var firstConnectionFlag = false;
            var switchingAtlasFlag = false;

            if(typeof sourceUS.User === 'undefined') {
                firstConnectionFlag = true;
            } else if(sourceUS.User.isMRILoaded === false) {
                firstConnectionFlag = true;
            }

            if(data.description === "allUserData" ) {
                // receiving the complete User data object
                User = data.user;
                User.uid = data.uid;
            } else {
                User = sourceUS.User;
                if(data.description === "sendAtlas") {
                    // receive an atlas from the user
                    // 1. Check if the atlas the user is requesting has not been loaded
                    atlasLoadedFlag = false;

                    // check whether user is switching atlas.
                    switchingAtlasFlag = false;
                    if(sourceUS.User) {
                        if((sourceUS.User.atlasFilename !== User.atlasFilename)||(sourceUS.User.dirname !== User.dirname)) {
                            switchingAtlasFlag = true;
                        }
                    }

                    for(const i in me.Atlases) {
                        if({}.hasOwnProperty.call(me.Atlases, i)) {
                            if(me.Atlases[i].dirname === User.dirname && me.Atlases[i].name === User.atlasFilename) {
                                atlasLoadedFlag = true;
                                break;
                            }
                        }
                    }
                    User.iAtlas = atlasLoadedFlag?parseInt(i, 10): me.Atlases.length; // value i if it was found, or last available if it wasn't

                    // 2. Send the atlas to the user (load it if required)
                    if(atlasLoadedFlag) {
                        if(firstConnectionFlag || switchingAtlasFlag) {
                            // send the new user our data
                            me.sendAtlasToUser(me.Atlases[i].data, userSocket, true);
                            sourceUS.User.isMRILoaded = true;
                        }
                    } else {
                        // The atlas requested has not been loaded before:
                        // Load the atlas s/he's requesting
                        me.addAtlas(User)
                        .then(function(atlas) {
                            me.sendAtlasToUser(atlas.data, userSocket, true);
                            sourceUS.User.isMRILoaded = true;
                        })
                        .catch ((err) => console.log(new Error("ERROR: Unable to load atlas")));
                    }
                } else {
                    // receive a specific field of the User data object from the user
                    /**
                     * @todo If the atlas/mri for the client failed to be sent, `User` is undefined
                     */
                    var changes = JSON.parse(data.description);
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
            if(User.hasOwnProperty('username')) {
                if(typeof sourceUS.User === 'undefined') {
                    tracer.log("    No User yet for id " + data.uid);
                } else if(!sourceUS.User.hasOwnProperty('username')) {
                    tracer.log("    User " + User.username + ", id " + data.uid + " logged in");
                }
            }
            if(sourceUS.hasOwnProperty('User') === false) {
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
            var sourceUS = me.getUserFromUserId(data.uid);

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
            var n = 0;
            for(const i in me.US) {
                if({}.hasOwnProperty.call(me.US, i)) {
                    if(me.US[i].socket === newUS.socket) {
                        continue;
                    }
                    var msg = JSON.stringify({ type: "userData", user: me.US[i].User, uid: me.US[i].uid, description: "allUserData" });
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
        keyPressHandler: function () {
            keypress(process.stdin);
            process.stdin.on('keypress', function (ch, key) {
                if(key) {
                    // tracer.log(ch, key);
                    if(key.name === 'c' && key.ctrl) {
                        tracer.log("Exit.");
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
        initSocketConnection: function () {

            /*
                Init
            */
            tracer.log("atlasmakerServer.js");
            tracer.log("date:", new Date());
            setInterval(function() { tracer.log("date:", new Date()); }, me.timeMarkInterval); // time mark
            tracer.log("free memory", os.freemem());

            /*
                Init keypress handler
            */
            me.keyPressHandler();

            /*
                Init colormap
            */
            var i;
            for(i = 1; i<256; i += 1) {
                me.colormap.push({
                    r: 100 + Math.random()*155,
                    g: 100 + Math.random()*155,
                    b: 100 + Math.random()*155
                });
            }

            /*
                Init WS connection
            */
            try {
                if(secure) {
                    websocket = new WebSocketServer({server: server});
                } else {
                    websocket = new WebSocketServer({ server: server, verifyClient: me.verifyClient });
                }

                websocket.on("connection", function (s, req) {

                    /*-----------*/
                    /* BLACKLIST */
                    var ip = req.connection.remoteAddress;
                    ip = ip.split(":").pop();
                    if(useWhitelist && !whitelist[ip]) {
                            tracer.log("--------------------> REJECT ip not in whitelist", ip);
                            s.close();

                            return;
                    }
                    if(useBlacklist && blacklist[ip]) {
                            tracer.log("--------------------> REJECT ip in blacklist", ip);
                            s.close();

                            return;
                    }

                    /*-----------*/

                    tracer.log("    remote_address", req.connection.remoteAddress);
                    me.uidcounter += 1;
                    var newUS = { "uid": "u" + me.uidcounter, "socket": s };
                    me.US.push(newUS);
                    tracer.log("    User id " + newUS.uid + " connected, total: " + me.US.filter(function(o) { return typeof o !== 'undefined'; }).length + " users");

                    // send data from previous users
                    me.sendPreviousUserDataMessage(newUS);

                    s.on('message', function (msg) {
                        var sender = s;
                        var sourceUS = me.getUserFromSocket(s);
                        var data = {};

                        // Handle binary data: a user uploaded an atlas file
                        if(msg instanceof Buffer) {
                            data.data = msg;
                            data.type = "atlas";
                        } else {
                            data = JSON.parse(msg);
                        }
                        data.uid = sourceUS.uid;

                        // Websocket traffic recording
                        if(me.recordWS) {
                            if(data.type === "atlas") {
                                me.recordedWSTraffic.push({ type: 'atlas' });
                            } else {
                                me.recordedWSTraffic.push(data);
                            }
                        }

                        if(me.debug>1) {
                            tracer.log("data type:", data.type);
                        }

                        switch(data.type) {
                            case "userData":
                                me.receiveUserDataMessage(data, sender);
                                break;
                            case "show":
                                // no action performed
                                break;
                            case "paint":
                                me.receivePaintMessage(data);
                                break;
                            case "requestSlice":
                                me.receiveRequestSliceMessage(data, sender);
                                break;
                            case "requestSlice2":
                                me.receiveRequestSlice2Message(data, sender);
                                break;
                            case "save":
                                me.receiveSaveMessage(data, s);
                                break;
                            case "saveMetadata":
                                me.receiveSaveMetadataMessage(data, sender);
                                break;
                            case "atlas":
                                me.receiveAtlasFromUserMessage(data, sender);
                                break;
                            case "echo":
                                tracer.log("ECHO: '" + data.msg + "' from user " + data.username);
                                break;
                            case "userNameQuery":
                                me.queryUserName(data)
                                .then(function(obj) {
                                    data.metadata = obj;
                                    sender.send(JSON.stringify(data));
                                })
                                .catch((err) => tracer.log(err));
                                break;
                            case "projectNameQuery":
                                me.queryProjectName(data)
                                .then(function(obj) {
                                    data.metadata = obj;
                                    sender.send(JSON.stringify(data));
                                })
                                .catch(function(err) { tracer.log("err:", err); });
                                break;
                            case "similarProjectNamesQuery":
                                me.querySimilarProjectNames(data)
                                .then(function(obj) {
                                    data.metadata = obj;
                                    sender.send(JSON.stringify(data));
                                })
                                .catch(function(err) { tracer.log("err:", err); });
                                break;
                            case "autocompleteClient":
                                me.declareAutocompleteClient(data, sender);
                                break;
                            default:
                                break;
                        }

                        // Broadcast
                        //----------
                        var n = 0;

                        // do not broadcast the following messages
                        if(data.type === "requestSlice"
                            || data.type === "requestSlice2"
                            || (data.type === "userData" && data.description === "sendAtlas")) {

                            return;
                        }

                        // scan through connected users
                        for(client of websocket.clients) {
                            // i-th user
                            var targetUS = me.getUserFromSocket(client);

                            // do not auto-broadcast
                            if(sourceUS.uid === targetUS.uid) {
                                if(me.debug>1) {
                                    tracer.log("    no broadcast to self");
                                }
                                continue;
                            }

                            // do not broadcast to autocomplete clients
                            if(sourceUS.autocompleteClient) {
                                if(me.debug>1) {
                                    tracer.log("    no broadcast to autocomplete clients");
                                }
                                continue;
                            }

                            // do not broadcast to undefined users
                            if( typeof sourceUS.User === 'undefined' || typeof targetUS.User === 'undefined') {
                                if(me.debug) {
                                    tracer.log("    User " + sourceUS.uid + ": " + (typeof sourceUS.User === 'undefined')?"undefined": "defined");
                                }
                                if(me.debug) {
                                    tracer.log("    User " + targetUS.uid + ": " + (typeof targetUS.User === 'undefined')?"undefined": "defined");
                                }
                                continue;
                            }
                            if (( targetUS.User.projectPage && targetUS.User.projectPage === sourceUS.User.projectPage)
                                || (targetUS.User.iAtlas === sourceUS.User.iAtlas)
                                || (data.type === "userData")
                                || (data.type === "chat")
                            ) {
                                if(data.type === "atlas") {
                                    me.sendAtlasToUser(data.data, client, false);
                                } else {
                                    // sanitise data
                                    const cleanData = DOMPurify.sanitize(JSON.stringify(data));
                                    try {
                                        client.send(cleanData);
                                    } catch (err) {
                                        tracer.log("ERROR:", err);
                                    }
                                }
                            } else if(me.debug>1) {
                                tracer.log("    no broadcast to user " + targetUS.User.username + " [uid: " + targetUS.uid + "] of atlas " + targetUS.User.specimenName + "/" + targetUS.User.atlasFilename);
                            }
                            n += 1;
                        }
                        if(me.debug>2) {
                            tracer.log("    broadcasted to", n, "users");
                        }
                    });

                    s.on('close', function () {
                        var sum;
                        var sourceUS;

                        tracer.log("A user is disconnecting");
                        tracer.log("There are " + me.US.filter(function(o) { return typeof o !== 'undefined'; }).length + " connected");

                        sourceUS = me.getUserFromSocket(s);
                        tracer.log("    The user disconnecting is: " + sourceUS.uid);

                        if(typeof sourceUS.User === 'undefined') {
                            tracer.log("<WARNING: The 'User' structure for " + sourceUS.uid + " is undefined. Maybe never assigned?");
                            // tracer.log("    US:", me.US);
                            tracer.log(" WARNING>");
                        } else if(sourceUS.User.dirname) {
                            tracer.log("    User was connected to MRI "+ sourceUS.User.dirname + sourceUS.User.mri, sourceUS.specimenName);
                            tracer.log("    User was connected to atlas "+ sourceUS.User.dirname + sourceUS.User.atlasFilename, sourceUS.specimenName);

                            // count how many users remain connected to the MRI after user leaves
                            sum = me.numberOfUsersConnectedToMRI(sourceUS.User.dirname + sourceUS.User.mri);
                            sum -= 1; // subtract current user
                            if(sum) {
                                tracer.log("    There remain " + sum + " users connected to that MRI");
                            } else {
                                tracer.log("    No user connected to MRI "
                                            + sourceUS.User.dirname
                                            + sourceUS.User.mri + ": unloading it", sourceUS.specimenName);
                                me.unloadMRI(sourceUS.User.dirname + sourceUS.User.mri);
                            }

                            // count how many users remain connected to the atlas after user leaves
                            sum = me.numberOfUsersConnectedToAtlas(sourceUS.User.dirname, sourceUS.User.atlasFilename);
                            sum -= 1; // subtract current user
                            if(sum) {
                                tracer.log("    There remain " + sum + " users connected to that atlas");
                            } else {
                                tracer.log("    No user connected to atlas "
                                            + sourceUS.User.dirname
                                            + sourceUS.User.atlasFilename + ": unloading it", sourceUS.specimenName);
                                me.unloadAtlas(sourceUS.User.dirname, sourceUS.User.atlasFilename, sourceUS.specimenName);
                            }
                        } else {
                            tracer.log("<ERROR: dirname was not defined>", sourceUS.User);
                        }

                        // send user disconnect message to remaining users
                        me.sendDisconnectMessage(sourceUS.uid);

                        // remove the user from the list
                        me.removeUser(s);

                        // display the total number of connected users
                        tracer.log("    " + me.US.filter(function(o) { return typeof o !== 'undefined'; }).length + " remain connected");

                    });
                });
                server.listen(port, function () { tracer.log('Listening on ' + server.address().port, server.address()); });
            } catch (ex) {
                tracer.log("ERROR: Unable to create a server", ex);
            }
        }
    };

    return me;
}());

module.exports = atlasmakerServer;

/*
    Atlases
        .name:        string
        .dirname:    string
        .hdr:        Analyze hdr
        .dim[3]:    3 uint16s
        .data:        Analyze img
        .sum:        value sum

    US
        .uid
        .socket
        .User
            .view:        string, either 'sag', 'axi' or 'cor'
            .tool:        string, either 'paint' or 'erase'
            .slice:        slice which the user is editing
            .penSize:    integer, for example, 5
            .penValue:    integer, value used to paint, for example, 1
            .doFill:    boolean, indicates whether 'paint' or 'erase' fill their target
            .mouseIsDown:    boolean, indicates whether the user's mouse button is down
            .x0:        previous x coordinate for painting, -1 if no previous
            .y0:        previous y coordinate for painting, -1 if no previous
            .mri:        normally, MRI-n4.nii.gz
            .dirname:    string, atlas file directory, for example, /data/Gorilla/
            .username:    string, for example, roberto
            .specimenName: string, for example, Crab-eating_macaque
            .atlasFilename:    string, atlas filename, for example, Cerebellum.nii.gz
            .iAtlas:    index of atlas in Atlases[]
            .dim:        array, size of the mri the user is editing, for example, [160, 224, 160]

    undoBuffer
        .type:    line, slice, volume
        .data:
*/
